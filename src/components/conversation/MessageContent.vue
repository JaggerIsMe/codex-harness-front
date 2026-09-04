<template>
  <div class="message-markdown" v-html="sanitizedHtml"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import { renderMarkdownHtml } from '../../utils/messageMarkdown'
const props = withDefaults(defineProps<{ content?: string }>(), { content: '' })

const sanitizedHtml = computed(() =>
  DOMPurify.sanitize(renderMarkdownHtml(props.content), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style'],
  }),
)
</script>
