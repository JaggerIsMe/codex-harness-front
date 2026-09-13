<template>
  <section class="space-y-3" :aria-label="output ? '输出文件引用配置' : '输入文件引用配置'">
    <div class="flex items-center justify-between">
      <h3 class="font-medium">{{ output ? '输出文件' : '输入文件' }}</h3>
      <AppButton :disabled="modelValue.length >= 20" @click="add">{{
        output ? '添加输出文件' : '添加输入文件'
      }}</AppButton>
    </div>
    <p class="text-sm text-muted-foreground">
      {{
        output
          ? '声明期望的输出路径，再在职责中明确要求生成。声明不等于文件已生成或校验通过。'
          : '选择工作区文件或引用必经上游声明的输出文件。传入的是相对路径，不会自动读取内容或绑定其他会话附件。'
      }}
    </p>
    <fieldset v-for="(file, index) in modelValue" :key="index" class="space-y-3 rounded border p-3">
      <FormField label="文件别名"
        ><AppInput
          :label="`${output ? '输出' : '输入'}文件别名 ${index + 1}`"
          :model-value="file.name"
          maxlength="64"
          @update:model-value="patch(index, { name: $event })"
      /></FormField>
      <select
        v-if="!output"
        class="w-full rounded border bg-background p-2"
        :aria-label="`文件来源 ${index + 1}`"
        :value="file.sourceNodeId != null ? 'UPSTREAM' : 'WORKSPACE'"
        @change="
          patch(index, {
            path: '',
            sourceNodeId: value($event) === 'UPSTREAM' ? '' : null,
            sourceFile: null,
          })
        "
      >
        <option value="WORKSPACE">项目工作区路径</option>
        <option value="UPSTREAM">上游输出文件</option>
      </select>
      <template v-if="!output && file.sourceNodeId != null">
        <select
          class="w-full rounded border bg-background p-2"
          :aria-label="`文件上游 ${index + 1}`"
          :value="file.sourceNodeId"
          @change="patch(index, { sourceNodeId: value($event), sourceFile: '' })"
        >
          <option value="" disabled>选择必经上游 Expert</option>
          <option v-for="node in upstream" :key="node.id" :value="node.id">{{ node.name }}</option>
        </select>
        <select
          class="w-full rounded border bg-background p-2"
          :aria-label="`上游输出文件 ${index + 1}`"
          :value="file.sourceFile ?? ''"
          @change="patch(index, { sourceFile: value($event) })"
        >
          <option value="" disabled>选择输出文件别名</option>
          <option
            v-for="item in upstream.find((n) => n.id === file.sourceNodeId)?.outputFiles ?? []"
            :key="item.name"
            :value="item.name"
          >
            {{ item.name }} · {{ item.path }}
          </option>
        </select>
      </template>
      <div v-else class="flex gap-2">
        <AppInput
          :label="`${output ? '输出' : '输入'}文件路径 ${index + 1}`"
          :model-value="file.path ?? ''"
          maxlength="2048"
          placeholder="例如 docs/report.md"
          @update:model-value="patch(index, { path: $event })"
        /><AppButton v-if="!output" @click="picking = index">选择文件</AppButton>
      </div>
      <div class="flex gap-2">
        <AppButton @click="emit('insert', `{{${output ? 'outputFile' : 'file'}:${file.name}}}`)"
          >插入文件路径</AppButton
        ><AppButton
          @click="
            emit(
              'update:modelValue',
              modelValue.filter((_, i) => i !== index),
            )
          "
          >移除引用</AppButton
        >
      </div>
    </fieldset>
    <WorkflowFilePicker
      v-if="picking !== null"
      :project-id="projectId"
      @select="picked"
      @close="picking = null"
    />
  </section>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import type { Id } from '@/types/domain'
import type { WorkflowFileReference, WorkflowNode } from '@/types/orchestration'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import FormField from '@/components/common/FormField.vue'
import WorkflowFilePicker from './WorkflowFilePicker.vue'
const props = defineProps<{
  modelValue: WorkflowFileReference[]
  upstream: WorkflowNode[]
  projectId: Id
  output?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [WorkflowFileReference[]]; insert: [string] }>()
const picking = ref<number | null>(null),
  value = (event: Event) => (event.target as HTMLSelectElement).value
function patch(index: number, change: Partial<WorkflowFileReference>) {
  emit(
    'update:modelValue',
    props.modelValue.map((f, i) => (i === index ? { ...f, ...change } : f)),
  )
}
function add() {
  emit('update:modelValue', [
    ...props.modelValue,
    { name: `file${props.modelValue.length + 1}`, path: '' },
  ])
}
function picked(path: string) {
  if (picking.value !== null) patch(picking.value, { path, sourceNodeId: null, sourceFile: null })
  picking.value = null
}
</script>
