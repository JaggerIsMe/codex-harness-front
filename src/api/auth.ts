import { request } from './request'
import type { AuthSession } from '@/utils/auth'
import type {
  User,
  LoginResult,
  Credentials,
  ActivationDetails,
  EmailSendResult,
  SessionCredentials,
} from '@/types/domain'
export const logout = (expectedSession?: AuthSession) =>
  request<void>(
    'post',
    '/auth/logout',
    {},
    { expectedSession, withCredentials: true, skipRenewal: true, sessionControl: true },
  )
export const refreshSession = (sessionId: string) =>
  request<SessionCredentials>(
    'post',
    '/auth/refresh',
    {},
    {
      anonymous: true,
      localErrors: true,
      skipRenewal: true,
      withCredentials: true,
      headers: { 'X-Harness-Session': sessionId, 'X-Harness-Refresh': '1' },
    },
  )
export const recordSessionActivity = (expectedSession: AuthSession) =>
  request<{ idleExpiresAt: number; sessionExpiresAt: number }>(
    'post',
    '/auth/activity',
    {},
    {
      expectedSession,
      localErrors: true,
      headers: { 'X-Harness-Activity': '1' },
    },
  )
export const changePassword = (
  currentPassword: string,
  newPassword: string,
  expectedSession?: AuthSession,
) =>
  request<void>(
    'post',
    '/auth/change-password',
    { currentPassword, newPassword },
    { expectedSession },
  )
export const getSocketTicket = (signal?: AbortSignal) =>
  request<{ ticket: string; expiresInSeconds: number }>('post', '/auth/socket-ticket', undefined, {
    signal,
  })
export function login(data: Credentials, signal?: AbortSignal) {
  return request<LoginResult>('post', `/auth/login`, data, {
    anonymous: true,
    signal,
    withCredentials: true,
    headers: { 'X-Harness-Refresh': '1' },
  })
}
export function getProfile(expectedSession?: AuthSession) {
  return request<User>('get', `/auth/profile`, undefined, { expectedSession })
}
const publicOptions = (signal?: AbortSignal) => ({ anonymous: true, localErrors: true, signal })
export const validateActivation = (token: string, signal?: AbortSignal) =>
  request<ActivationDetails>('post', '/auth/activation/validate', { token }, publicOptions(signal))
export const activateAccount = (
  data: { token: string; newPassword: string; displayName?: string },
  signal?: AbortSignal,
) => request<void>('post', '/auth/activate', data, publicOptions(signal))
export const resendActivation = (email: string, signal?: AbortSignal) =>
  request<EmailSendResult>('post', '/auth/activation/resend', { email }, publicOptions(signal))
export const requestPasswordCode = (email: string, signal?: AbortSignal) =>
  request<EmailSendResult>('post', '/auth/password-reset/code', { email }, publicOptions(signal))
export const recoverPassword = (
  data: { email: string; code: string; newPassword: string },
  signal?: AbortSignal,
) => request<void>('post', '/auth/password-reset', data, publicOptions(signal))
