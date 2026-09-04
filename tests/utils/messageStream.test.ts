import { expect, it } from 'vitest'
import { applyMessagePatches, parseMessagePatches } from '@/utils/messageStream'
import { parseRealtimeEvent } from '@/utils/realtime'
import type { Message, MessagePatch } from '@/types/domain'

const message: Message = {
  id: 1,
  turnId: 7,
  sequenceNo: 2,
  role: 'ASSISTANT',
  messageType: 'TEXT',
  messageKey: 'answer',
  revision: 1,
  content: 'hello',
  status: 'STREAMING',
}
const append: MessagePatch = {
  message: { ...message, revision: 2, content: ' world' },
  baseRevision: 1,
  operation: 'APPEND',
}
it('applies interleaved Message updates by stable identity and deduplicates revisions', () => {
  const another = { ...message, id: 2, sequenceNo: 3, messageKey: 'other', content: 'other' }
  const result = applyMessagePatches([message, another], [append, append])!
  expect(result.map((m) => m.content)).toEqual(['hello world', 'other'])
})
it('rejects a missing base atomically without corrupting already valid messages', () => {
  expect(
    applyMessagePatches(
      [message],
      [append, { ...append, message: { ...message, revision: 4 }, baseRevision: 3 }],
    ),
  ).toBeNull()
  expect(message.content).toBe('hello')
})
it('replaces content on completion rather than appending the final snapshot', () => {
  const done: MessagePatch = {
    ...append,
    operation: 'REPLACE',
    message: { ...message, revision: 3, content: 'hello world', status: 'COMPLETED' },
  }
  const result = applyMessagePatches([message], [done, append])!
  expect(result[0].content).toBe('hello world')
  expect(result[0].streaming).toBe(false)
})
it('rejects malformed or oversized untrusted patches', () => {
  expect(parseMessagePatches([append])).toHaveLength(1)
  for (const invalid of [
    { ...append, baseRevision: -1 },
    { ...append, message: { ...message, revision: '2' } },
    { ...append, operation: 'DELETE' },
  ])
    expect(parseMessagePatches([invalid])).toBeUndefined()
  expect(
    parseRealtimeEvent(
      JSON.stringify({
        type: 'MESSAGE_UPDATED',
        payload: { cursor: 1, patches: [{ invalid: true }] },
      }),
    ),
  ).toBeNull()
})
