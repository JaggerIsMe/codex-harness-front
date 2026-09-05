<template>
  <AppDialog :model-value="modelValue" title="发布专家新版本" @close="close">
    <p>将「{{ expert?.name }}」的当前草稿发布为不可变版本。项目升级后，新会话使用新版本。</p>
    <label class="mt-4 flex items-start gap-3 rounded-lg border p-4">
      <input
        v-model="compatibleUpgrade"
        type="checkbox"
        class="mt-1"
        :disabled="busy || !expert?.publishedVersionId"
      />
      <span>
        <strong class="block">兼容升级</strong>
        <span class="mt-1 block text-sm text-muted-foreground">
          该版本与上一版本兼容。项目升级到此版本时，兼容链完整的既有会话会保留原 Codex
          Thread，并从下一轮开始使用新提示词和 Skills。
        </span>
      </span>
    </label>
    <p v-if="!expert?.publishedVersionId" class="mt-2 text-sm text-muted-foreground">
      首次发布没有上一版本，系统会按非兼容版本记录。
    </p>
    <p class="mt-3 text-sm text-muted-foreground">
      如果系统提示词、工具语义或工作方式发生破坏性变化，请勿勾选。非兼容版本只影响项目升级后创建的新会话。
    </p>
    <p v-if="error" role="alert" class="mt-3 text-destructive">{{ error }}</p>
    <template #footer>
      <AppButton :disabled="busy" @click="close">取消</AppButton>
      <AppButton tone="primary" :loading="busy" @click="publish">发布</AppButton>
    </template>
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import { publishExpert } from '@/api/expert'
import type { Expert } from '@/types/expert'

const props = defineProps<{ modelValue: boolean; expert: Expert | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; published: [] }>()
const compatibleUpgrade = ref(false)
const busy = ref(false)
const error = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      compatibleUpgrade.value = false
      error.value = ''
    }
  },
)

function close() {
  if (!busy.value) emit('update:modelValue', false)
}

async function publish() {
  if (!props.expert || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await publishExpert(props.expert.id, props.expert.revision, compatibleUpgrade.value)
    emit('published')
    emit('update:modelValue', false)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '发布失败'
  } finally {
    busy.value = false
  }
}
</script>
