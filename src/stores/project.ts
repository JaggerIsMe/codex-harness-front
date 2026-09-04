import type { Project, Id } from '@/types/domain'
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getProject, getProjects } from '../api/project.ts'
export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const loading = ref(false)
  const error = ref('')
  let projectRevision = 0

  async function loadProjects() {
    loading.value = true
    error.value = ''
    try {
      const result = await getProjects()
      projects.value = result?.data || []
      return projects.value
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '项目加载失败'
      return []
    } finally {
      loading.value = false
    }
  }

  async function loadProject(projectId: Id) {
    if (String(currentProject.value?.id || '') !== String(projectId)) currentProject.value = null
    const revision = ++projectRevision
    const result = await getProject(projectId)
    if (revision !== projectRevision) return null
    currentProject.value = result?.data || null
    return currentProject.value
  }

  function upsertProject(project: Project) {
    projects.value = [
      project,
      ...projects.value.filter((item) => String(item.id) !== String(project.id)),
    ]
  }

  return { error, projects, currentProject, loading, loadProjects, loadProject, upsertProject }
})
