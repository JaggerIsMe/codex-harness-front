import { request } from './request'
import type { User, LoginResult, Credentials } from '@/types/domain'
export function login(data: Credentials) {
  return request<LoginResult>('post', `/auth/login`, data)
}
export function getProfile() {
  return request<User>('get', `/auth/profile`)
}
