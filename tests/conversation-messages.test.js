import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildConversationDisplayMessages,
  normalizeLegacyDeltaContent,
} from '../src/utils/conversationMessages.ts'
import { renderMarkdownHtml } from '../src/utils/messageMarkdown.ts'

test('restores whitespace deltas that were persisted as inline JSON', () => {
  const malformed =
    '中心城区约{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":" "}27℃' +
    '{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"\\n"}注意防暑'

  assert.equal(normalizeLegacyDeltaContent(malformed), '中心城区约 27℃\n注意防暑')
})

test('keeps ordinary JSON examples unchanged', () => {
  const content =
    '示例：{"threadId":"thread-1","turnId":"turn-1","itemId":"message-1","delta":"正文"}'

  assert.equal(normalizeLegacyDeltaContent(content), content)
})

test('structures a streamed final answer as readable markdown', () => {
  const content =
    '重庆今天：\n\n- **中心城区：27～36℃**\n- 注意防暑\n\n[中央气象台](https://www.nmc.cn/)'
  const html = renderMarkdownHtml(content)

  assert.match(html, /<ul>/)
  assert.match(html, /<strong>中心城区：27～36℃<\/strong>/)
  assert.match(html, /<a href="https:\/\/www\.nmc\.cn\/">中央气象台<\/a>/)
})

test('replays the captured weather answer without inline event payloads', () => {
  const envelope = (delta) =>
    JSON.stringify({ threadId: 'thread-1', turnId: 'turn-1', itemId: 'message-1', delta })
  const captured =
    `重庆今天（8月23日）：\n\n- **中心城区：多云，约${envelope(' ')}27～36℃**\n` +
    `- **全市：约${envelope(' ')}22～38℃**${envelope('\n')}` +
    '- 注意防暑补水\n\n[中央气象台](https://www.nmc.cn/)'

  const normalized = normalizeLegacyDeltaContent(captured)
  const html = renderMarkdownHtml(normalized)

  assert.equal(normalized.includes('{"threadId"'), false)
  assert.equal((html.match(/<li>/g) || []).length, 3)
  assert.equal(normalized.includes('约 27～36℃'), true)
  assert.equal(normalized.includes('约 22～38℃'), true)
})

test('renders extended GFM structures used in formal answers', () => {
  const markdown =
    '| 项目 | 状态 |\n| --- | --- |\n| 构建 | ✅ |\n\n- [x] 测试\n  - ~~旧方案~~\n\n![预览](https://example.com/preview.png)'
  const html = renderMarkdownHtml(markdown)

  assert.match(html, /<table>/)
  assert.match(html, /<input[^>]*type="checkbox"/)
  assert.match(html, /<input[^>]*checked/)
  assert.match(html, /<del>旧方案<\/del>/)
  assert.match(html, /<img src="https:\/\/example\.com\/preview\.png" alt="预览">/)
})

test('keeps commentary outside the formal answer', () => {
  for (const includeItemIds of [true, false]) {
    const itemId = (value) => (includeItemIds ? { itemId: value } : {})
    const messages = [
      {
        id: 1,
        turnId: 7,
        sequenceNo: 1,
        role: 'ASSISTANT',
        messageType: 'ACTIVITY',
        ...itemId('commentary-1'),
        content: '{"id":"commentary-1","type":"agentMessage","phase":"commentary"}',
        streaming: includeItemIds,
      },
      {
        id: 2,
        turnId: 7,
        sequenceNo: 2,
        role: 'ASSISTANT',
        messageType: 'TEXT',
        ...itemId('commentary-1'),
        content: '我查一下广安今天的天气。',
        streaming: includeItemIds,
      },
      {
        id: 3,
        turnId: 7,
        sequenceNo: 3,
        role: 'ASSISTANT',
        messageType: 'ACTIVITY',
        ...itemId('final-1'),
        content: '{"id":"final-1","type":"agentMessage","phase":"final_answer"}',
        streaming: includeItemIds,
      },
      {
        id: 4,
        turnId: 7,
        sequenceNo: 4,
        role: 'ASSISTANT',
        messageType: 'TEXT',
        ...itemId('final-1'),
        content: '广安今天晴，26～36℃。',
        streaming: includeItemIds,
      },
    ]

    const [group] = buildConversationDisplayMessages(messages)

    assert.equal(group.content, '广安今天晴，26～36℃。')
    assert.equal(
      group.processItems.some((item) => item.content.includes('我查一下广安')),
      true,
    )
  }
})

test('uses the persisted commentary type without phase inference', () => {
  const [group] = buildConversationDisplayMessages([
    {
      id: 1,
      turnId: 8,
      sequenceNo: 1,
      role: 'ASSISTANT',
      messageType: 'COMMENTARY',
      content: '正在查询天气。',
    },
    {
      id: 2,
      turnId: 8,
      sequenceNo: 2,
      role: 'ASSISTANT',
      messageType: 'TEXT',
      content: '今天晴，最高36℃。',
    },
  ])

  assert.equal(group.content, '今天晴，最高36℃。')
  assert.equal(group.processItems[0].messageType, 'COMMENTARY')
  assert.equal(group.processItems[0].content, '正在查询天气。')
})

test('collapses start and completion snapshots for the same tool activity', () => {
  const [group] = buildConversationDisplayMessages([
    {
      id: 1,
      turnId: 9,
      sequenceNo: 1,
      role: 'ASSISTANT',
      messageType: 'ACTIVITY',
      content: '{"id":"search-1","type":"webSearch","query":""}',
    },
    {
      id: 2,
      turnId: 9,
      sequenceNo: 2,
      role: 'ASSISTANT',
      messageType: 'ACTIVITY',
      content: '{"id":"search-1","type":"webSearch","query":"广安天气"}',
    },
  ])

  assert.equal(group.processItems.length, 1)
  assert.equal(JSON.parse(group.processItems[0].content).query, '广安天气')
})
