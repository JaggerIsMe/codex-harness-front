<template>
  <WorkspaceWorkbenchLayout
    ref="workbenchLayout"
    :preview-open="!!previewFile"
    :files-open="filesOpen && !!currentConversation"
  >
    <template #chat>
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
                {{ currentConversation.projectName }} · 会话 #{{ currentConversation.id }} · 项目
                #{{ currentConversation.projectId }}
              </p>
            </div>
            <div class="conversation-header__actions">
              <AppButton
                data-workspace-files-toggle
                :aria-expanded="filesOpen"
                @click="filesOpen = !filesOpen"
                >工作区文件</AppButton
              >
              <RouterLink
                :to="`/projects/${currentConversation.projectId}/experts`"
                class="relative inline-flex"
                ><AppButton>项目专家</AppButton
                ><span
                  v-if="expertUpgradeAvailable"
                  aria-label="项目专家有新版本"
                  class="absolute -right-1 -top-1 size-2.5 rounded-full bg-red-500 ring-2 ring-background"
                ></span
              ></RouterLink>
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
                <MessageAttachments
                  :key="String(currentConversation.id)"
                  :attachments="message.attachments"
                  :project-id="currentConversation.projectId"
                />
              </article>

              <article v-else class="agent-message">
                <header class="agent-message__header">
                  <strong>{{ expertName(message.turnId) }}</strong
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
            <p v-if="expertIdentityError" role="alert" class="p-3 text-sm text-destructive">
              {{ expertIdentityError }}
            </p>
            <EmptyState
              v-if="!loading && !messages.length"
              description="发送第一条任务消息开始 Turn"
            />
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

          <ConversationComposer
            :key="`${currentConversation.projectId}:${currentConversation.id}`"
            :project-id="currentConversation.projectId"
            :conversation-id="currentConversation.id"
          />
        </template>
        <div v-else class="conversation-empty">
          <div class="empty-intro">
            <span class="empty-intro__label">{{ projectName || '工作区' }}</span>
            <h2>今天想做些什么？</h2>
            <p>新建一个会话，开始与 Codex 一起工作。</p>
            <AppButton :icon="Plus" tone="primary" @click="emit('create')">新建会话</AppButton>
            <RouterLink
              v-if="conversationStore.currentProjectId"
              :to="`/projects/${conversationStore.currentProjectId}/experts`"
              class="mt-3 block text-sm text-primary underline"
              >管理项目专家</RouterLink
            >
          </div>
        </div>
      </section>
    </template>
    <template #preview="{ active, maximized, maximize }">
      <WorkspaceFilePreviewPanel
        v-if="previewFile"
        :file="previewFile"
        :metadata="previewMetadata"
        :blob="previewBlob"
        :loading="previewLoading"
        :downloading="previewDownloading"
        :error="previewError"
        :changed="previewChanged"
        :online="previewOnline"
        :active="active"
        :maximized="maximized"
        @refresh="refreshPreview"
        @download="downloadPreview"
        @close="closePreview"
        @maximize="maximize"
      />
    </template>
    <template #files>
      <WorkspaceFilePanel
        v-if="filesOpen && currentConversation"
        :key="String(currentConversation.projectId)"
        :project-id="currentConversation.projectId"
        :preview-path="previewFile?.path"
        @preview="previewEntry"
        @close="filesOpen = false"
      />
    </template>
  </WorkspaceWorkbenchLayout>
</template>

<script setup lang="ts">
import type { Approval, Decision, DisplayMessage } from '@/types/domain'
import EmptyState from '@/components/common/EmptyState.vue'
import AppBadge from '@/components/common/AppBadge.vue'
import AppButton from '@/components/common/AppButton.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { Plus, RefreshCw as Refresh } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useConversationStore } from '../../stores/conversation'
import { buildConversationDisplayMessages } from '../../utils/conversationMessages'
import ApprovalCard from './ApprovalCard.vue'
import AgentProcess from './AgentProcess.vue'
import MessageContent from './MessageContent.vue'
import ConversationComposer from './ConversationComposer.vue'
import MessageAttachments from './MessageAttachments.vue'
import { useTurnExperts } from '@/composables/useTurnExperts'
import { useProjectExpertUpgradeNotice } from '@/composables/useProjectExpertUpgradeNotice'
import WorkspaceFilePanel from '@/components/workspace/WorkspaceFilePanel.vue'
import WorkspaceWorkbenchLayout from '@/components/workspace/WorkspaceWorkbenchLayout.vue'
import WorkspaceFilePreviewPanel from '@/components/workspace/WorkspaceFilePreviewPanel.vue'
import { useWorkspaceFilePreview } from '@/composables/useWorkspaceFilePreview'
import type { WorkspaceFileEntry } from '@/types/workspace-file'
const filesOpen = ref(false)
const workbenchLayout = ref<InstanceType<typeof WorkspaceWorkbenchLayout> | null>(null)

defineProps<{ projectName?: string }>()
const emit = defineEmits<{ create: [] }>()
const conversationStore = useConversationStore()
const {
  currentConversation,
  messages,
  currentTurn,
  pendingApprovals,
  isTurnActive,
  loading,
  resolvingId,
} = storeToRefs(conversationStore)
const {
  file: previewFile,
  metadata: previewMetadata,
  blob: previewBlob,
  loading: previewLoading,
  downloading: previewDownloading,
  error: previewError,
  changed: previewChanged,
  online: previewOnline,
  open: openPreview,
  close: closePreview,
  download: downloadPreview,
  refresh: refreshPreview,
} = useWorkspaceFilePreview(
  computed(() => currentConversation.value?.projectId),
  computed(() => currentConversation.value?.id),
)
function previewEntry(file: WorkspaceFileEntry) {
  void openPreview(file)
  workbenchLayout.value?.revealPreview()
}
const messagePanel = ref<HTMLElement | null>(null)
const shouldStickToBottom = ref(true)
const expertUpgradeAvailable = useProjectExpertUpgradeNotice(
  computed(() => currentConversation.value?.projectId),
)

const displayMessages = computed(() => buildConversationDisplayMessages(messages.value))
const { rows: turnExperts, error: expertIdentityError } = useTurnExperts(
  () => currentConversation.value,
  () => currentTurn.value,
)
const expertName = (id: number) => {
  const value = turnExperts.value.find((row) => String(row.turnId) === String(id))
  return value ? value.expertName || 'Codex' : '助手'
}
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
        CREATED:
          currentTurn.value?.preparationPhase === 'EXPERT_SKILLS'
            ? '正在准备专家 Skills'
            : currentTurn.value?.preparationPhase
              ? '正在准备附件'
              : '任务正在下发',
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
    shouldStickToBottom.value = true
    scrollToBottom(true)
  },
)
</script>

<style src="../../assets/styles/workspace.files.scss"></style>
