import type { Message, DisplayMessage, AssistantDisplayMessage, MessageType } from '@/types/domain'
export function normalizeLegacyDeltaContent(content: string) {
  if (typeof content !== 'string' || !content.includes('{"threadId"')) return content || ''
  let result = ''
  let cursor = 0
  while (cursor < content.length) {
    const start = content.indexOf('{', cursor)
    if (start < 0) return result + content.slice(cursor)
    result += content.slice(cursor, start)
    const end = findJsonObjectEnd(content, start)
    if (end < 0) return result + content.slice(start)
    const candidate = content.slice(start, end + 1)
    let parsed: unknown
    try {
      parsed = JSON.parse(candidate)
    } catch {
      result += content[start]
      cursor = start + 1
      continue
    }
    if (isWhitespaceDeltaEnvelope(parsed)) {
      result += parsed.delta
      cursor = end + 1
    } else {
      result += candidate
      cursor = end + 1
    }
  }
  return result
}

export function buildConversationDisplayMessages(messages: Message[]) {
  const result: DisplayMessage[] = []
  for (const message of messages) {
    if (message.role === 'USER') {
      result.push({ ...message, role: 'USER', id: `user-${message.id}` })
      continue
    }
    const previous = result[result.length - 1]
    const sameTurn =
      previous?.role === 'ASSISTANT' && String(previous.turnId) === String(message.turnId)
    const group: AssistantDisplayMessage =
      sameTurn && previous.role === 'ASSISTANT'
        ? previous
        : {
            id: `assistant-${message.turnId ?? message.id}`,
            role: 'ASSISTANT',
            turnId: message.turnId,
            sequenceStart: message.sequenceNo,
            sequenceEnd: message.sequenceNo,
            createdAt: message.createdAt,
            content: '',
            processItems: [],
            streaming: false,
            responseItemId: null,
            itemPhases: {},
            activeAgentPhase: null,
          }
    if (!sameTurn) result.push(group)
    group.sequenceEnd = message.sequenceNo
    group.streaming ||= Boolean(message.streaming)
    group.incomplete ||= ['INCOMPLETE', 'INTERRUPTED'].includes(message.status || '')
    group.truncated ||= Boolean(message.truncated)
    if (message.messageType === 'TEXT') {
      const phase = message.itemId ? group.itemPhases![message.itemId] : group.activeAgentPhase
      if (phase === 'commentary') {
        appendProcessItem(group, message, 'COMMENTARY')
        continue
      }
      if (
        group.content &&
        message.itemId &&
        group.responseItemId &&
        message.itemId !== group.responseItemId
      )
        group.content += '\n\n'
      group.content +=
        message.streaming || message.messageKey
          ? message.content || ''
          : normalizeLegacyDeltaContent(message.content)
      if (message.itemId) group.responseItemId = message.itemId
      continue
    }
    const agentMessage = parseAgentMessageActivity(message.content)
    if (agentMessage) {
      group.activeAgentPhase = agentMessage.phase
      group.itemPhases![message.itemId || agentMessage.id] = agentMessage.phase
      continue
    }
    appendProcessItem(group, message, message.messageType || 'ACTIVITY')
  }
  for (const item of result) {
    if (item.role === 'ASSISTANT') {
      delete item.itemPhases
      delete item.activeAgentPhase
    }
  }
  return result
}

function appendProcessItem(
  group: AssistantDisplayMessage,
  message: Message,
  messageType: MessageType,
) {
  const detailId = processDetailId(message.content)
  const key = `${messageType}:${message.itemId || detailId || 'consecutive'}`
  const lastItem = group.processItems[group.processItems.length - 1]
  if (lastItem?.key === key) {
    if (messageType === 'ACTIVITY' && detailId)
      lastItem.content = message.content || lastItem.content
    else lastItem.content += message.content || ''
    lastItem.streaming ||= Boolean(message.streaming)
    return
  }
  group.processItems.push({
    status: message.status,
    key,
    messageType,
    content: message.content || '',
    streaming: Boolean(message.streaming),
  })
}

function processDetailId(content: string) {
  if (typeof content !== 'string' || !content.trimStart().startsWith('{')) return null
  try {
    const value: unknown = JSON.parse(content)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return 'id' in value && typeof value.id === 'string' ? value.id : null
  } catch {
    return null
  }
}

function parseAgentMessageActivity(content: string) {
  if (typeof content !== 'string' || !content.trimStart().startsWith('{')) return null
  try {
    const value: unknown = JSON.parse(content)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    if (
      !('type' in value) ||
      value.type !== 'agentMessage' ||
      !('phase' in value) ||
      typeof value.phase !== 'string' ||
      !['commentary', 'final_answer'].includes(value.phase)
    )
      return null
    return { id: 'id' in value && typeof value.id === 'string' ? value.id : '', phase: value.phase }
  } catch {
    return null
  }
}

function findJsonObjectEnd(content: string, start: number) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < content.length; index += 1) {
    const character = content[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}' && --depth === 0) return index
  }
  return -1
}

function isWhitespaceDeltaEnvelope(
  value: unknown,
): value is { threadId: string; turnId: string; itemId: string; delta: string } {
  return (
    value !== null &&
    typeof value === 'object' &&
    'threadId' in value &&
    typeof value.threadId === 'string' &&
    'turnId' in value &&
    typeof value.turnId === 'string' &&
    'itemId' in value &&
    typeof value.itemId === 'string' &&
    'delta' in value &&
    typeof value.delta === 'string' &&
    /^\s*$/.test(value.delta)
  )
}
