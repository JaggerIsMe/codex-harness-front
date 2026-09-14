import type { Id } from './domain'

export type OrchestrationStatus =
  'QUEUED' | 'RUNNING' | 'CANCELING' | 'NEEDS_ATTENTION' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
export type StepStatus =
  | OrchestrationStatus
  | 'PENDING'
  | 'CREATING'
  | 'WAITING_THREAD'
  | 'DISPATCHING'
  | 'WAITING_APPROVAL'
  | 'WAITING_USER'
  | 'VALIDATING'
  | 'VALIDATION_FAILED'
  | 'SKIPPED'
export interface StepResult {
  schemaVersion: number
  summary: string
  sourceMessageIds: Id[]
  sourceTurnId: Id | null
  expertVersionId: Id | null
  truncated: boolean
  output?: JsonValue | null
  files?: WorkflowFileReference[] | null
}
export interface OrchestrationStep {
  id: Id
  position: number
  name: string
  expertId: Id | null
  objective: string
  status: StepStatus
  conversationId: Id | null
  turnId: Id | null
  failureMessage: string | null
  result: StepResult | null
}
export interface Orchestration {
  id: Id
  projectId: Id
  title: string
  goal: string
  status: OrchestrationStatus
  failureMessage: string | null
  createdAt: string
  steps: OrchestrationStep[]
  workflow?: Workflow | null
}
export interface CreateOrchestration {
  title: string
  goal: string
  requestKey: string
  workflow: Workflow
}
export const statusLabels: Record<StepStatus, string> = {
  QUEUED: '排队中',
  RUNNING: '执行中',
  CANCELING: '正在停止',
  NEEDS_ATTENTION: '待核实',
  SUCCEEDED: '已完成',
  FAILED: '失败',
  CANCELLED: '已停止',
  PENDING: '等待上游',
  CREATING: '创建会话',
  WAITING_THREAD: '等待会话就绪',
  DISPATCHING: '派发中',
  WAITING_APPROVAL: '等待用户决定',
  WAITING_USER: '等待补充信息',
  VALIDATING: '校验节点产出',
  VALIDATION_FAILED: '产出校验未通过',
  SKIPPED: '已跳过',
}
export const terminalStatuses: OrchestrationStatus[] = ['SUCCEEDED', 'FAILED', 'CANCELLED']

export interface Workflow {
  schemaVersion: 2 | 3 | 4
  startNodeId: string
  nodes: WorkflowNode[]
}
export interface WorkflowNode {
  id: string
  kind: 'START' | 'EXPERT' | 'BRANCH' | 'END'
  name: string
  expertId: Id | null
  objective: string
  next: string | null
  condition: WorkflowCondition | null
  x: number
  y: number
  inputs?: WorkflowInput[] | null
  outputSchema?: WorkflowOutputSchema | null
  inputFiles?: WorkflowFileReference[] | null
  outputFiles?: WorkflowFileReference[] | null
}
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null'
export interface WorkflowOutputSchema {
  type: JsonType
  description?: string
  properties?: Record<string, WorkflowOutputSchema>
  required?: string[]
  additionalProperties?: boolean
  items?: WorkflowOutputSchema
  enum?: JsonValue[]
}
export interface WorkflowInput {
  name: string
  source: 'GOAL' | 'CONSTANT' | 'RESULT_TEXT' | 'RESULT_JSON' | 'FILE'
  sourceNodeId?: string | null
  pointer?: string | null
  value?: string | null
  fileName?: string | null
  required: boolean
}
export interface WorkflowFileReference {
  name: string
  path?: string | null
  sourceNodeId?: string | null
  sourceFile?: string | null
}
export interface WorkflowCondition {
  sourceNodeId: string
  operator: 'EQUALS' | 'CONTAINS' | 'JSON_EQUALS'
  pointer: string
  value: string
  whenTrue: string | null
  whenFalse: string | null
}
