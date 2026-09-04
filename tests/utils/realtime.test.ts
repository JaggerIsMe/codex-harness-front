import { expect, it } from 'vitest'
import { parseRealtimeEvent } from '@/utils/realtime'

it('rejects invalid frames without publishing malformed state', () => {
  for (const frame of ['not json', 'null', '[]', '{"type":123}'])
    expect(parseRealtimeEvent(frame)).toBeNull()
})
it('narrows envelope fields and retains structured activity details', () => {
  const event = parseRealtimeEvent(
    '{"type":"TURN_EVENT","deviceId":1,"payload":{"conversationId":4,"turnId":7,"content":{},"details":{"type":"webSearch","query":"Vue"}}}',
  )
  expect(event?.payload?.content).toBeUndefined()
  expect(JSON.parse(String(event?.payload?.details))).toEqual({ type: 'webSearch', query: 'Vue' })
})
