<template>
  <footer class="composer space-y-3" @dragover.prevent @drop="drop" @paste="paste">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-sm">{{
        expertLoading ? '加载会话专家…' : expertSelection?.name || '未绑定专家'
      }}</span>
      <span v-if="expertSelection?.expertId" class="text-xs text-muted-foreground"
        >创建时固定，不可更改</span
      >
      <AppButton size="small" @click="reloadExpert">刷新状态</AppButton>
    </div>
    <p
      v-if="expertError || (expertSelection && !expertSelection.available)"
      role="alert"
      class="text-sm text-destructive"
    >
      {{ expertError || expertSelection?.unavailableReason }}
    </p>
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
      <div class="text-xs text-muted-foreground">模型由管理员按 Device 统一配置</div>
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
import { useConversationExpert } from '@/composables/useConversationExpert'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import AttachmentUpload from './AttachmentUpload.vue'
import { useConversationAttachments } from '@/composables/useConversationAttachments'
import { useConversationStore } from '@/stores/conversation'
import type { Id } from '@/types/domain'
const props = defineProps<{ projectId: Id; conversationId: Id }>()
const {
  selection: expertSelection,
  loading: expertLoading,
  error: expertError,
  load: reloadExpert,
} = useConversationExpert(props.projectId, props.conversationId)
const store = useConversationStore()
const { canStartTurn, sending, canInterrupt, interrupting } = storeToRefs(store)
const { rows, limits, loading, error, blocked, selected, add, upload, remove, clearSent, load } =
  useConversationAttachments(props.projectId, props.conversationId)
const message = ref('')
let request: { fingerprint: string; id: string } | null = null
const canSend = computed(
  () =>
    canStartTurn.value &&
    !sending.value &&
    !expertLoading.value &&
    !expertError.value &&
    Boolean(expertSelection.value?.available) &&
    !blocked.value &&
    (message.value.trim() || selected.value.length > 0) &&
    (!selected.value.length || limits.value?.agentSupported),
)
async function send() {
  if (!canSend.value) return
  const input = {
    message: message.value.trim(),
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
