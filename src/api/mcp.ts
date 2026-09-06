import { request } from './request'
import type { Id } from '@/types/domain'
import type {
  McpConfiguration,
  McpConfigurationDraft,
  McpConfigurationVersion,
  McpSelectableVersion,
} from '@/types/mcp'

export const listMcpConfigurations = (keyword = '', status = '', signal?: AbortSignal) =>
  request<McpConfiguration[]>('get', '/admin/mcp-configurations', undefined, {
    params: { keyword, status },
    signal,
  })
export const saveMcpConfiguration = (id: Id | null, data: McpConfigurationDraft) =>
  request<McpConfiguration>(
    id == null ? 'post' : 'put',
    id == null ? '/admin/mcp-configurations' : `/admin/mcp-configurations/${id}`,
    data,
  )
export const changeMcpConfigurationStatus = (
  id: Id,
  status: 'ENABLED' | 'DISABLED',
  revision: number,
) =>
  request<McpConfiguration>('put', `/admin/mcp-configurations/${id}/status`, { status, revision })
export const getMcpConfigurationVersions = (id: Id, signal?: AbortSignal) =>
  request<McpConfigurationVersion[]>('get', `/admin/mcp-configurations/${id}/versions`, undefined, {
    signal,
  })
export const revokeMcpConfigurationVersion = (configurationId: Id, versionId: Id) =>
  request<McpConfigurationVersion>(
    'put',
    `/admin/mcp-configurations/${configurationId}/versions/${versionId}/revoke`,
  )
export const listSelectableMcpVersions = (signal?: AbortSignal) =>
  request<McpSelectableVersion[]>(
    'get',
    '/admin/mcp-configurations/selectable-versions',
    undefined,
    { signal },
  )
