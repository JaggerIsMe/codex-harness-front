import axios, { type AxiosRequestConfig, type Method } from 'axios'
import { toast } from 'vue-sonner'
import router from '../router/index.js'
import { getAccessToken, removeAccessToken } from '../utils/auth'
import type { ApiResponse, Id } from '../types/domain'
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 15000,
})
client.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message)
    this.name = 'ApiError'
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
      error.response?.status,
    )
  }
  if (normalized.code === 401) {
    removeAccessToken()
    if (router.currentRoute.value.name !== 'login') {
      await router.replace({
        name: 'login',
        query: { redirect: router.currentRoute.value.fullPath },
      })
    }
  }
  toast.error(normalized.message)
  return Promise.reject(normalized)
})

export async function request<T>(
  method: Method,
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<ApiResponse<T>> {
  return (await client.request<ApiResponse<T>>({ ...config, method, url, data })).data
}

export async function downloadSkillVersion(skillId: Id, versionId: Id): Promise<Blob> {
  return (
    await client.get<Blob>(`/skills/${skillId}/versions/${versionId}/download`, {
      responseType: 'blob',
      timeout: 60000,
    })
  ).data
}
