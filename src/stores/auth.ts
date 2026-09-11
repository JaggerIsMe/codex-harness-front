import type { User, Credentials } from '@/types/domain'
import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { CanceledError } from 'axios'
import { getProfile, login, logout } from '../api/auth'
import router from '@/router/index.js'
import { finishConfirmation } from '@/lib/confirm'
import {
  AUTH_SESSION_KEY,
  CREDENTIALS_CHANGED,
  captureAuthSession,
  getAccessToken,
  isCurrentAuthSession,
  removeAccessToken,
  readAuthSession,
  setAuthSession,
  type AuthSession,
} from '../utils/auth'
import { withAuthLock } from '@/utils/authLock'
import { renewAuthSession } from '@/utils/sessionRenewal'
export const useAuthStore = defineStore('auth', () => {
  const token = ref(getAccessToken())
  const sessionId = ref(readAuthSession()?.sessionId ?? null)
  const credentialGeneration = ref(readAuthSession()?.credentialGeneration ?? 0)
  const user = ref<User | null>(null)
  const sessionRevision = ref(0)
  const signingOut = ref(false)
  const profileError = ref('')
  const isAuthenticated = computed(() => Boolean(token.value))
  const can = (permission: string) =>
    !user.value?.mustChangePassword && Boolean(user.value?.permissions?.includes(permission))
  const home = computed(() =>
    user.value?.mustChangePassword ? '/account/password' : can('device:manage') ? '/' : '/projects',
  )
  let pending: Promise<void> | null = null
  let loginAttempt = 0
  function synchronize() {
    const current = captureAuthSession()
    const identityChanged = sessionId.value !== current.sessionId
    if (!identityChanged) {
      token.value = current.token
      credentialGeneration.value = current.credentialGeneration
      return false
    }
    finishConfirmation(false)
    pending = null
    profileError.value = ''
    user.value = null
    token.value = current.token
    sessionId.value = current.sessionId
    credentialGeneration.value = current.credentialGeneration
    signingOut.value = false
    sessionRevision.value += 1
    return true
  }
  async function signIn(credentials: Credentials, signal?: AbortSignal) {
    const session = captureAuthSession()
    const attempt = ++loginAttempt
    await withAuthLock(async () => {
      if (attempt !== loginAttempt || !isCurrentAuthSession(session) || signal?.aborted)
        throw new CanceledError('登录状态已更新')
      const result = await login(credentials, signal)
      if (signal?.aborted) return
      if (attempt !== loginAttempt || !isCurrentAuthSession(session))
        throw new CanceledError('登录状态已更新')
      setAuthSession(result.data)
      synchronize()
      user.value = result.data.user
    })
  }
  async function loadProfile() {
    synchronize()
    if (pending) return pending
    const session = captureAuthSession()
    if (!session.token) return
    profileError.value = ''
    const operation = getProfile(session)
      .then((result) => {
        if (isCurrentAuthSession(session)) user.value = result.data
      })
      .catch((error) => {
        // Only the request layer's confirmed authentication failures end a session.
        if (isCurrentAuthSession(session)) profileError.value = '暂时无法验证登录，请重试。'
        throw error
      })
      .finally(() => {
        if (pending === operation) pending = null
      })
    pending = operation
    return operation
  }
  function clearLocked(expected: AuthSession) {
    if (!removeAccessToken(expected)) return false
    synchronize()
    return true
  }
  function clear(expected: AuthSession = captureAuthSession()) {
    return withAuthLock(async () => clearLocked(expected))
  }
  async function signOut() {
    const session = captureAuthSession()
    signingOut.value = true
    try {
      if (readAuthSession() && readAuthSession()!.expiresAt <= Date.now() / 1000)
        await renewAuthSession(session, true).catch(() => {})
      await withAuthLock(async () => {
        try {
          if (session.token && isCurrentAuthSession(session)) await logout(captureAuthSession())
        } finally {
          clearLocked(session)
        }
      })
    } finally {
      if (!token.value || isCurrentAuthSession(session)) signingOut.value = false
    }
  }
  async function synchronizeTabs(event: StorageEvent) {
    if (event.storageArea && event.storageArea !== localStorage) return
    if (event.key !== AUTH_SESSION_KEY && event.key !== null) return
    const previousUserId = user.value?.id
    if (!synchronize()) return
    const session = captureAuthSession()
    if (!session.token) {
      if (!router.currentRoute.value.meta.publicFlow)
        void router.replace({ name: 'login', query: { reason: 'session-expired' } })
      return
    }
    try {
      await loadProfile()
      if (!isCurrentAuthSession(session) || !user.value) return
      if (router.currentRoute.value.meta.publicFlow) return
      const path =
        previousUserId === user.value.id ? router.currentRoute.value.fullPath : home.value
      await router.replace({ path, force: true })
    } catch {
      // Authentication failures already redirect; temporary failures retain the session.
    }
  }
  window.addEventListener('harness:unauthorized', synchronize)
  window.addEventListener(CREDENTIALS_CHANGED, synchronize)
  window.addEventListener('storage', synchronizeTabs)
  onScopeDispose(() => {
    window.removeEventListener('harness:unauthorized', synchronize)
    window.removeEventListener(CREDENTIALS_CHANGED, synchronize)
    window.removeEventListener('storage', synchronizeTabs)
  })
  return {
    token,
    sessionId,
    credentialGeneration,
    user,
    sessionRevision,
    signingOut,
    profileError,
    isAuthenticated,
    can,
    home,
    signIn,
    loadProfile,
    signOut,
    clear,
    synchronize,
  }
})
