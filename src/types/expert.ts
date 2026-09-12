import type { Id } from './domain'
export interface ExpertBindingOption {
  id: number
  label: string
  tag?: string
  unavailable?: boolean
}
export interface Expert {
  id: Id
  name: string
  description: string
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'DISABLED'
  draftChanged: boolean
  publishedVersionId: Id | null
  revision: number
  systemPrompt: string | null
  skillVersionIds: number[]
  mcpBindings: number[]
  skillUpdates: ExpertSkillUpdate[]
  mcpUpdates: ExpertMcpUpdate[]
}
export interface ExpertMcpUpdate {
  configurationId: number
  name: string
  currentVersionId: number
  currentVersionNo: number
  availableVersionId: number
  availableVersionNo: number
}
export interface ExpertSkillUpdate {
  skillId: number
  skillName: string
  currentVersionId: number
  currentVersion: string
  availableVersionId: number
  availableVersion: string
}
export interface ExpertDraft {
  name: string
  description: string
  systemPrompt: string
  skillVersionIds: number[]
  mcpBindings: number[]
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
  mcpBindings: number[]
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
