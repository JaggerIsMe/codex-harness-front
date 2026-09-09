<template>
  <div class="attachment-queue" @dragover.prevent @drop.stop.prevent="drop" @paste.stop="paste">
    <input
      ref="picker"
      type="file"
      multiple
      class="hidden"
      aria-label="选择会话附件"
      @change="choose"
    />
    <ul v-if="rows.length" class="attachment-queue__files" aria-label="待发送附件">
      <li v-for="row in rows" :key="row.key" class="attachment-queue__file">
        <div class="attachment-queue__header">
          <AppButton
            v-if="row.status === 'error'"
            circle
            link
            class="composer__icon attachment-queue__action"
            :icon="RefreshCw"
            :disabled="disabled"
            :label="`${row.attachment ? '检查状态' : '重试上传'} ${row.name}`"
            :title="`${row.attachment ? '检查状态' : '重试上传'} ${row.name}`"
            @click="emit('retry', row)"
          />
          <FileText v-else class="size-4 text-muted-foreground" aria-hidden="true" />
          <AppButton
            circle
            link
            class="composer__icon attachment-queue__action"
            :icon="X"
            :disabled="disabled || row.status === 'removing'"
            :label="`移除 ${row.name}`"
            :title="`移除 ${row.name}`"
            @click="emit('remove', row)"
          />
        </div>
        <div class="attachment-queue__details">
          <p class="truncate font-medium" :title="row.name">{{ row.name }}</p>
          <p class="truncate text-muted-foreground">{{ (row.size / 1024).toFixed(1) }} KB</p>
          <p
            class="truncate"
            :class="row.status === 'error' ? 'text-destructive' : 'text-muted-foreground'"
            :title="statusText(row)"
            :role="
              row.status === 'error' ? 'alert' : row.status === 'uploading' ? 'status' : undefined
            "
          >
            {{ statusText(row) }}
          </p>
        </div>
      </li>
      <li
        v-for="slot in Math.max(0, 5 - rows.length)"
        :key="`empty-${slot}`"
        class="attachment-queue__placeholder"
        aria-hidden="true"
      ></li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { FileText, RefreshCw, X } from 'lucide-vue-next'
import AppButton from '@/components/common/AppButton.vue'
import type { AttachmentDraft } from '@/composables/useConversationAttachments'
import type { AttachmentLimits } from '@/types/domain'
const props = defineProps<{
  rows: AttachmentDraft[]
  limits: AttachmentLimits | null
  loading: boolean
  disabled: boolean
}>()
const emit = defineEmits<{
  add: [files: File[]]
  retry: [row: AttachmentDraft]
  remove: [row: AttachmentDraft]
}>()
const picker = ref<HTMLInputElement | null>(null)
function statusText(row: AttachmentDraft): string {
  if (row.status === 'uploading')
    return row.attachment?.workspaceOperationId ? '正在确认工作区文件…' : `上传中 ${row.progress}%`
  if (row.status === 'removing') return '移除中…'
  if (row.status === 'ready')
    return row.attachment?.workspacePath
      ? `已就绪：${row.attachment.workspacePath}`
      : '历史附件已就绪'
  return row.error || '上传失败'
}
function openPicker() {
  if (!props.disabled && !props.loading && props.limits?.agentSupported) picker.value?.click()
}
defineExpose({ openPicker })
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
