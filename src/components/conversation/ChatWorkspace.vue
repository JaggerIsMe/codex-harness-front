<template>
  <section class="conversation-workbench">
    <p v-if="conversationStore.detailError" role="alert" class="p-4 text-destructive">
      {{ conversationStore.detailError }}
    </p>
    <p v-if="loading" role="status" class="p-3">加载会话中…</p>
    <p v-if="conversationStore.streamWarning" role="status" class="p-3 text-amber-700">
      {{ conversationStore.streamWarning }}
    </p>
    <template v-if="currentConversation">
      <header class="conversation-header">
        <div>
          <div class="conversation-title">
            <h3>{{ currentConversation.title }}</h3>
            <AppBadge :tone="currentConversation.status === 'ACTIVE' ? 'success' : 'danger'">{{
              statusLabel(currentConversation.status)
            }}</AppBadge>
          </div>
          <p>
            {{ currentConversation.projectName }} · 会话 #{{ currentConversation.id }} · 项目 #{{
              currentConversation.projectId
            }}
          </p>
        </div>
        <div class="conversation-header__actions">
          <AppBadge
            v-if="!currentConversation.codexThreadId && currentConversation.status === 'ACTIVE'"
            tone="warning"
            >Agent 正在初始化 Thread</AppBadge
          >
          <AppBadge v-else-if="isTurnActive" tone="primary">{{
            turnStatusLabel(currentTurn?.status || '')
          }}</AppBadge>
          <AppButton
            :icon="Refresh"
            :loading="loading"
            @click="conversationStore.refreshCurrent({ silent: false })"
            >刷新</AppButton
          >
        </div>
      </header>

      <div
        ref="messagePanel"
        :aria-busy="loading"
        class="message-panel"
        @scroll="handleMessageScroll"
      >
        <AppButton
          v-if="conversationStore.hasMoreMessages"
          :loading="conversationStore.loadingOlder"
          @click="conversationStore.loadOlderMessages()"
          >加载更早消息</AppButton
        >
        <div
          v-for="message in displayMessages"
          :key="message.id"
          class="message-row"
          :class="`message-row--${message.role.toLowerCase()}`"
        >
          <article v-if="message.role === 'USER'" class="message-bubble message-bubble--user">
            <pre>{{ message.content }}</pre>
          </article>

          <article v-else class="agent-message">
            <header class="agent-message__header">
              <strong>Codex</strong
              ><span v-if="isStreaming(message)" class="streaming-state"><i></i>正在回答</span>
            </header>
            <p v-if="message.incomplete" class="text-sm text-amber-700">
              此轮包含未完成的消息，以下为已保存内容。
            </p>
            <p v-if="message.truncated" class="text-sm text-amber-700">
              部分输出超过保留上限，已截断。
            </p>

            <AgentProcess
              :items="message.processItems"
              :streaming="isStreaming(message)"
              :incomplete="message.incomplete"
            />

            <div
              v-if="message.content"
              class="agent-answer"
              :class="{ 'agent-answer--streaming': isStreaming(message) }"
              aria-live="polite"
            >
              <MessageContent :content="message.content" /><span
                v-if="isStreaming(message)"
                class="streaming-caret"
                aria-hidden="true"
              ></span>
            </div>
            <div v-else-if="isStreaming(message)" class="agent-answer agent-answer--pending">
              <span></span>正在组织回答…
            </div>
          </article>
        </div>
        <EmptyState v-if="!loading && !messages.length" description="发送第一条任务消息开始 Turn" />
      </div>

      <div v-if="pendingApprovals.length" class="approval-stack">
        <ApprovalCard
          v-for="approval in pendingApprovals"
          :key="approval.id"
          :approval="approval"
          :loading="resolvingId === approval.id"
          @decision="decide(approval, $event)"
        />
      </div>

      <footer class="composer">
        <AppInput
          v-model="messageInput"
          type="textarea"
          :rows="3"
          maxlength="100000"
          resize="none"
          placeholder="向 Codex 描述任务，Ctrl + Enter 发送"
          :disabled="!canStartTurn"
          @keydown.ctrl.enter.prevent="send"
        />
        <div class="composer__footer">
          <div class="composer-options">
            <AppInput v-model="turnModel" placeholder="模型（可选）" />
            <AppSelect v-model="reasoningEffort" clearable placeholder="推理强度">
              <option v-for="item in reasoningOptions" :key="item" :value="item">{{ item }}</option>
            </AppSelect>
          </div>
          <div>
            <AppButton
              v-if="canInterrupt"
              tone="danger"
              plain
              :loading="interrupting"
              @click="interrupt"
              >中断 Turn</AppButton
            >
            <AppButton
              tone="primary"
              :icon="Promotion"
              :loading="sending"
              :disabled="!canStartTurn || !messageInput.trim()"
              @click="send"
              >发送任务</AppButton
            >
          </div>
        </div>
      </footer>
    </template>
    <div v-else class="conversation-empty">
      <div class="empty-intro">
        <span class="empty-intro__label">{{ projectName || '工作区' }}</span>
        <h2>今天想做些什么？</h2>
        <p>新建一个会话，开始与 Codex 一起工作。</p>
        <AppButton :icon="Plus" tone="primary" @click="emit('create')">新建会话</AppButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Approval, Decision, DisplayMessage } from '@/types/domain'
import EmptyState from '@/components/common/EmptyState.vue'
import AppBadge from '@/components/common/AppBadge.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Plus, Send as Promotion, RefreshCw as Refresh } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useConversationStore } from '../../stores/conversation'
import { buildConversationDisplayMessages } from '../../utils/conversationMessages'
import ApprovalCard from './ApprovalCard.vue'
import AgentProcess from './AgentProcess.vue'
import MessageContent from './MessageContent.vue'

defineProps<{ projectName?: string }>()
const emit = defineEmits<{ create: [] }>()
const conversationStore = useConversationStore()
const {
  currentConversation,
  messages,
  currentTurn,
  pendingApprovals,
  isTurnActive,
  canInterrupt,
  canStartTurn,
  loading,
  sending,
  interrupting,
  resolvingId,
} = storeToRefs(conversationStore)
const messageInput = ref('')
const turnModel = ref('')
const reasoningEffort = ref('')
const messagePanel = ref<HTMLElement | null>(null)
const reasoningOptions = ['low', 'medium', 'high', 'xhigh']
const shouldStickToBottom = ref(true)

const displayMessages = computed(() => buildConversationDisplayMessages(messages.value))

const messageScrollToken = computed(() => {
  const last = messages.value[messages.value.length - 1]
  return `${messages.value.length}:${last?.id || ''}:${last?.content?.length || 0}`
})

function statusLabel(status: string) {
  return (
    ({ ACTIVE: '进行中', FAILED: '失败', COMPLETED: '已完成' } as Record<string, string>)[status] ||
    status ||
    '未知'
  )
}

function turnStatusLabel(status: string) {
  return (
    (
      {
        CREATED: '任务正在下发',
        RUNNING: 'Codex 正在执行',
        WAITING_APPROVAL: '等待审批',
      } as Record<string, string>
    )[status] || status
  )
}

function isStreaming(message: DisplayMessage) {
  return (
    message.streaming &&
    isTurnActive.value &&
    String(message.turnId) === String(currentTurn.value?.id)
  )
}

async function send() {
  const content = messageInput.value.trim()
  if (!content || !canStartTurn.value) return
  const result = await conversationStore.startNewTurn({
    message: content,
    model: turnModel.value.trim() || undefined,
    reasoningEffort: reasoningEffort.value || undefined,
  })
  if (result) messageInput.value = ''
}

async function interrupt() {
  await conversationStore.interruptCurrentTurn()
  toast.success('中断命令已发送')
}

async function decide(approval: Approval, decision: Decision) {
  await conversationStore.decideApproval(approval, decision)
  toast.success('审批决定已提交')
}

function handleMessageScroll() {
  if (!messagePanel.value) return
  const distance =
    messagePanel.value.scrollHeight - messagePanel.value.scrollTop - messagePanel.value.clientHeight
  shouldStickToBottom.value = distance < 80
}

async function scrollToBottom(force = false) {
  await nextTick()
  if (messagePanel.value && (force || shouldStickToBottom.value))
    messagePanel.value.scrollTop = messagePanel.value.scrollHeight
}

watch(messageScrollToken, () => scrollToBottom())
watch(
  () => currentConversation.value?.id,
  () => {
    messageInput.value = ''
    shouldStickToBottom.value = true
    scrollToBottom(true)
  },
)
</script>
