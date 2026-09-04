import type { User, Credentials } from '@/types/domain'
import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { getProfile, login, logout } from '../api/auth'
import { getAccessToken, removeAccessToken, setAccessToken } from '../utils/auth'
export const useAuthStore = defineStore('auth', () => {
  const token = ref(getAccessToken())
  const user = ref<User | null>(null)
  const isAuthenticated = computed(() => Boolean(token.value))
  const can = (permission: string) =>
    !user.value?.mustChangePassword && Boolean(user.value?.permissions?.includes(permission))
  const home = computed(() =>
    user.value?.mustChangePassword ? '/account/password' : can('device:manage') ? '/' : '/projects',
  )
  let pending: Promise<void> | null = null
  let revision = 0
  async function signIn(credentials: Credentials) {
    const result = await login(credentials)
    if (!result.data.accessToken) throw new Error('登录响应中缺少访问令牌')
    revision += 1
    token.value = result.data.accessToken
    user.value = result.data.user
    setAccessToken(token.value)
  }
  async function loadProfile() {
    if (pending) return pending
    const version = revision
    const operation = getProfile()
      .then((result) => {
        if (version === revision) user.value = result.data
      })
      .catch((error) => {
        if (version === revision) clear()
        throw error
      })
      .finally(() => {
        if (pending === operation) pending = null
      })
    pending = operation
    return operation
  }
  function clear() {
    revision += 1
    pending = null
    token.value = ''
    user.value = null
    removeAccessToken()
  }
  async function signOut() {
    try {
      if (getAccessToken()) await logout()
    } finally {
      clear()
    }
  }
  window.addEventListener('harness:unauthorized', clear)
  onScopeDispose(() => window.removeEventListener('harness:unauthorized', clear))
  return { token, user, isAuthenticated, can, home, signIn, loadProfile, signOut, clear }
})
