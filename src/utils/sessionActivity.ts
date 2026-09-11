const ACTIVITY_KEY = 'harness_user_activity'
const THROTTLE_MS = 60000
interface Activity {
  sessionId: string
  at: number
  sentAt: number
}
interface ActiveSession {
  sessionId: string
  idleExpiresAt: number
  sessionExpiresAt: number
}
interface ActivityOptions {
  getSession: () => ActiveSession | null
  sendActivity: () => Promise<void>
  now?: () => number
}
function readActivity(sessionId: string): Activity {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ACTIVITY_KEY) || 'null')
    if (
      value &&
      typeof value === 'object' &&
      'sessionId' in value &&
      value.sessionId === sessionId &&
      'at' in value &&
      typeof value.at === 'number' &&
      'sentAt' in value &&
      typeof value.sentAt === 'number'
    )
      return { sessionId, at: value.at, sentAt: value.sentAt }
  } catch {
    /* Activity tracking is optional; the server enforces idle expiry. */
  }
  return { sessionId, at: 0, sentAt: 0 }
}
export function getLastSessionActivity(sessionId: string): number {
  return readActivity(sessionId).at
}

export function startSessionActivity(options: ActivityOptions): () => void {
  const now = options.now ?? Date.now
  let stopped = false
  let sending = false
  let timer: number | null = null
  function activeSession() {
    // Only the server can decide whether idle expiry has passed; local clocks may be skewed.
    return options.getSession()
  }
  function schedule() {
    if (stopped || sending) return
    if (timer) window.clearTimeout(timer)
    timer = null
    const session = activeSession()
    if (!session) return
    const activity = readActivity(session.sessionId)
    if (activity.at <= activity.sentAt) return
    const delay = Math.max(0, activity.sentAt + THROTTLE_MS - now())
    if (delay) {
      timer = window.setTimeout(send, delay)
      return
    }
    void send()
  }
  async function send() {
    timer = null
    const session = activeSession()
    if (stopped || sending || !session) return
    const activity = readActivity(session.sessionId)
    if (activity.at <= activity.sentAt) return
    if (activity.sentAt + THROTTLE_MS > now()) {
      schedule()
      return
    }
    sending = true
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify({ ...activity, sentAt: now() }))
    try {
      await options.sendActivity()
    } catch {
      /* A later genuine interaction may retry. */
    } finally {
      sending = false
      schedule()
    }
  }
  function onInteraction(event: Event) {
    if (!event.isTrusted) return
    const session = activeSession()
    if (!session) return
    const activity = readActivity(session.sessionId)
    const timestamp = now()
    // A wall-clock rollback must not suppress real user activity until the old clock catches up.
    localStorage.setItem(
      ACTIVITY_KEY,
      JSON.stringify({
        ...activity,
        at: timestamp,
        sentAt: activity.sentAt > timestamp ? 0 : activity.sentAt,
      }),
    )
    window.dispatchEvent(new Event('harness:activity'))
    schedule()
  }
  const events = ['pointerdown', 'keydown', 'wheel'] as const
  events.forEach((name) => window.addEventListener(name, onInteraction, { passive: true }))
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACTIVITY_KEY) schedule()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    stopped = true
    if (timer) window.clearTimeout(timer)
    events.forEach((name) => window.removeEventListener(name, onInteraction))
    window.removeEventListener('storage', onStorage)
  }
}
