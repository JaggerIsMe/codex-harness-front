import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import * as api from '@/api/workspace-file'
import { ApiError } from '@/api/request'
import { useWorkspaceFilePreview } from '@/composables/useWorkspaceFilePreview'
import type { ApiResponse, RealtimeEvent } from '@/types/domain'
import type { WorkspaceFileEntry, WorkspaceFileOperation } from '@/types/workspace-file'
import type { WorkspaceFilePreview } from '@/types/workspace-preview'

const auth = reactive({ token: 'token' })
const directory = reactive({
  projects: {} as Record<string, Record<string, { generation: string; online: boolean }>>,
})
const agent = reactive({ eventRevision: 0, lastEvent: null as RealtimeEvent | null })
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/stores/workspace-file', () => ({ useWorkspaceFileStore: () => directory }))
vi.mock('@/stores/agent', () => ({ useAgentStore: () => agent }))
vi.mock('@/api/request', () => ({
  ApiError: class extends Error {
    constructor(
      message: string,
      public code?: number,
    ) {
      super(message)
    }
  },
}))
vi.mock('@/api/workspace-file', () => ({
  prepareWorkspaceDownload: vi.fn(),
  waitWorkspaceOperation: vi.fn(),
  getWorkspacePreview: vi.fn(),
  downloadWorkspaceContent: vi.fn(),
}))
const response = <T>(data: T): ApiResponse<T> => ({ status: 'success', code: 200, info: '', data })
const operation = (id: string): WorkspaceFileOperation => ({
  id,
  path: id,
  kind: 'PREPARE_WORKSPACE_DOWNLOAD',
  status: 'SUCCEEDED',
  error: null,
})
const entry = (path: string): WorkspaceFileEntry => ({
  path,
  name: path,
  type: 'FILE',
  sizeBytes: 5,
  modifiedAt: 1,
})
const metadata = (id: string): WorkspaceFilePreview => ({
  operationId: id,
  path: id,
  fileName: id,
  kind: 'TEXT',
  mediaType: 'text/plain',
  encoding: 'utf-8',
  sizeBytes: 5,
  sha256: 'a'.repeat(64),
  readyAt: '2026-09-08T10:00:00',
  width: null,
  height: null,
  reason: null,
  limits: {
    maxBytes: 1048576,
    maxLines: 20000,
    maxRows: 1000,
    maxColumns: 100,
    maxPixels: 20000000,
  },
})
const scopes: ReturnType<typeof effectScope>[] = []
function setup() {
  const pid = ref<number | undefined>(1),
    cid = ref<number | undefined>(2),
    scope = effectScope()
  scopes.push(scope)
  return { pid, cid, scope, state: scope.run(() => useWorkspaceFilePreview(pid, cid))! }
}
beforeEach(() => {
  vi.resetAllMocks()
  auth.token = 'token'
  directory.projects = { '1': { '': { generation: '1', online: true } } }
  vi.mocked(api.prepareWorkspaceDownload).mockImplementation(async (_, path) =>
    response(operation(path)),
  )
  vi.mocked(api.waitWorkspaceOperation).mockImplementation(async (_, id) => operation(String(id)))
  vi.mocked(api.getWorkspacePreview).mockImplementation(async (_, id) =>
    response(metadata(String(id))),
  )
  vi.mocked(api.downloadWorkspaceContent).mockResolvedValue(new Blob(['hello']))
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('ignores a late A response after B replaces it and aborts the old request', async () => {
  let resolve!: (value: ApiResponse<WorkspaceFilePreview>) => void
  vi.mocked(api.getWorkspacePreview).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const { state } = setup()
  const first = state.open(entry('a.txt'))
  await flushPromises()
  const signal = vi.mocked(api.getWorkspacePreview).mock.calls[0]![2]
  await state.open(entry('b.txt'))
  resolve(response(metadata('a.txt')))
  await first
  expect(signal.aborted).toBe(true)
  expect(state.metadata.value?.path).toBe('b.txt')
  expect(api.downloadWorkspaceContent).toHaveBeenCalledTimes(1)
})
it('downloads the same operation even after directory changes and releases URLs on close', async () => {
  const { state } = setup()
  await state.open(entry('a.txt'))
  await nextTick()
  directory.projects['1']!['']!.generation = '2'
  await nextTick()
  expect(state.changed.value).toBe(true)
  await state.download()
  expect(api.prepareWorkspaceDownload).toHaveBeenCalledTimes(1)
  expect(vi.mocked(api.downloadWorkspaceContent).mock.calls.map((call) => call[1])).toEqual([
    'a.txt',
    'a.txt',
  ])
  state.close()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  expect(state.blob.value).toBeNull()
})
it('clears content and aborts when changing conversations, logging out or losing permission', async () => {
  const { state, cid } = setup()
  await state.open(entry('a.txt'))
  const signal = vi.mocked(api.downloadWorkspaceContent).mock.calls[0]![2]
  cid.value = 3
  expect(signal.aborted).toBe(true)
  expect(state.file.value).toBeNull()
  await state.open(entry('a.txt'))
  auth.token = ''
  expect(state.blob.value).toBeNull()
  await state.open(entry('a.txt'))
  vi.mocked(api.downloadWorkspaceContent).mockRejectedValueOnce(new ApiError('无权限', 403))
  await state.download()
  expect(state.file.value).toBeNull()
})
it('does not fetch unsupported content and does not silently replace an expired snapshot', async () => {
  const { state } = setup()
  vi.mocked(api.getWorkspacePreview).mockResolvedValueOnce(
    response({ ...metadata('a.zip'), kind: 'UNSUPPORTED', reason: '暂不支持' }),
  )
  await state.open(entry('a.zip'))
  expect(state.metadata.value?.reason).toBe('暂不支持')
  expect(api.downloadWorkspaceContent).not.toHaveBeenCalled()
  vi.mocked(api.downloadWorkspaceContent).mockRejectedValueOnce(new ApiError('副本已过期', 400))
  await state.download()
  expect(state.error.value).toBe('副本已过期')
  expect(api.prepareWorkspaceDownload).toHaveBeenCalledTimes(1)
})

it('ignores its own preparation event, unrelated paths and selection between directories', async () => {
  const { state } = setup()
  directory.projects['1']!['docs'] = { generation: '8', online: true }
  await state.open(entry('a.txt'))
  agent.lastEvent = {
    type: 'WORKSPACE_FILES_CHANGED',
    payload: { projectId: '1', operationId: 'a.txt', path: 'a.txt' },
  }
  agent.eventRevision++
  expect(state.changed.value).toBe(false)
  agent.lastEvent = {
    type: 'WORKSPACE_FILES_CHANGED',
    payload: { projectId: '1', operationId: '99', path: 'unrelated' },
  }
  agent.eventRevision++
  expect(state.changed.value).toBe(false)
  await state.open(entry('docs/b.txt'))
  await nextTick()
  expect(state.changed.value).toBe(false)
  agent.lastEvent = {
    type: 'WORKSPACE_FILES_CHANGED',
    payload: { projectId: '1', operationId: '100', path: 'docs' },
  }
  agent.eventRevision++
  expect(state.changed.value).toBe(true)
})
