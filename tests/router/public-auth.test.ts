import { createPinia, setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import router from '@/router/index.js'
import { useAuthStore } from '@/stores/auth'
import * as authApi from '@/api/auth'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

it.each(['anonymous', 'expired', 'force-password'] as const)(
  'allows public authentication routes with %s login state',
  async (state) => {
    setActivePinia(createPinia())
    const profile = vi
      .spyOn(authApi, 'getProfile')
      .mockRejectedValue(new Error('Expired credentials'))
    const auth = useAuthStore()
    if (state !== 'anonymous') {
      localStorage.setItem('harness_access_token', 'existing-credentials')
      auth.token = 'existing-credentials'
    }
    if (state === 'force-password')
      auth.user = {
        id: 1,
        email: 'admin@example.com',
        displayName: '管理员',
        activated: true,
        mustChangePassword: true,
        roles: ['SYS_ADMIN'],
        permissions: [],
      }
    await router.push('/forgot-password')
    expect(router.currentRoute.value.name).toBe('forgot-password')
    await router.push('/activate')
    expect(router.currentRoute.value.name).toBe('activate')
    expect(profile).not.toHaveBeenCalled()
    if (state !== 'anonymous')
      expect(localStorage.getItem('harness_access_token')).toBe('existing-credentials')
  },
)
