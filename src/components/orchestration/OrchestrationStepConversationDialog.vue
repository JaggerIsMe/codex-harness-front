<template>
  <AppDialog
    :model-value="true"
    :title="`${step.name} · 步骤会话`"
    width="1000px"
    @close="emit('close')"
  >
    <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <p>
        {{ statusLabels[step.status] }} · 会话 #{{ conversationId
        }}<span v-if="step.turnId"> · Turn #{{ step.turnId }}</span>
      </p>
      <AppButton :loading="loading" @click="refresh">刷新会话</AppButton>
    </div>
    <p class="rounded bg-muted p-3 text-sm">
      在此查看节点输入、执行过程和回复。正常执行无需操作；仅在需要回答、审批或修正产出时处理下方提示。
    </p>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">正在加载步骤会话…</p>
    <AppButton v-if="hasMore" :loading="loadingOlder" @click="loadOlder">加载更早消息</AppButton>
    <div aria-label="步骤会话消息" class="min-w-0 space-y-5">
      <article
        v-for="message in displayMessages"
        :key="message.id"
        class="min-w-0 space-y-2 rounded-lg border p-4"
      >
        <strong class="text-sm">{{ message.role === 'USER' ? '节点输入' : 'Expert 回复' }}</strong>
        <span v-if="message.turnId" class="ml-2 text-xs text-muted-foreground"
          >Turn #{{ message.turnId }}</span
        >
        <template v-if="message.role === 'USER'">
          <pre class="whitespace-pre-wrap break-words text-sm">{{ message.content }}</pre>
          <MessageAttachments
            :attachments="message.attachments"
            :project-id="projectId"
            :conversation-id="conversationId"
          />
        </template>
        <template v-else>
          <p v-if="message.incomplete || message.truncated" class="text-sm text-warning">
            部分消息未完成或已截断，以下为已保存内容。
          </p>
          <AgentProcess
            :items="message.processItems"
            :streaming="message.streaming"
            :incomplete="message.incomplete"
          />
          <MessageContent v-if="message.content" :content="message.content" />
          <p v-if="message.streaming" role="status" class="text-sm text-muted-foreground">
            正在执行，内容会自动更新…
          </p>
        </template>
      </article>
      <p
        v-if="loaded && !displayMessages.length"
        class="py-6 text-center text-sm text-muted-foreground"
      >
        此步骤暂时没有消息。
      </p>
    </div>
    <div v-if="approvals.length" class="min-w-0 space-y-3" aria-label="步骤待处理审批">
      <ApprovalCard
        v-for="approval in approvals"
        :key="approval.id"
        :approval="approval"
        :loading="resolvingId !== null"
        @decision="(decision, answers) => decide(approval, decision, answers)"
      />
    </div>
    <p v-if="decisionError" role="alert" class="text-sm text-destructive">{{ decisionError }}</p>
    <OrchestrationStepContinuation
      v-if="
        executionId &&
        step.turnId &&
        canContinue &&
        auth.can('turn:start') &&
        ['WAITING_USER', 'VALIDATION_FAILED'].includes(step.status)
      "
      :key="String(step.turnId)"
      :project-id="projectId"
      :execution-id="executionId"
      :step-id="step.id"
      :turn-id="step.turnId"
      :validation-failed="step.status === 'VALIDATION_FAILED'"
      :reason="step.failureMessage"
      @continued="continued"
    />
    <template #footer><AppButton @click="emit('close')">关闭会话</AppButton></template>
  </AppDialog>
</template>
<script setup lang="ts">
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import AgentProcess from '@/components/conversation/AgentProcess.vue'
import MessageContent from '@/components/conversation/MessageContent.vue'
import MessageAttachments from '@/components/conversation/MessageAttachments.vue'
import ApprovalCard from '@/components/conversation/ApprovalCard.vue'
import { useStepConversation } from '@/composables/useStepConversation'
import { statusLabels, type OrchestrationStep } from '@/types/orchestration'
import type { Id } from '@/types/domain'
import OrchestrationStepContinuation from './OrchestrationStepContinuation.vue'
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
const props = defineProps<{
  projectId: Id
  conversationId: Id
  step: OrchestrationStep
  executionId?: Id
  canContinue?: boolean
}>()
const emit = defineEmits<{ close: []; continued: [] }>()
const {
  displayMessages,
  approvals,
  loading,
  loaded,
  loadingOlder,
  error,
  decisionError,
  hasMore,
  resolvingId,
  refresh,
  loadOlder,
  decide,
} = useStepConversation(props.projectId, props.conversationId)
function continued() {
  emit('continued')
  void refresh()
}
</script>
<style src="../../assets/styles/conversation.scss" lang="scss"></style>
