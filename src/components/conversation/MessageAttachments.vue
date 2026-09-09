<template>
  <ul v-if="attachments?.length" class="mt-2 space-y-1">
    <li v-for="attachment in attachments" :key="attachment.id">
      <button
        type="button"
        class="max-w-full break-all text-left text-sm underline focus-visible:outline-2"
        :disabled="busy !== null || !attachment.workspacePath"
        title="下载工作区中的当前文件，需要设备在线"
        @click="download(attachment)"
      >
        {{ attachment.fileName }} · {{ (attachment.sizeBytes / 1024).toFixed(1) }} KB
        {{ busy === attachment.id ? '（下载中）' : '' }}
      </button>
    </li>
  </ul>
  <p v-if="error" role="alert" class="mt-1 text-sm text-destructive">{{ error }}</p>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import {
  prepareWorkspaceDownload,
  waitWorkspaceOperation,
  downloadWorkspaceContent,
} from '@/api/workspace-file'
import type { ConversationAttachment, Id } from '@/types/domain'
const props = defineProps<{
  attachments?: ConversationAttachment[]
  projectId: Id
}>()
const busy = ref<Id | null>(null)
const error = ref('')
const controller = new AbortController()
const urls = new Set<string>()
const timers = new Set<ReturnType<typeof setTimeout>>()
async function download(attachment: ConversationAttachment) {
  if (busy.value !== null || !attachment.workspacePath) return
  busy.value = attachment.id
  error.value = ''
  try {
    const { data } = await prepareWorkspaceDownload(
      props.projectId,
      attachment.workspacePath,
      crypto.randomUUID(),
      controller.signal,
    )
    await waitWorkspaceOperation(props.projectId, data.id, controller.signal)
    const blob = await downloadWorkspaceContent(props.projectId, data.id, controller.signal)
    if (controller.signal.aborted) return
    const url = URL.createObjectURL(blob)
    urls.add(url)
    const link = document.createElement('a')
    link.href = url
    link.download = attachment.fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url)
      urls.delete(url)
      timers.delete(timer)
    }, 1000)
    timers.add(timer)
  } catch (cause) {
    if (!controller.signal.aborted)
      error.value = cause instanceof Error ? cause.message : '工作区文件下载失败'
  } finally {
    busy.value = null
  }
}
onBeforeUnmount(() => {
  controller.abort()
  for (const timer of timers) clearTimeout(timer)
  for (const url of urls) URL.revokeObjectURL(url)
})
</script>
