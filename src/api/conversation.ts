import { request } from './request'
import type { PageQuery } from '@/utils/pagination'
import type {
  Conversation,
  Turn,
  Approval,
  Id,
  ConversationInput,
  TurnInput,
  Message,
  Decision,
  MessageState,
  PageResult,
} from '@/types/domain'
export function getConversations(projectId: Id, signal?: AbortSignal, query: PageQuery = {}) {
  return request<PageResult<Conversation> | Conversation[]>(
    'get',
    `/projects/${projectId}/conversations`,
    undefined,
    {
      signal,
      params: { page: 1, size: 10, ...query },
    },
  )
}
export function getConversationStatuses(projectId: Id, ids: Id[], signal?: AbortSignal) {
  return request<Conversation[]>('get', `/projects/${projectId}/conversations/status`, undefined, {
    signal,
    params: { ids: ids.join(',') },
  })
}
export function getConversation(projectId: Id, conversationId: Id, signal?: AbortSignal) {
  return request<Conversation>(
    'get',
    `/projects/${projectId}/conversations/${conversationId}`,
    undefined,
    { signal },
  )
}
export function getActiveTurn(projectId: Id, conversationId: Id, signal?: AbortSignal) {
  return request<Turn | null>(
    'get',
    `/projects/${projectId}/conversations/${conversationId}/active-turn`,
    undefined,
    { signal },
  )
}
export function getConversationMessages(projectId: Id, conversationId: Id, signal?: AbortSignal) {
  return request<Message[]>(
    'get',
    `/projects/${projectId}/conversations/${conversationId}/messages`,
    undefined,
    { signal },
  )
}
export function getConversationMessageState(
  projectId: Id,
  conversationId: Id,
  signal?: AbortSignal,
  before = 0,
) {
  return request<MessageState>(
    'get',
    `/projects/${projectId}/conversations/${conversationId}/message-state?before=${before}`,
    undefined,
    { signal },
  )
}
export function getConversationApprovals(projectId: Id, conversationId: Id, signal?: AbortSignal) {
  return request<Approval[]>(
    'get',
    `/projects/${projectId}/conversations/${conversationId}/approvals`,
    undefined,
    { signal },
  )
}
export function createConversation(projectId: Id, data: ConversationInput) {
  return request<Conversation>('post', `/projects/${projectId}/conversations`, data)
}
export function startTurn(projectId: Id, conversationId: Id, data: TurnInput) {
  return request<Turn>('post', `/projects/${projectId}/conversations/${conversationId}/turns`, data)
}
export function interruptTurn(projectId: Id, conversationId: Id, turnId: Id) {
  return request<Turn>(
    'post',
    `/projects/${projectId}/conversations/${conversationId}/turns/${turnId}/interrupt`,
  )
}
export function resolveApproval(approvalId: Id, decision: Decision) {
  return request<Approval>('post', `/approvals/${approvalId}/decision`, { decision })
}
