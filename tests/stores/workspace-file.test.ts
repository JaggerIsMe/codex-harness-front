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
