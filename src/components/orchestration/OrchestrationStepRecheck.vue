<template>
  <div class="space-y-2">
    <AppButton :loading="checking" @click="recheck">重新校验并推进</AppButton>
    <p class="text-xs text-muted-foreground">
      核实已保存的完成回执与产出记录，通过后自动进入下一节点；不向当前 Expert 发送新消息。
    </p>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
  </div>
</template>
<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import AppButton from '@/components/common/AppButton.vue'
import { recheckOrchestrationStep } from '@/api/orchestration'
import type { Id } from '@/types/domain'
const props = defineProps<{ projectId: Id; executionId: Id; stepId: Id; turnId: Id }>()
const emit = defineEmits<{ checked: [] }>()
const checking = ref(false),
  error = ref('')
let disposed = false
onBeforeUnmount(() => {
  disposed = true
})
async function recheck() {
  if (checking.value) return
  checking.value = true
  error.value = ''
  try {
    await recheckOrchestrationStep(props.projectId, props.executionId, props.stepId, props.turnId)
    if (!disposed) emit('checked')
  } catch (cause) {
    if (!disposed)
      error.value = cause instanceof Error ? cause.message : '重新校验失败，请刷新节点状态'
  } finally {
    if (!disposed) checking.value = false
  }
}
</script>
