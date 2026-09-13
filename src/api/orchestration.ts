import { request } from './request'
import type { Id } from '@/types/domain'
import type { CreateOrchestration, Orchestration } from '@/types/orchestration'

const root = (projectId: Id) => `/projects/${projectId}/orchestrations`
export const orchestrationAvailable = (projectId: Id, signal?: AbortSignal) =>
  request<boolean>('get', `${root(projectId)}/availability`, undefined, { signal })
export const listOrchestrations = (projectId: Id, keyword: string, signal?: AbortSignal) =>
  request<Orchestration[]>('get', root(projectId), undefined, { params: { keyword }, signal })
export const getOrchestration = (projectId: Id, id: Id, signal?: AbortSignal) =>
  request<Orchestration>('get', `${root(projectId)}/${id}`, undefined, { signal })
export const createOrchestration = (projectId: Id, input: CreateOrchestration) =>
  request<Orchestration>('post', root(projectId), input)
export const cancelOrchestration = (projectId: Id, id: Id) =>
  request<Orchestration>('post', `${root(projectId)}/${id}/cancel`)
export const acknowledgeOrchestrationStopped = (projectId: Id, id: Id) =>
  request<Orchestration>('post', `${root(projectId)}/${id}/acknowledge-stopped`, {
    confirmedStopped: true,
  })
