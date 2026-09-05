import type { Id } from './domain'
export interface Expert {
  id: Id
  name: string
  description: string
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'DISABLED'
  publishedVersionId: Id | null
  revision: number
  systemPrompt: string | null
  skillVersionIds: number[]
}
export interface ExpertDraft {
  name: string
  description: string
  systemPrompt: string
  skillVersionIds: number[]
  mcpBindings: string[]
  knowledgeBindings: string[]
  revision?: number
}
export interface ExpertVersion {
  id: Id
  expertId: Id
  versionNo: number
  name: string
  description: string
  skillVersionIds: number[]
  compatibleUpgrade: boolean
}
export interface ProjectExpert {
  expertId: Id
  expertVersionId: Id
  versionNo: number
  latestVersionId: Id | null
  latestVersionNo: number | null
  upgradeAvailable: boolean
  name: string
  description: string
  available: boolean
  unavailableReason: string | null
}
export interface ProjectExperts {
  projectRevision: number
  experts: ProjectExpert[]
}
export interface ExpertSelection {
  expertId: Id | null
  expertVersionId: Id | null
  name: string | null
  selectionRevision: number
  projectRevision: number
  available: boolean
  unavailableReason: string | null
}
export interface TurnExpert {
  turnId: Id
  expertVersionId: Id | null
  expertName: string | null
}
