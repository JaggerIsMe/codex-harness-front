import { request } from './request'
import type { Id } from '@/types/domain'
import type {
  DeviceModelAssignment,
  ModelConfiguration,
  ModelConfigurationDraft,
  ModelSelectableVersion,
} from '@/types/model'

export const listModelConfigurations = (keyword = '', status = '', signal?: AbortSignal) =>
  request<ModelConfiguration[]>('get', '/admin/model-configurations', undefined, {
    params: { keyword, status },
    signal,
  })
export const saveModelConfiguration = (id: Id | null, data: ModelConfigurationDraft) =>
  request<ModelConfiguration>(
    id == null ? 'post' : 'put',
    id == null ? '/admin/model-configurations' : `/admin/model-configurations/${id}`,
    data,
  )
export const changeModelConfigurationStatus = (
  id: Id,
  status: 'ENABLED' | 'DISABLED',
  revision: number,
) =>
  request<ModelConfiguration>('put', `/admin/model-configurations/${id}/status`, {
    status,
    revision,
  })
export const listSelectableModelVersions = (signal?: AbortSignal) =>
  request<ModelSelectableVersion[]>(
    'get',
    '/admin/model-configurations/selectable-versions',
    undefined,
    { signal },
  )
export const getDeviceModelAssignment = (deviceId: Id, signal?: AbortSignal) =>
  request<DeviceModelAssignment | null>('get', `/devices/${deviceId}/model-assignment`, undefined, {
    signal,
  })
export const assignDeviceModel = (
  deviceId: Id,
  modelConfigurationVersionId: Id,
  revision: number,
) =>
  request<DeviceModelAssignment>('put', `/devices/${deviceId}/model-assignment`, {
    modelConfigurationVersionId,
    revision,
  })
export const unassignDeviceModel = (deviceId: Id, revision: number) =>
  request<void>('delete', `/devices/${deviceId}/model-assignment`, undefined, {
    params: { revision },
  })
