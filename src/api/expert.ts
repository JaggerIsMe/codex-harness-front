import { request } from './request'
import type { Id } from '@/types/domain'
import type {
  Expert,
  ExpertDraft,
  ExpertVersion,
  ProjectExperts,
  ExpertSelection,
  TurnExpert,
} from '@/types/expert'
export const listExperts = (admin: boolean, keyword = '', signal?: AbortSignal) =>
  request<Expert[]>('get', admin ? '/admin/experts' : '/expert-market', undefined, {
    params: { keyword },
    signal,
  })
export const saveExpert = (id: Id | null, data: ExpertDraft) =>
  request<Expert>(
    id == null ? 'post' : 'put',
    id == null ? '/admin/experts' : `/admin/experts/${id}/draft`,
    data,
  )
export const changeExpertStatus = (id: Id, action: 'unpublish' | 'disable', revision: number) =>
  request<Expert>('post', `/admin/experts/${id}/${action}`, { revision })
export const publishExpert = (id: Id, revision: number, compatibleUpgrade: boolean) =>
  request<Expert>('post', `/admin/experts/${id}/publish`, { revision, compatibleUpgrade })
export const getExpertVersions = (id: Id, signal?: AbortSignal) =>
  request<ExpertVersion[]>('get', `/expert-market/${id}/versions`, undefined, { signal })
export const getProjectExperts = (id: Id, signal?: AbortSignal) =>
  request<ProjectExperts>('get', `/projects/${id}/experts`, undefined, { signal })
export const bindExpert = (projectId: Id, expertVersionId: Id, projectRevision: number) =>
  request<ProjectExperts>('post', `/projects/${projectId}/experts`, {
    expertVersionId,
    projectRevision,
  })
export const unbindExpert = (projectId: Id, id: Id, revision: number) =>
  request<ProjectExperts>('delete', `/projects/${projectId}/experts/${id}`, { revision })
const conversationPath = (projectId: Id, conversationId: Id) =>
  `/projects/${projectId}/conversations/${conversationId}`
export const getExpertSelection = (projectId: Id, conversationId: Id, signal?: AbortSignal) =>
  request<ExpertSelection>(
    'get',
    `${conversationPath(projectId, conversationId)}/expert`,
    undefined,
    { signal },
  )
export const getTurnExperts = (projectId: Id, conversationId: Id, signal?: AbortSignal) =>
  request<TurnExpert[]>(
    'get',
    `${conversationPath(projectId, conversationId)}/turn-experts`,
    undefined,
    { signal },
  )
