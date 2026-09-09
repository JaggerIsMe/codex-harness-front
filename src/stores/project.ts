import type { Project, Id } from '@/types/domain'
import { computed, onScopeDispose, ref } from 'vue'
import { defineStore } from 'pinia'
import { getProject, getProjects } from '@/api/project'
import { normalizePageResult } from '@/utils/pagination'

const PAGE_SIZE = 20

export const useProjectStore = defineStore('project', () => {
  // Metadata outlives a search page so open Conversations keep their Project identity.
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const listedIds = ref<string[]>([])
  const pinnedIds = ref<string[]>([])
  const keyword = ref('')
  const page = ref(0)
  const total = ref(0)
  const projectCount = ref(0)
  const size = ref(PAGE_SIZE)
  const loading = ref(false)
  const loadingMore = ref(false)
  const error = ref('')
  const moreError = ref('')
  let projectRevision = 0
  let listRevision = 0
  let controller: AbortController | null = null
  const pendingUpdates = new Map<string, Project>()
  const hasMore = computed(() => page.value > 0 && page.value * size.value < total.value)
  const visibleProjects = computed(() => {
    const byId = new Map(projects.value.map((project) => [String(project.id), project]))
    const ids = [...new Set([...(keyword.value ? [] : pinnedIds.value), ...listedIds.value])]
    return ids.flatMap((id) => {
      const project = byId.get(id)
      return project ? [project] : []
    })
  })

  function reset() {
    projectRevision++
    listRevision++
    controller?.abort()
    controller = null
    projects.value = []
    currentProject.value = null
    listedIds.value = []
    pinnedIds.value = []
    keyword.value = ''
    page.value = total.value = projectCount.value = 0
    size.value = PAGE_SIZE
    error.value = moreError.value = ''
    loading.value = loadingMore.value = false
    pendingUpdates.clear()
  }

  async function fetchPage(nextPage: number, resetList = false) {
    if (controller && !resetList) return []
    controller?.abort()
    const request = new AbortController()
    controller = request
    const revision = ++listRevision
    const append = nextPage > 1
    if (resetList) {
      listedIds.value = []
      page.value = total.value = 0
    }
    loading.value = !append
    loadingMore.value = append
    error.value = moreError.value = ''
    pendingUpdates.clear()
    try {
      const response = await getProjects(request.signal, {
        page: nextPage,
        size: PAGE_SIZE,
        keyword: keyword.value,
      })
      if (request.signal.aborted || revision !== listRevision) return []
      const result = normalizePageResult(response.data, nextPage, PAGE_SIZE)
      const rows = result.items.map((item) => pendingUpdates.get(String(item.id)) || item)
      const byId = new Map(projects.value.map((item) => [String(item.id), item]))
      rows.forEach((item) => byId.set(String(item.id), item))
      projects.value = [...byId.values()]
      const incoming = rows.map((item) => String(item.id))
      listedIds.value = [
        ...new Set(append ? [...listedIds.value, ...incoming] : [...incoming, ...listedIds.value]),
      ]
      page.value = append || resetList ? result.page : Math.max(page.value, result.page)
      total.value = result.total
      size.value = result.size
      if (!keyword.value) projectCount.value = result.total
      return rows
    } catch (cause) {
      if (revision === listRevision && !request.signal.aborted) {
        const message = cause instanceof Error ? cause.message : '项目加载失败'
        if (append) moreError.value = message
        else error.value = message
      }
      return []
    } finally {
      if (revision === listRevision) {
        controller = null
        loading.value = loadingMore.value = false
        pendingUpdates.clear()
      }
    }
  }

  function loadProjects() {
    return fetchPage(1)
  }
  function loadMore() {
    return hasMore.value ? fetchPage(page.value + 1) : Promise.resolve([])
  }
  function setKeyword(value: string) {
    keyword.value = value.trim()
    return fetchPage(1, true)
  }

  async function loadProject(projectId: Id) {
    if (String(currentProject.value?.id || '') !== String(projectId)) currentProject.value = null
    const revision = ++projectRevision
    const result = await getProject(projectId)
    if (revision !== projectRevision) return null
    currentProject.value = result?.data || null
    if (currentProject.value) upsertProject(currentProject.value)
    return currentProject.value
  }

  function upsertProject(project: Project) {
    const id = String(project.id)
    if (controller) pendingUpdates.set(id, project)
    if (String(currentProject.value?.id) === id) currentProject.value = project
    projects.value = [project, ...projects.value.filter((item) => String(item.id) !== id)]
    if (!listedIds.value.includes(id))
      pinnedIds.value = [id, ...pinnedIds.value.filter((value) => value !== id)]
  }
  onScopeDispose(reset)
  return {
    projects,
    visibleProjects,
    currentProject,
    keyword,
    page,
    total,
    projectCount,
    hasMore,
    loading,
    loadingMore,
    error,
    moreError,
    loadProjects,
    loadMore,
    setKeyword,
    loadProject,
    upsertProject,
    reset,
  }
})
