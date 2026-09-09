import { computed, onScopeDispose, ref } from 'vue'
import { getProjects } from '@/api/project'
import { normalizePageResult } from '@/utils/pagination'
import type { Project } from '@/types/domain'

/** A picker or management page has its own query, independent of sidebar search. */
export function useProjectQuery() {
  const items = ref<Project[]>([])
  const keyword = ref('')
  const page = ref(0)
  const total = ref(0)
  const size = ref(20)
  const loading = ref(false)
  const error = ref('')
  let revision = 0
  let requestedPage = 1
  let controller: AbortController | null = null
  const hasMore = computed(() => page.value > 0 && page.value * size.value < total.value)
  function cancel() {
    revision++
    controller?.abort()
    controller = null
    loading.value = false
  }
  async function load(nextPage = 1, reset = false) {
    if (controller && !reset) return
    cancel()
    requestedPage = nextPage
    const version = revision
    const request = new AbortController()
    controller = request
    if (reset) {
      items.value = []
      page.value = total.value = 0
    }
    loading.value = true
    error.value = ''
    try {
      const response = await getProjects(request.signal, {
        page: nextPage,
        size: 20,
        keyword: keyword.value,
      })
      if (version !== revision || request.signal.aborted) return
      const result = normalizePageResult(response.data, nextPage, 20)
      const ids = new Set(result.items.map((item) => String(item.id)))
      const rows =
        nextPage > 1
          ? [...items.value, ...result.items]
          : [...result.items, ...items.value.filter((item) => !ids.has(String(item.id)))]
      items.value = [...new Map(rows.map((item) => [String(item.id), item])).values()]
      page.value = Math.max(page.value, result.page)
      total.value = result.total
      size.value = result.size
    } catch (cause) {
      if (version === revision && !request.signal.aborted)
        error.value = cause instanceof Error ? cause.message : '项目加载失败'
    } finally {
      if (version === revision) {
        controller = null
        loading.value = false
      }
    }
  }
  function search(value = '') {
    keyword.value = value.trim()
    return load(1, true)
  }
  function loadMore() {
    return hasMore.value ? load(page.value + 1) : Promise.resolve()
  }
  function retry() {
    return load(requestedPage)
  }
  function refresh() {
    return load(1)
  }
  onScopeDispose(cancel)
  return {
    items,
    keyword,
    page,
    total,
    loading,
    error,
    hasMore,
    search,
    loadMore,
    retry,
    refresh,
    cancel,
  }
}
