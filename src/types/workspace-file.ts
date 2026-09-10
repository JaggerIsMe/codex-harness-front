import type { Id } from './domain'

export interface WorkspaceFileEntry {
  name: string
  path: string
  type: 'DIRECTORY' | 'FILE' | 'UNAVAILABLE'
  sizeBytes: number
  modifiedAt: number
  entryRevision?: string | null
}
export interface WorkspaceCapability {
  supported: boolean
  enabled: boolean
  reason: string | null
}
export interface WorkspaceFileLimits {
  maxArchiveFiles: number
  maxArchiveSourceBytes: number
  maxArchiveOutputBytes: number
  maxFileBytes: number
  maxRequestBytes: number
}
export interface WorkspaceDeletePlan {
  planId: string
  planDigest: string
  path: string
  entryType: WorkspaceFileEntry['type']
  entryRevision: string
  fileCount: number
  directoryCount: number
  totalBytes: number
  expiresAt: number
  attachmentCount?: number
}
export interface WorkspaceOperationItem {
  path: string
  entryType: WorkspaceFileEntry['type']
  status: 'DELETED' | 'REMAINING' | 'UNKNOWN' | 'ARCHIVED' | 'FAILED'
  code?: string | null
  error?: string | null
}
export interface WorkspaceOperationResult {
  version: number
  status: string
  outcome: 'NO_CHANGE' | 'COMPLETE' | 'PARTIAL' | 'UNKNOWN'
  sourcePath?: string | null
  targetPath?: string | null
  entryType?: WorkspaceFileEntry['type'] | null
  entryRevision?: string | null
  plan?: WorkspaceDeletePlan | null
  summary?: { deletedFiles: number; deletedDirectories: number; remainingCount: number } | null
  items?: WorkspaceOperationItem[] | null
  resultDigest?: string | null
}
export interface WorkspaceFileOperation {
  id: Id
  kind: string
  path: string
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'PARTIAL_FAILED' | 'UNKNOWN'
  error: string | null
  targetPath?: string | null
  code?: string | null
  contentState?: 'NONE' | 'PENDING' | 'AVAILABLE' | 'EXPIRED' | null
  attachmentCount?: number
  result?: WorkspaceOperationResult | null
}
export interface WorkspaceOperationPage<T = WorkspaceFileOperation> {
  items: T[]
  nextCursor: string | null
}
export interface WorkspaceFileChange {
  operationId: Id
  kind: string
  status: WorkspaceFileOperation['status']
  sourcePath: string
  targetPath?: string | null
  entryType?: WorkspaceFileEntry['type'] | null
  entryRevision?: string | null
  items?: WorkspaceOperationItem[]
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
  capabilities?: { mutations: WorkspaceCapability; archive: WorkspaceCapability }
  limits?: WorkspaceFileLimits
}
export interface WorkspaceDirectoryState extends WorkspaceDirectory {
  loading: boolean
  error: string
}
