<template>
  <section class="space-y-3" aria-label="输出 Schema 配置">
    <p class="text-sm text-muted-foreground">
      启用后，最终回复必须是符合 Schema 的严格
      JSON。不满足则该步骤失败并停止后续执行。请自行在职责中约定输出格式。
    </p>
    <label class="flex items-center gap-2"
      ><input
        type="checkbox"
        :checked="Boolean(modelValue)"
        @change="toggle(($event.target as HTMLInputElement).checked)"
      />启用输出 Schema 校验</label
    >
    <template v-if="modelValue">
      <div class="flex gap-2">
        <AppButton :aria-pressed="!raw" @click="raw = false">可视化字段</AppButton
        ><AppButton :aria-pressed="raw" @click="raw = true">JSON 编辑</AppButton
        ><AppButton @click="emit('insert', '{{outputSchema}}')">插入输出 Schema</AppButton>
      </div>
      <AppInput
        v-if="raw"
        v-model="text"
        label="输出 Schema JSON"
        type="textarea"
        :rows="14"
        maxlength="16000"
        @update:model-value="parse"
      />
      <WorkflowSchemaNode
        v-else
        :model-value="modelValue"
        label="输出"
        :depth="0"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <p class="text-xs text-muted-foreground">
        支持
        type、properties、required、additionalProperties（布尔值）、items、enum（标量）、description；最多
        8 层、128 项，不支持 $ref 或远程 Schema。
      </p>
    </template>
  </section>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { WorkflowOutputSchema } from '@/types/orchestration'
import { schemaError, defaultOutputSchema } from '@/utils/workflowData'
import WorkflowSchemaNode from './WorkflowSchemaNode.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
const props = defineProps<{ modelValue: WorkflowOutputSchema | null }>()
const emit = defineEmits<{
  'update:modelValue': [WorkflowOutputSchema | null]
  insert: [string]
  valid: [boolean]
}>()
const raw = ref(false),
  text = ref(''),
  error = ref('')
watch(
  () => props.modelValue,
  (schema) => {
    if (!error.value) text.value = JSON.stringify(schema, null, 2)
  },
  { immediate: true, deep: true },
)
function parse(value: string) {
  try {
    const schema: unknown = JSON.parse(value)
    if (schema === null) throw new Error('启用时 Schema 不能为 null')
    const issue = schemaError(schema)
    if (issue) throw new Error(issue)
    error.value = ''
    emit('update:modelValue', schema as WorkflowOutputSchema)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Schema 无效'
  }
  emit('valid', !error.value)
}
function toggle(on: boolean) {
  error.value = ''
  emit('valid', true)
  emit('update:modelValue', on ? defaultOutputSchema() : null)
}
</script>
