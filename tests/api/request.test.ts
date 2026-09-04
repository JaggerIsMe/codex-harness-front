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
