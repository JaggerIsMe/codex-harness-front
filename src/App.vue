<template>
  <p v-if="!supportsAuthLock()" class="bg-destructive/10 p-4 text-sm text-destructive" role="alert">
    {{ AUTH_LOCK_UNAVAILABLE }}
  </p>
  <router-view v-slot="{ Component }">
    <div
      v-if="requiresAuth && !auth.user"
      class="flex min-h-screen flex-col items-center justify-center gap-4"
      role="status"
    >
      <p>{{ auth.profileError || '正在验证登录…' }}</p>
      <button v-if="auth.profileError" class="text-primary underline" @click="retryProfile">
        重新验证
      </button>
    </div>
    <component v-else :is="Component" :key="requiresAuth ? auth.sessionRevision : undefined" />
  </router-view>
  <ThemeToggle v-if="route.name === 'login'" class="login-theme-toggle" />
  <Toaster :theme="theme.mode" rich-colors position="top-right" />
  <ConfirmDialog />
</template>
<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed } from 'vue'
import { Toaster } from 'vue-sonner'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import { useThemeStore } from '@/stores/theme'
import { useAuthStore } from '@/stores/auth'
import { useSessionLifecycle } from '@/composables/useSessionLifecycle'
import { AUTH_LOCK_UNAVAILABLE, supportsAuthLock } from '@/utils/authLock'

const route = useRoute()
const router = useRouter()
const theme = useThemeStore()
const auth = useAuthStore()
useSessionLifecycle()
const requiresAuth = computed(() => route.matched.some((record) => record.meta.requiresAuth))
async function retryProfile() {
  try {
    await auth.loadProfile()
    if (auth.user) await router.replace({ path: route.fullPath, force: true })
  } catch {
    // Keep the retry state visible while authentication is temporarily unavailable.
  }
}
</script>
