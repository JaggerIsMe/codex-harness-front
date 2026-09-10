import { computed, nextTick, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useWorkspaceFileStore } from '@/stores/workspace-file'
import { useAgentStore } from '@/stores/agent'
import { ApiError } from '@/api/request'
import * as api from '@/api/workspace-file'
import type { Id } from '@/types/domain'
import type { WorkspaceFileEntry } from '@/types/workspace-file'
import type { WorkspaceFilePreview } from '@/types/workspace-preview'
import { insideWorkspacePath, workspaceChangeEvent } from '@/utils/workspaceFileActions'

export function useWorkspaceFilePreview(
  projectId: Ref<Id | undefined>,
  conversationId: Ref<Id | undefined>,
) {
  const auth = useAuthStore()
  const directories = useWorkspaceFileStore()
  const agent = useAgentStore()
  const file = shallowRef<WorkspaceFileEntry | null>(null)
  const metadata = shallowRef<WorkspaceFilePreview | null>(null)
  const blob = shallowRef<Blob | null>(null)
  const loading = ref(false)
  const downloading = ref(false)
  const error = ref('')
  const changed = ref(false)
  const online = computed(
    () => directories.projects[String(projectId.value)]?.['']?.online ?? false,
  )
  let controller: AbortController | undefined
  let generation = 0
  let trigger: HTMLElement | null = null
  const urls = new Map<string, ReturnType<typeof setTimeout>>()
  function clear() {
    generation++
    controller?.abort()
    controller = undefined
    for (const [url, timer] of urls) {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
    }
    urls.clear()
    file.value = null
    metadata.value = null
    blob.value = null
    loading.value = false
    downloading.value = false
    error.value = ''
    changed.value = false
  }
  function close() {
    const focus = trigger
    clear()
    void nextTick(() => {
      if (focus?.isConnected && focus.getClientRects().length) focus.focus()
      else document.querySelector<HTMLElement>('[data-workspace-files-toggle]')?.focus()
    })
  }
  function handleError(cause: unknown) {
    if (cause instanceof ApiError && [401, 403, 404].includes(cause.code || 0)) {
      clear()
      return
    }
    error.value = cause instanceof Error ? cause.message : '读取文件失败，请重试'
  }
  async function open(entry: WorkspaceFileEntry) {
    const pid = projectId.value
    if (pid === undefined || entry.type !== 'FILE') return
    trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    clear()
    file.value = { ...entry }
    loading.value = true
    const current = generation
    const signal = (controller = new AbortController()).signal
    try {
      const { data: operation } = await api.prepareWorkspaceDownload(
        pid,
        entry.path,
        crypto.randomUUID(),
        signal,
      )
      if (current !== generation) return
      await api.waitWorkspaceOperation(pid, operation.id, signal)
      if (current !== generation) return
      const { data } = await api.getWorkspacePreview(pid, operation.id, signal)
      if (current !== generation) return
      const content =
        data.kind === 'UNSUPPORTED'
          ? null
          : await api.downloadWorkspaceContent(pid, operation.id, signal)
      if (current !== generation) return
      if (content && content.size !== data.sizeBytes) throw new Error('文件副本大小不匹配，请刷新')
      metadata.value = data
      blob.value = content
    } catch (cause) {
      if (current === generation && !signal.aborted) handleError(cause)
    } finally {
      if (current === generation) loading.value = false
    }
  }
  async function download() {
    const data = metadata.value
    const pid = projectId.value
    if (!data || pid === undefined || !controller || downloading.value) return
    const current = generation
    const signal = controller.signal
    downloading.value = true
    error.value = ''
    try {
      const content = await api.downloadWorkspaceContent(pid, data.operationId, signal)
      if (current !== generation) return
      const url = URL.createObjectURL(content)
      const link = document.createElement('a')
      link.href = url
      link.download = data.fileName
      link.click()
      urls.set(
        url,
        setTimeout(() => {
          URL.revokeObjectURL(url)
          urls.delete(url)
        }, 1000),
      )
    } catch (cause) {
      if (current === generation && !signal.aborted) handleError(cause)
    } finally {
      if (current === generation) downloading.value = false
    }
  }
  watch(
    () => {
      const path = file.value?.path || ''
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
      return [path, directories.projects[String(projectId.value)]?.[parent]?.generation] as const
    },
    ([path, value], [previousPath, previous]) => {
      if (metadata.value && path === previousPath && value && previous && value !== previous)
        changed.value = true
    },
  )
  watch(
    () => agent.eventRevision,
    () => {
      const event = agent.lastEvent
      const snapshot = metadata.value
      if (
        event?.type !== 'WORKSPACE_FILES_CHANGED' ||
        String(event.payload?.projectId) !== String(projectId.value)
      )
        return
      const change = workspaceChangeEvent(event.payload)
      if (change && projectId.value !== undefined) {
        directories.applyChange(projectId.value, change)
        return
      }
      if (!snapshot) return
      // Preparing this very snapshot also emits WORKSPACE_FILES_CHANGED; it isn't a modification.
      if (String(event.payload?.operationId) === String(snapshot.operationId)) return
      const path = event.payload?.path
      if (
        typeof path === 'string' &&
        (path === '' || snapshot.path === path || snapshot.path.startsWith(`${path}/`))
      )
        changed.value = true
    },
    { flush: 'sync' },
  )
  watch(
    () => directories.lastChange[String(projectId.value)],
    (change) => {
      const path = file.value?.path
      if (!change || !path || !insideWorkspacePath(path, change.sourcePath)) return
      if (
        change.status === 'SUCCEEDED' ||
        change.items?.some((item) => item.path === path && item.status === 'DELETED')
      )
        close()
      else {
        changed.value = true
        error.value = '文件操作结果尚未完全确认；当前显示操作前的只读副本，请核实状态'
      }
    },
    { flush: 'sync' },
  )
  watch([projectId, conversationId, () => auth.token], clear, { flush: 'sync' })
  watch(
    () => directories.resetEpochs[String(projectId.value)],
    () => {
      if (!metadata.value) return
      changed.value = true
      error.value = '文件变更记录需要重新同步；当前显示原只读副本，请刷新目录核实'
    },
    { flush: 'sync' },
  )
  // A revoked directory request clears the project cache; erase the local preview as well.
  watch(
    () => directories.projects[String(projectId.value)],
    (value, previous) => {
      if (previous && (!value || !Object.keys(value).length)) clear()
    },
    { flush: 'sync' },
  )
  onScopeDispose(clear)
  return {
    file,
    metadata,
    blob,
    loading,
    downloading,
    error,
    changed,
    online,
    open,
    close,
    download,
    refresh: () => {
      if (file.value) void open(file.value)
    },
  }
}
