import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PublicAuthLayout from '@/components/auth/PublicAuthLayout.vue'

const { clear, replace } = vi.hoisted(() => ({ clear: vi.fn(), replace: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ isAuthenticated: false, clear }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace }) }))

it('returns to login without requiring credential mutation when already signed out', async () => {
  clear.mockRejectedValue(new Error('Web Locks unavailable'))
  const wrapper = mount(PublicAuthLayout, { props: { title: '找回密码' } })
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(clear).not.toHaveBeenCalled()
  expect(replace).toHaveBeenCalledWith('/login')
  wrapper.unmount()
})
