import type { SessionCredentials } from '../../src/types/domain'
import { setAuthSession } from '../../src/utils/auth'

export function sessionCredentials(
  accessToken: string,
  overrides: Partial<SessionCredentials> = {},
): SessionCredentials {
  const now = Math.floor(Date.now() / 1000)
  return {
    accessToken,
    tokenType: 'Bearer',
    expiresInSeconds: 7200,
    expiresAt: now + 7200,
    sessionId: `sid-${accessToken}`,
    sessionExpiresAt: now + 604800,
    idleExpiresAt: now + 7200,
    refreshBeforeSeconds: 600,
    credentialGeneration: 1,
    ...overrides,
  }
}
export function setAccessToken(token: string) {
  setAuthSession(sessionCredentials(token))
}
