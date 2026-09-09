import { expect, it } from 'vitest'
import { buildConversationOutline } from '@/utils/conversationOutline'
import type { AssistantDisplayMessage, UserDisplayMessage } from '@/types/domain'

function user(id: string, turnId: number, content = '用户请求'): UserDisplayMessage {
  return { id, turnId, content, role: 'USER', messageType: 'TEXT', sequenceNo: 1 }
}

function assistant(id: string, turnId: number, content = '助手回复'): AssistantDisplayMessage {
  return {
    id,
    turnId,
    content,
    role: 'ASSISTANT',
    sequenceStart: 2,
    sequenceEnd: 2,
    processItems: [],
    streaming: false,
    responseItemId: null,
  }
}

it('groups every user Message and assistant output in a Turn while preserving display order', () => {
  const result = buildConversationOutline([
    user('user-10', 9, '第一项请求'),
    assistant('assistant-9', 9, '第一段回答'),
    user('user-11', 9, '补充输入'),
    assistant('assistant-9-more', 9, '第二段回答'),
    user('user-20', 10, '第二项请求'),
    assistant('assistant-10', 10, '另一项回答'),
  ])
  expect(result).toEqual([
    {
      id: 'turn-9',
      anchorId: 'user-10',
      messageIds: ['user-10', 'assistant-9', 'user-11', 'assistant-9-more'],
      prompt: '第一项请求 补充输入',
      reply: '第一段回答 第二段回答',
      streaming: false,
    },
    {
      id: 'turn-10',
      anchorId: 'user-20',
      messageIds: ['user-20', 'assistant-10'],
      prompt: '第二项请求',
      reply: '另一项回答',
      streaming: false,
    },
  ])
})

it('keeps the Turn identity stable as pagination loads its user Message before an existing reply', () => {
  const reply = assistant('assistant-9', 9)
  const partial = buildConversationOutline([reply])[0]!
  const complete = buildConversationOutline([user('user-10', 9), reply])[0]!
  expect(partial).toMatchObject({ id: 'turn-9', anchorId: 'assistant-9', prompt: '' })
  expect(complete).toMatchObject({ id: partial.id, anchorId: 'user-10', prompt: '用户请求' })
  expect(buildConversationOutline([reply, user('user-10', 9)])[0]!.anchorId).toBe('user-10')
})

it('reflects live assistant content and streaming without changing the Turn identity', () => {
  const reply = { ...assistant('assistant-9', 9, '正在回答'), streaming: true }
  const pending = buildConversationOutline([user('user-10', 9), reply])[0]!
  const complete = buildConversationOutline([
    user('user-10', 9),
    { ...reply, streaming: false, content: '完整回答' },
  ])[0]!
  expect(pending).toMatchObject({ id: 'turn-9', streaming: true, reply: '正在回答' })
  expect(complete).toMatchObject({ id: pending.id, streaming: false, reply: '完整回答' })
})

it('uses attachment names for attachment-only input and never exposes ACTIVITY or command JSON', () => {
  const request = {
    ...user('user-1', 1, ''),
    attachments: [
      { id: 8, fileName: 'input_data.csv', mediaType: 'text/csv', sizeBytes: 100, sha256: 'sha' },
      {
        id: 9,
        fileName: '需求说明.pdf',
        mediaType: 'application/pdf',
        sizeBytes: 200,
        sha256: 'sha',
      },
    ],
  }
  const reply = assistant('assistant-1', 1, '')
  reply.processItems = [
    {
      key: 'activity',
      messageType: 'ACTIVITY',
      content: '{"type":"commandExecution","command":"private-command"}',
      streaming: true,
    },
    { key: 'command', messageType: 'COMMAND', content: '{"secret":"value"}', streaming: false },
  ]
  expect(buildConversationOutline([request, reply])[0]).toMatchObject({
    prompt: 'input_data.csv、需求说明.pdf',
    reply: '包含 2 项执行过程',
    streaming: true,
  })
})

it('prefers assistant body text, falling back only to safe commentary and reasoning summaries', () => {
  const reply = assistant('assistant-1', 1, '')
  reply.processItems = [
    { key: 'activity', messageType: 'ACTIVITY', content: '{"unsafe":"private"}', streaming: false },
    { key: 'comment', messageType: 'COMMENTARY', content: '**开始**检查', streaming: false },
    {
      key: 'reason',
      messageType: 'REASONING',
      content: '检查[页面](https://example.com)',
      streaming: false,
    },
  ]
  expect(buildConversationOutline([reply])[0]!.reply).toBe('开始检查 检查页面')
  expect(
    buildConversationOutline([{ ...reply, content: '# 已完成\n<b>最终结果</b>' }])[0]!.reply,
  ).toBe('已完成 最终结果')
})

it('produces bounded plain-text previews with readable Markdown links and intact Unicode', () => {
  const content =
    '<script>alert(1)</script># 请求\n**检查** [页面](https://example.com)\n' + '😀'.repeat(300)
  const entry = buildConversationOutline([user('user-1', 1, content)])[0]!
  expect(entry.prompt).toMatch(/^请求 检查 页面 /)
  expect(entry.prompt).not.toMatch(/<|script|alert|https|\*|\[|\]/)
  expect(Array.from(entry.prompt)).toHaveLength(260)
  expect(entry.prompt.endsWith('😀…')).toBe(true)
  const emojiOnly = buildConversationOutline([user('user-2', 2, '😀'.repeat(300))])[0]!
  expect(emojiOnly.prompt).toBe(`${'😀'.repeat(259)}…`)
})

it('keeps missing or invalid Turn identities separate and allows a Turn with no assistant yet', () => {
  const missing = user('missing', 1)
  Reflect.deleteProperty(missing, 'turnId')
  const invalid = assistant('invalid', Number.NaN)
  const absent = assistant('absent', 1)
  Reflect.set(absent, 'turnId', null)
  const entries = buildConversationOutline([missing, invalid, absent, user('user-2', 2)])
  expect(entries.map((entry) => entry.id)).toEqual([
    'message-missing',
    'message-invalid',
    'message-absent',
    'turn-2',
  ])
  expect(entries[3]!.reply).toBe('')
  expect(buildConversationOutline([])).toEqual([])
})
