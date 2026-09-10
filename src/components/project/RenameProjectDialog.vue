<template>
  <AppDialog :model-value="modelValue" title="修改项目名称" @update:model-value="close">
    <form class="grid gap-4" @submit.prevent="submit">
      <label class="grid gap-2">
        项目名称
        <AppInput
          v-model="projectName"
          label="项目名称"
          required
          maxlength="128"
          :disabled="submitting"
          :aria-invalid="Boolean(error)"
          :aria-describedby="error ? errorId : undefined"
        />
      </label>
      <p v-if="error" :id="errorId" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <button type="submit" class="sr-only" tabindex="-1" :disabled="submitting">保存名称</button>
    </form>
    <template #footer>
      <AppButton :disabled="submitting" @click="close(false)">取消</AppButton>
      <AppButton tone="primary" :loading="submitting" @click="submit">保存名称</AppButton>
    </template>
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, useId, watch } from 'vue'
import { toast } from 'vue-sonner'
import type { Project } from '@/types/domain'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import { useProjectConversationActions } from '@/composables/useProjectConversationActions'

const props = defineProps<{ modelValue: boolean; project: Project }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [value: Project] }>()
const { renameProject } = useProjectConversationActions()
const projectName = ref('')
const submitting = ref(false)
const error = ref('')
const errorId = useId()
watch(
  () => [props.modelValue, props.project.id] as const,
  ([open]) => {
    if (!open) return
    projectName.value = props.project.projectName
    error.value = ''
  },
  { immediate: true },
)
function close(open: boolean) {
  if (!submitting.value) emit('update:modelValue', open)
}
async function submit() {
  if (submitting.value) return
  const name = projectName.value.trim()
  if (!name || name.length > 128) {
    error.value = '请输入 1 至 128 个字符的项目名称'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const project = await renameProject(props.project, name)
    toast.success('项目名称已修改')
    emit('saved', project)
    emit('update:modelValue', false)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '修改项目名称失败'
  } finally {
    submitting.value = false
  }
}
</script>
