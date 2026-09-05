import { request, downloadFile } from './request'
import type { ConversationArtifact, Id } from '@/types/domain'

const base = (pid: Id, cid: Id) => `/projects/${pid}/conversations/${cid}/artifacts`
export function getArtifacts(pid: Id, cid: Id, signal?: AbortSignal) {
  return request<ConversationArtifact[]>('GET', base(pid, cid), undefined, { signal })
}
export function retryArtifact(pid: Id, cid: Id, aid: Id, signal?: AbortSignal) {
  return request<ConversationArtifact>('POST', `${base(pid, cid)}/${aid}/retry`, undefined, {
    signal,
  })
}
export function downloadArtifact(pid: Id, cid: Id, aid: Id, signal?: AbortSignal) {
  return downloadFile(`${base(pid, cid)}/${aid}/download`, signal)
}
