import { request } from './request'
import type { Project, Id, ProjectInput, ExecutableDevice, PageResult } from '@/types/domain'
import type { PageQuery } from '@/utils/pagination'
export const getExecutableDevices = (signal?: AbortSignal) =>
  request<ExecutableDevice[]>('get', '/devices/available', undefined, { signal })
export const retryProjectPreparation = (id: Id) =>
  request<Project>('post', `/projects/${id}/retry-preparation`)
export function getProjects(signal?: AbortSignal, query: PageQuery = {}) {
  return request<PageResult<Project> | Project[]>('get', `/projects`, undefined, {
    signal,
    params: { page: 1, size: 20, ...query },
  })
}
export function getProject(projectId: Id, signal?: AbortSignal) {
  return request<Project>('get', `/projects/${projectId}`, undefined, { signal })
}
export function createProject(data: ProjectInput) {
  return request<Project>('post', `/projects`, data)
}
