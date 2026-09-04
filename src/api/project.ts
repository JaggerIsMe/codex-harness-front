import { request } from './request'
import type { Project, Id, ProjectInput } from '@/types/domain'
export function getProjects() {
  return request<Project[]>('get', `/projects`)
}
export function getProject(projectId: Id) {
  return request<Project>('get', `/projects/${projectId}`)
}
export function createProject(data: ProjectInput) {
  return request<Project>('post', `/projects`, data)
}
