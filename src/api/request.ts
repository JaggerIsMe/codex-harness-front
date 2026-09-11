import axios, { type AxiosRequestConfig, type Method } from 'axios'
import { toast } from 'vue-sonner'
import router from '../router/index.js'
import {
  captureAuthSession,
  isCurrentAuthSession,
  isCurrentCredential,
  readAuthSession,
  type AuthSession,
} from '../utils/auth'
import { invalidateAuthSession } from '../utils/authSession'
import { renewAuthSession } from '@/utils/sessionRenewal'
import { getLastSessionActivity } from '@/utils/sessionActivity'
import type { ApiResponse, Id } from '../types/domain'
const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  timeout: 15000,
})
export interface RequestOptions extends AxiosRequestConfig {
  anonymous?: boolean
  localErrors?: boolean
  expectedSession?: AuthSession
  skipRenewal?: boolean
  retried?: boolean
  sessionControl?: boolean
}
// Keep credentials out of the public, serializable ApiError metadata.
const requestSessions = new WeakMap<object, AuthSession>()
const errorSessions = new WeakMap<ApiError, AuthSession>()
const errorConfigs = new WeakMap<ApiError, AxiosRequestConfig>()
client.interceptors.request.use(async (config) => {
  if ((config as RequestOptions).anonymous) {
    config.headers.delete('Authorization')
    return config
  }
  const expected = (config as RequestOptions).expectedSession ?? captureAuthSession()
  delete (config as RequestOptions).expectedSession
  if (!isCurrentAuthSession(expected)) throw new axios.CanceledError('登录状态已更新')
  const stored = readAuthSession()
  if (
    !(config as RequestOptions).skipRenewal &&
    stored &&
    stored.expiresAt < stored.sessionExpiresAt &&
    stored.expiresAt - stored.refreshBeforeSeconds <= Date.now() / 1000 &&
    getLastSessionActivity(stored.sessionId) >= Date.now() - 60000
  )
    await renewAuthSession(expected)
  if (!isCurrentAuthSession(expected)) throw new axios.CanceledError('登录状态已更新')
  const session = captureAuthSession()
  requestSessions.set(config, session)
  if (session.token) config.headers.Authorization = `Bearer ${session.token}`
  else config.headers.delete('Authorization')
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
    const error = new ApiError(
      'info' in data ? String(data.info) : '请求失败',
      'code' in data ? Number(data.code) : undefined,
      readRetryAfter(data),
      response.config as RequestOptions,
    )
    const session = requestSessions.get(response.config)
    if (session) errorSessions.set(error, session)
    errorConfigs.set(error, response.config)
    throw error
  }
  const session = requestSessions.get(response.config)
  if (session && !isCurrentAuthSession(session)) throw new axios.CanceledError('登录状态已更新')
  return response
})

client.interceptors.response.use(undefined, async (error: unknown) => {
  if (axios.isCancel(error)) return Promise.reject(error)
  let normalized =
    error instanceof ApiError
      ? error
      : new ApiError(error instanceof Error ? error.message : '网络异常，请稍后重试')
  let session = error instanceof ApiError ? errorSessions.get(error) : undefined
  const sourceConfig =
    error instanceof ApiError
      ? errorConfigs.get(error)
      : axios.isAxiosError(error)
        ? error.config
        : undefined
  if (axios.isAxiosError(error)) {
    session = error.config ? requestSessions.get(error.config) : undefined
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
  if (session && !isCurrentAuthSession(session)) return Promise.reject(normalized)
  if (
    !normalized.options.anonymous &&
    normalized.code === 40122 &&
    session &&
    sourceConfig &&
    !(sourceConfig as RequestOptions).skipRenewal &&
    !(sourceConfig as RequestOptions).retried
  ) {
    try {
      if (isCurrentCredential(session)) await renewAuthSession(session, true)
      if (!isCurrentAuthSession(session)) throw new axios.CanceledError('登录状态已更新')
    } catch (cause) {
      if (!axios.isCancel(cause) && !normalized.options.localErrors && cause instanceof Error)
        toast.error(cause.message)
      return Promise.reject(cause)
    }
    return client.request({
      ...sourceConfig,
      expectedSession: captureAuthSession(),
      retried: true,
    } as RequestOptions)
  }
  if (
    !normalized.options.anonymous &&
    !(sourceConfig as RequestOptions | undefined)?.sessionControl &&
    [401, 40121].includes(normalized.code || 0)
  ) {
    if (session && !isCurrentCredential(session)) return Promise.reject(normalized)
    if (
      !session ||
      !(await invalidateAuthSession(
        session,
        normalized.code === 40121 ? 'session-replaced' : 'session-expired',
      ))
    )
      return Promise.reject(normalized)
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
  return (await client.request<ApiResponse<T>>({ ...bindSession(config), method, url, data })).data
}

function bindSession(options: RequestOptions = {}): RequestOptions {
  return options.anonymous
    ? options
    : { ...options, expectedSession: options.expectedSession ?? captureAuthSession() }
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
    await client.get<Blob>(
      `/skills/${skillId}/versions/${versionId}/download`,
      bindSession({
        responseType: 'blob',
        timeout: 60000,
      }),
    )
  ).data
}

export async function downloadFile(url: string, signal?: AbortSignal): Promise<Blob> {
  return (
    await client.get<Blob>(url, bindSession({ responseType: 'blob', timeout: 120000, signal }))
  ).data
}
