<template>
  <div class="file-preview-renderer">
    <div class="file-preview-tools">
      <button type="button" :disabled="!pages || page <= 1" @click="page--">上一页</button>
      <label
        >页码
        <input
          aria-label="PDF 页码"
          type="number"
          min="1"
          :max="pages || 1"
          :value="page"
          :disabled="!pages"
          @change="jump"
      /></label>
      <span>/ {{ pages || '—' }}</span>
      <button type="button" :disabled="!pages || page >= pages" @click="page++">下一页</button>
      <button type="button" @click="zoom = null">适应宽度</button>
      <button type="button" aria-label="缩小 PDF" @click="zoomBy(-0.25)">−</button>
      <span>{{ Math.round(scale * 100) }}%</span>
      <button type="button" aria-label="放大 PDF" @click="zoomBy(0.25)">＋</button>
    </div>
    <p v-if="error" role="alert" class="file-preview-notice">{{ error }}，请下载查看。</p>
    <p v-else-if="busy" role="status" class="file-preview-notice">正在渲染 PDF…</p>
    <div ref="viewport" class="file-pdf-preview">
      <canvas ref="canvas" :aria-label="`PDF 第 ${page} 页`"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onScopeDispose, ref, watch } from 'vue'
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { clamp } from '@/utils/workspaceLayout'
GlobalWorkerOptions.workerSrc = workerUrl
const props = defineProps<{ blob: Blob; active: boolean; maxPixels: number }>()
const viewport = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const page = ref(1),
  pages = ref(0),
  zoom = ref<number | null>(null),
  scale = ref(1),
  busy = ref(true),
  error = ref('')
let width = 400,
  disposed = false,
  revision = 0
let loadingTask: PDFDocumentLoadingTask | undefined, document: PDFDocumentProxy | undefined
let renderTask: RenderTask | undefined, renderedPage: PDFPageProxy | undefined
let parseTimer: ReturnType<typeof setTimeout> | undefined
let timer: ReturnType<typeof setTimeout> | undefined, observer: ResizeObserver | undefined
function clearCanvas() {
  if (canvas.value) {
    canvas.value.width = 0
    canvas.value.height = 0
  }
}
function fail(message: string) {
  if (disposed) return
  error.value = message
  busy.value = false
  revision++
  renderTask?.cancel()
  clearTimeout(timer)
  clearTimeout(parseTimer)
  void loadingTask?.destroy().catch(() => {})
  document = undefined
  clearCanvas()
}
async function render() {
  const current = ++revision
  const previous = renderTask
  previous?.cancel()
  clearTimeout(timer)
  if (!props.active || !document || !canvas.value || error.value) return
  busy.value = true
  timer = setTimeout(() => fail('PDF 渲染超时'), 15000)
  try {
    await previous?.promise.catch(() => {})
    if (disposed || current !== revision) return
    renderedPage?.cleanup()
    const pdfPage = await document.getPage(page.value)
    if (disposed || current !== revision) return
    renderedPage = pdfPage
    const base = pdfPage.getViewport({ scale: 1 })
    scale.value = zoom.value ?? Math.max(0.05, (width - 32) / base.width)
    const display = pdfPage.getViewport({ scale: scale.value })
    if (
      !Number.isFinite(display.width) ||
      !Number.isFinite(display.height) ||
      display.width < 1 ||
      display.height < 1 ||
      display.width > 32767 ||
      display.height > 32767
    )
      throw new Error('页面尺寸超过限制')
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      32767 / display.width,
      32767 / display.height,
      Math.sqrt(props.maxPixels / (display.width * display.height)),
      props.maxPixels / Math.max(display.width, display.height),
    )
    const target = canvas.value
    target.style.width = `${display.width}px`
    target.style.height = `${display.height}px`
    target.width = Math.max(1, Math.floor(display.width * ratio))
    target.height = Math.max(1, Math.floor(display.height * ratio))
    renderTask = pdfPage.render({
      canvas: target,
      viewport: display,
      transform: [ratio, 0, 0, ratio, 0, 0],
    })
    await renderTask.promise
  } catch (cause) {
    if (!disposed && current === revision && props.active)
      fail(cause instanceof Error ? `PDF 无法渲染：${cause.message}` : 'PDF 无法渲染')
  } finally {
    if (current === revision) {
      busy.value = false
      clearTimeout(timer)
    }
  }
}
function jump(event: Event) {
  page.value = clamp(
    Math.floor(Number((event.target as HTMLInputElement).value)) || 1,
    1,
    pages.value,
  )
  ;(event.target as HTMLInputElement).value = String(page.value)
}
function zoomBy(delta: number) {
  zoom.value = clamp(scale.value + delta, 0.25, 4)
}
watch([page, zoom, () => props.active], () => {
  void render()
})
onMounted(async () => {
  observer = new ResizeObserver((entries) => {
    const value = entries[0]?.contentRect.width || 0
    if (value > 0 && Math.abs(value - width) > 1) {
      width = value
      if (zoom.value === null) void render()
    }
  })
  if (viewport.value) {
    width = viewport.value.clientWidth || width
    observer.observe(viewport.value)
  }
  try {
    const data = new Uint8Array(await props.blob.arrayBuffer())
    if (disposed) return
    const base = `${import.meta.env.BASE_URL}pdfjs/`
    loadingTask = getDocument({
      data,
      cMapUrl: `${base}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${base}standard_fonts/`,
      wasmUrl: `${base}wasm/`,
      iccUrl: `${base}iccs/`,
      enableXfa: false,
      useSystemFonts: false,
      maxImageSize: 20000000,
      canvasMaxAreaInBytes: props.maxPixels * 4,
    })
    loadingTask.onPassword = () => fail('首版不支持加密 PDF 解锁')
    parseTimer = setTimeout(() => fail('PDF 解析超时'), 15000)
    document = await loadingTask.promise
    clearTimeout(parseTimer)
    if (disposed || error.value) {
      await loadingTask.destroy()
      return
    }
    pages.value = document.numPages
    void render()
  } catch {
    if (!disposed && !error.value) fail('PDF 文件损坏或无法读取')
  }
})
onScopeDispose(() => {
  disposed = true
  revision++
  observer?.disconnect()
  clearTimeout(timer)
  clearTimeout(parseTimer)
  renderTask?.cancel()
  void loadingTask?.destroy().catch(() => {})
  document = undefined
  clearCanvas()
})
</script>
