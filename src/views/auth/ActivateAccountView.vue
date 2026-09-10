<template>
  <PublicAuthLayout title="账号激活" description="验证邮箱并设置你的登录密码。">
    <p v-if="state === 'loading'" role="status">正在检查激活链接…</p>
    <form v-else-if="state === 'valid'" ref="element" class="grid gap-4" @submit.prevent="submit">
      <p class="text-sm text-muted-foreground">激活邮箱：{{ details?.maskedEmail }}</p>
      <label class="grid gap-2"
        >显示名称<AppInput
          v-model.trim="displayName"
          required
          maxlength="128"
          autocomplete="nickname"
      /></label>
      <label class="grid gap-2"
        >设置密码<AppInput
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          minlength="12"
          maxlength="64"
      /></label>
      <label class="grid gap-2"
        >确认密码<AppInput
          v-model="confirmation"
          type="password"
          autocomplete="new-password"
          required
          maxlength="64"
      /></label>
      <p class="text-sm text-muted-foreground">{{ passwordHint }}</p>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <AppButton tone="primary" :loading="busy" :disabled="remaining > 0" @click="submit">{{
        remaining > 0 ? `${remaining} 秒后重试` : '激活账号'
      }}</AppButton>
    </form>
    <div v-else-if="state === 'success'" role="status" class="grid gap-2">
      <h2 class="font-semibold">账号激活成功</h2>
      <p class="text-sm text-muted-foreground">请使用邮箱和刚设置的密码登录。</p>
    </div>
    <div v-else class="grid gap-3">
      <p role="alert" class="text-sm text-destructive">{{ stateMessage }}</p>
      <AppButton
        v-if="state === 'unavailable' && token"
        :loading="busy"
        :disabled="remaining > 0"
        @click="validate"
        >{{ remaining > 0 ? `${remaining} 秒后重试` : '重新检查' }}</AppButton
      >
    </div>
    <ActivationResendForm v-if="state !== 'loading' && state !== 'valid' && state !== 'success'" />
  </PublicAuthLayout>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PublicAuthLayout from '@/components/auth/PublicAuthLayout.vue'
import ActivationResendForm from '@/components/auth/ActivationResendForm.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import { activateAccount, validateActivation } from '@/api/auth'
import type { ActivationDetails } from '@/types/domain'
import { useEmailRequest } from '@/composables/useEmailRequest'
import { passwordError, passwordHint } from '@/utils/password'
type ActivationState =
  'loading' | 'valid' | 'invalid' | 'expired' | 'used' | 'unavailable' | 'success'
const route = useRoute()
const router = useRouter()
const state = ref<ActivationState>('loading')
const token = ref(typeof route.query.token === 'string' ? route.query.token : '')
const details = ref<ActivationDetails>()
const displayName = ref('')
const password = ref('')
const confirmation = ref('')
const element = ref<HTMLFormElement | null>(null)
const { busy, error, errorCode, remaining, run } = useEmailRequest()
let disposed = false
const stateMessage = computed(
  () =>
    ({
      expired: '激活链接已过期，请重新发送激活邮件。',
      used: '此激活链接已使用，可直接登录；忘记密码时可从登录页找回。',
      invalid: '激活链接无效或已被更新，请使用最新邮件中的链接。',
      unavailable: error.value || '暂时无法检查激活链接，请稍后重试。',
    })[state.value as 'expired' | 'used' | 'invalid' | 'unavailable'],
)
function applyFailure() {
  state.value =
    errorCode.value === 41021
      ? 'expired'
      : errorCode.value === 40921
        ? 'used'
        : errorCode.value === 40021
          ? 'invalid'
          : 'unavailable'
}
async function validate() {
  if (!token.value) {
    state.value = 'invalid'
    return
  }
  state.value = 'loading'
  const result = await run((signal) => validateActivation(token.value, signal))
  if (disposed) return
  if (!result) {
    applyFailure()
    return
  }
  details.value = result.data
  displayName.value = result.data.displayName
  state.value = 'valid'
}
async function submit() {
  if (busy.value || remaining.value || !element.value?.reportValidity()) return
  error.value = passwordError(password.value, confirmation.value)
  if (error.value) return
  const result = await run((signal) =>
    activateAccount(
      { token: token.value, newPassword: password.value, displayName: displayName.value.trim() },
      signal,
    ),
  )
  if (disposed) return
  if (!result) {
    if ([40021, 41021, 40921].includes(errorCode.value ?? 0)) applyFailure()
    return
  }
  password.value = confirmation.value = token.value = ''
  state.value = 'success'
}
onMounted(async () => {
  if (route.query.token) await router.replace({ name: 'activate' })
  if (!disposed) await validate()
})
onBeforeUnmount(() => {
  disposed = true
  password.value = confirmation.value = token.value = ''
})
</script>
