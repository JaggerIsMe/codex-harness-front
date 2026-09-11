import { request } from './request'
import type {
  SkillImportMode,
  SkillImportUpload,
  SkillImportInput,
  SkillImportPreview,
  SkillImportCommit,
  SkillImportSubmission,
} from '@/types/skill-import'
import type {
  Skill,
  SkillVersion,
  SkillDeployment,
  Id,
  SearchParams,
  SkillInput,
} from '@/types/domain'
export function getSkills(params: SearchParams, signal?: AbortSignal) {
  return request<Skill[]>('get', `/skills`, undefined, { params, signal })
}
export function getSkillDeployments(params: SearchParams) {
  return request<SkillDeployment[]>('get', `/skill-deployments`, undefined, { params })
}
export function createSkill(data: FormData) {
  return request<Skill>('post', `/skills`, data, { timeout: 60000 })
}
export function uploadSkillVersion(skillId: Id, data: FormData) {
  return request<SkillVersion>('post', `/skills/${skillId}/versions`, data, { timeout: 60000 })
}
export function updateSkill(skillId: Id, data: SkillInput) {
  return request<Skill>('put', `/skills/${skillId}`, data)
}
export function updateSkillVersionStatus(skillId: Id, versionId: Id, status: string) {
  return request<SkillVersion>('patch', `/skills/${skillId}/versions/${versionId}/status`, {
    status,
  })
}

export { downloadSkillVersion } from './request'

export function uploadSkillImport(file: File, signal?: AbortSignal) {
  const data = new FormData()
  data.append('file', file)
  return request<SkillImportUpload>('post', '/skills/imports/files', data, {
    signal,
    timeout: 60000,
    localErrors: true,
  })
}
export function discardSkillImport(uploadId: string) {
  return request<void>(
    'delete',
    `/skills/imports/files/${encodeURIComponent(uploadId)}`,
    undefined,
    { localErrors: true },
  )
}
export function previewSkillImport(
  mode: SkillImportMode,
  items: SkillImportInput[],
  signal?: AbortSignal,
) {
  return request<SkillImportPreview>(
    'post',
    '/skills/imports/preview',
    { mode, items },
    { signal, localErrors: true },
  )
}
export function commitSkillImport(input: SkillImportCommit, signal?: AbortSignal) {
  return request<SkillImportSubmission>('post', '/skills/imports/commit', input, {
    signal,
    timeout: 120000,
    localErrors: true,
  })
}
export function getSkillImportSubmission(submissionId: string, signal?: AbortSignal) {
  return request<SkillImportSubmission>(
    'get',
    `/skills/imports/submissions/${encodeURIComponent(submissionId)}`,
    undefined,
    { signal, localErrors: true },
  )
}
