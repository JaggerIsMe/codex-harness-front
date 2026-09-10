import { request, downloadFile } from './request'
import type { Id } from '@/types/domain'
import type {
  WorkspaceDirectory,
  WorkspaceFileOperation,
  WorkspaceOperationPage,
  WorkspaceOperationItem,
} from '@/types/workspace-file'
import type { WorkspaceFilePreview } from '@/types/workspace-preview'

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
export function getWorkspacePreview(pid: Id, id: Id, signal: AbortSignal) {
  return request<WorkspaceFilePreview>('get', `${base(pid)}/operations/${id}/preview`, undefined, {
    signal,
  })
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
export class WorkspaceOperationError extends Error {
  constructor(public operation: WorkspaceFileOperation) {
    super(
      operation.error ||
        (operation.status === 'UNKNOWN'
          ? '操作结果未知，请核实状态；不要重复提交'
          : operation.status === 'PARTIAL_FAILED'
            ? '操作部分完成，请查看明细后重新检查'
            : '文件操作失败或已过期'),
    )
  }
}
export function renameWorkspaceEntry(
  pid: Id,
  input: { path: string; name: string; expectedRevision: string; requestKey: string },
  signal: AbortSignal,
) {
  return request<WorkspaceFileOperation>('post', `${base(pid)}/renames`, input, { signal })
}
export function moveWorkspaceEntry(
  pid: Id,
  input: { path: string; targetDirectory: string; expectedRevision: string; requestKey: string },
  signal: AbortSignal,
) {
  return request<WorkspaceFileOperation>('post', `${base(pid)}/moves`, input, { signal })
}
export function prepareWorkspaceDeletion(
  pid: Id,
  input: { path: string; expectedRevision: string; requestKey: string },
  signal: AbortSignal,
) {
  return request<WorkspaceFileOperation>('post', `${base(pid)}/delete-plans`, input, { signal })
}
export function deleteWorkspaceEntry(
  pid: Id,
  input: { planId: string; planDigest: string; requestKey: string },
  signal: AbortSignal,
) {
  return request<WorkspaceFileOperation>('post', `${base(pid)}/deletions`, input, { signal })
}
export function prepareWorkspaceArchive(
  pid: Id,
  input: { items: { path: string; expectedRevision: string }[]; requestKey: string },
  signal: AbortSignal,
) {
  return request<WorkspaceFileOperation>('post', `${base(pid)}/archive-downloads`, input, {
    signal,
  })
}
export function getWorkspaceOperations(pid: Id, cursor: string, signal: AbortSignal) {
  return request<WorkspaceOperationPage>('get', `${base(pid)}/operations`, undefined, {
    params: { cursor, limit: 20 },
    signal,
  })
}
export function getWorkspaceOperationItems(pid: Id, id: Id, cursor: string, signal: AbortSignal) {
  return request<WorkspaceOperationPage<WorkspaceOperationItem>>(
    'get',
    `${base(pid)}/operations/${id}/items`,
    undefined,
    { params: { cursor, limit: 100 }, signal },
  )
}
export function reconcileWorkspaceOperation(
  pid: Id,
  id: Id,
  requestKey: string,
  signal: AbortSignal,
) {
  return request<WorkspaceFileOperation>(
    'post',
    `${base(pid)}/operations/${id}/reconcile`,
    { requestKey },
    { signal },
  )
}
/** Poll one durable operation. Aborting this wait never implies rollback of a remote write. */
export async function waitWorkspaceOperation(pid: Id, id: Id, signal: AbortSignal) {
  const deadline = Date.now() + 330000
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const { data } = await getWorkspaceOperation(pid, id, signal)
    if (data.status === 'SUCCEEDED') return data
    if (['FAILED', 'EXPIRED', 'PARTIAL_FAILED', 'UNKNOWN'].includes(data.status))
      throw new WorkspaceOperationError(data)
    await delay(signal)
  }
  throw new Error('文件操作等待超时，请刷新目录核实结果')
}
