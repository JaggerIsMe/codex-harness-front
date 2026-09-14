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
        ><AppButton :aria-pressed="raw" @click="raw = true">查看 JSON</AppButton
        ><AppButton @click="emit('insert', '{{outputSchema}}')">插入输出 Schema</AppButton>
      </div>
      <AppInput
        v-if="raw"
        :model-value="text"
        label="输出 Schema JSON"
        type="textarea"
        :rows="14"
        readonly
      />
      <WorkflowSchemaNode
        v-else
        :model-value="modelValue"
        label="输出"
        :depth="0"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <p v-if="raw" class="text-xs text-muted-foreground">
        JSON 仅供查看和复制，请在“可视化字段”中修改。
      </p>
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
import { computed, ref, watch } from 'vue'
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
const raw = ref(false)
const text = computed(() => JSON.stringify(props.modelValue, null, 2))
const error = computed(() => schemaError(props.modelValue))
watch(error, (message) => emit('valid', !message), { immediate: true })
function toggle(on: boolean) {
  emit('update:modelValue', on ? defaultOutputSchema() : null)
}
</script>
