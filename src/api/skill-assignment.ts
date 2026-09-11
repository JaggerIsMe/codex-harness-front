import { request } from './request'
import type {
  AssignmentPage,
  AssignmentPreview,
  AssignmentSubmission,
  AssignmentHistory,
  AssignmentTargetInput,
} from '@/types/skill-assignment'
export function getBatchAssignmentCandidates(
  targets: AssignmentTargetInput[],
  keyword: string,
  page: number,
  signal?: AbortSignal,
) {
  return request<AssignmentPage>(
    'post',
    '/skill-expert-assignments/batch/candidates',
    { targets, keyword, page, size: 20 },
    { signal, localErrors: true },
  )
}
export function previewBatchAssignment(
  targets: AssignmentTargetInput[],
  expertIds: number[],
  signal?: AbortSignal,
) {
  return request<AssignmentPreview>(
    'post',
    '/skill-expert-assignments/batch/preview',
    { targets, expertIds },
    { signal, localErrors: true },
  )
}
export function getAssignmentCandidates(
  skillId: number,
  versionId: number,
  keyword: string,
  page: number,
  signal?: AbortSignal,
) {
  return request<AssignmentPage>(
    'get',
    `/skills/${skillId}/versions/${versionId}/expert-candidates`,
    undefined,
    { params: { keyword, page, size: 20 }, signal, localErrors: true },
  )
}
export function previewAssignment(
  skillId: number,
  versionId: number,
  expertIds: number[],
  signal?: AbortSignal,
) {
  return request<AssignmentPreview>(
    'post',
    '/skill-expert-assignments/preview',
    { skillId, versionId, expertIds },
    { signal, localErrors: true },
  )
}
export function commitAssignment(id: string, signal?: AbortSignal) {
  return request<AssignmentSubmission>(
    'post',
    `/skill-expert-assignments/${encodeURIComponent(id)}/commit`,
    undefined,
    { signal, timeout: 120000, localErrors: true },
  )
}
export function getAssignment(id: string, signal?: AbortSignal) {
  return request<AssignmentSubmission>(
    'get',
    `/skill-expert-assignments/${encodeURIComponent(id)}`,
    undefined,
    { signal, localErrors: true },
  )
}
export function listAssignments(page: number, signal?: AbortSignal) {
  return request<AssignmentHistory[]>('get', '/skill-expert-assignments', undefined, {
    params: { page, size: 20 },
    signal,
    localErrors: true,
  })
}
