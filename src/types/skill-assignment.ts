export type AssignmentAction = 'ADD' | 'REPLACE' | 'SKIP' | 'BLOCKED'
export interface AssignmentTargetInput {
  skillId: number
  versionId: number
}
export interface AssignmentTarget extends AssignmentTargetInput {
  skillName: string
  version: string
}
export interface AssignmentChange extends AssignmentTarget {
  draftVersionId: number | null
  draftVersion: string | null
  publishedVersion: string | null
  action: AssignmentAction
}
export interface AssignmentCandidate {
  expertId: number
  name: string
  status: string
  revision: number
  draftVersionId: number | null
  draftVersion: string | null
  publishedVersion: string | null
  action: AssignmentAction
  reason: string
  changes?: AssignmentChange[]
}
export interface AssignmentPage {
  items: AssignmentCandidate[]
  total: number
  page: number
  size: number
}
export interface AssignmentPreview {
  batchId: string
  skillName: string
  version: string
  items: AssignmentCandidate[]
  expiresAt: string
  targets?: AssignmentTarget[]
}
export interface AssignmentResult {
  expertId: number
  name: string
  action: AssignmentAction
  previousVersionId: number | null
  versionId: number
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  message: string
  revision: number | null
  changes?: AssignmentChange[]
}
export interface AssignmentSubmission {
  batchId: string
  skillName: string
  version: string
  started: boolean
  complete: boolean
  items: AssignmentResult[]
  targets?: AssignmentTarget[]
}
export interface AssignmentHistory {
  batchId: string
  skillName: string
  version: string
  createdAt: string
  successCount: number
  failedCount: number
  skippedCount: number
  targets?: AssignmentTarget[]
}
