<template>
  <AppDialog :model-value="modelValue" title="重置密码" @update:model-value="close">
    <form ref="element" class="grid gap-4" @submit.prevent="save">
      <p>为 {{ user?.username }} 设置临时密码。保存后旧凭证失效，用户再次登录必须修改密码。</p>
      <label class="grid gap-2"
        >临时密码<AppInput
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          minlength="12"
          maxlength="64"
      /></label>
      <p class="text-sm text-muted-foreground">
        12–64字符，包含字母和数字，请通过安全渠道交给用户。
      </p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    </form>
    <template #footer
      ><AppButton :disabled="saving" @click="close(false)">取消</AppButton
      ><AppButton tone="danger" :loading="saving" @click="save">确认重置</AppButton></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ManagedUser } from '@/types/domain'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import { resetPassword } from '@/api/user'
const props = defineProps<{ modelValue: boolean; user: ManagedUser | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const element = ref<HTMLFormElement | null>(null)
const password = ref(''),
  error = ref(''),
  saving = ref(false)
watch(
  () => props.modelValue,
  () => {
    password.value = ''
    error.value = ''
  },
)
function close(value: boolean) {
  if (!saving.value) emit('update:modelValue', value)
}
async function save() {
  if (saving.value || !props.user || !element.value?.reportValidity()) return
  saving.value = true
  error.value = ''
  try {
    await resetPassword(props.user.id, password.value)
    password.value = ''
    emit('update:modelValue', false)
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '重置失败'
  } finally {
    saving.value = false
  }
}
</script>
