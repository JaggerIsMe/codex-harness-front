import { expect, it, vi } from 'vitest'
import { sessionEndMessage } from '@/utils/authSession'

vi.mock('@/router/index.js', () => ({ default: {} }))

it('only displays recognized login end reasons', () => {
  expect(sessionEndMessage('session-replaced')).toContain('其他位置登录')
  expect(sessionEndMessage('session-expired')).toContain('登录已失效')
  expect(sessionEndMessage('<script>alert(1)</script>')).toBeNull()
  expect(sessionEndMessage(['session-replaced'])).toBeNull()
  expect(sessionEndMessage(undefined)).toBeNull()
})
