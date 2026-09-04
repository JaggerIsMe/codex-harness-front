<template>
  <AppDialog :model-value="modelValue" title="分配角色" @update:model-value="close">
    <p class="mb-4">{{ user?.displayName }}（{{ user?.username }}）</p>
    <label class="grid gap-2"
      >角色<AppSelect v-model="role"
        ><option value="USER">普通用户</option>
        <option value="SYS_ADMIN">管理员</option></AppSelect
      ></label
    >
    <p class="mt-4 text-sm text-muted-foreground">
      管理员可管理平台用户、机器和 Skills。保存后用户需重新登录；项目归属保持独占。
    </p>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <template #footer
      ><AppButton :disabled="saving" @click="close(false)">取消</AppButton
      ><AppButton tone="primary" :loading="saving" @click="save">确认分配</AppButton></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ManagedUser } from '@/types/domain'
import AppDialog from '@/components/common/AppDialog.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppButton from '@/components/common/AppButton.vue'
import { assignRole } from '@/api/user'
const props = defineProps<{ modelValue: boolean; user: ManagedUser | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const role = ref('USER'),
  error = ref('')
const saving = ref(false)
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      role.value = props.user?.roles.includes('SYS_ADMIN') ? 'SYS_ADMIN' : 'USER'
      error.value = ''
    }
  },
)
function close(value: boolean) {
  if (!saving.value) emit('update:modelValue', value)
}
async function save() {
  if (saving.value || !props.user) return
  saving.value = true
  error.value = ''
  try {
    await assignRole(props.user.id, role.value)
    emit('update:modelValue', false)
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '分配失败'
  } finally {
    saving.value = false
  }
}
</script>
