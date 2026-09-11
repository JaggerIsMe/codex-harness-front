import type { SessionCredentials } from '@/types/domain'

export const ACCESS_TOKEN_KEY = 'harness_access_token'
export const AUTH_SESSION_KEY = 'harness_auth_session'
export const CREDENTIALS_CHANGED = 'harness:credentials-changed'

export interface AuthSession {
  readonly sessionId: string | null
  readonly token: string | null
  readonly revision: number
  readonly credentialGeneration: number
}
let observedSessionId: string | null | undefined
let revision = 0

function validCredentials(value: unknown): value is SessionCredentials {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  return (
    typeof data.accessToken === 'string' &&
    Boolean(data.accessToken) &&
    typeof data.sessionId === 'string' &&
    Boolean(data.sessionId) &&
    data.tokenType === 'Bearer' &&
    typeof data.refreshBeforeSeconds === 'number' &&
    Number.isSafeInteger(data.refreshBeforeSeconds) &&
    data.refreshBeforeSeconds >= 0 &&
    [
      'expiresAt',
      'sessionExpiresAt',
      'idleExpiresAt',
      'expiresInSeconds',
      'credentialGeneration',
    ].every(
      (key) =>
        typeof data[key] === 'number' && Number.isSafeInteger(data[key]) && Number(data[key]) > 0,
    )
  )
}

export function readAuthSession(): SessionCredentials | null {
  // Old tokens lack refresh-cookie/session metadata and require a new login.
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null')
    return validCredentials(raw) ? raw : null
  } catch {
    return null
  }
}
export function captureAuthSession(): AuthSession {
  const session = readAuthSession()
  const sessionId = session?.sessionId ?? null
  if (sessionId !== observedSessionId) {
    observedSessionId = sessionId
    revision += 1
  }
  return {
    sessionId,
    token: session?.accessToken ?? null,
    revision,
    credentialGeneration: session?.credentialGeneration ?? 0,
  }
}
export function isCurrentAuthSession(session: AuthSession) {
  const current = captureAuthSession()
  return session.sessionId === current.sessionId && session.revision === current.revision
}
export function isCurrentCredential(session: AuthSession) {
  const current = captureAuthSession()
  return (
    isCurrentAuthSession(session) &&
    session.token === current.token &&
    session.credentialGeneration === current.credentialGeneration
  )
}
export function getAccessToken() {
  return readAuthSession()?.accessToken ?? null
}

export function setAuthSession(value: SessionCredentials, expected?: AuthSession): boolean {
  if (!validCredentials(value)) throw new Error('登录响应中缺少有效的续期信息，请重新登录')
  if (expected && (!isCurrentAuthSession(expected) || value.sessionId !== expected.sessionId))
    return false
  const current = readAuthSession()
  if (
    current?.sessionId === value.sessionId &&
    value.credentialGeneration <= current.credentialGeneration
  )
    return false
  const stored: SessionCredentials = {
    accessToken: value.accessToken,
    tokenType: value.tokenType,
    expiresInSeconds: value.expiresInSeconds,
    expiresAt: value.expiresAt,
    sessionId: value.sessionId,
    sessionExpiresAt: value.sessionExpiresAt,
    idleExpiresAt: Math.min(
      value.sessionExpiresAt,
      Math.max(
        value.idleExpiresAt,
        current?.sessionId === value.sessionId ? current.idleExpiresAt : 0,
      ),
    ),
    refreshBeforeSeconds: value.refreshBeforeSeconds,
    credentialGeneration: value.credentialGeneration,
  }
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(stored))
  captureAuthSession()
  window.dispatchEvent(new Event(CREDENTIALS_CHANGED))
  return true
}
export function updateSessionActivity(
  expected: AuthSession,
  deadlines: { idleExpiresAt: number; sessionExpiresAt: number },
) {
  if (!isCurrentAuthSession(expected)) return
  const current = readAuthSession()
  if (
    !current ||
    !Number.isSafeInteger(deadlines.idleExpiresAt) ||
    !Number.isSafeInteger(deadlines.sessionExpiresAt)
  )
    return
  const sessionExpiresAt = Math.min(current.sessionExpiresAt, deadlines.sessionExpiresAt)
  localStorage.setItem(
    AUTH_SESSION_KEY,
    JSON.stringify({
      ...current,
      sessionExpiresAt,
      idleExpiresAt: Math.min(
        sessionExpiresAt,
        Math.max(current.idleExpiresAt, deadlines.idleExpiresAt),
      ),
    }),
  )
  window.dispatchEvent(new Event(CREDENTIALS_CHANGED))
}
export function removeAccessToken(expected?: AuthSession) {
  if (expected && !isCurrentAuthSession(expected)) return false
  localStorage.removeItem(AUTH_SESSION_KEY)
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  captureAuthSession()
  window.dispatchEvent(new Event(CREDENTIALS_CHANGED))
  return true
}
