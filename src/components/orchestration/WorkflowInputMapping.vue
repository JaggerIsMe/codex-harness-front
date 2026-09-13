<template>
  <section class="space-y-3" aria-label="输入字段映射配置">
    <p class="text-sm text-muted-foreground">
      定义字段来源，再插入职责。映射不自动追加到消息；JSON 字段保留原类型，固定值按文本传入。
    </p>
    <div class="flex gap-2">
      <AppButton @click="add">添加输入字段</AppButton
      ><AppButton @click="emit('insert', '{{inputs}}')">插入全部输入</AppButton>
    </div>
    <fieldset
      v-for="(input, index) in modelValue"
      :key="index"
      class="space-y-3 rounded-lg border p-3"
    >
      <legend class="px-1 text-sm">输入 {{ index + 1 }}</legend>
      <div class="grid gap-3 sm:grid-cols-2">
        <FormField label="字段名"
          ><AppInput
            :label="`输入字段名 ${index + 1}`"
            :model-value="input.name"
            @update:model-value="patch(index, { name: $event })"
            maxlength="64"
        /></FormField>
        <FormField label="来源"
          ><select
            class="w-full rounded border bg-background p-2"
            :aria-label="`输入来源 ${index + 1}`"
            :value="input.source"
            @change="source(index, $event)"
          >
            <option value="GOAL">工作流目标</option>
            <option value="CONSTANT">固定文本</option>
            <option value="RESULT_TEXT">上游完整结果</option>
            <option value="RESULT_JSON">上游 JSON 字段</option>
            <option value="FILE">输入文件路径</option>
          </select></FormField
        >
      </div>
      <AppInput
        v-if="input.source === 'CONSTANT'"
        :label="`固定输入 ${index + 1}`"
        type="textarea"
        :model-value="input.value ?? ''"
        maxlength="12000"
        @update:model-value="patch(index, { value: $event })"
      />
      <select
        v-if="input.source === 'RESULT_TEXT' || input.source === 'RESULT_JSON'"
        class="w-full rounded border bg-background p-2"
        :aria-label="`输入上游 ${index + 1}`"
        :value="input.sourceNodeId ?? ''"
        @change="patch(index, { sourceNodeId: value($event) })"
      >
        <option value="" disabled>选择必经上游 Expert</option>
        <option v-for="node in upstream" :key="node.id" :value="node.id">{{ node.name }}</option>
      </select>
      <template v-if="input.source === 'RESULT_JSON'">
        <AppInput
          :label="`输入 JSON Pointer ${index + 1}`"
          :model-value="input.pointer ?? ''"
          placeholder="/summary（留空引用整个 JSON）"
          maxlength="500"
          @update:model-value="patch(index, { pointer: $event })"
        />
        <label class="flex items-center gap-2 text-sm"
          ><input
            type="checkbox"
            :checked="input.required"
            @change="patch(index, { required: ($event.target as HTMLInputElement).checked })"
          />字段必须存在（不勾选时缺失映射为 null；JSON 无效仍失败）</label
        >
      </template>
      <select
        v-if="input.source === 'FILE'"
        class="w-full rounded border bg-background p-2"
        :aria-label="`输入文件别名 ${index + 1}`"
        :value="input.fileName ?? ''"
        @change="patch(index, { fileName: value($event) })"
      >
        <option value="" disabled>先在文件引用中配置输入文件</option>
        <option v-for="file in files" :key="file.name" :value="file.name">{{ file.name }}</option>
      </select>
      <div class="flex gap-2">
        <AppButton @click="emit('insert', `{{input:${input.name}}}`)">插入此字段</AppButton
        ><AppButton
          @click="
            emit(
              'update:modelValue',
              modelValue.filter((_, i) => i !== index),
            )
          "
          >移除字段</AppButton
        >
      </div>
    </fieldset>
    <p v-if="!modelValue.length" class="text-sm text-muted-foreground">
      尚未配置字段，可继续使用原有的目标和结果变量。
    </p>
  </section>
</template>
<script setup lang="ts">
import type { WorkflowInput, WorkflowNode, WorkflowFileReference } from '@/types/orchestration'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import FormField from '@/components/common/FormField.vue'
const props = defineProps<{
  modelValue: WorkflowInput[]
  upstream: WorkflowNode[]
  files: WorkflowFileReference[]
}>()
const emit = defineEmits<{ 'update:modelValue': [WorkflowInput[]]; insert: [string] }>()
const value = (event: Event) => (event.target as HTMLSelectElement).value
function patch(index: number, change: Partial<WorkflowInput>) {
  emit(
    'update:modelValue',
    props.modelValue.map((v, i) => (i === index ? { ...v, ...change } : v)),
  )
}
function add() {
  if (props.modelValue.length < 40)
    emit('update:modelValue', [
      ...props.modelValue,
      { name: `input${props.modelValue.length + 1}`, source: 'GOAL', required: true },
    ])
}
function source(index: number, event: Event) {
  emit(
    'update:modelValue',
    props.modelValue.map((v, i) =>
      i === index
        ? {
            name: v.name,
            source: value(event) as WorkflowInput['source'],
            value: '',
            pointer: '',
            sourceNodeId: '',
            fileName: '',
            required: true,
          }
        : v,
    ),
  )
}
</script>
