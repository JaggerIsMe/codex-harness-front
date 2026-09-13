<template>
  <AppDialog :model-value="true" title="节点输入输出配置" width="920px" @close="emit('close')">
    <div class="space-y-4">
      <p class="text-sm">{{ node.name }} · 配置字段、输出结构和文件引用，应用后保存到工作流。</p>
      <div class="flex flex-wrap gap-2" aria-label="输入输出配置区">
        <AppButton
          v-for="item in tabs"
          :key="item.key"
          :aria-pressed="tab === item.key"
          @click="tab = item.key"
          >{{ item.label }}</AppButton
        >
      </div>
      <WorkflowInputMapping
        v-show="tab === 'inputs'"
        :model-value="draft.inputs ?? []"
        :upstream="upstream"
        :files="draft.inputFiles ?? []"
        @update:model-value="draft.inputs = $event"
        @insert="insert"
      />
      <WorkflowOutputSchemaEditor
        v-show="tab === 'schema'"
        :model-value="draft.outputSchema ?? null"
        @update:model-value="draft.outputSchema = $event"
        @insert="insert"
        @valid="schemaValid = $event"
      />
      <div v-show="tab === 'files'" class="space-y-6">
        <WorkflowFileReferences
          :model-value="draft.inputFiles ?? []"
          :upstream="upstream"
          :project-id="projectId"
          @update:model-value="draft.inputFiles = $event"
          @insert="insert"
        /><WorkflowFileReferences
          :model-value="draft.outputFiles ?? []"
          :upstream="upstream"
          :project-id="projectId"
          output
          @update:model-value="draft.outputFiles = $event"
          @insert="insert"
        />
      </div>
      <FormField label="职责与目标（变量展开前）"
        ><AppInput
          v-model="draft.objective"
          label="配置中的职责与目标"
          type="textarea"
          :rows="6"
          maxlength="12000"
      /></FormField>
      <p v-if="notice" role="status" class="text-sm text-muted-foreground">{{ notice }}</p>
      <p v-if="errors.length" role="alert" class="whitespace-pre-line text-sm text-destructive">
        {{ errors.join('\n') }}
      </p>
    </div>
    <template #footer
      ><AppButton @click="emit('close')">取消</AppButton
      ><AppButton tone="primary" :disabled="!schemaValid" @click="apply"
        >应用输入输出配置</AppButton
      ></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import type { Id } from '@/types/domain'
import type { WorkflowNode } from '@/types/orchestration'
import { validateNodeData } from '@/utils/workflowData'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import FormField from '@/components/common/FormField.vue'
import WorkflowInputMapping from './WorkflowInputMapping.vue'
import WorkflowOutputSchemaEditor from './WorkflowOutputSchemaEditor.vue'
import WorkflowFileReferences from './WorkflowFileReferences.vue'
const props = defineProps<{ node: WorkflowNode; upstream: WorkflowNode[]; projectId: Id }>()
const emit = defineEmits<{ apply: [WorkflowNode]; close: [] }>()
const draft = ref<WorkflowNode>(JSON.parse(JSON.stringify(props.node))),
  tab = ref('inputs'),
  errors = ref<string[]>([]),
  notice = ref(''),
  schemaValid = ref(true)
const tabs = [
  { key: 'inputs', label: '输入字段映射' },
  { key: 'schema', label: '输出 Schema' },
  { key: 'files', label: '输入输出文件' },
]
function insert(variable: string) {
  draft.value.objective += `\n${variable}`
  notice.value = `已将 ${variable} 插入职责末尾，请调整位置和说明文字。`
}
function apply() {
  errors.value = validateNodeData(draft.value, props.upstream)
  if (!draft.value.objective.trim() || draft.value.objective.length > 12000)
    errors.value.push('职责需为 1–12000 字符')
  if (!errors.value.length && schemaValid.value)
    emit('apply', { ...draft.value, inputs: draft.value.inputs ?? [] })
}
</script>
