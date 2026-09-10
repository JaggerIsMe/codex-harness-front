<template>
  <main class="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
    <section
      class="grid w-full max-w-md gap-6 rounded-xl border bg-background p-6 shadow-sm sm:p-8"
    >
      <div class="grid gap-2">
        <p class="text-sm font-semibold text-primary">My Harness For Codex</p>
        <h1 class="text-2xl font-semibold">{{ title }}</h1>
        <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
      </div>
      <slot />
      <div class="border-t pt-4">
        <p v-if="auth.isAuthenticated" class="mb-2 text-xs text-muted-foreground">
          当前浏览器已有登录状态；切换账号时才会清除。
        </p>
        <AppButton class="w-full" @click="goToLogin">{{
          auth.isAuthenticated ? '切换账号登录' : '返回登录'
        }}</AppButton>
      </div>
    </section>
  </main>
</template>
<script setup lang="ts">
import { useRouter } from 'vue-router'
import AppButton from '@/components/common/AppButton.vue'
import { useAuthStore } from '@/stores/auth'
defineProps<{ title: string; description?: string }>()
const auth = useAuthStore()
const router = useRouter()
function goToLogin() {
  auth.clear()
  void router.replace('/login')
}
</script>
