import { request } from './request'
import type {
  User,
  LoginResult,
  Credentials,
  ActivationDetails,
  EmailSendResult,
} from '@/types/domain'
export const logout = () => request<void>('post', '/auth/logout')
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>('post', '/auth/change-password', { currentPassword, newPassword })
export const getSocketTicket = (signal?: AbortSignal) =>
  request<{ ticket: string; expiresInSeconds: number }>('post', '/auth/socket-ticket', undefined, {
    signal,
  })
export function login(data: Credentials, signal?: AbortSignal) {
  return request<LoginResult>('post', `/auth/login`, data, { anonymous: true, signal })
}
export function getProfile() {
  return request<User>('get', `/auth/profile`)
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
