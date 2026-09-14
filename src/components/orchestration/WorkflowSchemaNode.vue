<template>
  <div class="space-y-3">
    <div class="grid gap-2 sm:grid-cols-2">
      <select
        :aria-label="`${label} 类型`"
        class="w-full rounded border bg-background p-2"
        :value="modelValue.type"
        @change="changeType"
      >
        <option
          v-for="type in jsonTypes"
          :key="type"
          :value="type"
          :disabled="depth >= 8 && (type === 'object' || type === 'array')"
        >
          {{ type }}
        </option>
      </select>
      <AppInput
        :label="`${label} 说明`"
        placeholder="字段说明（可选）"
        :model-value="modelValue.description ?? ''"
        maxlength="1000"
        @update:model-value="emit('update:modelValue', { ...modelValue, description: $event })"
      />
    </div>
    <template v-if="modelValue.type === 'object'">
      <label class="flex items-center gap-2 text-sm"
        ><input
          type="checkbox"
          :checked="modelValue.additionalProperties !== false"
          @change="
            emit('update:modelValue', {
              ...modelValue,
              additionalProperties: ($event.target as HTMLInputElement).checked,
            })
          "
        />允许额外字段</label
      >
      <div
        v-for="[name, child] in Object.entries(modelValue.properties ?? {})"
        :key="name"
        class="space-y-2 rounded border p-3"
      >
        <div class="flex flex-wrap items-center gap-3">
          <strong class="break-all text-sm">{{ name }}</strong>
          <label class="flex items-center gap-1 text-sm"
            ><input
              type="checkbox"
              :aria-label="`${label}/${name} 必填`"
              :checked="modelValue.required?.includes(name)"
              @change="required(name, ($event.target as HTMLInputElement).checked)"
            />必填</label
          >
          <AppButton size="small" :aria-label="`移除输出字段 ${name}`" @click="remove(name)"
            >移除</AppButton
          >
        </div>
        <WorkflowSchemaNode
          :model-value="child"
          :label="`${label}/${name}`"
          :depth="depth + 1"
          @update:model-value="setProperty(name, $event)"
        />
      </div>
      <div v-if="depth < 8" class="flex gap-2">
        <AppInput
          v-model="newName"
          :label="`${label} 新字段名`"
          placeholder="新字段名"
          maxlength="100"
          @keydown.enter.prevent="add"
        /><AppButton @click="add">添加字段</AppButton>
      </div>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    </template>
    <div
      v-if="modelValue.type === 'array' && modelValue.items"
      class="space-y-2 rounded border p-3"
    >
      <p class="text-sm">数组元素</p>
      <WorkflowSchemaNode
        :model-value="modelValue.items"
        :label="`${label}/items`"
        :depth="depth + 1"
        @update:model-value="emit('update:modelValue', { ...modelValue, items: $event })"
      />
    </div>
    <p v-if="modelValue.enum" class="break-all text-xs text-muted-foreground">
      允许值：{{ JSON.stringify(modelValue.enum) }}
    </p>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import type { WorkflowOutputSchema, JsonType } from '@/types/orchestration'
import { jsonTypes } from '@/utils/workflowData'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
const props = defineProps<{ modelValue: WorkflowOutputSchema; label: string; depth: number }>()
const emit = defineEmits<{ 'update:modelValue': [WorkflowOutputSchema] }>()
const newName = ref(''),
  error = ref('')
function changeType(event: Event) {
  const type = (event.target as HTMLSelectElement).value as JsonType
  emit('update:modelValue', {
    type,
    ...(type === 'object'
      ? { properties: {}, required: [], additionalProperties: false }
      : type === 'array'
        ? { items: { type: 'string' as const } }
        : {}),
  })
}
function setProperty(name: string, child: WorkflowOutputSchema) {
  emit('update:modelValue', {
    ...props.modelValue,
    properties: { ...props.modelValue.properties, [name]: child },
  })
}
function required(name: string, on: boolean) {
  const keys = (props.modelValue.required ?? []).filter((k) => k !== name)
  emit('update:modelValue', { ...props.modelValue, required: on ? [...keys, name] : keys })
}
function add() {
  const name = newName.value
  if (!name || Object.hasOwn(props.modelValue.properties ?? {}, name)) {
    error.value = '字段名不能为空或重复'
    return
  }
  setProperty(name, { type: 'string' })
  newName.value = ''
  error.value = ''
}
function remove(name: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    properties: Object.fromEntries(
      Object.entries(props.modelValue.properties ?? {}).filter(([key]) => key !== name),
    ),
    required: props.modelValue.required?.filter((k) => k !== name),
  })
}
</script>
