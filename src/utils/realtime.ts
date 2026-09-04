import type { RealtimeEvent } from '../types/domain'
import { parseMessagePatches } from './messageStream'
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Validate untrusted frames before publishing them to application stores. */
export function parseRealtimeEvent(frame: string): RealtimeEvent | null {
  try {
    const value: unknown = JSON.parse(frame)
    if (!record(value) || typeof value.type !== 'string') return null
    const id = (input: unknown) =>
      typeof input === 'string' || typeof input === 'number' ? input : undefined
    const payload = record(value.payload) ? value.payload : null
    const patches = parseMessagePatches(payload?.patches)
    if (
      value.type === 'MESSAGE_UPDATED' &&
      (!patches || !Number.isSafeInteger(payload?.cursor) || Number(payload?.cursor) <= 0)
    )
      return null
    const text = (key: string) =>
      typeof payload?.[key] === 'string' ? (payload[key] as string) : undefined
    return {
      type: value.type,
      deviceId: id(value.deviceId),
      correlationId: id(value.correlationId),
      payload: payload
        ? {
            conversationId: id(payload.conversationId),
            turnId: id(payload.turnId),
            codexTurnId: text('codexTurnId'),
            eventType: text('eventType'),
            phase: text('phase'),
            itemId: text('itemId'),
            content: text('content'),
            commandType: text('commandType'),
            patches,
            cursor: typeof payload.cursor === 'number' ? payload.cursor : undefined,
            details:
              payload.details == null
                ? undefined
                : typeof payload.details === 'string'
                  ? payload.details
                  : JSON.stringify(payload.details),
          }
        : undefined,
    }
  } catch {
    return null
  }
}
