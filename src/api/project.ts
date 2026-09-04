import { request } from './request'
import type { Project, Id, ProjectInput, ExecutableDevice } from '@/types/domain'
export const getExecutableDevices = (signal?: AbortSignal) =>
  request<ExecutableDevice[]>('get', '/devices/available', undefined, { signal })
export const retryProjectPreparation = (id: Id) =>
  request<Project>('post', `/projects/${id}/retry-preparation`)
export function getProjects() {
  return request<Project[]>('get', `/projects`)
}
export function getProject(projectId: Id) {
  return request<Project>('get', `/projects/${projectId}`)
}
export function createProject(data: ProjectInput) {
  return request<Project>('post', `/projects`, data)
}
