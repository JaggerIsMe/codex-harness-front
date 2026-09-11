import { setAccessToken, sessionCredentials } from '../support/auth'
import axios, { AxiosError, type AxiosAdapter, type AxiosResponse } from 'axios'
import { beforeAll, afterAll, afterEach, expect, it, vi } from 'vitest'
import { captureAuthSession, getAccessToken, readAuthSession, setAuthSession } from '@/utils/auth'

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
  setAccessToken('test-token')
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
  setAccessToken('expired')
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
  expect(getAccessToken()).toBeNull()
  expect(replace).toHaveBeenCalledWith({
    name: 'login',
    query: { redirect: '/projects', reason: 'session-expired' },
  })
  expect(notify).toHaveBeenCalledTimes(1)
})

it('keeps existing credentials and page state when an anonymous request fails', async () => {
  setAccessToken('another-account')
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
  expect(getAccessToken()).toBe('another-account')
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

it.each(['http', 'envelope'] as const)('handles replacement from a %s failure', async (mode) => {
  setAccessToken('replaced')
  transport = async (config) => {
    const response = {
      config,
      status: mode === 'http' ? 401 : 200,
      statusText: '',
      headers: {},
      data: { status: 'error', code: 40121, info: '账号已在其他设备登录' },
    }
    if (mode === 'http') throw new AxiosError('Unauthorized', '', config, undefined, response)
    return response
  }
  await expect(api.request('get', '/devices')).rejects.toMatchObject({ code: 40121 })
  expect(getAccessToken()).toBeNull()
  expect(replace).toHaveBeenCalledWith({
    name: 'login',
    query: { redirect: '/projects', reason: 'session-replaced' },
  })
  expect(notify).toHaveBeenCalledTimes(1)
})

it.each([401, 40121])('ignores a late %s from the previous login', async (code) => {
  setAccessToken('old-token')
  transport = async (config) => {
    expect(config.headers.Authorization).toBe('Bearer old-token')
    setAccessToken('new-token')
    const response = {
      config,
      status: 401,
      statusText: '',
      headers: {},
      data: { status: 'error', code },
    }
    throw new AxiosError('Unauthorized', '', config, undefined, response)
  }
  await expect(api.request('get', '/devices')).rejects.toMatchObject({ code })
  expect(getAccessToken()).toBe('new-token')
  expect(replace).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('ignores a late authentication error inside an HTTP 200 envelope', async () => {
  setAccessToken('old-token')
  transport = async (config) => {
    setAccessToken('new-token')
    return {
      config,
      status: 200,
      statusText: '',
      headers: {},
      data: { status: 'error', code: 40121 },
    }
  }
  await expect(api.request('get', '/auth/profile')).rejects.toMatchObject({ code: 40121 })
  expect(getAccessToken()).toBe('new-token')
  expect(replace).not.toHaveBeenCalled()
})

it('ends one session only once when several requests are rejected', async () => {
  setAccessToken('replaced')
  transport = async (config) => ({
    config,
    status: 200,
    statusText: '',
    headers: {},
    data: { status: 'error', code: 40121 },
  })
  await Promise.allSettled([api.request('get', '/devices'), api.request('get', '/projects')])
  expect(replace).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledTimes(1)
})

it('retains the session when its registry is temporarily unavailable', async () => {
  setAccessToken('still-valid')
  transport = async (config) => {
    const response = {
      config,
      status: 503,
      statusText: '',
      headers: {},
      data: { status: 'error', code: 50322 },
    }
    throw new AxiosError('Unavailable', '', config, undefined, response)
  }
  await expect(api.request('get', '/auth/profile')).rejects.toMatchObject({ code: 50322 })
  expect(getAccessToken()).toBe('still-valid')
  expect(replace).not.toHaveBeenCalled()
})

it('cancels an old account response before it can populate the new account cache', async () => {
  setAccessToken('old-token')
  transport = async (config) => {
    setAccessToken('new-token')
    return {
      config,
      status: 200,
      statusText: '',
      headers: {},
      data: { status: 'success', code: 200, data: { id: 1 } },
    }
  }
  await expect(api.request('get', '/projects')).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  expect(notify).not.toHaveBeenCalled()
})

it('does not send an old logout using credentials from a newer login', async () => {
  setAccessToken('old-token')
  const expectedSession = captureAuthSession()
  setAccessToken('new-token')
  const send = vi.fn()
  transport = send
  await expect(
    api.request('post', '/auth/logout', undefined, { expectedSession }),
  ).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  expect(send).not.toHaveBeenCalled()
  expect(getAccessToken()).toBe('new-token')
})

it.each(['request', 'file', 'skill'] as const)(
  'binds the %s helper to the session before Axios schedules dispatch',
  async (kind) => {
    setAccessToken('old-token')
    const send = vi.fn()
    transport = send
    const pending =
      kind === 'request'
        ? api.request('post', '/devices/1/disable')
        : kind === 'file'
          ? api.downloadFile('/files/1/content')
          : api.downloadSkillVersion(1, 2)
    setAccessToken('new-token')
    await expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    expect(send).not.toHaveBeenCalled()
    expect(getAccessToken()).toBe('new-token')
  },
)

it('renews an expired access credential with its cookie and replays a rejected write once', async () => {
  setAccessToken('initial')
  const source = readAuthSession()!
  let businessCalls = 0
  let refreshCalls = 0
  transport = async (config) => {
    if (config.url === '/auth/refresh') {
      refreshCalls += 1
      expect(config.withCredentials).toBe(true)
      expect(config.headers.Authorization).toBeUndefined()
      expect(config.headers['X-Harness-Session']).toBe(source.sessionId)
      expect(config.headers['X-Harness-Refresh']).toBe('1')
      return {
        config,
        status: 200,
        statusText: '',
        headers: {},
        data: {
          status: 'success',
          code: 200,
          data: sessionCredentials('renewed', {
            sessionId: source.sessionId,
            credentialGeneration: 2,
          }),
        },
      }
    }
    businessCalls += 1
    if (businessCalls === 1) {
      const response = {
        config,
        status: 401,
        statusText: '',
        headers: {},
        data: { status: 'error', code: 40122 },
      }
      throw new AxiosError('Expired', '', config, undefined, response)
    }
    expect(config.headers.Authorization).toBe('Bearer renewed')
    expect(config.data).toBe(JSON.stringify({ message: 'one operation' }))
    return {
      config,
      status: 200,
      statusText: '',
      headers: {},
      data: { status: 'success', code: 200, data: { id: 1 } },
    }
  }
  expect(
    (await api.request<{ id: number }>('post', '/turns', { message: 'one operation' })).data.id,
  ).toBe(1)
  expect(businessCalls).toBe(2)
  expect(refreshCalls).toBe(1)
  expect(replace).not.toHaveBeenCalled()
})

it('accepts an old successful response from the same login after credential renewal', async () => {
  setAccessToken('initial')
  const source = captureAuthSession()
  transport = async (config) => {
    setAuthSession(
      sessionCredentials('renewed', { sessionId: source.sessionId!, credentialGeneration: 2 }),
      source,
    )
    return {
      config,
      status: 200,
      statusText: '',
      headers: {},
      data: { status: 'success', code: 200, data: { id: 1 } },
    }
  }
  expect((await api.request<{ id: number }>('get', '/projects')).data.id).toBe(1)
  expect(getAccessToken()).toBe('renewed')
})

it('never replays a write after a network timeout', async () => {
  setAccessToken('initial')
  const send = vi.fn(async (config) => {
    throw new AxiosError('Timeout', 'ECONNABORTED', config)
  })
  transport = send
  await expect(api.request('post', '/turns', { message: 'once' })).rejects.toThrow('Timeout')
  expect(send).toHaveBeenCalledOnce()
})
