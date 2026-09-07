<template>
  <AppDialog :model-value="modelValue" title="新建文件夹" width="420px" @close="close">
    <form class="space-y-3" @submit.prevent="submit">
      <p class="text-sm text-muted-foreground">位置：{{ parent || '工作区根目录' }}</p>
      <label class="block text-sm" for="workspace-directory-name">文件夹名称</label>
      <AppInput
        id="workspace-directory-name"
        v-model="name"
        maxlength="255"
        :disabled="submitting"
        autofocus
      />
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <button type="submit" class="sr-only">创建</button>
    </form>
    <template #footer>
      <AppButton :disabled="submitting" @click="close">取消</AppButton>
      <AppButton tone="primary" :loading="submitting" :disabled="!name.trim()" @click="submit"
        >创建</AppButton
      >
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
const props = defineProps<{
  modelValue: boolean
  parent: string
  create: (name: string, requestKey: string) => Promise<void>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const name = ref('')
const error = ref('')
const submitting = ref(false)
let request: { name: string; id: string } | null = null
watch(
  () => props.modelValue,
  (value) => {
    if (value) {
      name.value = ''
      error.value = ''
      request = null
    }
  },
)
function close() {
  if (!submitting.value) emit('update:modelValue', false)
}
async function submit() {
  if (submitting.value) return
  const value = name.value.trim()
  if (!value || /[/\\<>:"|?*]/.test(value) || value === '.' || value === '..') {
    error.value = '请输入有效的单个文件夹名称'
    return
  }
  if (request?.name !== value) request = { name: value, id: crypto.randomUUID() }
  submitting.value = true
  error.value = ''
  try {
    await props.create(value, request.id)
    emit('update:modelValue', false)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '创建失败'
  } finally {
    submitting.value = false
  }
}
</script>
