import { request, downloadFile } from './request'
import type { Id } from '@/types/domain'
import type { WorkspaceDirectory, WorkspaceFileOperation } from '@/types/workspace-file'

const base = (pid: Id) => `/projects/${pid}/workspace-files`
export function getWorkspaceDirectory(
  pid: Id,
  path: string,
  cursor: string,
  refresh: boolean,
  signal: AbortSignal,
) {
  return request<WorkspaceDirectory>('get', base(pid), undefined, {
    params: { path, cursor, refresh },
    signal,
  })
}
export function getWorkspaceOperation(pid: Id, id: Id, signal: AbortSignal) {
  return request<WorkspaceFileOperation>('get', `${base(pid)}/operations/${id}`, undefined, {
    signal,
  })
}
export function createWorkspaceDirectory(
  pid: Id,
  path: string,
  requestKey: string,
  signal: AbortSignal,
) {
  return request<WorkspaceFileOperation>(
    'post',
    `${base(pid)}/directories`,
    { path, requestKey },
    { signal },
  )
}
export function uploadWorkspaceFile(
  pid: Id,
  path: string,
  file: File,
  requestKey: string,
  signal: AbortSignal,
  progress: (value: number) => void,
) {
  const data = new FormData()
  data.append('file', file)
  return request<WorkspaceFileOperation>('post', `${base(pid)}/uploads`, data, {
    params: { path, requestKey },
    signal,
    timeout: 120000,
    onUploadProgress: (event) =>
      progress(Math.min(99, Math.round((100 * event.loaded) / (event.total || file.size || 1)))),
  })
}
export function prepareWorkspaceDownload(
  pid: Id,
  path: string,
  requestKey: string,
  signal: AbortSignal,
) {
  return request<WorkspaceFileOperation>(
    'post',
    `${base(pid)}/downloads`,
    { path, requestKey },
    { signal },
  )
}
export function downloadWorkspaceContent(pid: Id, id: Id, signal: AbortSignal) {
  return downloadFile(`${base(pid)}/operations/${id}/content`, signal)
}
function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException('已取消', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, 800)
    signal.addEventListener('abort', abort, { once: true })
  })
}
/** Poll one durable operation. Aborting this wait never implies rollback of a remote write. */
export async function waitWorkspaceOperation(pid: Id, id: Id, signal: AbortSignal) {
  const deadline = Date.now() + 330000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const { data } = await getWorkspaceOperation(pid, id, signal)
    if (data.status === 'SUCCEEDED') return data
    if (data.status === 'FAILED' || data.status === 'EXPIRED')
      throw new Error(data.error || '文件操作失败或已过期')
    await delay(signal)
  }
  throw new Error('文件操作等待超时，请刷新目录核实结果')
}
