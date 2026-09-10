<template>
  <form ref="element" class="grid gap-4" @submit.prevent="send">
    <div>
      <h2 class="font-semibold">重新发送激活邮件</h2>
      <p class="mt-1 text-sm text-muted-foreground">填写管理员为你登记的邮箱。重发后旧链接失效。</p>
    </div>
    <label class="grid gap-2"
      >邮箱<AppInput
        v-model.trim="email"
        label="激活邮箱"
        type="email"
        autocomplete="email"
        required
        maxlength="254"
    /></label>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <p v-if="message" role="status" class="text-sm text-muted-foreground">{{ message }}</p>
    <AppButton :loading="busy" :disabled="remaining > 0" @click="send">{{
      remaining > 0 ? `${remaining} 秒后可重发` : '发送激活邮件'
    }}</AppButton>
  </form>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import { resendActivation } from '@/api/auth'
import { useEmailRequest } from '@/composables/useEmailRequest'
const email = ref('')
const message = ref('')
const element = ref<HTMLFormElement | null>(null)
const { busy, error, remaining, run, cancel, startCooldown, clearCooldown } = useEmailRequest()
watch(email, () => {
  cancel()
  clearCooldown()
  message.value = ''
})
async function send() {
  if (busy.value || remaining.value || !element.value?.reportValidity()) return
  const result = await run((signal) => resendActivation(email.value.trim().toLowerCase(), signal))
  if (!result) return
  message.value = '若邮箱符合条件，激活邮件将发送至该邮箱，请留意收件箱和垃圾邮件。'
  startCooldown(result.data.retryAfterSeconds)
}
</script>
