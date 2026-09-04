import type { Message, MessagePatch } from '../types/domain'

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
const messageTypes = [
  'TEXT',
  'COMMENTARY',
  'REASONING',
  'COMMAND',
  'COMMAND_OUTPUT',
  'FILE_CHANGE',
  'ERROR',
  'ACTIVITY',
]
const statuses = ['STREAMING', 'COMPLETED', 'INCOMPLETE', 'INTERRUPTED']

export function parseMessagePatches(value: unknown): MessagePatch[] | undefined {
  if (!Array.isArray(value) || value.length > 16) return undefined
  const result: MessagePatch[] = []
  for (const patch of value) {
    if (!record(patch) || !record(patch.message)) return undefined
    const m = patch.message
    if (
      !['APPEND', 'REPLACE'].includes(String(patch.operation)) ||
      !Number.isSafeInteger(patch.baseRevision) ||
      Number(patch.baseRevision) < 0 ||
      typeof m.messageKey !== 'string' ||
      !m.messageKey ||
      !Number.isSafeInteger(m.revision) ||
      Number(m.revision) <= 0 ||
      !Number.isSafeInteger(m.sequenceNo) ||
      Number(m.sequenceNo) <= 0 ||
      !Number.isSafeInteger(m.turnId) ||
      Number(m.turnId) <= 0 ||
      !(typeof m.id === 'string' || typeof m.id === 'number') ||
      typeof m.content !== 'string' ||
      m.content.length > 1048576 ||
      !['USER', 'ASSISTANT', 'SYSTEM'].includes(String(m.role)) ||
      !messageTypes.includes(String(m.messageType)) ||
      !statuses.includes(String(m.status))
    )
      return undefined
    result.push({
      operation: patch.operation as MessagePatch['operation'],
      baseRevision: Number(patch.baseRevision),
      message: {
        id: m.id,
        turnId: Number(m.turnId),
        sequenceNo: Number(m.sequenceNo),
        messageKey: m.messageKey,
        revision: Number(m.revision),
        content: m.content,
        role: m.role as Message['role'],
        messageType: m.messageType as Message['messageType'],
        status: m.status as Message['status'],
        streaming: m.status === 'STREAMING',
        itemId: typeof m.itemId === 'string' ? m.itemId : null,
        phase: typeof m.phase === 'string' ? m.phase : null,
        metadata: typeof m.metadata === 'string' ? m.metadata : null,
        createdAt: typeof m.createdAt === 'string' ? m.createdAt : undefined,
        truncated: m.truncated === true,
      },
    })
  }
  return result
}

/** Apply one frame atomically. A missing base requires an authoritative snapshot. */
export function applyMessagePatches(
  messages: Message[],
  patches: MessagePatch[],
): Message[] | null {
  const next = [...messages]
  for (const patch of patches) {
    const incoming = patch.message
    const index = next.findIndex((m) => m.messageKey === incoming.messageKey)
    const old = next[index]
    if (old && (old.revision || 0) >= (incoming.revision || 0)) continue
    if (patch.operation === 'APPEND' && (!old || old.revision !== patch.baseRevision)) return null
    const value: Message = {
      ...incoming,
      content: patch.operation === 'APPEND' ? old!.content + incoming.content : incoming.content,
      streaming: incoming.status === 'STREAMING',
    }
    if (value.content.length > 1048576) return null
    if (index >= 0) next[index] = value
    else next.push(value)
  }
  return next.sort((a, b) => a.sequenceNo - b.sequenceNo)
}
