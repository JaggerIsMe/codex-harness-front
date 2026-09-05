<template>
  <div class="space-y-2" @dragover.prevent @drop.stop.prevent="drop" @paste.stop="paste">
    <div class="flex flex-wrap items-center gap-2 text-sm">
      <AppButton :disabled="disabled || loading || !limits?.agentSupported" @click="picker?.click()"
        >添加附件</AppButton
      >
      <input
        ref="picker"
        type="file"
        multiple
        class="hidden"
        aria-label="选择会话附件"
        @change="choose"
      />
      <span v-if="loading" role="status">正在恢复附件…</span>
      <span v-else-if="limits && !limits.agentSupported">升级 Agent 后可发送附件</span>
      <span v-else-if="limits" class="text-muted-foreground"
        >可拖拽或粘贴文件 · 最多 {{ limits.maxFiles }} 个 · 单个
        {{ Math.round(limits.maxFileBytes / 1048576) }} MB</span
      >
    </div>
    <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    <AppButton v-if="!limits && !loading" :disabled="disabled" @click="emit('reload')"
      >重新加载附件</AppButton
    >
    <ul class="flex flex-wrap gap-2">
      <li
        v-for="row in rows"
        :key="row.key"
        class="flex min-w-0 max-w-full items-center gap-2 rounded-md border px-3 py-2 text-sm"
      >
        <div class="min-w-0">
          <p class="truncate" :title="row.name">
            {{ row.name }} · {{ (row.size / 1024).toFixed(1) }} KB
          </p>
          <span v-if="row.status === 'uploading'" role="status">上传中 {{ row.progress }}%</span>
          <span v-else-if="row.status === 'removing'">移除中…</span>
          <span v-else-if="row.status === 'ready'" class="text-muted-foreground"
            >已上传，发送时传输到 Agent</span
          >
          <span v-else role="alert" class="text-destructive">{{ row.error }}</span>
        </div>
        <AppButton v-if="row.status === 'error'" :disabled="disabled" @click="emit('retry', row)"
          >重试</AppButton
        >
        <AppButton
          :disabled="disabled || row.status === 'removing'"
          :aria-label="`移除 ${row.name}`"
          @click="emit('remove', row)"
          >移除</AppButton
        >
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppButton from '@/components/common/AppButton.vue'
import type { AttachmentDraft } from '@/composables/useConversationAttachments'
import type { AttachmentLimits } from '@/types/domain'
const props = defineProps<{
  rows: AttachmentDraft[]
  limits: AttachmentLimits | null
  loading: boolean
  disabled: boolean
  error: string
}>()
const emit = defineEmits<{
  add: [files: File[]]
  retry: [row: AttachmentDraft]
  remove: [row: AttachmentDraft]
  reload: []
}>()
const picker = ref<HTMLInputElement | null>(null)
function add(files: FileList | null) {
  if (!props.disabled && files) emit('add', Array.from(files))
}
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  add(input.files)
  input.value = ''
}
function drop(event: DragEvent) {
  add(event.dataTransfer?.files || null)
}
function paste(event: ClipboardEvent) {
  if (event.clipboardData?.files.length) {
    event.preventDefault()
    add(event.clipboardData.files)
  }
}
</script>
