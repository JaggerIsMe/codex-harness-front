export type SkillImportMode = 'CREATE' | 'UPDATE'
export interface SkillImportUpload {
  uploadId: string
  filename: string
  fileSize: number
  sha256: string
  skillName: string
  description: string
  matchedSkillId: number | null
  expiresAt: string
}
export interface SkillImportInput {
  itemId: string
  uploadId: string
  skillId: number | null
  skillName: string
  description: string
  tag?: string
  version: string
}
export interface SkillImportImpact {
  expertId: number
  expertName: string
  expertStatus: string
  source: 'DRAFT' | 'VERSION'
  expertVersionId: number | null
  expertVersionNo: number | null
  skillVersionId: number
}
export interface SkillImportPreviewItem {
  itemId: string
  skillId: number | null
  skillName: string
  version: string
  currentVersion: string | null
  status: 'READY' | 'SKIP' | 'INVALID'
  message: string
  experts: SkillImportImpact[]
  fingerprint: string
}
export interface SkillImportPreview {
  previewId: string
  items: SkillImportPreviewItem[]
  affectedExpertCount: number
  expiresAt: string
}
export interface SkillImportCommit {
  previewId: string
  submissionId: string
}
export interface SkillImportResult {
  itemId: string
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  message: string
  skillId: number | null
  versionId: number | null
}
export interface SkillImportSubmission {
  submissionId: string
  complete: boolean
  items: SkillImportResult[]
  successCount: number
  failedCount: number
  skippedCount: number
}
