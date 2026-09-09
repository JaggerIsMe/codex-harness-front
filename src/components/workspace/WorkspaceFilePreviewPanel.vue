<template>
  <aside class="workspace-file-preview" aria-label="文件预览" :aria-busy="loading">
    <header class="workspace-file-preview__header">
      <strong>{{ file.name }}</strong>
      <span class="workspace-file-preview__path" :title="file.path">{{ file.path }}</span>
      <small
        >{{ size }} ·
        {{
          metadata?.readyAt
            ? `获取于 ${new Date(metadata.readyAt).toLocaleString()}`
            : '准备文件副本'
        }}</small
      >
      <div class="file-preview-tools">
        <button type="button" :disabled="loading || !online" @click="emit('refresh')">
          刷新预览
        </button>
        <button type="button" :disabled="!metadata || downloading" @click="emit('download')">
          {{ downloading ? '下载中…' : '下载副本' }}
        </button>
        <button type="button" @click="emit('maximize')">
          {{ maximized ? '恢复布局' : '最大化预览' }}
        </button>
        <button type="button" aria-label="关闭文件预览" @click="emit('close')">
          <X :size="16" />
        </button>
      </div>
    </header>
    <p v-if="changed" role="status" class="file-preview-notice">
      目录已更新，可刷新预览。当前仍显示已获取副本。
    </p>
    <p v-if="!online" role="status" class="file-preview-notice">
      Device 离线，已获取内容仍可阅读；重新读取需设备在线。
    </p>
    <p v-if="error || decodeError" role="alert" class="file-preview-notice">
      {{ error || decodeError }}
    </p>
    <p v-if="loading" role="status" class="file-preview-notice">正在获取文件副本…</p>
    <template v-else-if="metadata">
      <p v-if="metadata.kind === 'UNSUPPORTED'" class="file-preview-notice">
        {{ metadata.reason || '暂不支持预览，请下载查看。' }}
      </p>
      <template v-else-if="blob">
        <TextFilePreview
          v-if="metadata.kind === 'TEXT' && text !== null"
          :key="metadata.operationId"
          :text="text"
        />
        <MarkdownFilePreview
          v-else-if="metadata.kind === 'MARKDOWN' && text !== null"
          :key="metadata.operationId"
          :text="text"
        />
        <TableFilePreview
          v-else-if="metadata.kind === 'TABLE' && text !== null"
          :key="metadata.operationId"
          :text="text"
          :delimiter="file.name.toLowerCase().endsWith('.tsv') ? '\t' : ','"
          :max-rows="metadata.limits.maxRows"
          :max-columns="metadata.limits.maxColumns"
        />
        <ImageFilePreview
          v-else-if="metadata.kind === 'IMAGE'"
          :key="metadata.operationId"
          :blob="blob"
          :media-type="metadata.mediaType!"
          :width="metadata.width!"
          :height="metadata.height!"
          :name="file.name"
        />
        <PdfFilePreview
          v-else-if="metadata.kind === 'PDF'"
          :key="metadata.operationId"
          :blob="blob"
          :active="active"
          :max-pixels="metadata.limits.maxPixels"
        />
      </template>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch, type AsyncComponentLoader } from 'vue'
import { X } from 'lucide-vue-next'
import type { WorkspaceFileEntry } from '@/types/workspace-file'
import type { WorkspaceFilePreview } from '@/types/workspace-preview'
import { decodePreview } from '@/utils/workspacePreview'
import TextFilePreview from './preview/TextFilePreview.vue'
import PreviewRendererStatus from './preview/PreviewRendererStatus.vue'
const renderer = (loader: AsyncComponentLoader) =>
  defineAsyncComponent({
    loader,
    loadingComponent: PreviewRendererStatus,
    errorComponent: PreviewRendererStatus,
    timeout: 15000,
  })
const MarkdownFilePreview = renderer(() => import('./preview/MarkdownFilePreview.vue'))
const TableFilePreview = renderer(() => import('./preview/TableFilePreview.vue'))
const ImageFilePreview = renderer(() => import('./preview/ImageFilePreview.vue'))
const PdfFilePreview = renderer(() => import('./preview/PdfFilePreview.vue'))
const props = defineProps<{
  file: WorkspaceFileEntry
  metadata: WorkspaceFilePreview | null
  blob: Blob | null
  loading: boolean
  downloading: boolean
  error: string
  changed: boolean
  online: boolean
  active: boolean
  maximized: boolean
}>()
const emit = defineEmits<{ close: []; refresh: []; download: []; maximize: [] }>()
const text = ref<string | null>(null),
  decodeError = ref('')
const size = computed(
  () => `${((props.metadata?.sizeBytes ?? props.file.sizeBytes) / 1024).toFixed(1)} KB`,
)
watch(
  () => props.blob,
  async (value, _, cleanup) => {
    let cancelled = false
    cleanup(() => {
      cancelled = true
    })
    text.value = null
    decodeError.value = ''
    if (!value || !['TEXT', 'MARKDOWN', 'TABLE'].includes(props.metadata?.kind || '')) return
    try {
      const content = decodePreview(await value.arrayBuffer(), props.metadata?.encoding || null)
      if (!cancelled) text.value = content
    } catch {
      if (!cancelled) decodeError.value = '文本解码失败，请下载查看。'
    }
  },
  { immediate: true },
)
</script>

<style src="../../assets/styles/workspace.file.preview.scss"></style>
