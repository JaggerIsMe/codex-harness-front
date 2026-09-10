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
  const mutationRevision = ref(0)
  const renamedProjects = new Map<string, { name: string; revision: number }>()
  const removedProjects = new Set<string>()
  const activityTimes = ref<Record<string, string>>({})
  const promotions = ref<Record<string, { at: number; order: number }>>({})
  const activityControllers = new Map<string, AbortController>()
  let promotionOrder = 0
  const hasMore = computed(() => page.value > 0 && page.value * size.value < total.value)
  const visibleProjects = computed(() => {
    const byId = new Map(projects.value.map((project) => [String(project.id), project]))
    const ids = [...new Set([...(keyword.value ? [] : pinnedIds.value), ...listedIds.value])]
    const rows = ids.flatMap((id) => {
      const project = byId.get(id)
      return project ? [project] : []
    })
    return rows.sort((a, b) => {
      const first = promotions.value[String(a.id)]
      const second = promotions.value[String(b.id)]
      const difference =
        Math.max(projectActivityTime(b), second?.at || 0) -
        Math.max(projectActivityTime(a), first?.at || 0)
      return difference || (second?.order || 0) - (first?.order || 0)
    })
  })

  function time(value?: string | null) {
    const parsed = value ? Date.parse(value) : NaN
    return Number.isFinite(parsed) ? parsed : 0
  }

  function projectActivityTime(project: Project) {
    return Math.max(
      time(project.lastActivityAt || project.createdAt),
      time(activityTimes.value[String(project.id)]),
    )
  }

  function latestActivityTime() {
    return Math.max(
      0,
      ...projects.value.map(projectActivityTime),
      ...Object.values(activityTimes.value).map(time),
      ...Object.values(promotions.value).map((value) => value.at),
    )
  }

  /** Keep server activity monotonic when an older page arrives after a live update. */
  function retainActivity(project: Project) {
    const id = String(project.id)
    const previous = activityTimes.value[id]
    if (time(project.lastActivityAt) > time(previous)) {
      activityTimes.value[id] = project.lastActivityAt!
      return project
    }
    return previous ? { ...project, lastActivityAt: previous } : project
  }

  function updateConversationActivity(projectId: Id, lastActivityAt?: string | null) {
    const id = String(projectId)
    if (lastActivityAt && time(lastActivityAt) > time(activityTimes.value[id])) {
      activityTimes.value[id] = lastActivityAt
      ensureActivityProject(projectId)
    }
  }

  function promoteProject(projectId: Id) {
    const id = String(projectId)
    // Use the observed server clock as the baseline; browser clock skew must not pin a project.
    promotions.value[id] = { at: latestActivityTime(), order: ++promotionOrder }
    ensureActivityProject(projectId)
  }

  function ensureActivityProject(projectId: Id) {
    const id = String(projectId)
    if (removedProjects.has(id)) return
    const known = projects.value.find((project) => String(project.id) === id)
    if (known) {
      if (!listedIds.value.includes(id) && !pinnedIds.value.includes(id))
        pinnedIds.value = [id, ...pinnedIds.value]
      return
    }
    if (activityControllers.has(id)) return
    const request = new AbortController()
    activityControllers.set(id, request)
    const before = mutationRevision.value
    void getProject(projectId, request.signal)
      .then((result) => {
        if (!request.signal.aborted) upsertProject(retainName(result.data, before))
      })
      .catch(() => {})
      .finally(() => {
        if (activityControllers.get(id) === request) activityControllers.delete(id)
      })
  }

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
    renamedProjects.clear()
    removedProjects.clear()
    activityControllers.forEach((request) => request.abort())
    activityControllers.clear()
    activityTimes.value = {}
    promotions.value = {}
    promotionOrder = 0
  }

  async function fetchPage(nextPage: number, resetList = false) {
    if (controller && !resetList) return []
    controller?.abort()
    const request = new AbortController()
    controller = request
    const revision = ++listRevision
    const beforePromotion = promotionOrder
    const beforeMutation = mutationRevision.value
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
      const rows = result.items
        .filter((item) => !removedProjects.has(String(item.id)))
        .map((item) =>
          retainActivity(retainName(pendingUpdates.get(String(item.id)) || item, beforeMutation)),
        )
      const byId = new Map(projects.value.map((item) => [String(item.id), item]))
      rows.forEach((item) => byId.set(String(item.id), item))
      projects.value = [...byId.values()]
      // A list requested before a user action must not undo that action when it resolves.
      const latest = latestActivityTime()
      for (const promotion of Object.values(promotions.value)) {
        if (promotion.order > beforePromotion) promotion.at = Math.max(promotion.at, latest)
      }
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
    if (removedProjects.has(String(projectId))) return null
    const changed = String(currentProject.value?.id || '') !== String(projectId)
    if (changed) currentProject.value = null
    const revision = ++projectRevision
    const before = mutationRevision.value
    const result = await getProject(projectId)
    if (revision !== projectRevision || removedProjects.has(String(projectId))) return null
    currentProject.value = result?.data ? retainName(result.data, before) : null
    if (currentProject.value) {
      upsertProject(currentProject.value)
      if (changed) promoteProject(projectId)
    }
    return currentProject.value
  }

  function upsertProject(project: Project) {
    if (removedProjects.has(String(project.id))) return
    project = retainActivity(project)
    const id = String(project.id)
    if (controller) pendingUpdates.set(id, project)
    if (String(currentProject.value?.id) === id) currentProject.value = project
    projects.value = [project, ...projects.value.filter((item) => String(item.id) !== id)]
    if (!listedIds.value.includes(id))
      pinnedIds.value = [id, ...pinnedIds.value.filter((value) => value !== id)]
  }
  function retainName(project: Project, before: number) {
    const renamed = renamedProjects.get(String(project.id))
    return renamed && renamed.revision > before
      ? { ...project, projectName: renamed.name }
      : project
  }
  function updateProjectName(project: Project) {
    renamedProjects.set(String(project.id), {
      name: project.projectName,
      revision: mutationRevision.value + 1,
    })
    upsertProject(project)
    mutationRevision.value++
  }
  function removeProject(projectId: Id) {
    const id = String(projectId)
    if (removedProjects.has(id)) return
    removedProjects.add(id)
    // Offset pages shift after removal; cancel an older page and start paging again.
    controller?.abort()
    controller = null
    listRevision++
    loading.value = loadingMore.value = false
    activityControllers.get(id)?.abort()
    activityControllers.delete(id)
    pendingUpdates.delete(id)
    renamedProjects.delete(id)
    if (String(currentProject.value?.id) === id) {
      projectRevision++
      currentProject.value = null
    }
    projects.value = projects.value.filter((item) => String(item.id) !== id)
    listedIds.value = listedIds.value.filter((value) => value !== id)
    pinnedIds.value = pinnedIds.value.filter((value) => value !== id)
    total.value = Math.max(0, total.value - 1)
    projectCount.value = Math.max(0, projectCount.value - 1)
    page.value = Math.min(page.value, 1)
    delete activityTimes.value[id]
    delete promotions.value[id]
    mutationRevision.value++
  }
  function removeConversation(projectId: Id) {
    const project = projects.value.find((item) => String(item.id) === String(projectId))
    if (project)
      upsertProject({ ...project, conversationCount: Math.max(0, project.conversationCount - 1) })
    mutationRevision.value++
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
    updateProjectName,
    removeProject,
    removeConversation,
    mutationRevision,
    promoteProject,
    updateConversationActivity,
    reset,
  }
})
