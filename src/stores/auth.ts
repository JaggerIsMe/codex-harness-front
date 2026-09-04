import type { User, Credentials } from '@/types/domain'
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getProfile, login } from '../api/auth.ts'
import { getAccessToken, removeAccessToken, setAccessToken } from '../utils/auth.ts'
export const useAuthStore = defineStore('auth', () => {
  const token = ref(getAccessToken())
  const user = ref<User | null>(null)

  const isAuthenticated = computed(() => Boolean(token.value))

  async function signIn(credentials: Credentials) {
    const result = await login(credentials)
    const accessToken = result.data.accessToken
    if (!accessToken) {
      throw new Error('登录响应中缺少访问令牌')
    }
    token.value = accessToken
    user.value = result.data.user || null
    setAccessToken(accessToken)
  }

  async function loadProfile() {
    const result = await getProfile()
    user.value = result?.data || null
  }

  function signOut() {
    token.value = ''
    user.value = null
    removeAccessToken()
  }

  return {
    token,
    user,
    isAuthenticated,
    signIn,
    loadProfile,
    signOut,
  }
})
