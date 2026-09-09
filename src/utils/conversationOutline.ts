import type { DisplayMessage } from '@/types/domain'

export interface ConversationOutlineEntry {
  id: string
  anchorId: string
  messageIds: string[]
  prompt: string
  reply: string
  streaming: boolean
}

interface OutlineGroup {
  entry: ConversationOutlineEntry
  hasUser: boolean
  prompts: string[]
  replies: string[]
  narratives: string[]
  processCount: number
}

function turnKey(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return `turn-${value}`
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return `turn-${value}`
  return null
}

function plainMarkdown(content: string): string {
  // A navigation preview only needs a prefix, even while a large reply is streaming.
  return content
    .slice(0, 4096)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/^\s{0,3}\[[^\]]+\]:\s+.*$/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/!?\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/^\s*(?:`{3,}|~{3,})[^\n]*$/gm, '')
    .replace(/(^|\n)\s{0,3}(?:#{1,6}\s|>\s|[-*+]\s|\d+[.)]\s)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function summary(parts: string[]): string {
  const text = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
  const characters = Array.from(text.slice(0, 522))
  return characters.length > 260 ? `${characters.slice(0, 259).join('')}…` : text
}

export function buildConversationOutline(messages: DisplayMessage[]): ConversationOutlineEntry[] {
  const groups = new Map<string, OutlineGroup>()
  for (const message of messages) {
    const messageId = String(message.id)
    const id = turnKey(message.turnId) ?? `message-${messageId}`
    let group = groups.get(id)
    if (!group) {
      group = {
        entry: {
          id,
          anchorId: messageId,
          messageIds: [],
          prompt: '',
          reply: '',
          streaming: false,
        },
        hasUser: false,
        prompts: [],
        replies: [],
        narratives: [],
        processCount: 0,
      }
      groups.set(id, group)
    }
    group.entry.messageIds.push(messageId)
    if (message.role === 'USER') {
      if (!group.hasUser) group.entry.anchorId = messageId
      group.hasUser = true
      group.prompts.push(
        plainMarkdown(message.content) ||
          message.attachments?.map((attachment) => attachment.fileName).join('、') ||
          '',
      )
    } else {
      group.replies.push(plainMarkdown(message.content))
      group.entry.streaming ||=
        message.streaming || message.processItems.some((item) => item.streaming)
      group.processCount += message.processItems.length
      for (const item of message.processItems) {
        if (item.messageType === 'COMMENTARY' || item.messageType === 'REASONING')
          group.narratives.push(plainMarkdown(item.content))
      }
    }
  }
  return Array.from(groups.values(), ({ entry, prompts, replies, narratives, processCount }) => ({
    ...entry,
    prompt: summary(prompts),
    reply:
      summary(replies) ||
      summary(narratives) ||
      (processCount ? `包含 ${processCount} 项执行过程` : ''),
  }))
}
