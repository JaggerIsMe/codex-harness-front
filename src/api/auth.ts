import { request } from './request'
import type { User, LoginResult, Credentials } from '@/types/domain'
export const logout = () => request<void>('post', '/auth/logout')
export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>('post', '/auth/change-password', { currentPassword, newPassword })
export const getSocketTicket = (signal?: AbortSignal) =>
  request<{ ticket: string; expiresInSeconds: number }>('post', '/auth/socket-ticket', undefined, {
    signal,
  })
export function login(data: Credentials) {
  return request<LoginResult>('post', `/auth/login`, data)
}
export function getProfile() {
  return request<User>('get', `/auth/profile`)
}
