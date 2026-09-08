import type { Id } from './domain'

export interface ModelRuntimeSpec {
  providerName: string
  baseUrl: string
  modelId: string
  inputModalities: string[]
  contextWindowTokens: number
}
export interface ModelConfiguration {
  id: Id
  configurationCode: string
  name: string
  description: string
  status: 'ENABLED' | 'DISABLED'
  currentVersionId: Id
  currentVersionNo: number
  configDigest: string
  revision: number
  runtime: ModelRuntimeSpec
  apiKeyMasked: string
  createdAt: string
  updatedAt: string
}
export interface ModelConfigurationDraft extends ModelRuntimeSpec {
  configurationCode: string
  name: string
  description: string
  apiKey: string
  revision?: number
}
export interface ModelSelectableVersion {
  configurationId: Id
  versionId: Id
  versionNo: number
  configurationCode: string
  name: string
  providerName: string
  modelId: string
  inputModalities: string[]
  configDigest: string
}
export interface DeviceModelAssignment {
  deviceId: Id
  runtimeMode: 'LOCAL_CODEX' | 'MANAGED_PROVIDER'
  modelConfigurationVersionId: Id | null
  revision: number
  configurationId: Id | null
  versionNo: number | null
  configurationCode: string | null
  name: string
  modelId: string | null
  updatedAt: string
}
