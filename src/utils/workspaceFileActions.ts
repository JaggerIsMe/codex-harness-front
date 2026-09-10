import type {
  WorkspaceFileChange,
  WorkspaceFileEntry,
  WorkspaceFileOperation,
} from '@/types/workspace-file'

export const workspaceParent = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
export const insideWorkspacePath = (path: string, parent: string) =>
  path === parent || path.startsWith(`${parent}/`)
export const mutationKind = (kind: string) =>
  ['RELOCATE_WORKSPACE_ENTRY', 'DELETE_WORKSPACE_ENTRY'].includes(kind)
export const mapWorkspacePath = (path: string, source: string, target: string) =>
  insideWorkspacePath(path, source) ? target + path.slice(source.length) : path
export function validWorkspaceName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    !/[\x00-\x1f\x7f/\\<>:"|?*]/.test(name) &&
    !/[. ]$/.test(name) &&
    name !== '.' &&
    name !== '..' &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) &&
    !/^\.(codex|git|harness|agent|agents|harness-workspace\.json)$/i.test(name) &&
    !/^\.harness-upload-/i.test(name)
  )
}
export function operationChange(operation: WorkspaceFileOperation): WorkspaceFileChange | null {
  if (
    !mutationKind(operation.kind) ||
    !['SUCCEEDED', 'PARTIAL_FAILED', 'UNKNOWN'].includes(operation.status)
  )
    return null
  return {
    operationId: operation.id,
    kind: operation.kind,
    status: operation.status,
    sourcePath: operation.result?.sourcePath || operation.path,
    targetPath: operation.result?.targetPath || operation.targetPath,
    entryType: operation.result?.entryType,
    entryRevision: operation.result?.entryRevision,
    items: operation.result?.items || [],
  }
}
export function workspaceChangeEvent(
  payload: Record<string, unknown> | undefined,
): WorkspaceFileChange | null {
  if (
    !payload ||
    typeof payload.kind !== 'string' ||
    !mutationKind(payload.kind) ||
    (typeof payload.operationId !== 'string' && typeof payload.operationId !== 'number') ||
    !['SUCCEEDED', 'PARTIAL_FAILED', 'UNKNOWN'].includes(String(payload.status)) ||
    typeof payload.sourcePath !== 'string'
  )
    return null
  if (!/^\d+$/.test(String(payload.operationId))) return null
  return {
    operationId: payload.operationId,
    kind: payload.kind,
    status: payload.status as WorkspaceFileOperation['status'],
    sourcePath: payload.sourcePath,
    targetPath: typeof payload.targetPath === 'string' ? payload.targetPath : null,
    entryType: payload.entryType === 'DIRECTORY' ? 'DIRECTORY' : 'FILE',
    entryRevision: typeof payload.entryRevision === 'string' ? payload.entryRevision : null,
  }
}
export function mappedSelection(
  entries: WorkspaceFileEntry[],
  change: WorkspaceFileChange,
): WorkspaceFileEntry[] {
  if (change.status === 'UNKNOWN' || change.status === 'PARTIAL_FAILED')
    return entries
      .filter(
        (entry) =>
          !change.items?.some((item) => item.path === entry.path && item.status === 'DELETED'),
      )
      .map((entry) =>
        insideWorkspacePath(entry.path, change.sourcePath)
          ? { ...entry, entryRevision: null }
          : entry,
      )
  if (change.kind === 'DELETE_WORKSPACE_ENTRY')
    return entries.filter((entry) => !insideWorkspacePath(entry.path, change.sourcePath))
  if (!change.targetPath) return entries
  return entries.map((entry) => {
    if (!insideWorkspacePath(entry.path, change.sourcePath)) return entry
    const path = mapWorkspacePath(entry.path, change.sourcePath, change.targetPath!)
    return {
      ...entry,
      path,
      name: path.split('/').at(-1)!,
      entryRevision: entry.path === change.sourcePath ? change.entryRevision : null,
    }
  })
}
export function formatWorkspaceBytes(bytes: number): string {
  return bytes < 1024
    ? `${bytes} B`
    : bytes < 1048576
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1048576).toFixed(1)} MiB`
}
