import { setAccessToken, sessionCredentials } from '../../support/auth'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import PasswordView from '@/views/account/PasswordView.vue'
import { useAuthStore } from '@/stores/auth'
import { getAccessToken } from '@/utils/auth'
import { changePassword } from '@/api/auth'
import type { ApiResponse } from '@/types/domain'

const { replace, notify } = vi.hoisted(() => ({ replace: vi.fn(), notify: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))
vi.mock('@/router/index.js', () => ({ default: { replace } }))
vi.mock('vue-sonner', () => ({ toast: { success: notify } }))
vi.mock('@/api/auth', () => ({
  changePassword: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getProfile: vi.fn(),
}))
let pinia: ReturnType<typeof createPinia>
let wrapper: VueWrapper | undefined
beforeEach(() => {
  setActivePinia((pinia = createPinia()))
  setAccessToken('first-token')
  vi.resetAllMocks()
})
afterEach(() => {
  wrapper?.unmount()
  disposePinia(pinia)
  localStorage.clear()
})

it.each([false, true])(
  'only clears the login that changed its password (session changed: %s)',
  async (changed) => {
    let complete!: (value: ApiResponse<void>) => void
    vi.mocked(changePassword).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve
      }),
    )
    wrapper = mount(PasswordView)
    const fields = wrapper.findAll('input')
    await fields[0]!.setValue('original-password')
    await fields[1]!.setValue('replacement-password123')
    await fields[2]!.setValue('replacement-password123')
    await wrapper.find('form').trigger('submit')
    expect(changePassword).toHaveBeenCalledWith(
      'original-password',
      'replacement-password123',
      expect.objectContaining({ token: 'first-token' }),
    )
    if (changed) {
      setAccessToken('second-token')
      useAuthStore().synchronize()
    }
    complete({ status: 'success', code: 200, info: '', data: undefined })
    await flushPromises()
    if (changed) {
      expect(useAuthStore().token).toBe('second-token')
      expect(replace).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()
    } else {
      expect(useAuthStore().token).toBeNull()
      expect(replace).toHaveBeenCalledWith('/login')
      expect(notify).toHaveBeenCalledOnce()
    }
  },
)
