<template>
  <footer class="composer-shell" @dragover.prevent @drop="drop" @paste="paste">
    <p
      v-if="expertError || (expertSelection && !expertSelection.available)"
      role="alert"
      class="text-sm text-destructive"
    >
      {{ expertError || expertSelection?.unavailableReason }}
    </p>
    <AttachmentUpload
      ref="attachmentUpload"
      :rows="rows"
      :limits="limits"
      :loading="loading"
      :disabled="attachmentsDisabled"
      @add="add"
      @retry="upload"
      @remove="remove"
    />
    <div ref="editor" class="composer" :class="{ 'composer--expanded': expanded }">
      <div class="composer__metadata">
        <div class="composer__expert">
          <span class="min-w-0 truncate" :title="expertSelection?.name || undefined">
            当前专家：{{ expertLoading ? '加载中…' : expertSelection?.name || '未绑定专家' }}
          </span>
          <AppButton
            circle
            link
            class="composer__icon composer__refresh"
            :icon="RefreshCw"
            :loading="expertLoading"
            label="刷新专家状态"
            title="刷新专家状态"
            @click="reloadExpert"
          />
        </div>
        <div
          v-if="loading || error || !limits || !limits.agentSupported || rows.length"
          class="composer__attachment-hints"
        >
          <p v-if="loading" role="status">正在恢复附件…</p>
          <p v-else-if="limits && !limits.agentSupported">升级 Agent 后可发送附件</p>
          <p v-else-if="limits && rows.length">
            上传到工作区根目录 · 最多 {{ limits.maxFiles }} 个 · 单个
            {{ Math.round(limits.maxFileBytes / 1048576) }} MB
          </p>
          <p v-if="rows.length">
            移除附件只取消消息关联，已写入工作区的文件会保留；同名冲突请移除附件、修改本地文件名后重新上传。
          </p>
          <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
          <AppButton v-if="!limits && !loading" :disabled="attachmentsDisabled" @click="load"
            >重新加载附件</AppButton
          >
        </div>
      </div>
      <AppInput
        :id="editorId"
        v-model="message"
        type="textarea"
        :rows="2"
        maxlength="100000"
        resize="none"
        placeholder="向 Codex 描述任务，Ctrl + Enter 发送"
        :disabled="!canStartTurn || sending"
        @keydown.ctrl.enter.prevent="send"
        @keydown.esc="expanded = false"
      />
      <div class="composer__footer">
        <AppButton
          circle
          link
          class="composer__icon"
          :icon="Plus"
          :disabled="attachmentsDisabled || loading || !limits?.agentSupported"
          label="添加附件"
          title="添加附件"
          @click="attachmentUpload?.openPicker()"
        />
        <div class="composer__actions">
          <AppButton
            circle
            link
            class="composer__icon"
            :icon="expanded ? Minimize2 : Maximize2"
            :label="expanded ? '收起输入框' : '展开输入框'"
            :title="expanded ? '收起输入框' : '展开输入框'"
            :aria-expanded="expanded"
            :aria-controls="editorId"
            @click="toggleExpanded"
          />
          <AppButton
            v-if="canInterrupt"
            circle
            class="composer__icon composer__stop"
            tone="danger"
            label="停止生成"
            title="停止生成"
            :disabled="interrupting"
            :aria-busy="interrupting"
            @click="interrupt"
          >
            <Square class="size-3.5 fill-current" aria-hidden="true" />
          </AppButton>
          <AppButton
            v-else
            circle
            class="composer__icon composer__send"
            tone="primary"
            :icon="ArrowUp"
            label="发送任务"
            title="发送任务"
            :loading="sending"
            :disabled="!canSend"
            @click="send"
          />
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { ArrowUp, Maximize2, Minimize2, Plus, RefreshCw, Square } from 'lucide-vue-next'
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
const expanded = ref(false)
const editorId = useId()
const editor = ref<HTMLElement | null>(null)
const attachmentUpload = ref<InstanceType<typeof AttachmentUpload> | null>(null)
const attachmentsDisabled = computed(() => sending.value || !canStartTurn.value)
async function toggleExpanded() {
  expanded.value = !expanded.value
  await nextTick()
  editor.value?.querySelector('textarea')?.focus({ preventScroll: true })
}
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
      expanded.value = false
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
