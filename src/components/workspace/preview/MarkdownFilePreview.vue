<template>
  <div class="file-preview-renderer">
    <div class="file-preview-tools">
      <button type="button" :aria-pressed="source" @click="source = !source">
        {{ source ? '查看 Markdown' : '查看源码' }}
      </button>
    </div>
    <TextFilePreview v-if="source" :text="text" />
    <div v-else class="file-markdown-preview" v-html="html"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import TextFilePreview from './TextFilePreview.vue'
import { renderPreviewMarkdown } from '@/utils/workspacePreview'
const props = defineProps<{ text: string }>()
const source = ref(false)
const html = computed(() => renderPreviewMarkdown(props.text))
</script>
