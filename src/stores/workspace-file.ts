import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from './auth'
import type { Id } from '@/types/domain'
import type { WorkspaceDirectory, WorkspaceDirectoryState } from '@/types/workspace-file'

const hiddenNames = new Set([
  '.codex',
  '.git',
  '.harness',
  '.agent',
  '.agents',
  '.harness-workspace.json',
])
function visiblePath(path: string): boolean {
  return path.split('/').every((part) => {
    const name = part.toLowerCase()
    return !hiddenNames.has(name) && !name.startsWith('.harness-upload-')
  })
}

export const useWorkspaceFileStore = defineStore('workspace-file', () => {
  const projects = ref<Record<string, Record<string, WorkspaceDirectoryState>>>({})
  const expanded = ref<Record<string, string[]>>({})
  const auth = useAuthStore()
  watch(
    () => auth.token,
    () => {
      projects.value = {}
      expanded.value = {}
    },
  )
  function directory(pid: Id, path: string): WorkspaceDirectoryState {
    const project = (projects.value[String(pid)] ||= {})
    return (project[path] ||= {
      path,
      generation: '0',
      scannedAt: 0,
      entries: [],
      nextCursor: null,
      loaded: false,
      online: false,
      supported: true,
      operation: null,
      maxFileBytes: 0,
      loading: false,
      error: '',
    })
  }
  function apply(pid: Id, value: WorkspaceDirectory, cursor: string, baseGeneration: string) {
    const previous = directory(pid, value.path)
    previous.entries = previous.entries.filter((entry) => visiblePath(entry.path))
    expanded.value[String(pid)] = (expanded.value[String(pid)] || []).filter(visiblePath)
    if (cursor && previous.generation !== baseGeneration) return
    if (!cursor && BigInt(value.generation) < BigInt(previous.generation)) return
    const keepPages =
      !cursor &&
      previous.generation === value.generation &&
      previous.entries.length > value.entries.length
    const entries = cursor
      ? [
          ...previous.entries,
          ...value.entries.filter(
            (item) => !previous.entries.some((old) => old.path === item.path),
          ),
        ]
      : keepPages
        ? previous.entries
        : value.entries
    Object.assign(previous, value, {
      entries: entries.filter((entry) => visiblePath(entry.path)),
      nextCursor: keepPages ? previous.nextCursor : (value.nextCursor ?? null),
      operation: value.operation ?? null,
      generation: cursor ? previous.generation : value.generation,
      error: '',
    })
  }
  function toggle(pid: Id, path: string) {
    if (!visiblePath(path)) return
    const paths = (expanded.value[String(pid)] ||= [])
    expanded.value[String(pid)] = paths.includes(path)
      ? paths.filter((item) => item !== path)
      : [...paths, path]
  }
  return { projects, expanded, directory, apply, toggle }
})
