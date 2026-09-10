import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios'
import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest'

const { replace, notify } = vi.hoisted(() => ({ replace: vi.fn(), notify: vi.fn() }))
vi.mock('@/router/index.js', () => ({
  default: { currentRoute: { value: { name: 'projects', fullPath: '/projects' } }, replace },
}))
vi.mock('vue-sonner', () => ({ toast: { error: notify } }))
let transport: AxiosAdapter
let api: typeof import('@/api/request')
const original = axios.defaults.adapter
beforeAll(async () => {
  axios.defaults.adapter = (config) => transport(config)
  api = await import('@/api/request')
})
afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})
afterAll(() => {
  axios.defaults.adapter = original
})

it('attaches authentication and returns the typed API envelope', async () => {
  localStorage.setItem('harness_access_token', 'test-token')
  transport = async (config) => {
    expect(config.headers.Authorization).toBe('Bearer test-token')
    expect(config.baseURL).toBe('/api/v1')
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { status: 'success', code: 200, info: '', data: { id: 1 } },
    }
  }
  expect((await api.request<{ id: number }>('get', '/devices')).data.id).toBe(1)
})
it('returns ZIP bytes directly rather than a JSON envelope', async () => {
  const file = new Blob(['zip-content'], { type: 'application/zip' })
  transport = async (config) => ({ config, status: 200, statusText: 'OK', headers: {}, data: file })
  expect(await api.downloadSkillVersion(1, 2)).toBe(file)
})
it('normalizes unauthorized failures and clears the token before redirecting', async () => {
  localStorage.setItem('harness_access_token', 'expired')
  transport = async (config) => {
    const response: AxiosResponse = {
      config,
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      data: { status: 'error', info: '登录已失效' },
    }
    throw new AxiosError('Unauthorized', 'ERR_BAD_RESPONSE', config, undefined, response)
  }
  await expect(api.request('get', '/devices')).rejects.toMatchObject({
    code: 401,
    message: '登录已失效',
  })
  expect(localStorage.getItem('harness_access_token')).toBeNull()
  expect(replace).toHaveBeenCalledWith({ name: 'login', query: { redirect: '/projects' } })
  expect(notify).toHaveBeenCalledTimes(1)
})

it('keeps existing credentials and page state when an anonymous request fails', async () => {
  localStorage.setItem('harness_access_token', 'another-account')
  transport = async (config) => {
    expect(config.headers.Authorization).toBeUndefined()
    const response: AxiosResponse = {
      config,
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      data: { status: 'error', code: 401, info: '验证码无效' },
    }
    throw new AxiosError('Unauthorized', 'ERR_BAD_RESPONSE', config, undefined, response)
  }
  await expect(
    api.request('post', '/auth/password-reset', {}, { anonymous: true, localErrors: true }),
  ).rejects.toMatchObject({ code: 401 })
  expect(localStorage.getItem('harness_access_token')).toBe('another-account')
  expect(replace).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('preserves recovery error details and cooldown from a successful HTTP envelope', async () => {
  transport = async (config) => ({
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: {
      status: 'error',
      code: 42921,
      info: '请稍后重试',
      data: { retryAfterSeconds: 42 },
    },
  })
  await expect(
    api.request('post', '/auth/activation/resend', {}, { anonymous: true, localErrors: true }),
  ).rejects.toMatchObject({ code: 42921, retryAfterSeconds: 42 })
  expect(replace).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('does not retain credentials in normalized API error metadata', async () => {
  transport = async (config) => ({
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: {
      status: 'error',
      code: 40021,
      info: '凭据无效',
      data: null,
    },
  })
  const error = await api
    .request(
      'post',
      '/auth/activate',
      { token: 'secret-token', newPassword: 'secret-password' },
      { anonymous: true, localErrors: true },
    )
    .catch((cause: unknown) => cause)
  expect(error).toBeInstanceOf(api.ApiError)
  expect(JSON.stringify(error)).not.toContain('secret-token')
  expect(JSON.stringify(error)).not.toContain('secret-password')
})
