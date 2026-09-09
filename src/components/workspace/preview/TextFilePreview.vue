<template>
  <div class="file-text-preview">
    <div class="file-preview-tools">
      <button type="button" :aria-pressed="wrap" @click="wrap = !wrap">自动换行</button>
      <button type="button" @click="copy">复制全文</button><span role="status">{{ notice }}</span>
    </div>
    <p v-if="!text" class="file-preview-notice">空文件</p>
    <div v-else class="file-text-preview__scroll">
      <pre v-if="!wrap" class="file-text-preview__lines" aria-hidden="true">{{ lineNumbers }}</pre>
      <pre class="file-text-preview__text" :class="{ 'file-text-preview__text--wrap': wrap }">{{
        text
      }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
const props = defineProps<{ text: string }>()
const wrap = ref(false)
const notice = ref('')
const lineNumbers = computed(() =>
  Array.from({ length: props.text.split(/\r\n|\r|\n/).length }, (_, index) => index + 1).join('\n'),
)
async function copy() {
  try {
    await navigator.clipboard.writeText(props.text)
    notice.value = '已复制'
  } catch {
    notice.value = '复制失败，请选中文本复制'
  }
}
</script>
