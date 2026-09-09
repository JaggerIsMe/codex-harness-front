import type { Id } from './domain'
export interface WorkspaceFilePreview {
  operationId: Id
  path: string
  fileName: string
  kind: 'TEXT' | 'MARKDOWN' | 'IMAGE' | 'PDF' | 'TABLE' | 'UNSUPPORTED'
  mediaType: string | null
  encoding: string | null
  sizeBytes: number
  sha256: string
  readyAt: string | null
  width: number | null
  height: number | null
  reason: string | null
  limits: {
    maxBytes: number
    maxLines: number
    maxRows: number
    maxColumns: number
    maxPixels: number
  }
}
