<template>
  <section class="space-y-5 rounded-lg border bg-card p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold">{{ execution.title }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ executionStatusLabel }} · #{{ execution.id }}
        </p>
      </div>
      <AppButton v-if="canCancel" :loading="canceling" @click="cancel">停止编排</AppButton>
      <AppButton
        v-if="execution.status === 'NEEDS_ATTENTION' && auth.can('turn:interrupt')"
        :loading="canceling"
        @click="acknowledge"
        >已核实停止，结束记录</AppButton
      >
    </div>
    <p class="whitespace-pre-wrap break-words">{{ execution.goal }}</p>
    <RouterLink
      v-if="execution.workflow && auth.can('conversation:create') && auth.can('turn:start')"
      :to="{
        name: 'project-workflow-editor',
        params: { projectId: execution.projectId },
        query: { copy: execution.id },
      }"
      :class="buttonVariants({ variant: 'outline' })"
      >复制到画布</RouterLink
    >
    <WorkflowCanvas
      v-if="displayWorkflow"
      :model-value="displayWorkflow"
      readonly
      :statuses="stepStatuses"
    />
    <p v-if="execution.failureMessage" role="alert" class="rounded bg-muted p-3 text-sm">
      {{ execution.failureMessage }}
    </p>
    <p v-if="execution.status === 'NEEDS_ATTENTION'" class="text-sm text-muted-foreground">
      未确认的执行不会自动重试。请进入步骤会话核实结果，必要时停止编排；文件修改不会自动回滚。
    </p>
    <ol class="space-y-3">
      <li v-for="step in execution.steps" :key="step.id" class="space-y-2 rounded border p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <strong
            >{{ step.name }}
            <span class="font-normal text-muted-foreground"
              >· {{ statusLabels[step.status] }}</span
            ></strong
          >
          <AppButton v-if="step.conversationId" link @click="selectedStepId = step.id">
            {{
              step.status === 'WAITING_APPROVAL'
                ? '处理审批 / 回答问题'
                : execution.status === 'RUNNING' && step.status === 'WAITING_USER'
                  ? '回答节点问题'
                  : execution.status === 'RUNNING' && step.status === 'VALIDATION_FAILED'
                    ? '查看并修正产出'
                    : '查看步骤会话'
            }}
          </AppButton>
        </div>
        <p class="text-sm text-muted-foreground">{{ step.objective }}</p>
        <p v-if="step.failureMessage" class="text-sm text-destructive">{{ step.failureMessage }}</p>
        <OrchestrationStepRecheck
          v-if="
            step.turnId &&
            auth.can('turn:start') &&
            ['RUNNING', 'NEEDS_ATTENTION'].includes(execution.status) &&
            ['WAITING_USER', 'VALIDATION_FAILED', 'NEEDS_ATTENTION'].includes(step.status)
          "
          :key="String(step.turnId)"
          :project-id="execution.projectId"
          :execution-id="execution.id"
          :step-id="step.id"
          :turn-id="step.turnId"
          @checked="emit('changed')"
        />
        <details v-if="step.result">
          <summary class="cursor-pointer text-sm">
            {{
              step.result.sourceTurnId
                ? `交接结果 · Turn #${step.result.sourceTurnId}`
                : '控制节点结果'
            }}
          </summary>
          <p class="mt-2 whitespace-pre-wrap break-words text-sm">
            {{
              step.result.sourceTurnId
                ? step.result.summary
                : step.result.summary === '流程结束' || step.result.summary === '流程开始'
                  ? step.result.summary
                  : step.result.summary === 'true'
                    ? '满足'
                    : '不满足'
            }}
          </p>
        </details>
        <details v-if="step.result && execution.workflow?.nodes[step.position]?.outputSchema">
          <summary class="cursor-pointer text-sm">已通过 Schema 校验的输出</summary>
          <pre
            class="mt-2 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-3 text-xs"
            >{{ JSON.stringify(step.result.output, null, 2) }}</pre>
        </details>
        <div v-if="step.result?.files?.length" class="space-y-1 text-sm">
          <p class="text-muted-foreground">
            {{
              step.result.schemaVersion >= 3
                ? '已核实本次产出的输出文件（内容哈希与节点开始前不同）'
                : '历史声明的输出文件（尚未核实存在性和内容）'
            }}
          </p>
          <p v-for="file in step.result.files" :key="file.name" class="break-all">
            {{ file.name }}：{{ file.path }}
          </p>
        </div>
      </li>
    </ol>
    <p class="text-xs text-muted-foreground">
      节点明确完成且产出校验通过后才进入下一步。文件检查验证存在性与内容变化，业务准确性请结合交接结果核对。
    </p>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <OrchestrationStepConversationDialog
      v-if="selectedStep?.conversationId"
      :key="`${execution.projectId}:${selectedStep.conversationId}`"
      :project-id="execution.projectId"
      :conversation-id="selectedStep.conversationId"
      :step="selectedStep"
      :execution-id="execution.id"
      :can-continue="execution.status === 'RUNNING'"
      @continued="emit('changed')"
      @close="selectedStepId = null"
    />
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import type { Orchestration } from '@/types/orchestration'
import { statusLabels, terminalStatuses } from '@/types/orchestration'
import { cancelOrchestration, acknowledgeOrchestrationStopped } from '@/api/orchestration'
import { confirmAction } from '@/lib/confirm'
import { useAuthStore } from '@/stores/auth'
import AppButton from '@/components/common/AppButton.vue'
import { buttonVariants } from '@/components/ui/button'
import WorkflowCanvas from './WorkflowCanvas.vue'
import OrchestrationStepConversationDialog from './OrchestrationStepConversationDialog.vue'
import OrchestrationStepRecheck from './OrchestrationStepRecheck.vue'
import type { Id } from '@/types/domain'
import { withStartNode } from '@/utils/workflow'
const props = defineProps<{ execution: Orchestration }>()
const emit = defineEmits<{ changed: [] }>()
const canceling = ref(false),
  error = ref('')
const auth = useAuthStore()
const executionStatusLabel = computed(() => {
  const waiting =
    props.execution.status === 'RUNNING' &&
    props.execution.steps.find((step) =>
      ['WAITING_USER', 'VALIDATION_FAILED', 'WAITING_APPROVAL', 'VALIDATING'].includes(step.status),
    )
  return statusLabels[waiting ? waiting.status : props.execution.status]
})
const displayWorkflow = computed(() =>
  props.execution.workflow ? withStartNode(props.execution.workflow) : null,
)
const selectedStepId = ref<Id | null>(null)
const selectedStep = computed(() =>
  props.execution.steps.find((step) => step.id === selectedStepId.value),
)
watch(
  () => props.execution.id,
  () => {
    selectedStepId.value = null
  },
)
const stepStatuses = computed(() =>
  Object.fromEntries(props.execution.steps.map((s) => [s.position, s.status])),
)
const canCancel = computed(
  () =>
    auth.can('turn:interrupt') &&
    !terminalStatuses.includes(props.execution.status) &&
    props.execution.status !== 'CANCELING',
)
async function acknowledge() {
  if (canceling.value) return
  const execution = props.execution
  canceling.value = true
  try {
    if (
      !(await confirmAction(
        '请先在设备端核实本次编排的执行及子进程已停止。此操作只结束编排记录，不会停止进程、回滚修改或重试。',
        '确认已人工核实停止',
      ))
    )
      return
    await acknowledgeOrchestrationStopped(execution.projectId, execution.id)
    error.value = ''
    emit('changed')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '结束记录失败'
  } finally {
    canceling.value = false
  }
}
async function cancel() {
  if (canceling.value) return
  const execution = props.execution
  canceling.value = true
  try {
    if (
      !(await confirmAction(
        '停止后不再启动后续步骤，并请求设备结束当前执行。已发生的修改不会回滚。',
        '停止编排',
      ))
    )
      return
    await cancelOrchestration(execution.projectId, execution.id)
    error.value = ''
    emit('changed')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '停止失败'
  } finally {
    canceling.value = false
  }
}
</script>
