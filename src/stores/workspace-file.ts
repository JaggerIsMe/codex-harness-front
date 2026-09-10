import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from './auth'
import type { Id } from '@/types/domain'
import type {
  WorkspaceDirectory,
  WorkspaceDirectoryState,
  WorkspaceFileChange,
} from '@/types/workspace-file'
import {
  insideWorkspacePath,
  mapWorkspacePath,
  workspaceParent,
} from '@/utils/workspaceFileActions'

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
  const epochs = ref<Record<string, number>>({})
  const lastChange = ref<Record<string, WorkspaceFileChange>>({})
  const resetEpochs = ref<Record<string, number>>({})
  const latestMutation = new Map<string, { id: bigint; status: string }>()
  const changes = new Set<string>()
  const auth = useAuthStore()
  watch(
    () => auth.token,
    () => {
      projects.value = {}
      expanded.value = {}
      epochs.value = {}
      lastChange.value = {}
      resetEpochs.value = {}
      latestMutation.clear()
      changes.clear()
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
  function epoch(pid: Id) {
    return epochs.value[String(pid)] || 0
  }
  function invalidate(pid: Id) {
    epochs.value[String(pid)] = epoch(pid) + 1
    for (const value of Object.values(projects.value[String(pid)] || {})) {
      value.loaded = false
      value.loading = false
      value.generation = '0'
      value.entries = []
      value.nextCursor = null
    }
  }
  function observeOperation(pid: Id, operationId: Id, status: string) {
    const key = String(pid)
    const id = BigInt(operationId)
    const previous = latestMutation.get(key)
    if (!previous || id > previous.id) latestMutation.set(key, { id, status })
  }
  function applyChange(pid: Id, change: WorkspaceFileChange) {
    const key = `${pid}:${change.operationId}:${change.status}:${change.items?.length || 0}`
    if (changes.has(key)) return false
    changes.add(key)
    if (changes.size > 1000) changes.delete(changes.values().next().value!)
    const projectId = String(pid)
    const id = BigInt(change.operationId)
    const latest = latestMutation.get(projectId)
    if (latest && id < latest.id) {
      // A delayed socket result must never replay an old rename on a newer directory state.
      invalidate(pid)
      expanded.value[projectId] = []
      resetEpochs.value[projectId] = (resetEpochs.value[projectId] || 0) + 1
      return true
    }
    if (
      latest &&
      id === latest.id &&
      ['SUCCEEDED', 'FAILED', 'PARTIAL_FAILED', 'EXPIRED'].includes(latest.status) &&
      change.status === 'UNKNOWN'
    )
      return false
    latestMutation.set(projectId, { id, status: change.status })
    const project = projects.value[String(pid)] || {}
    const paths = expanded.value[String(pid)] || []
    epochs.value[String(pid)] = epoch(pid) + 1
    const parents = new Set([
      workspaceParent(change.sourcePath),
      ...(change.targetPath ? [workspaceParent(change.targetPath)] : []),
    ])
    for (const path of Object.keys(project)) {
      if (
        insideWorkspacePath(path, change.sourcePath) ||
        (change.targetPath && insideWorkspacePath(path, change.targetPath))
      )
        delete project[path]
      else if (parents.has(path)) {
        Object.assign(project[path]!, {
          loaded: false,
          loading: false,
          generation: '0',
          entries: [],
          nextCursor: null,
        })
      }
    }
    if (change.status === 'SUCCEEDED') {
      expanded.value[String(pid)] =
        change.kind === 'DELETE_WORKSPACE_ENTRY'
          ? paths.filter((path) => !insideWorkspacePath(path, change.sourcePath))
          : change.targetPath
            ? paths.map((path) => mapWorkspacePath(path, change.sourcePath, change.targetPath!))
            : paths
    }
    lastChange.value[String(pid)] = change
    return true
  }
  function apply(
    pid: Id,
    value: WorkspaceDirectory,
    cursor: string,
    baseGeneration: string,
    requestEpoch = epoch(pid),
  ) {
    if (requestEpoch !== epoch(pid)) return
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
  return {
    projects,
    expanded,
    epochs,
    resetEpochs,
    lastChange,
    directory,
    apply,
    toggle,
    epoch,
    invalidate,
    applyChange,
    observeOperation,
  }
})
