<template>
  <ul v-if="attachments?.length" class="mt-2 space-y-1">
    <li v-for="attachment in attachments" :key="attachment.id">
      <button
        type="button"
        class="max-w-full break-all text-left text-sm underline focus-visible:outline-2"
        :disabled="busy !== null"
        @click="download(attachment)"
      >
        {{ attachment.fileName }} · {{ (attachment.sizeBytes / 1024).toFixed(1) }} KB
        {{ busy === attachment.id ? '（下载中）' : '' }}
      </button>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { downloadAttachment } from '@/api/attachment'
import type { ConversationAttachment, Id } from '@/types/domain'
const props = defineProps<{
  attachments?: ConversationAttachment[]
  projectId: Id
  conversationId: Id
}>()
const busy = ref<Id | null>(null)
const controller = new AbortController()
const urls = new Set<string>()
const timers = new Set<ReturnType<typeof setTimeout>>()
async function download(attachment: ConversationAttachment) {
  busy.value = attachment.id
  try {
    const blob = await downloadAttachment(
      props.projectId,
      props.conversationId,
      attachment.id,
      controller.signal,
    )
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
  } catch {
    /* Shared request error handling. */
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
