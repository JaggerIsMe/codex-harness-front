<template>
  <footer class="composer space-y-3" @dragover.prevent @drop="drop" @paste="paste">
    <AttachmentUpload
      :rows="rows"
      :limits="limits"
      :loading="loading"
      :error="error"
      :disabled="sending || !canStartTurn"
      @add="add"
      @retry="upload"
      @remove="remove"
      @reload="load"
    />
    <AppInput
      v-model="message"
      type="textarea"
      :rows="3"
      maxlength="100000"
      resize="none"
      placeholder="向 Codex 描述任务，Ctrl + Enter 发送"
      :disabled="!canStartTurn || sending"
      @keydown.ctrl.enter.prevent="send"
    />
    <div class="composer__footer">
      <div class="composer-options">
        <AppInput v-model="model" placeholder="模型（可选）" :disabled="sending" />
        <AppSelect v-model="effort" clearable placeholder="推理强度" :disabled="sending">
          <option v-for="item in ['low', 'medium', 'high', 'xhigh']" :key="item" :value="item">
            {{ item }}
          </option>
        </AppSelect>
      </div>
      <div class="flex gap-2">
        <AppButton
          v-if="canInterrupt"
          tone="danger"
          plain
          :loading="interrupting"
          @click="interrupt"
          >中断 Turn</AppButton
        >
        <AppButton tone="primary" :loading="sending" :disabled="!canSend" @click="send"
          >发送任务</AppButton
        >
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AttachmentUpload from './AttachmentUpload.vue'
import { useConversationAttachments } from '@/composables/useConversationAttachments'
import { useConversationStore } from '@/stores/conversation'
import type { Id } from '@/types/domain'
const props = defineProps<{ projectId: Id; conversationId: Id }>()
const store = useConversationStore()
const { canStartTurn, sending, canInterrupt, interrupting } = storeToRefs(store)
const { rows, limits, loading, error, blocked, selected, add, upload, remove, clearSent, load } =
  useConversationAttachments(props.projectId, props.conversationId)
const message = ref(''),
  model = ref(''),
  effort = ref('')
let request: { fingerprint: string; id: string } | null = null
const canSend = computed(
  () =>
    canStartTurn.value &&
    !sending.value &&
    !blocked.value &&
    (message.value.trim() || selected.value.length > 0) &&
    (!selected.value.length || limits.value?.agentSupported),
)
async function send() {
  if (!canSend.value) return
  const input = {
    message: message.value.trim(),
    model: model.value.trim() || undefined,
    reasoningEffort: effort.value || undefined,
    attachmentIds: selected.value.map((item) => item.id),
  }
  const fingerprint = JSON.stringify(input)
  if (request?.fingerprint !== fingerprint) request = { fingerprint, id: crypto.randomUUID() }
  try {
    const result = await store.startNewTurn({ ...input, clientRequestId: request.id })
    if (result) {
      message.value = ''
      clearSent()
      request = null
    }
  } catch {
    /* Shared request adapter displays the error; preserve draft and request ID for retry. */
  }
}
async function interrupt() {
  try {
    await store.interruptCurrentTurn()
    toast.success('中断命令已发送')
  } catch {
    /* Shared error handling. */
  }
}
function drop(event: DragEvent) {
  event.preventDefault()
  if (!sending.value && canStartTurn.value) add(Array.from(event.dataTransfer?.files || []))
}
function paste(event: ClipboardEvent) {
  if (
    !event.defaultPrevented &&
    !sending.value &&
    canStartTurn.value &&
    event.clipboardData?.files.length
  ) {
    event.preventDefault()
    add(Array.from(event.clipboardData.files))
  }
}
</script>
