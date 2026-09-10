import axios, { type AxiosRequestConfig, type Method } from 'axios'
import { toast } from 'vue-sonner'
import router from '../router/index.js'
import { getAccessToken, removeAccessToken } from '../utils/auth'
import type { ApiResponse, Id } from '../types/domain'
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 15000,
})
export interface RequestOptions extends AxiosRequestConfig {
  anonymous?: boolean
  localErrors?: boolean
}
client.interceptors.request.use((config) => {
  if ((config as RequestOptions).anonymous) {
    config.headers.delete('Authorization')
    return config
  }
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export class ApiError extends Error {
  readonly options: Pick<RequestOptions, 'anonymous' | 'localErrors'>
  constructor(
    message: string,
    readonly code?: number,
    readonly retryAfterSeconds?: number,
    options: Pick<RequestOptions, 'anonymous' | 'localErrors'> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.options = { anonymous: options.anonymous, localErrors: options.localErrors }
  }
}

client.interceptors.response.use(async (response) => {
  let data: unknown = response.data
  if (data instanceof Blob && data.type.includes('json')) {
    try {
      data = JSON.parse(await data.text())
    } catch {
      /* A non-JSON file is returned unchanged. */
    }
  }
  if (data && typeof data === 'object' && 'status' in data && data.status === 'error') {
    throw new ApiError(
      'info' in data ? String(data.info) : '请求失败',
      'code' in data ? Number(data.code) : undefined,
      readRetryAfter(data),
      response.config as RequestOptions,
    )
  }
  return response
})

client.interceptors.response.use(undefined, async (error: unknown) => {
  if (axios.isCancel(error)) return Promise.reject(error)
  let normalized =
    error instanceof ApiError
      ? error
      : new ApiError(error instanceof Error ? error.message : '网络异常，请稍后重试')
  if (axios.isAxiosError(error)) {
    let body: unknown = error.response?.data
    if (body instanceof Blob) {
      try {
        body = JSON.parse(await body.text())
      } catch {
        body = null
      }
    }
    normalized = new ApiError(
      body && typeof body === 'object' && 'info' in body ? String(body.info) : error.message,
      body && typeof body === 'object' && 'code' in body
        ? Number(body.code)
        : error.response?.status,
      readRetryAfter(body) ?? positiveSeconds(error.response?.headers['retry-after']),
      error.config as RequestOptions,
    )
  }
  if (!normalized.options.anonymous && normalized.code === 401) {
    removeAccessToken()
    window.dispatchEvent(new Event('harness:unauthorized'))
    if (router.currentRoute.value.name !== 'login') {
      void router.replace({
        name: 'login',
        query: { redirect: router.currentRoute.value.fullPath },
      })
    }
  }
  if (
    !normalized.options.anonymous &&
    normalized.code === 40301 &&
    router.currentRoute.value.name !== 'password'
  )
    void router.replace({ name: 'password' })
  if (!normalized.options.localErrors) toast.error(normalized.message)
  return Promise.reject(normalized)
})

export async function request<T>(
  method: Method,
  url: string,
  data?: unknown,
  config?: RequestOptions,
): Promise<ApiResponse<T>> {
  return (await client.request<ApiResponse<T>>({ ...config, method, url, data })).data
}

function positiveSeconds(value: unknown): number | undefined {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined
}
function readRetryAfter(body: unknown): number | undefined {
  if (!body || typeof body !== 'object') return undefined
  const data = 'data' in body ? body.data : undefined
  return data && typeof data === 'object' && 'retryAfterSeconds' in data
    ? positiveSeconds(data.retryAfterSeconds)
    : undefined
}

export async function downloadSkillVersion(skillId: Id, versionId: Id): Promise<Blob> {
  return (
    await client.get<Blob>(`/skills/${skillId}/versions/${versionId}/download`, {
      responseType: 'blob',
      timeout: 60000,
    })
  ).data
}

export async function downloadFile(url: string, signal?: AbortSignal): Promise<Blob> {
  return (await client.get<Blob>(url, { responseType: 'blob', timeout: 120000, signal })).data
}
