<template>
  <AppDialog :model-value="modelValue" title="修改会话名称" @update:model-value="close">
    <form class="grid gap-4" @submit.prevent="submit">
      <label class="grid gap-2">
        会话名称
        <AppInput
          v-model="title"
          label="会话名称"
          required
          maxlength="255"
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
import type { Conversation } from '@/types/domain'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import { useProjectConversationActions } from '@/composables/useProjectConversationActions'

const props = defineProps<{ modelValue: boolean; conversation: Conversation }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  saved: [value: Conversation]
}>()
const { renameConversation } = useProjectConversationActions()
const title = ref('')
const submitting = ref(false)
const error = ref('')
const errorId = useId()
watch(
  () => [props.modelValue, props.conversation.id] as const,
  ([open]) => {
    if (!open) return
    title.value = props.conversation.title
    error.value = ''
  },
  { immediate: true },
)
function close(open: boolean) {
  if (!submitting.value) emit('update:modelValue', open)
}
async function submit() {
  if (submitting.value) return
  const name = title.value.trim()
  if (!name || name.length > 255) {
    error.value = '请输入 1 至 255 个字符的会话名称'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const conversation = await renameConversation(props.conversation, name)
    toast.success('会话名称已修改')
    emit('saved', conversation)
    emit('update:modelValue', false)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '修改会话名称失败'
  } finally {
    submitting.value = false
  }
}
</script>
