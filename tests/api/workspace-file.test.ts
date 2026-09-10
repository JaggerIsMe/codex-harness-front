import { expect, it, vi } from 'vitest'
import { waitWorkspaceOperation, WorkspaceOperationError } from '@/api/workspace-file'
import { request } from '@/api/request'
vi.mock('@/api/request', () => ({ request: vi.fn(), downloadFile: vi.fn() }))
it.each(['UNKNOWN', 'PARTIAL_FAILED'])(
  'stops polling immediately on %s and carries the durable result',
  async (status) => {
    vi.mocked(request).mockResolvedValue({
      status: 'success',
      code: 200,
      info: '',
      data: { id: '1', kind: 'DELETE_WORKSPACE_ENTRY', path: 'docs', status, error: null },
    })
    const waiting = waitWorkspaceOperation(1, '1', new AbortController().signal)
    await expect(waiting).rejects.toBeInstanceOf(WorkspaceOperationError)
    await expect(waiting).rejects.toMatchObject({ operation: { status } })
    expect(request).toHaveBeenCalledTimes(1)
  },
)
