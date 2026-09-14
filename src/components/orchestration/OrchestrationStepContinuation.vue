<template>
  <form
    class="space-y-3 rounded border bg-muted/30 p-4"
    aria-label="节点补充信息"
    @submit.prevent="submit"
  >
    <p class="text-sm">
      {{
        validationFailed
          ? '产出校验未通过。可提供修正要求，由当前 Expert 继续处理。'
          : '当前 Expert 需要你的回答。回复后继续当前节点，完成并通过校验后自动进入下一节点。'
      }}
    </p>
    <p v-if="reason" class="whitespace-pre-wrap break-words text-sm">{{ reason }}</p>
    <AppInput
      v-model="message"
      type="textarea"
      :label="validationFailed ? '修正要求' : '你的回答'"
      :rows="4"
      maxlength="50000"
      :disabled="sending"
      :placeholder="validationFailed ? '请输入需要修正的内容或要求' : '请输入你的回答或补充说明'"
    />
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <AppButton
      type="submit"
      tone="primary"
      :loading="sending"
      :disabled="!message.trim() || sending"
      >发送并继续当前节点</AppButton
    >
  </form>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import { continueOrchestrationStep } from '@/api/orchestration'
import type { Id } from '@/types/domain'
const props = defineProps<{
  projectId: Id
  executionId: Id
  stepId: Id
  turnId: Id
  validationFailed?: boolean
  reason?: string | null
}>()
const emit = defineEmits<{ continued: [] }>()
const message = ref(''),
  error = ref(''),
  sending = ref(false)
let pending: { expectedTurnId: Id; requestKey: string; message: string } | null = null
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
async function submit() {
  if (sending.value || !message.value.trim()) return
  // Reuse the same request after an uncertain network response; changed text is a new request.
  if (!pending || pending.message !== message.value)
    pending = {
      expectedTurnId: props.turnId,
      requestKey: crypto.randomUUID(),
      message: message.value,
    }
  sending.value = true
  try {
    await continueOrchestrationStep(props.projectId, props.executionId, props.stepId, pending)
    if (!disposed) {
      message.value = ''
      error.value = ''
      pending = null
      emit('continued')
    }
  } catch (cause) {
    if (!disposed)
      error.value = cause instanceof Error ? cause.message : '续聊失败，请刷新节点状态后重试'
  } finally {
    if (!disposed) sending.value = false
  }
}
</script>
