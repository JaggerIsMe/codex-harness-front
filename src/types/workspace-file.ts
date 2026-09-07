import type { Id } from './domain'

export interface WorkspaceFileEntry {
  name: string
  path: string
  type: 'DIRECTORY' | 'FILE' | 'UNAVAILABLE'
  sizeBytes: number
  modifiedAt: number
}
export interface WorkspaceFileOperation {
  id: Id
  kind: string
  path: string
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED'
  error: string | null
}
export interface WorkspaceDirectory {
  path: string
  generation: string
  scannedAt: number
  entries: WorkspaceFileEntry[]
  nextCursor: string | null
  loaded: boolean
  online: boolean
  supported: boolean
  operation: WorkspaceFileOperation | null
  maxFileBytes: number
}
export interface WorkspaceDirectoryState extends WorkspaceDirectory {
  loading: boolean
  error: string
}
