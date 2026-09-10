import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceFileStore } from '@/stores/workspace-file'
import type { WorkspaceDirectory } from '@/types/workspace-file'
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ token: 'test' }) }))
beforeEach(() => setActivePinia(createPinia()))
const directory = (generation: string, name: string): WorkspaceDirectory => ({
  path: '',
  generation,
  scannedAt: 1,
  entries: [{ name, path: name, type: 'FILE', sizeBytes: 1, modifiedAt: 1 }],
  nextCursor: null,
  loaded: true,
  online: true,
  supported: true,
  operation: null,
  maxFileBytes: 100,
})
it('isolates projects and ignores old first-page responses', () => {
  const store = useWorkspaceFileStore()
  store.apply(1, directory('20', 'new.txt'), '', '0')
  store.apply(1, directory('10', 'old.txt'), '', '0')
  store.apply(2, directory('30', 'private.txt'), '', '0')
  expect(store.directory(1, '').entries.map((file) => file.name)).toEqual(['new.txt'])
  expect(store.directory(2, '').entries.map((file) => file.name)).toEqual(['private.txt'])
})
it('rejects pagination from a previous directory generation', () => {
  const store = useWorkspaceFileStore()
  store.apply(1, directory('20', 'a.txt'), '', '0')
  store.apply(1, directory('30', 'changed.txt'), '', '20')
  store.apply(1, directory('40', 'stale-page.txt'), 'a.txt', '20')
  expect(store.directory(1, '').entries.map((file) => file.name)).toEqual(['changed.txt'])
  store.apply(1, directory('41', 'next.txt'), 'changed.txt', '30')
  expect(store.directory(1, '').entries.map((file) => file.name)).toEqual([
    'changed.txt',
    'next.txt',
  ])
})
it('filters internal entries from responses and retained pages at every depth', () => {
  const store = useWorkspaceFileStore()
  const cached = store.directory(1, '')
  Object.assign(cached, directory('20', '.git'))
  cached.entries.push(directory('20', 'report.txt').entries[0]!)
  store.expanded['1'] = ['docs/.AGENT/nested', 'docs']
  store.apply(1, { ...directory('20', 'unused'), entries: [] }, '', '20')
  expect(cached.entries.map((entry) => entry.name)).toEqual(['report.txt'])
  expect(store.expanded['1']).toEqual(['docs'])
  for (const name of [
    '.CODEX',
    '.git',
    '.harness',
    '.agent',
    '.agents',
    '.harness-workspace.json',
    '.harness-upload-temp',
  ]) {
    store.apply(1, directory('21', `docs/${name}`), 'report.txt', '20')
  }
  store.apply(1, directory('22', '.gitignore'), 'report.txt', '20')
  expect(cached.entries.map((entry) => entry.name)).toEqual(['report.txt', '.gitignore'])
  store.toggle(1, '.codex')
  expect(store.expanded['1']).toEqual(['docs'])
})
it('discards even a newer generation if its request began before a structural change', () => {
  const store = useWorkspaceFileStore()
  store.apply(1, directory('20', 'old.txt'), '', '0')
  const epoch = store.epoch(1)
  store.applyChange(1, {
    operationId: '10',
    kind: 'DELETE_WORKSPACE_ENTRY',
    status: 'SUCCEEDED',
    sourcePath: 'old.txt',
    entryType: 'FILE',
  })
  store.apply(1, directory('999', 'old.txt'), '', '20', epoch)
  expect(store.directory(1, '').entries).toEqual([])
  store.apply(1, directory('1000', 'new.txt'), '', '0', store.epoch(1))
  expect(store.directory(1, '').entries[0]?.name).toBe('new.txt')
})
it('invalidates folded descendants and maps only complete path segments once', () => {
  const store = useWorkspaceFileStore()
  store.directory(1, 'docs/a').loaded = true
  store.directory(1, 'docs/a/folded').loaded = true
  store.directory(1, 'docs/another').loaded = true
  store.expanded['1'] = ['docs/a', 'docs/a/nested', 'docs/another']
  const change = {
    operationId: '11',
    kind: 'RELOCATE_WORKSPACE_ENTRY',
    status: 'SUCCEEDED' as const,
    sourcePath: 'docs/a',
    targetPath: 'archive',
    entryType: 'DIRECTORY' as const,
  }
  expect(store.applyChange(1, change)).toBe(true)
  expect(store.projects['1']?.['docs/a/folded']).toBeUndefined()
  expect(store.projects['1']?.['docs/another']?.loaded).toBe(true)
  expect(store.expanded['1']).toEqual(['archive', 'archive/nested', 'docs/another'])
  expect(store.applyChange(1, change)).toBe(false)
})
it('does not replay an older mutation or downgrade a confirmed mutation to UNKNOWN', () => {
  const store = useWorkspaceFileStore()
  store.applyChange(1, {
    operationId: '20',
    kind: 'RELOCATE_WORKSPACE_ENTRY',
    status: 'SUCCEEDED',
    sourcePath: 'b',
    targetPath: 'c',
  })
  store.expanded['1'] = ['c']
  store.applyChange(1, {
    operationId: '19',
    kind: 'RELOCATE_WORKSPACE_ENTRY',
    status: 'SUCCEEDED',
    sourcePath: 'c',
    targetPath: 'b',
  })
  expect(store.expanded['1']).toEqual([])
  expect(store.lastChange['1']?.targetPath).toBe('c')
  expect(store.resetEpochs['1']).toBe(1)
  expect(
    store.applyChange(1, {
      operationId: '20',
      kind: 'RELOCATE_WORKSPACE_ENTRY',
      status: 'UNKNOWN',
      sourcePath: 'b',
      targetPath: 'c',
    }),
  ).toBe(false)
  expect(store.lastChange['1']?.status).toBe('SUCCEEDED')
})
