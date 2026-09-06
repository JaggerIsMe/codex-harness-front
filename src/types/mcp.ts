import type { Id } from './domain'

export type McpTransportType = 'STDIO' | 'STREAMABLE_HTTP'
export interface McpRuntimeSpec {
  transportType: McpTransportType
  command: string | null
  args: string[]
  cwdMode: 'WORKSPACE' | null
  envVars: string[]
  url: string | null
  httpHeaders: Record<string, string>
  startupTimeoutSeconds: number
  toolTimeoutSeconds: number
  required: boolean
  enabledTools: string[]
  disabledTools: string[]
}
export interface McpConfiguration {
  id: Id
  serverCode: string
  name: string
  description: string
  status: 'ENABLED' | 'DISABLED'
  currentVersionId: Id
  currentVersionNo: number
  configDigest: string
  revision: number
  runtimeSpec: McpRuntimeSpec
  createdAt: string
  updatedAt: string
}
export interface McpConfigurationVersion {
  id: Id
  configurationId: Id
  versionNo: number
  serverCode: string
  name: string
  description: string
  status: 'ACTIVE' | 'REVOKED'
  configDigest: string
  runtimeSpec: McpRuntimeSpec
  createdAt: string
}
export interface McpSelectableVersion {
  configurationId: Id
  versionId: Id
  versionNo: number
  serverCode: string
  name: string
  transportType: McpTransportType
  configDigest: string
}
export interface McpConfigurationDraft extends Omit<McpRuntimeSpec, 'command' | 'url'> {
  serverCode: string
  name: string
  description: string
  command: string
  url: string
  revision?: number
}
