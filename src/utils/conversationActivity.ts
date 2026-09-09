import type { Conversation, Id, Turn } from '@/types/domain'

export type ActivityIssueKind = 'send' | 'message' | 'sync'
export interface ConversationActivity {
  state: 'idle' | 'running' | 'completed' | 'error'
  label: string
}
export interface ActivitySnapshot {
  conversation: Conversation
  turn: Turn | null
  failureMessage: string
  incomplete: boolean
  issues: Partial<Record<ActivityIssueKind, string>>
  revision: number
}
export const ACTIVE_TURN_STATUSES = ['CREATED', 'RUNNING', 'WAITING_APPROVAL']
export const TERMINAL_TURN_STATUSES = ['COMPLETED', 'FAILED', 'INTERRUPTED']

export function isActivityRunning(snapshot: ActivitySnapshot) {
  return (
    snapshot.conversation.status === 'ACTIVE' &&
    (ACTIVE_TURN_STATUSES.includes(snapshot.turn?.status || '') ||
      (!snapshot.turn && !snapshot.conversation.codexThreadId))
  )
}

export function snapshotOf(conversation: Conversation): ActivitySnapshot {
  return {
    conversation,
    turn:
      conversation.latestTurnId != null && conversation.latestTurnStatus
        ? { id: Number(conversation.latestTurnId), status: conversation.latestTurnStatus }
        : null,
    failureMessage: conversation.latestTurnFailureMessage || '',
    incomplete: conversation.latestTurnHasIncompleteMessage || false,
    issues: {},
    revision: 0,
  }
}

/** A late response or earlier Turn must never restart an already finished Turn. */
export function canAdvanceTurn(current: Turn | null, next: Turn | null) {
  if (!current) return true
  if (!next || Number(next.id) < Number(current.id)) return false
  if (Number(next.id) > Number(current.id)) return true
  if (TERMINAL_TURN_STATUSES.includes(current.status)) return next.status === current.status
  return next.status !== 'CREATED' || current.status === 'CREATED'
}

export function sameId(a: Id | null | undefined, b: Id | null | undefined) {
  return a != null && b != null && String(a) === String(b)
}

export function describeActivity(
  snapshot: ActivitySnapshot,
  disconnected: boolean,
): ConversationActivity {
  const { conversation, turn, issues } = snapshot
  if (conversation.status === 'FAILED' || turn?.status === 'FAILED')
    return { state: 'error', label: snapshot.failureMessage || '回复异常' }
  const issue = issues.send || issues.message || issues.sync
  if (issue) return { state: 'error', label: issue }
  if (snapshot.incomplete && turn?.status !== 'INTERRUPTED')
    return { state: 'error', label: '消息接收不完整' }
  if (isActivityRunning(snapshot)) {
    if (disconnected) return { state: 'error', label: '连接已断开，暂时无法接收消息' }
    return {
      state: 'running',
      label:
        turn?.status === 'WAITING_APPROVAL'
          ? '等待审批'
          : turn
            ? 'Agent 正在回复'
            : 'Agent 正在初始化 Thread',
    }
  }
  if (turn?.status === 'COMPLETED') return { state: 'completed', label: '回复已完成' }
  return { state: 'idle', label: turn?.status === 'INTERRUPTED' ? '已停止回复' : '' }
}

/** Stable across polling and reloads; no error text or message content is stored. */
export function activityNotificationKey(snapshot: ActivitySnapshot, disconnected: boolean) {
  const state = describeActivity(snapshot, disconnected).state
  if (state !== 'completed' && state !== 'error') return null
  const { conversation, turn, issues } = snapshot
  const reason =
    conversation.status === 'FAILED'
      ? 'conversation-failed'
      : turn?.status === 'FAILED'
        ? 'turn-failed'
        : issues.send
          ? 'send'
          : issues.message
            ? 'message'
            : issues.sync
              ? 'sync'
              : snapshot.incomplete
                ? 'incomplete'
                : state === 'completed'
                  ? 'completed'
                  : 'disconnected'
  return JSON.stringify([
    conversation.projectId,
    conversation.codexThreadId,
    turn?.id ?? null,
    reason,
  ])
}
