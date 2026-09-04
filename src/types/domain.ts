export type Id = number | string
export type Decision = 'ACCEPT' | 'ACCEPT_FOR_SESSION' | 'DECLINE' | 'CANCEL'
export type Json = string | number | boolean | null | unknown[] | Record<string, unknown>
export interface Device {
  id: number
  deviceCode: string
  deviceName: string
  status: string
  agentVersion: string
  osName: string
  osVersion: string
  isolationMode: string
  lastHeartbeatAt: string
}
export interface Workspace {
  id: number
  deviceId: number
  workspaceName: string
  rootPath: string
  status: string
  lastReportedAt: string
  parentName: string
  projectType: string
  failureCode: string
  failureMessage: string
}
export interface WorkspaceRoot {
  id: number
  deviceId: number
  rootName: string
  status: string
}
export interface User {
  id: number
  username: string
  displayName: string
}
export interface LoginResult {
  accessToken: string
  tokenType: string
  expiresInSeconds: number
  user: User
}
export interface Enrollment {
  enrollmentCode: string
  expiresAt: string
}
export interface Project {
  id: number
  projectName: string
  status: string
  isolationMode: string
  deviceId: number
  deviceCode: string
  deviceName: string
  deviceStatus: string
  workspaceId: number
  workspaceName: string
  rootPath: string
  workspaceStatus: string
  conversationCount: number
  createdAt: string
}
export interface Conversation {
  id: number
  deviceId: number
  workspaceId: number
  projectId: number
  projectName: string
  title: string
  status: string
  codexThreadId: string
}
export interface Turn {
  id: number
  conversationId?: number
  status: string
  codexTurnId?: string
}
export interface Approval {
  id: number
  conversationId: number
  turnId: number
  approvalType: string
  details: Json
  status: string
}
export interface Skill {
  id: number
  skillName: string
  description: string
  status: string
  versionCount: number
  createdAt: string
  updatedAt: string
  versions: SkillVersion[]
}
export interface SkillVersion {
  id: number
  skillId: number
  version: string
  sha256: string
  fileSize: number
  status: string
  createdAt: string
}
export interface SkillDeployment {
  id: number
  deviceId: number
  skillVersionId: number
  skillId: number
  skillName: string
  version: string
  deviceName: string
  installStatus: string
  errorMessage: string
  requestedAt: string
  installedAt: string
  updatedAt: string
  scopeType: string
  projectId: number
  projectName: string
}

export interface ApiResponse<T> {
  status: 'success' | 'error'
  code: number
  info: string
  data: T
}
export interface Credentials {
  username: string
  password: string
}
export interface WorkspaceInput {
  parentName: string
  workspaceName: string
  projectType: string
}
export interface ProjectInput {
  projectName: string
  deviceId: Id
  workspaceId: Id
}
export interface ConversationInput {
  title?: string
  model?: string
}
export interface TurnInput {
  message: string
  model?: string
  reasoningEffort?: string
}
export interface SkillInput {
  skillName: string
  description: string
  status: string
}
export interface SearchParams {
  keyword?: string
  status?: string
  scopeType?: string
}
export interface DeploymentResult {
  deployments: SkillDeployment[]
  failedCount: number
}
export type MessageType =
  | 'TEXT'
  | 'COMMENTARY'
  | 'REASONING'
  | 'COMMAND'
  | 'COMMAND_OUTPUT'
  | 'FILE_CHANGE'
  | 'ERROR'
  | 'ACTIVITY'
export interface Message {
  id: Id
  turnId: number
  sequenceNo: number
  role: 'USER' | 'ASSISTANT' | 'SYSTEM'
  messageType: MessageType
  content: string
  createdAt?: string
  streaming?: boolean
  itemId?: string | null
  eventType?: string
  phase?: string | null
  messageKey?: string | null
  revision?: number
  status?: 'STREAMING' | 'COMPLETED' | 'INCOMPLETE' | 'INTERRUPTED'
  metadata?: string | null
  truncated?: boolean
}
export interface MessagePatch {
  message: Message
  baseRevision: number
  operation: 'APPEND' | 'REPLACE'
}
export interface MessageUpdate {
  conversationId: Id
  turnId: Id
  cursor: number
  patches: MessagePatch[]
}
export interface MessageState {
  messages: Message[]
  turnId: Id | null
  cursor: number
  hasMore: boolean
  degraded: boolean
  resetRequired: boolean
  updates: MessageUpdate[]
}
export interface ProcessItem {
  status?: Message['status']
  key: string
  messageType: MessageType
  content: string
  streaming: boolean
}
export interface UserDisplayMessage extends Message {
  role: 'USER'
}
export interface AssistantDisplayMessage {
  incomplete?: boolean
  truncated?: boolean
  id: string
  role: 'ASSISTANT'
  turnId: number
  sequenceStart: number
  sequenceEnd: number
  createdAt?: string
  content: string
  processItems: ProcessItem[]
  streaming: boolean
  responseItemId: string | null
  itemPhases?: Record<string, string>
  activeAgentPhase?: string | null
}
export type DisplayMessage = UserDisplayMessage | AssistantDisplayMessage
export interface RealtimeEvent {
  type: string
  deviceId?: Id
  correlationId?: Id
  payload?: {
    conversationId?: Id
    turnId?: Id
    codexTurnId?: string
    eventType?: string
    phase?: string
    itemId?: string
    content?: string
    details?: Json
    commandType?: string
    cursor?: number
    patches?: MessagePatch[]
  }
}
