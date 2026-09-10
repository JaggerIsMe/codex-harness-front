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
it('preserves typed workspace mutation identity and rejects malformed structure metadata', () => {
  const event = parseRealtimeEvent(
    JSON.stringify({
      type: 'WORKSPACE_FILES_CHANGED',
      payload: {
        projectId: '3',
        operationId: '100',
        kind: 'RELOCATE_WORKSPACE_ENTRY',
        status: 'SUCCEEDED',
        sourcePath: 'docs',
        targetPath: 'archive',
        entryType: 'DIRECTORY',
        entryRevision: 'new',
        affectedDirectories: ['', 'archive'],
      },
    }),
  )
  expect(event?.payload).toMatchObject({
    operationId: '100',
    kind: 'RELOCATE_WORKSPACE_ENTRY',
    status: 'SUCCEEDED',
    sourcePath: 'docs',
    targetPath: 'archive',
    entryType: 'DIRECTORY',
    entryRevision: 'new',
    affectedDirectories: ['', 'archive'],
  })
  const malformed = parseRealtimeEvent(
    JSON.stringify({
      type: 'WORKSPACE_FILES_CHANGED',
      payload: { kind: {}, entryType: 'UNEXPECTED', sourcePath: [], affectedDirectories: [false] },
    }),
  )
  expect(malformed?.payload?.kind).toBeUndefined()
  expect(malformed?.payload?.entryType).toBeUndefined()
  expect(malformed?.payload?.sourcePath).toBeUndefined()
  expect(malformed?.payload?.affectedDirectories).toBeUndefined()
})
