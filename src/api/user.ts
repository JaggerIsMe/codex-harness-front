import { request } from './request'
import type {
  Id,
  ManagedUser,
  UserInput,
  PageResult,
  RoleOption,
  Device,
  EmailSendResult,
} from '@/types/domain'
export const getAssignableDevices = (signal?: AbortSignal) =>
  request<Device[]>('get', '/devices', undefined, { signal })
export const getUsers = (keyword = '', status = '', page = 1, signal?: AbortSignal) =>
  request<PageResult<ManagedUser>>('get', '/users', undefined, {
    params: { keyword, status, page, size: 20 },
    signal,
  })
export const createUser = (data: UserInput, signal?: AbortSignal) =>
  request<ManagedUser>('post', '/users', data, { signal })
export const resendUserActivation = (id: Id, signal?: AbortSignal) =>
  request<EmailSendResult>('post', `/users/${id}/activation-email`, undefined, { signal })
export const updateUser = (
  id: Id,
  data: { displayName: string; status: string },
  signal?: AbortSignal,
) => request<ManagedUser>('put', `/users/${id}`, data, { signal })
export const assignRole = (id: Id, role: string) =>
  request<ManagedUser>('put', `/users/${id}/roles`, { role })
export const assignDevices = (id: Id, deviceIds: number[]) =>
  request<ManagedUser>('put', `/users/${id}/devices`, { deviceIds })
export const assignExperts = (id: Id, expertIds: number[]) =>
  request<ManagedUser>('put', `/users/${id}/experts`, { expertIds })
export const resetPassword = (id: Id, password: string, signal?: AbortSignal) =>
  request<void>('post', `/users/${id}/reset-password`, { password }, { signal })
export const getRoles = () => request<RoleOption[]>('get', '/roles')
