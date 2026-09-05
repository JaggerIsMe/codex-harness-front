import { request } from './request'
import type { Id, ManagedUser, UserInput, PageResult, RoleOption, Device } from '@/types/domain'
export const getAssignableDevices = (signal?: AbortSignal) =>
  request<Device[]>('get', '/devices', undefined, { signal })
export const getUsers = (keyword = '', status = '', page = 1) =>
  request<PageResult<ManagedUser>>('get', '/users', undefined, {
    params: { keyword, status, page, size: 20 },
  })
export const createUser = (data: UserInput) => request<ManagedUser>('post', '/users', data)
export const updateUser = (id: Id, data: { displayName: string; status: string }) =>
  request<ManagedUser>('put', `/users/${id}`, data)
export const assignRole = (id: Id, role: string) =>
  request<ManagedUser>('put', `/users/${id}/roles`, { role })
export const assignDevices = (id: Id, deviceIds: number[]) =>
  request<ManagedUser>('put', `/users/${id}/devices`, { deviceIds })
export const assignExperts = (id: Id, expertIds: number[]) =>
  request<ManagedUser>('put', `/users/${id}/experts`, { expertIds })
export const resetPassword = (id: Id, password: string) =>
  request<void>('post', `/users/${id}/reset-password`, { password })
export const getRoles = () => request<RoleOption[]>('get', '/roles')
