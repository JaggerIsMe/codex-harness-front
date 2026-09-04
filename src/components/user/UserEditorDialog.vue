<template>
  <AppDialog
    :model-value="modelValue"
    :title="user ? '编辑用户' : '新增用户'"
    @update:model-value="close"
  >
    <form ref="element" class="grid gap-4" @submit.prevent="save">
      <label class="grid gap-2"
        >用户名<AppInput
          v-model="username"
          :disabled="Boolean(user)"
          required
          pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,63}"
          autocomplete="off"
      /></label>
      <label class="grid gap-2"
        >显示名称<AppInput v-model="displayName" required maxlength="128"
      /></label>
      <template v-if="!user">
        <label class="grid gap-2"
          >临时密码<AppInput
            v-model="password"
            type="password"
            required
            minlength="12"
            maxlength="64"
            autocomplete="new-password"
        /></label>
        <p class="text-sm text-muted-foreground">
          12–64字符，包含字母和数字。请通过安全渠道交给用户；首次登录必须修改。
        </p>
        <label class="grid gap-2"
          >角色<AppSelect v-model="role"
            ><option value="USER">普通用户</option>
            <option value="SYS_ADMIN">管理员</option></AppSelect
          ></label
        >
      </template>
      <p v-else class="text-sm text-muted-foreground">
        保存后该用户需重新登录。机器和角色请通过列表中的对应操作管理。
      </p>
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
import AppSelect from '@/components/common/AppSelect.vue'
import AppButton from '@/components/common/AppButton.vue'
import { createUser, updateUser } from '@/api/user'
const props = defineProps<{ modelValue: boolean; user: ManagedUser | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const element = ref<HTMLFormElement | null>(null)
const username = ref(''),
  displayName = ref(''),
  password = ref(''),
  role = ref('USER'),
  error = ref('')
const saving = ref(false)
watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      password.value = ''
      return
    }
    username.value = props.user?.username || ''
    displayName.value = props.user?.displayName || ''
    password.value = ''
    role.value = 'USER'
    error.value = ''
  },
)
function close(value: boolean) {
  if (!saving.value) emit('update:modelValue', value)
}
async function save() {
  if (saving.value || !element.value?.reportValidity()) return
  saving.value = true
  error.value = ''
  try {
    if (props.user)
      await updateUser(props.user.id, {
        displayName: displayName.value.trim(),
        status: props.user.status,
      })
    else
      await createUser({
        username: username.value,
        displayName: displayName.value.trim(),
        password: password.value,
        role: role.value,
        deviceIds: [],
      })
    password.value = ''
    emit('update:modelValue', false)
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    saving.value = false
  }
}
</script>
