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
  managedModels: boolean
  modelRuntimeTargets: boolean
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
  email: string
  displayName: string
  roles: string[]
  permissions: string[]
  mustChangePassword: boolean
  activated: boolean
}
export interface ManagedUser extends Omit<User, 'permissions'> {
  status: 'ENABLED' | 'DISABLED'
  activationEmailStatus: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED' | null
  deviceIds: number[]
  expertIds: number[]
  lastLoginAt?: string
  createdAt?: string
}
export interface UserInput {
  email: string
  role: 'USER' | 'SYS_ADMIN'
}
export interface EmailSendResult {
  retryAfterSeconds: number
}
export interface ActivationDetails {
  maskedEmail: string
  displayName: string
  expiresAt: string
}
export interface PageResult<T> {
  items: T[]
  total: number
  page: number
  size: number
}
export interface RoleOption {
  code: string
  name: string
}
export interface ExecutableDevice {
  id: number
  deviceName: string
  status: string
  isolationMode: string
  provisioningAvailable: boolean
}
export interface SessionCredentials {
  accessToken: string
  tokenType: string
  expiresInSeconds: number
  expiresAt: number
  sessionId: string
  sessionExpiresAt: number
  idleExpiresAt: number
  refreshBeforeSeconds: number
  credentialGeneration: number
}
export interface LoginResult extends SessionCredentials {
  user: User
}
export interface Enrollment {
  enrollmentCode: string
  expiresAt: string
}
export interface Project {
  provisioningStatus: 'PREPARING' | 'READY' | 'FAILED'
  failureCode?: string
  failureMessage?: string
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
  lastActivityAt?: string | null
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
  lastActivityAt?: string | null
  latestTurnId?: Id | null
  latestTurnStatus?: string | null
  latestTurnFailureMessage?: string | null
  latestTurnHasIncompleteMessage?: boolean
}
export interface Turn {
  preparationPhase?: string | null
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
  tag?: string
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

export interface ApiResponse<T> {
  status: 'success' | 'error'
  code: number
  info: string
  data: T
}
export interface Credentials {
  email: string
  password: string
}
export interface ProjectInput {
  projectName: string
  deviceId: Id
  requestKey: string
}
export interface ConversationInput {
  expertId: Id
  title?: string
}
export interface UpdateProjectInput {
  projectName: string
}
export interface UpdateConversationInput {
  title: string
}
export interface ConversationAttachment {
  workspaceLocationState?: 'AVAILABLE' | 'MISSING' | 'UNKNOWN'
  locationRevision?: number
  lastFileOperationId?: Id | null
  workspacePath?: string | null
  workspaceOperationId?: Id | null
  id: Id
  fileName: string
  mediaType: string
  sizeBytes: number
  sha256: string
}
export interface AttachmentLimits {
  maxFileBytes: number
  maxFiles: number
  maxTotalBytes: number
  agentSupported: boolean
}
export interface TurnInput {
  attachmentIds?: Id[]
  clientRequestId?: string
  message: string
}
export interface SkillInput {
  skillName: string
  description: string
  tag?: string
  status: string
}
export interface SearchParams {
  keyword?: string
  status?: string
  scopeType?: string
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
  attachments?: ConversationAttachment[]
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
    projectId?: Id
    path?: string
    operationId?: Id
    kind?: string
    status?: string
    sourcePath?: string
    targetPath?: string | null
    entryType?: 'FILE' | 'DIRECTORY' | 'UNAVAILABLE'
    entryRevision?: string | null
    affectedDirectories?: string[]
    conversationId?: Id
    turnId?: Id
    codexTurnId?: string
    eventType?: string
    phase?: string
    itemId?: string
    content?: string
    details?: Json
    commandType?: string
    errorCode?: string
    message?: string
    reason?: string
    cursor?: number
    patches?: MessagePatch[]
  }
}
