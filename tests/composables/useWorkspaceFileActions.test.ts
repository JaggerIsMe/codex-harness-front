import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { computed, effectScope, reactive, ref } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { useWorkspaceFileActions } from '@/composables/useWorkspaceFileActions'
import type { useWorkspaceFiles } from '@/composables/useWorkspaceFiles'
import { useWorkspaceFileStore } from '@/stores/workspace-file'
import * as api from '@/api/workspace-file'
import type { ApiResponse } from '@/types/domain'
import type {
  WorkspaceDirectory,
  WorkspaceFileEntry,
  WorkspaceFileOperation,
} from '@/types/workspace-file'

const agent = reactive({ eventRevision: 0, lastEvent: null, connectionState: 'CONNECTED' })
const auth = reactive({ token: 'test' })
vi.mock('@/stores/agent', () => ({ useAgentStore: () => agent }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/workspace-file', async (original) => ({
  ...(await original<typeof import('@/api/workspace-file')>()),
  getWorkspaceOperations: vi.fn(),
  getWorkspaceOperationItems: vi.fn(),
  prepareWorkspaceArchive: vi.fn(),
  waitWorkspaceOperation: vi.fn(),
  downloadWorkspaceContent: vi.fn(),
  renameWorkspaceEntry: vi.fn(),
  reconcileWorkspaceOperation: vi.fn(),
  prepareWorkspaceDeletion: vi.fn(),
}))
const response = <T>(data: T): ApiResponse<T> => ({ status: 'success', code: 200, info: '', data })
const entry = (path: string, revision = 'r1'): WorkspaceFileEntry => ({
  path,
  name: path.split('/').at(-1)!,
  type: 'FILE',
  sizeBytes: 5,
  modifiedAt: 1,
  entryRevision: revision,
})
const operation = (
  id: string,
  status: WorkspaceFileOperation['status'] = 'SUCCEEDED',
): WorkspaceFileOperation => ({
  id,
  status,
  kind: 'PREPARE_WORKSPACE_ARCHIVE',
  path: '',
  error: null,
  contentState: 'AVAILABLE',
})
const scopes: ReturnType<typeof effectScope>[] = []
function setup() {
  const store = useWorkspaceFileStore()
  const directory: WorkspaceDirectory = {
    path: '',
    generation: '1',
    scannedAt: 1,
    entries: [entry('a.txt')],
    nextCursor: null,
    loaded: true,
    online: true,
    supported: true,
    operation: null,
    maxFileBytes: 100,
    capabilities: {
      mutations: { supported: true, enabled: true, reason: null },
      archive: { supported: true, enabled: true, reason: null },
    },
    limits: {
      maxArchiveFiles: 100,
      maxArchiveSourceBytes: 1000,
      maxArchiveOutputBytes: 1100,
      maxFileBytes: 100,
      maxRequestBytes: 524288,
    },
  }
  store.apply(1, directory, '', '0')
  const files: ReturnType<typeof useWorkspaceFiles> = {
    root: computed(() => store.directory(1, '')),
    directories: computed(() => store.projects['1'] || {}),
    expanded: computed(() => store.expanded['1'] || []),
    selected: ref(''),
    busy: ref(false),
    writable: computed(() => true),
    operationText: ref(''),
    error: ref(''),
    signal: new AbortController().signal,
    load: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    toggle: vi.fn(),
    upload: vi.fn(async () => {}),
    createDirectory: vi.fn(async () => {}),
    download: vi.fn(async () => {}),
  }
  const scope = effectScope()
  scopes.push(scope)
  const state = scope.run(() => useWorkspaceFileActions(1, files))!
  return { store, state, scope, files }
}
beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  auth.token = 'test'
  vi.mocked(api.getWorkspaceOperations).mockResolvedValue(response({ items: [], nextCursor: null }))
  vi.mocked(api.getWorkspaceOperationItems).mockResolvedValue(
    response({ items: [], nextCursor: null }),
  )
  vi.mocked(api.downloadWorkspaceContent).mockResolvedValue(new Blob(['zip']))
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:zip'), revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('preserves cross-directory selection through first-page refresh but requires new revisions after rename', async () => {
  const { state, store } = setup()
  state.multiSelect.value = true
  state.select(entry('a.txt'))
  state.select(entry('docs/b.txt'))
  store.directory(1, '').entries = []
  await flushPromises()
  expect(state.selectedPaths.value).toEqual(['a.txt', 'docs/b.txt'])
  store.applyChange(1, {
    operationId: '10',
    kind: 'RELOCATE_WORKSPACE_ENTRY',
    status: 'SUCCEEDED',
    sourcePath: 'docs',
    targetPath: 'archive',
    entryType: 'DIRECTORY',
  })
  expect(state.selectedPaths.value).toEqual(['a.txt', 'archive/b.txt'])
  expect(state.archiveProblem.value).toContain('重新核验')
  store.directory(1, 'archive').entries = [entry('archive/b.txt', 'r2')]
  await flushPromises()
  expect(state.archiveProblem.value).toBe('')
  state.multiSelect.value = false
  await flushPromises()
  expect(state.selection.value).toEqual([])
})
it('freezes ZIP input, downloads one immutable operation and releases its URL on disposal', async () => {
  const { state, scope } = setup()
  state.multiSelect.value = true
  state.select(entry('a.txt'))
  state.select(entry('docs/a.txt'))
  vi.mocked(api.prepareWorkspaceArchive).mockResolvedValue(response(operation('100', 'RUNNING')))
  let finish!: (operation: WorkspaceFileOperation) => void
  vi.mocked(api.waitWorkspaceOperation).mockImplementation(
    () => new Promise((resolve) => (finish = resolve)),
  )
  const waiting = state.archive()
  await flushPromises()
  state.select(entry('docs/a.txt'))
  state.select(entry('later.txt'))
  expect(
    vi.mocked(api.prepareWorkspaceArchive).mock.calls[0]?.[1].items.map((item) => item.path),
  ).toEqual(['a.txt', 'docs/a.txt'])
  finish(operation('100'))
  await waiting
  expect(api.downloadWorkspaceContent).toHaveBeenCalledWith(1, '100', expect.any(AbortSignal))
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1)
  scope.stop()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:zip')
})
it('stops at UNKNOWN and uses reconciliation rather than repeating a filesystem mutation', async () => {
  const { state } = setup()
  const unknown: WorkspaceFileOperation = {
    ...operation('200', 'UNKNOWN'),
    kind: 'RELOCATE_WORKSPACE_ENTRY',
    path: 'a.txt',
    targetPath: 'b.txt',
    error: '结果未知',
  }
  vi.mocked(api.renameWorkspaceEntry).mockResolvedValue(response(unknown))
  await expect(state.rename(entry('a.txt'), 'b.txt', 'request')).rejects.toBeInstanceOf(
    api.WorkspaceOperationError,
  )
  expect(api.waitWorkspaceOperation).not.toHaveBeenCalled()
  vi.mocked(api.reconcileWorkspaceOperation).mockResolvedValue(
    response({ ...unknown, status: 'SUCCEEDED' }),
  )
  await state.reconcile(unknown)
  expect(api.renameWorkspaceEntry).toHaveBeenCalledTimes(1)
  expect(state.operations.value[0]?.status).toBe('SUCCEEDED')
})
it('loads partial deletion details and only removes confirmed deleted selections', async () => {
  const { state, store } = setup()
  state.multiSelect.value = true
  state.select(entry('docs/a.txt'))
  state.select(entry('docs/b.txt'))
  const partial: WorkspaceFileOperation = {
    ...operation('201', 'PARTIAL_FAILED'),
    kind: 'DELETE_WORKSPACE_ENTRY',
    path: 'docs',
    error: '文件被占用',
  }
  vi.mocked(api.reconcileWorkspaceOperation).mockResolvedValue(response(partial))
  vi.mocked(api.getWorkspaceOperationItems).mockResolvedValue(
    response({
      items: [
        { path: 'docs/a.txt', entryType: 'FILE', status: 'DELETED' },
        { path: 'docs/b.txt', entryType: 'FILE', status: 'REMAINING' },
      ],
      nextCursor: null,
    }),
  )
  await state.reconcile(partial)
  await flushPromises()
  expect(state.selectedPaths.value).toEqual(['docs/b.txt'])
  expect(state.selection.value[0]?.entryRevision).toBeNull()
  expect(store.lastChange['1']?.items?.length).toBe(2)
})
it('restores completed archives without automatically downloading and aborts pending waits on close', async () => {
  vi.mocked(api.getWorkspaceOperations).mockResolvedValue(
    response({ items: [operation('300'), operation('301', 'RUNNING')], nextCursor: null }),
  )
  vi.mocked(api.waitWorkspaceOperation).mockImplementation(() => new Promise(() => {}))
  const { state, scope } = setup()
  await flushPromises()
  expect(state.operations.value).toHaveLength(2)
  expect(api.downloadWorkspaceContent).not.toHaveBeenCalled()
  const signal = vi.mocked(api.waitWorkspaceOperation).mock.calls[0]![2]
  scope.stop()
  expect(signal.aborted).toBe(true)
})
it('merges server attachment association count into the confirmed deletion plan', async () => {
  const { state } = setup()
  const plan = {
    planId: 'p',
    planDigest: 'd',
    path: 'a.txt',
    entryType: 'FILE' as const,
    entryRevision: 'r1',
    fileCount: 1,
    directoryCount: 0,
    totalBytes: 5,
    expiresAt: Date.now() + 120000,
  }
  vi.mocked(api.prepareWorkspaceDeletion).mockResolvedValue(
    response({
      ...operation('400'),
      kind: 'PREPARE_WORKSPACE_DELETE',
      attachmentCount: 3,
      result: { version: 1, status: 'SUCCEEDED', outcome: 'NO_CHANGE', plan },
    }),
  )
  expect((await state.planDeletion(entry('a.txt'), 'key')).attachmentCount).toBe(3)
})
it('refreshes ZIP content expiry independently from the operation terminal status', async () => {
  vi.mocked(api.getWorkspaceOperations).mockResolvedValue(
    response({ items: [operation('500')], nextCursor: null }),
  )
  const { state } = setup()
  await flushPromises()
  vi.mocked(api.getWorkspaceOperations).mockResolvedValue(
    response({ items: [{ ...operation('500'), contentState: 'EXPIRED' }], nextCursor: null }),
  )
  await state.restore()
  expect(state.operations.value[0]).toMatchObject({ status: 'SUCCEEDED', contentState: 'EXPIRED' })
  vi.mocked(api.getWorkspaceOperations).mockResolvedValue(
    response({ items: [operation('500')], nextCursor: null }),
  )
  await state.restore()
  expect(state.operations.value[0]?.contentState).toBe('EXPIRED')
})
