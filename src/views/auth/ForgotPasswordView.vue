<template>
  <PublicAuthLayout title="找回密码" description="通过邮箱验证码设置新的登录密码。">
    <div v-if="success" role="status" class="grid gap-2">
      <h2 class="font-semibold">密码重置成功</h2>
      <p class="text-sm text-muted-foreground">该账号的旧登录凭证已失效，请使用新密码登录。</p>
    </div>
    <form v-else ref="element" class="grid gap-4" @submit.prevent="submit">
      <label class="grid gap-2"
        >邮箱<AppInput
          v-model.trim="email"
          label="邮箱"
          type="email"
          required
          maxlength="254"
          autocomplete="email"
          :disabled="resetBusy"
      /></label>
      <div class="grid gap-2">
        <AppButton :loading="sendBusy" :disabled="sendRemaining > 0 || resetBusy" @click="send">{{
          sendRemaining > 0 ? `${sendRemaining} 秒后可重发` : '发送验证码'
        }}</AppButton>
        <p v-if="message" role="status" class="text-sm text-muted-foreground">{{ message }}</p>
        <p v-if="sendError" role="alert" class="text-sm text-destructive">{{ sendError }}</p>
      </div>
      <label class="grid gap-2"
        >邮箱验证码<AppInput
          v-model="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]{6}"
          maxlength="6"
          minlength="6"
          required
      /></label>
      <label class="grid gap-2"
        >新密码<AppInput
          v-model="password"
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
          maxlength="64"
      /></label>
      <p class="text-sm text-muted-foreground">{{ passwordHint }}重发后请使用最新验证码。</p>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <AppButton
        tone="primary"
        :loading="resetBusy"
        :disabled="sendBusy || resetRemaining > 0"
        @click="submit"
        >{{ resetRemaining > 0 ? `${resetRemaining} 秒后重试` : '重置密码' }}</AppButton
      >
    </form>
  </PublicAuthLayout>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import PublicAuthLayout from '@/components/auth/PublicAuthLayout.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import { recoverPassword, requestPasswordCode } from '@/api/auth'
import { useEmailRequest } from '@/composables/useEmailRequest'
import { passwordError, passwordHint } from '@/utils/password'
const email = ref('')
const code = ref('')
const password = ref('')
const confirmation = ref('')
const message = ref('')
const success = ref(false)
const element = ref<HTMLFormElement | null>(null)
const {
  busy: sendBusy,
  error: sendError,
  remaining: sendRemaining,
  run: sendRequest,
  cancel: cancelSend,
  startCooldown,
  clearCooldown,
} = useEmailRequest()
const {
  busy: resetBusy,
  error,
  remaining: resetRemaining,
  run: resetRequest,
  cancel: cancelReset,
} = useEmailRequest()
watch(email, () => {
  cancelSend()
  cancelReset()
  clearCooldown()
  message.value = ''
  code.value = ''
  password.value = ''
  confirmation.value = ''
})
async function send() {
  if (sendBusy.value || resetBusy.value || sendRemaining.value) return
  const input = element.value?.querySelector<HTMLInputElement>('input[type="email"]')
  if (!input?.reportValidity()) return
  code.value = ''
  const result = await sendRequest((signal) =>
    requestPasswordCode(email.value.trim().toLowerCase(), signal),
  )
  if (!result) return
  message.value = '若邮箱符合条件，验证码将发送至该邮箱，请留意收件箱和垃圾邮件。'
  startCooldown(result.data.retryAfterSeconds)
}
async function submit() {
  if (sendBusy.value || resetBusy.value || resetRemaining.value || !element.value?.reportValidity())
    return
  error.value = passwordError(password.value, confirmation.value)
  if (error.value) return
  const result = await resetRequest((signal) =>
    recoverPassword(
      { email: email.value.trim().toLowerCase(), code: code.value, newPassword: password.value },
      signal,
    ),
  )
  if (!result) return
  password.value = confirmation.value = code.value = ''
  clearCooldown()
  success.value = true
}
onBeforeUnmount(() => {
  password.value = confirmation.value = code.value = ''
})
</script>
