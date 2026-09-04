import { request } from './request'
import type {
  Skill,
  SkillVersion,
  SkillDeployment,
  Id,
  SearchParams,
  SkillInput,
} from '@/types/domain'
export function getSkills(params: SearchParams) {
  return request<Skill[]>('get', `/skills`, undefined, { params })
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
