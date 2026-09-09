<template>
  <div class="file-preview-renderer">
    <div class="file-preview-tools">
      <button type="button" @click="zoom = null">适应窗口</button>
      <button type="button" aria-label="缩小图片" @click="zoomBy(-0.25)">−</button>
      <span>{{ Math.round(scale * 100) }}%</span>
      <button type="button" aria-label="放大图片" @click="zoomBy(0.25)">＋</button>
      <span>{{ width }} × {{ height }}</span>
    </div>
    <p v-if="failed" role="alert" class="file-preview-notice">图片解码失败，请下载查看。</p>
    <div ref="viewport" class="file-image-preview">
      <img
        v-if="url && !failed"
        :src="url"
        :alt="name"
        :style="{ width: `${width * scale}px`, height: `${height * scale}px` }"
        @error="failed = true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import { clamp } from '@/utils/workspaceLayout'
const props = defineProps<{
  blob: Blob
  mediaType: string
  width: number
  height: number
  name: string
}>()
const viewport = ref<HTMLElement | null>(null)
const zoom = ref<number | null>(null)
const bounds = ref({ width: 400, height: 400 })
const failed = ref(false)
const url = ref('')
const scale = computed(
  () =>
    zoom.value ??
    Math.min(
      1,
      Math.max(1, bounds.value.width - 32) / props.width,
      Math.max(1, bounds.value.height - 32) / props.height,
    ),
)
function zoomBy(delta: number) {
  zoom.value = clamp(scale.value + delta, 0.1, 4)
}
watch(
  () => props.blob,
  (value) => {
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = URL.createObjectURL(new Blob([value], { type: props.mediaType }))
    failed.value = false
    zoom.value = null
  },
  { immediate: true },
)
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect
    if (rect && rect.width > 0 && rect.height > 0)
      bounds.value = { width: rect.width, height: rect.height }
  })
  if (viewport.value) observer.observe(viewport.value)
})
onScopeDispose(() => {
  observer?.disconnect()
  if (url.value) URL.revokeObjectURL(url.value)
})
</script>
