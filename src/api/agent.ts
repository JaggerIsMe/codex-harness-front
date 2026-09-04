import { request } from './request'
import type {
  Device,
  Workspace,
  WorkspaceRoot,
  Enrollment,
  SkillDeployment,
  Id,
  WorkspaceInput,
} from '@/types/domain'
export function getDevices() {
  return request<Device[]>('get', `/devices`)
}
export function createEnrollment(data: { expiresInMinutes: number }) {
  return request<Enrollment>('post', `/devices/enrollments`, data)
}
export function updateDeviceStatus(deviceId: Id, status: string) {
  return request<Device>('patch', `/devices/${deviceId}/status`, { status })
}
export function getDeviceWorkspaces(deviceId: Id) {
  return request<Workspace[]>('get', `/devices/${deviceId}/workspaces`)
}
export function getDeviceWorkspaceRoots(deviceId: Id) {
  return request<WorkspaceRoot[]>('get', `/devices/${deviceId}/workspace-roots`)
}
export function createWorkspace(deviceId: Id, data: WorkspaceInput) {
  return request<Workspace>('post', `/devices/${deviceId}/workspaces`, data)
}
export function deploySkill(scopeType: string, targetId: Id, versionId: Id) {
  return request<SkillDeployment>('post', `/skill-deployments`, { scopeType, targetId, versionId })
}
export function removeSkill(deploymentId: Id) {
  return request<SkillDeployment>('post', `/skill-deployments/${deploymentId}/remove`)
}
