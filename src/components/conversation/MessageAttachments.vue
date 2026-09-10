<template>
  <ul v-if="attachments?.length" class="mt-2 space-y-1">
    <li v-for="attachment in attachments" :key="attachment.id">
      <button
        type="button"
        class="max-w-full break-all text-left text-sm underline focus-visible:outline-2"
        :disabled="
          busy !== null ||
          !attachment.workspacePath ||
          attachment.workspaceLocationState === 'MISSING' ||
          attachment.workspaceLocationState === 'UNKNOWN'
        "
        title="下载工作区中的当前文件，需要设备在线"
        @click="download(attachment)"
      >
        {{ attachment.fileName }} · {{ (attachment.sizeBytes / 1024).toFixed(1) }} KB
        {{ busy === attachment.id ? '（下载中）' : '' }}
      </button>
      <p
        v-if="attachment.workspaceLocationState === 'MISSING'"
        class="text-xs text-muted-foreground"
      >
        文件已删除；历史附件关联保留。
      </p>
      <p v-else-if="attachment.workspaceLocationState === 'UNKNOWN'" class="text-xs text-warning">
        文件位置待核实，暂不可下载。
      </p>
      <p v-else-if="attachment.workspacePath" class="break-all text-xs text-muted-foreground">
        当前路径：{{ attachment.workspacePath }}
      </p>
    </li>
  </ul>
  <p v-if="error" role="alert" class="mt-1 text-sm text-destructive">{{ error }}</p>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { waitWorkspaceOperation, downloadWorkspaceContent } from '@/api/workspace-file'
import { prepareAttachmentDownload } from '@/api/attachment'
import type { ConversationAttachment, Id } from '@/types/domain'
const props = defineProps<{
  attachments?: ConversationAttachment[]
  projectId: Id
  conversationId: Id
}>()
const busy = ref<Id | null>(null)
const error = ref('')
const controller = new AbortController()
const urls = new Set<string>()
const timers = new Set<ReturnType<typeof setTimeout>>()
async function download(attachment: ConversationAttachment) {
  if (
    busy.value !== null ||
    !attachment.workspacePath ||
    ['MISSING', 'UNKNOWN'].includes(attachment.workspaceLocationState || 'AVAILABLE')
  )
    return
  busy.value = attachment.id
  error.value = ''
  try {
    const { data } = await prepareAttachmentDownload(
      props.projectId,
      props.conversationId,
      attachment.id,
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
