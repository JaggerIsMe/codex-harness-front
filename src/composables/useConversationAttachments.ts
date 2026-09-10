import { computed, onScopeDispose, ref, watch } from 'vue'
import type { AttachmentLimits, ConversationAttachment, Id } from '@/types/domain'
import { waitWorkspaceOperation } from '@/api/workspace-file'
import {
  getAttachmentLimits,
  getPendingAttachments,
  uploadAttachment,
  removeAttachment,
} from '@/api/attachment'
import { useAgentStore } from '@/stores/agent'
import { insideWorkspacePath, mutationKind } from '@/utils/workspaceFileActions'
export interface AttachmentDraft {
  key: string
  name: string
  size: number
  file?: File
  attachment?: ConversationAttachment
  progress: number
  status: 'uploading' | 'ready' | 'error' | 'removing'
  error?: string
}
export function useConversationAttachments(pid: Id, cid: Id) {
  const rows = ref<AttachmentDraft[]>([])
  const limits = ref<AttachmentLimits | null>(null)
  const loading = ref(true)
  const error = ref('')
  const lifetime = new AbortController()
  const uploads = new Map<string, AbortController>()
  let disposed = false
  const agent = useAgentStore()
  let locationEpoch = 0
  const unavailable = (attachment?: ConversationAttachment) =>
    attachment?.workspaceLocationState === 'MISSING' ||
    attachment?.workspaceLocationState === 'UNKNOWN'
  const blocked = computed(
    () =>
      loading.value ||
      rows.value.some((row) => row.status !== 'ready' || unavailable(row.attachment)),
  )
  const selected = computed(() =>
    rows.value.flatMap((row) => (row.attachment ? [row.attachment] : [])),
  )
  async function load() {
    let epoch = ++locationEpoch
    loading.value = true
    error.value = ''
    try {
      const [settings, firstPending] = await Promise.all([
        getAttachmentLimits(pid, cid, lifetime.signal),
        getPendingAttachments(pid, cid, lifetime.signal),
      ])
      if (disposed) return
      let pending = firstPending
      while (epoch !== locationEpoch) {
        epoch = locationEpoch
        pending = await getPendingAttachments(pid, cid, lifetime.signal)
        if (disposed) return
      }
      limits.value = settings.data
      rows.value = pending.data.map((attachment) => ({
        key: String(attachment.id),
        name: attachment.fileName,
        size: attachment.sizeBytes,
        attachment,
        progress: 100,
        status: unavailable(attachment)
          ? 'error'
          : attachment.workspaceOperationId
            ? 'uploading'
            : 'ready',
        error: locationError(attachment),
      }))
      for (const row of rows.value)
        if (row.attachment?.workspaceOperationId && !unavailable(row.attachment))
          void awaitWorkspace(row)
    } catch (cause) {
      if (!disposed) error.value = cause instanceof Error ? cause.message : '附件加载失败'
    } finally {
      if (!disposed) loading.value = false
    }
  }
  function locationError(attachment?: ConversationAttachment) {
    return attachment?.workspaceLocationState === 'MISSING'
      ? '文件已删除，请移除关联后重新上传'
      : attachment?.workspaceLocationState === 'UNKNOWN'
        ? '文件位置待核实，暂不可发送'
        : undefined
  }
  async function refreshLocations() {
    const epoch = ++locationEpoch
    if (loading.value) return
    try {
      const { data } = await getPendingAttachments(pid, cid, lifetime.signal)
      if (disposed || epoch !== locationEpoch) return
      const latest = new Map(data.map((attachment) => [String(attachment.id), attachment]))
      for (const row of rows.value) {
        const current = row.attachment
        const attachment = current && latest.get(String(current.id))
        if (!attachment || (attachment.locationRevision || 0) < (current?.locationRevision || 0))
          continue
        row.attachment = attachment
        if (unavailable(attachment)) {
          row.status = 'error'
          row.error = locationError(attachment)
        } else if (unavailable(current) && row.status !== 'removing') {
          row.error = ''
          row.status = 'uploading'
          void awaitWorkspace(row)
        }
      }
    } catch (cause) {
      if (!disposed && epoch === locationEpoch)
        error.value = cause instanceof Error ? cause.message : '附件定位刷新失败'
    }
  }
  async function awaitWorkspace(row: AttachmentDraft, existing?: AbortController) {
    const controller = existing || new AbortController()
    if (!existing) uploads.set(row.key, controller)
    try {
      const id = row.attachment?.workspaceOperationId
      if ((row.file || row.attachment?.workspacePath) && (!id || !row.attachment?.workspacePath))
        throw new Error('附件缺少工作区上传记录，请移除后重新上传')
      if (id) await waitWorkspaceOperation(pid, id, controller.signal)
      if (disposed || controller.signal.aborted) return
      if (unavailable(row.attachment)) throw new Error(locationError(row.attachment))
      row.progress = 100
      row.status = 'ready'
    } catch (cause) {
      if (!disposed && !controller.signal.aborted) {
        row.status = 'error'
        row.error = cause instanceof Error ? cause.message : '写入工作区失败'
      }
    } finally {
      if (!existing) uploads.delete(row.key)
    }
  }
  async function upload(row: AttachmentDraft) {
    if (disposed) return
    if (row.attachment) {
      if (unavailable(row.attachment)) {
        await refreshLocations()
        return
      }
      row.status = 'uploading'
      await awaitWorkspace(row)
      return
    }
    if (!row.file) return
    const controller = new AbortController()
    uploads.set(row.key, controller)
    row.status = 'uploading'
    row.error = ''
    row.progress = 0
    try {
      const result = await uploadAttachment(pid, cid, row.file, controller.signal, (value) => {
        row.progress = value
      })
      if (disposed || controller.signal.aborted) return
      row.attachment = result.data
      row.progress = 99
      await awaitWorkspace(row, controller)
    } catch (cause) {
      if (!disposed && !controller.signal.aborted) {
        row.status = 'error'
        row.error = cause instanceof Error ? cause.message : '上传失败'
      }
    } finally {
      uploads.delete(row.key)
    }
  }
  function add(files: File[]) {
    const config = limits.value
    if (!config?.agentSupported || loading.value || disposed) return
    let total = rows.value.reduce((sum, row) => sum + row.size, 0)
    for (const file of files) {
      if (
        !file.size ||
        file.size > config.maxFileBytes ||
        rows.value.length >= config.maxFiles ||
        total + file.size > config.maxTotalBytes
      ) {
        error.value = `附件超限：最多 ${config.maxFiles} 个，单文件 ${(config.maxFileBytes / 1048576).toFixed(0)} MB，总计 ${(config.maxTotalBytes / 1048576).toFixed(0)} MB；不支持空文件`
        continue
      }
      total += file.size
      rows.value.push({
        key: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        file,
        progress: 0,
        status: 'uploading',
      })
      const row = rows.value[rows.value.length - 1]!
      void upload(row)
    }
  }
  async function remove(row: AttachmentDraft) {
    const wasReady = row.status === 'ready'
    uploads.get(row.key)?.abort()
    if (row.attachment) {
      row.status = 'removing'
      try {
        await removeAttachment(pid, cid, row.attachment.id, lifetime.signal)
      } catch (cause) {
        if (!disposed) {
          row.status = wasReady ? 'ready' : 'error'
          row.error = '移除失败，请检查工作区上传状态后重试'
          error.value = cause instanceof Error ? cause.message : '移除失败'
        }
        return
      }
    }
    if (!disposed) rows.value = rows.value.filter((item) => item.key !== row.key)
  }
  function clearSent() {
    locationEpoch++
    rows.value = []
    error.value = ''
  }
  watch(
    () => agent.eventRevision,
    () => {
      const event = agent.lastEvent
      if (
        event?.type !== 'WORKSPACE_FILES_CHANGED' ||
        String(event.payload?.projectId) !== String(pid) ||
        !mutationKind(String(event.payload?.kind))
      )
        return
      const path = event.payload?.sourcePath
      if (typeof path === 'string')
        for (const row of rows.value) {
          if (
            row.attachment?.workspacePath &&
            !unavailable(row.attachment) &&
            insideWorkspacePath(row.attachment.workspacePath, path)
          ) {
            row.attachment = { ...row.attachment, workspaceLocationState: 'UNKNOWN' }
            row.status = 'error'
            row.error = '正在核实文件当前位置'
          }
        }
      void refreshLocations()
    },
    { flush: 'sync' },
  )
  watch(
    () => agent.connectionState,
    (state) => {
      if (state === 'CONNECTED') void refreshLocations()
    },
  )
  const onFocus = () => {
    if (rows.value.length) void refreshLocations()
  }
  window.addEventListener('focus', onFocus)
  onScopeDispose(() => {
    disposed = true
    window.removeEventListener('focus', onFocus)
    lifetime.abort()
    for (const controller of uploads.values()) controller.abort()
    uploads.clear()
  })
  void load()
  return {
    rows,
    limits,
    loading,
    error,
    blocked,
    selected,
    add,
    upload,
    remove,
    clearSent,
    load,
    refreshLocations,
  }
}
