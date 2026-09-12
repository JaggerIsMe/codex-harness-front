<template>
  <fieldset class="min-w-0 rounded-lg border p-4">
    <legend class="px-2 font-medium">{{ title }}</legend>
    <div class="mb-3 flex items-center justify-between gap-3">
      <span class="text-sm text-muted-foreground">已绑定 {{ modelValue.length }} 项</span>
      <AppButton :disabled="disabled || loading" @click="openPicker">添加 {{ kind }}</AppButton>
    </div>
    <p v-if="loading" role="status" class="text-sm text-muted-foreground">正在加载 {{ kind }}…</p>
    <p v-else-if="!modelValue.length" class="text-sm text-muted-foreground">
      尚未绑定 {{ kind }}，可点击添加。
    </p>
    <ul v-else :aria-label="`已绑定的 ${kind}`" class="space-y-2">
      <li
        v-for="option in boundOptions"
        :key="option.id"
        class="flex min-w-0 items-center justify-between gap-3 rounded border px-3 py-2"
      >
        <span
          class="min-w-0 break-words text-sm"
          :class="option.unavailable ? 'text-destructive' : ''"
          >{{ option.label }}</span
        >
        <AppButton
          link
          :disabled="disabled"
          :aria-label="`移除 ${option.label}`"
          @click="remove(option.id)"
          >移除</AppButton
        >
      </li>
    </ul>
  </fieldset>
  <AppDialog
    v-if="pickerOpen"
    :model-value="pickerOpen"
    :title="`添加 ${kind}`"
    width="640px"
    @close="pickerOpen = false"
  >
    <div class="flex gap-2">
      <AppInput
        v-model="keyword"
        :label="`搜索 ${kind}`"
        :placeholder="kind === 'Skills' ? '搜索 Skills 名称、版本或标签' : '搜索 MCP 名称或版本'"
        @keyup.enter.prevent="search"
      />
      <AppButton @click="search">搜索</AppButton>
    </div>
    <p class="text-sm text-muted-foreground">
      已选 {{ pendingIds.length }} 项，确认后加入专家草稿。
    </p>
    <div class="max-h-72 space-y-2 overflow-y-auto" :aria-label="`可添加的 ${kind}`">
      <label
        v-for="option in candidates"
        :key="option.id"
        class="flex items-start gap-2 rounded border p-3 text-sm"
      >
        <input v-model="pendingIds" type="checkbox" :value="option.id" class="mt-1" />
        <span class="min-w-0 break-words"
          >{{ option.label
          }}<span v-if="option.tag" class="mt-1 block text-xs text-muted-foreground"
            >标签：{{ option.tag }}</span
          ></span
        >
      </label>
      <p v-if="!candidates.length" class="py-4 text-sm text-muted-foreground">
        {{ appliedKeyword ? '没有匹配的可添加项' : '暂无可添加项，可用配置已全部绑定或尚未创建' }}
      </p>
    </div>
    <template #footer>
      <AppButton @click="pickerOpen = false">取消</AppButton>
      <AppButton
        tone="primary"
        :disabled="!pendingIds.length || disabled || loading"
        @click="confirm"
        >确认添加</AppButton
      >
    </template>
  </AppDialog>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import AppButton from '@/components/common/AppButton.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import type { ExpertBindingOption } from '@/types/expert'

const props = defineProps<{
  modelValue: number[]
  title: string
  kind: 'Skills' | 'MCP'
  options: ExpertBindingOption[]
  loading?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number[]] }>()
const pickerOpen = ref(false)
const pendingIds = ref<number[]>([])
const keyword = ref(''),
  appliedKeyword = ref('')
const boundOptions = computed(() =>
  props.modelValue.map(
    (id) =>
      props.options.find((option) => option.id === id) ?? {
        id,
        label: `不可用 ${props.kind} 版本 #${id}`,
        unavailable: true,
      },
  ),
)
const candidates = computed(() =>
  props.options.filter(
    (option) =>
      !option.unavailable &&
      !props.modelValue.includes(option.id) &&
      `${option.label} ${option.tag || ''}`.toLowerCase().includes(appliedKeyword.value),
  ),
)
function openPicker() {
  pendingIds.value = []
  keyword.value = appliedKeyword.value = ''
  pickerOpen.value = true
}
function search() {
  appliedKeyword.value = keyword.value.trim().toLowerCase()
}
function remove(id: number) {
  emit(
    'update:modelValue',
    props.modelValue.filter((value) => value !== id),
  )
}
function confirm() {
  const available = new Set(
    props.options.filter((option) => !option.unavailable).map((option) => option.id),
  )
  emit('update:modelValue', [
    ...new Set([...props.modelValue, ...pendingIds.value.filter((id) => available.has(id))]),
  ])
  pickerOpen.value = false
}
</script>
