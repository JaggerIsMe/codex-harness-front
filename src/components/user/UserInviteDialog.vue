<template>
  <AppDialog :model-value="modelValue" title="新增用户" @update:model-value="close">
    <form ref="element" class="grid gap-4" @submit.prevent="save">
      <label class="grid gap-2"
        >邮箱<AppInput
          v-model.trim="email"
          label="邮箱"
          type="email"
          autocomplete="off"
          required
          maxlength="254"
      /></label>
      <label class="grid gap-2"
        >角色<AppSelect v-model="role"
          ><option value="USER">普通用户</option>
          <option value="SYS_ADMIN">管理员</option></AppSelect
        ></label
      >
      <p class="text-sm text-muted-foreground">
        系统发送激活邮件，由用户自行设置密码。机器和专家可在创建后分配。
      </p>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    </form>
    <template #footer
      ><AppButton :disabled="saving" @click="close(false)">取消</AppButton
      ><AppButton tone="primary" :loading="saving" @click="save"
        >创建并发送激活邮件</AppButton
      ></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppButton from '@/components/common/AppButton.vue'
import { createUser } from '@/api/user'
import { useEmailRequest } from '@/composables/useEmailRequest'
import type { UserInput } from '@/types/domain'
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const element = ref<HTMLFormElement | null>(null)
const email = ref('')
const role = ref<UserInput['role']>('USER')
const { busy: saving, error, run, cancel } = useEmailRequest()
watch(
  () => props.modelValue,
  () => {
    cancel()
    email.value = ''
    role.value = 'USER'
  },
)
function close(value: boolean) {
  if (!saving.value) emit('update:modelValue', value)
}
async function save() {
  if (saving.value || !element.value?.reportValidity()) return
  const result = await run((signal) =>
    createUser({ email: email.value.trim().toLowerCase(), role: role.value }, signal),
  )
  if (!result) return
  emit('update:modelValue', false)
  emit('saved')
}
</script>
