import { request, downloadFile } from './request'
import type { AttachmentLimits, ConversationAttachment, Id } from '@/types/domain'
const base = (pid: Id, cid: Id) => `/projects/${pid}/conversations/${cid}/attachments`
export function getAttachmentLimits(pid: Id, cid: Id, signal?: AbortSignal) {
  return request<AttachmentLimits>('get', `${base(pid, cid)}/limits`, undefined, { signal })
}
export function getPendingAttachments(pid: Id, cid: Id, signal?: AbortSignal) {
  return request<ConversationAttachment[]>('get', base(pid, cid), undefined, { signal })
}
export function uploadAttachment(
  pid: Id,
  cid: Id,
  file: File,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  const data = new FormData()
  data.append('file', file)
  return request<ConversationAttachment>('post', base(pid, cid), data, {
    signal,
    timeout: 120000,
    onUploadProgress: (event) =>
      progress(Math.min(99, Math.round((event.loaded / (event.total || file.size)) * 100))),
  })
}
export function removeAttachment(pid: Id, cid: Id, aid: Id, signal?: AbortSignal) {
  return request<void>('delete', `${base(pid, cid)}/${aid}`, undefined, { signal })
}
export function downloadAttachment(pid: Id, cid: Id, aid: Id, signal?: AbortSignal) {
  return downloadFile(`${base(pid, cid)}/${aid}/download`, signal)
}
