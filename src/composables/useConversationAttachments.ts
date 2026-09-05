import { computed, onScopeDispose, ref } from 'vue'
import type { AttachmentLimits, ConversationAttachment, Id } from '@/types/domain'
import {
  getAttachmentLimits,
  getPendingAttachments,
  uploadAttachment,
  removeAttachment,
} from '@/api/attachment'
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
  const blocked = computed(() => loading.value || rows.value.some((row) => row.status !== 'ready'))
  const selected = computed(() =>
    rows.value.flatMap((row) => (row.attachment ? [row.attachment] : [])),
  )
  async function load() {
    loading.value = true
    error.value = ''
    try {
      const [settings, pending] = await Promise.all([
        getAttachmentLimits(pid, cid, lifetime.signal),
        getPendingAttachments(pid, cid, lifetime.signal),
      ])
      if (disposed) return
      limits.value = settings.data
      rows.value = pending.data.map((attachment) => ({
        key: String(attachment.id),
        name: attachment.fileName,
        size: attachment.sizeBytes,
        attachment,
        progress: 100,
        status: 'ready',
      }))
    } catch (cause) {
      if (!disposed) error.value = cause instanceof Error ? cause.message : '附件加载失败'
    } finally {
      if (!disposed) loading.value = false
    }
  }
  async function upload(row: AttachmentDraft) {
    if (!row.file || disposed) return
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
      row.progress = 100
      row.status = 'ready'
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
    uploads.get(row.key)?.abort()
    if (row.attachment) {
      row.status = 'removing'
      try {
        await removeAttachment(pid, cid, row.attachment.id, lifetime.signal)
      } catch (cause) {
        if (!disposed) {
          row.status = 'ready'
          error.value = cause instanceof Error ? cause.message : '移除失败'
        }
        return
      }
    }
    if (!disposed) rows.value = rows.value.filter((item) => item.key !== row.key)
  }
  function clearSent() {
    rows.value = []
    error.value = ''
  }
  onScopeDispose(() => {
    disposed = true
    lifetime.abort()
    for (const controller of uploads.values()) controller.abort()
    uploads.clear()
  })
  void load()
  return { rows, limits, loading, error, blocked, selected, add, upload, remove, clearSent, load }
}
