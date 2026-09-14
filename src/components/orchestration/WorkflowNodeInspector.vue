<template>
  <aside class="min-w-0 space-y-4 rounded-xl border bg-card p-4" aria-label="节点配置">
    <div class="flex items-center justify-between gap-2">
      <h2 class="font-semibold">节点配置</h2>
      <AppButton v-if="node.kind !== 'START'" size="small" tone="danger" @click="emit('remove')"
        >删除节点</AppButton
      >
    </div>
    <p class="break-all text-xs text-muted-foreground">节点 ID：{{ node.id }}</p>
    <FormField label="节点名称"
      ><AppInput
        :model-value="node.name"
        label="节点名称"
        maxlength="80"
        @update:model-value="patch({ name: $event })"
    /></FormField>
    <p v-if="node.kind === 'START'" class="text-sm text-muted-foreground">
      每个工作流默认一个开始节点，不可删除。连接“下一步”出口设置流程入口；此节点不执行
      Expert，也不生成会话。
    </p>
    <template v-if="node.kind === 'EXPERT'">
      <AppButton v-if="projectId" @click="dataOpen = true">配置输入 / 输出 / 文件</AppButton>
      <p
        v-if="
          node.inputs?.length ||
          node.outputSchema ||
          node.inputFiles?.length ||
          node.outputFiles?.length
        "
        class="text-xs text-muted-foreground"
      >
        {{ node.inputs?.length ?? 0 }} 个输入字段 ·
        {{ node.outputSchema ? 'JSON 输出校验' : '文本输出' }} ·
        {{ (node.inputFiles?.length ?? 0) + (node.outputFiles?.length ?? 0) }} 个文件引用
      </p>
      <FormField label="执行 Expert">
        <select
          :value="node.expertId ?? ''"
          aria-label="执行 Expert"
          class="w-full rounded border bg-background p-2 text-sm"
          @change="patch({ expertId: value($event) || null })"
        >
          <option value="" disabled>请选择项目专家</option>
          <option
            v-for="expert in experts"
            :key="expert.expertId"
            :value="expert.expertId"
            :disabled="!expert.available"
          >
            {{ expert.name }} · v{{ expert.versionNo }}{{ expert.available ? '' : '（不可用）' }}
          </option>
        </select>
      </FormField>
      <FormField label="职责与目标（实际发送内容）"
        ><AppInput
          :key="node.id"
          ref="objectiveInput"
          :model-value="node.objective"
          type="textarea"
          label="职责与目标"
          :rows="8"
          maxlength="12000"
          placeholder="填写此节点需要执行的任务"
          @update:model-value="patch({ objective: $event })"
      /></FormField>
      <p class="text-xs text-muted-foreground">
        仅发送这里的内容，不附加预置提示词。需要工作流目标或上游结果时，请主动插入变量。
      </p>
      <div class="flex flex-wrap gap-2">
        <AppButton size="small" @click="insert('{{goal}}')">插入工作流目标</AppButton>
        <AppButton
          v-for="source in upstream"
          :key="source.id"
          size="small"
          @click="insert(`{{result:${source.id}}}`)"
          >插入 {{ source.name }} 结果</AppButton
        >
      </div>
      <p v-if="insertionError" role="alert" class="text-sm text-destructive">
        {{ insertionError }}
      </p>
    </template>
    <template v-else-if="node.condition">
      <FormField label="判断来源">
        <select
          :value="node.condition.sourceNodeId"
          aria-label="判断来源"
          class="w-full rounded border bg-background p-2 text-sm"
          @change="condition({ sourceNodeId: value($event) })"
        >
          <option value="" disabled>请选择上游 Expert 结果</option>
          <option v-for="source in upstream" :key="source.id" :value="source.id">
            {{ source.name }}
          </option>
        </select>
      </FormField>
      <FormField label="判断方式">
        <select
          :value="node.condition.operator"
          aria-label="判断方式"
          class="w-full rounded border bg-background p-2 text-sm"
          @change="setOperator"
        >
          <option value="EQUALS">文本等于</option>
          <option value="CONTAINS">文本包含</option>
          <option value="JSON_EQUALS">JSON 字段等于</option>
        </select>
      </FormField>
      <FormField v-if="node.condition.operator === 'JSON_EQUALS'" label="JSON Pointer"
        ><AppInput
          :model-value="node.condition.pointer"
          label="JSON Pointer"
          placeholder="例如 /approved；留空表示整个结果"
          maxlength="500"
          @update:model-value="condition({ pointer: $event })"
      /></FormField>
      <FormField label="条件值"
        ><AppInput
          :model-value="node.condition.value"
          type="textarea"
          label="条件值"
          :placeholder="
            node.condition.operator === 'JSON_EQUALS'
              ? '例如 true、42 或带双引号的字符串'
              : '填写精确文本（区分大小写）'
          "
          maxlength="4000"
          @update:model-value="condition({ value: $event })"
      /></FormField>
      <p class="text-xs text-muted-foreground">
        判断来源必须在所有到达路径上都已完成。JSON 字段缺失或格式无效会停止流程。若需 JSON
        输出，请自行在来源节点职责中说明。
      </p>
    </template>
    <p v-if="node.kind === 'BRANCH'" class="text-xs text-muted-foreground">
      条件节点需连接两个不同的出口。可以连接“结束”节点直接结束路径。
    </p>
    <WorkflowDataDialog
      v-if="dataOpen && projectId"
      :key="node.id"
      :node="node"
      :upstream="upstream"
      :project-id="projectId"
      @apply="applyData"
      @close="dataOpen = false"
    />
  </aside>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Id } from '@/types/domain'
import WorkflowDataDialog from './WorkflowDataDialog.vue'
import type { Workflow, WorkflowNode, WorkflowCondition } from '@/types/orchestration'
import type { ProjectExpert } from '@/types/expert'
import { upstreamExperts } from '@/utils/workflow'
import FormField from '@/components/common/FormField.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
const props = defineProps<{
  node: WorkflowNode
  workflow: Workflow
  experts: ProjectExpert[]
  projectId?: Id
}>()
const emit = defineEmits<{ change: [node: WorkflowNode]; remove: [] }>()
const upstream = computed(() => upstreamExperts(props.workflow, props.node.id))
const dataOpen = ref(false)
const objectiveInput = ref<InstanceType<typeof AppInput> | null>(null)
const insertionError = ref('')
watch(
  () => props.node.id,
  () => {
    insertionError.value = ''
  },
)
function applyData(node: WorkflowNode) {
  emit('change', node)
  dataOpen.value = false
}
function value(event: Event) {
  return (event.target as HTMLSelectElement).value
}
function patch(change: Partial<WorkflowNode>) {
  emit('change', { ...props.node, ...change })
}
function condition(change: Partial<WorkflowCondition>) {
  if (props.node.condition) patch({ condition: { ...props.node.condition, ...change } })
}
function setOperator(event: Event) {
  const operator = value(event)
  if (operator === 'EQUALS' || operator === 'CONTAINS' || operator === 'JSON_EQUALS')
    condition({ operator })
}
function insert(text: string) {
  insertionError.value = objectiveInput.value?.insertAtCursor(text)
    ? ''
    : '职责最多为 12000 字符，请缩短内容后再插入。'
}
</script>
