<template>
  <section class="mx-auto grid max-w-xl gap-5 p-6">
    <h1 class="text-xl font-semibold">修改密码</h1>
    <p v-if="auth.user?.mustChangePassword">首次登录或密码已被重置，请修改密码后继续使用。</p>
    <form class="grid gap-4" @submit.prevent="submit">
      <label class="grid gap-2"
        >当前密码<AppInput
          v-model="currentPassword"
          type="password"
          autocomplete="current-password"
          required
      /></label>
      <label class="grid gap-2"
        >新密码<AppInput
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          required
          minlength="12"
          maxlength="64"
      /></label>
      <label class="grid gap-2"
        >确认新密码<AppInput
          v-model="confirmation"
          type="password"
          autocomplete="new-password"
          required
      /></label>
      <p class="text-sm text-muted-foreground">
        12–64字符，包含字母和数字，UTF-8不超过72字节。修改后需重新登录，所有旧登录凭证失效。
      </p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
      <AppButton tone="primary" :loading="saving" @click="submit">保存并重新登录</AppButton>
    </form>
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import { changePassword } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
const router = useRouter()
const currentPassword = ref('')
const newPassword = ref('')
const confirmation = ref('')
const error = ref('')
const saving = ref(false)
async function submit() {
  if (saving.value) return
  if (
    !currentPassword.value ||
    newPassword.value !== confirmation.value ||
    newPassword.value.length < 12
  ) {
    error.value = '请填写当前密码；新密码至少12字符且两次输入一致'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmation.value = ''
    auth.clear()
    toast.success('密码已修改，请重新登录')
    await router.replace('/login')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '修改失败'
  } finally {
    saving.value = false
  }
}
</script>
