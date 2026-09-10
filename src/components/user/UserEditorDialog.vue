<template>
  <AppDialog :model-value="modelValue" title="编辑用户" @update:model-value="close">
    <form ref="element" class="grid gap-4" @submit.prevent="save">
      <p class="text-sm text-muted-foreground">{{ user?.email }}</p>
      <label class="grid gap-2"
        >显示名称<AppInput v-model.trim="displayName" required maxlength="128"
      /></label>
      <p class="text-sm text-muted-foreground">显示名称不影响登录邮箱。保存后该用户需重新登录。</p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    </form>
    <template #footer
      ><AppButton :disabled="saving" @click="close(false)">取消</AppButton
      ><AppButton tone="primary" :loading="saving" @click="save">保存</AppButton></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ManagedUser } from '@/types/domain'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import { updateUser } from '@/api/user'
import { useEmailRequest } from '@/composables/useEmailRequest'
const props = defineProps<{ modelValue: boolean; user: ManagedUser | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const element = ref<HTMLFormElement | null>(null)
const displayName = ref('')
const { busy: saving, error, run, cancel } = useEmailRequest()
watch(
  () => props.modelValue,
  (open) => {
    cancel()
    if (open) displayName.value = props.user?.displayName || ''
  },
)
function close(value: boolean) {
  if (!saving.value) emit('update:modelValue', value)
}
async function save() {
  if (saving.value || !props.user || !element.value?.reportValidity()) return
  const user = props.user
  const result = await run((signal) =>
    updateUser(user.id, { displayName: displayName.value.trim(), status: user.status }, signal),
  )
  if (!result) return
  emit('update:modelValue', false)
  emit('saved')
}
</script>
