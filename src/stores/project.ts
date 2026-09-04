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
  let listRevision = 0
  function reset() {
    projectRevision += 1
    listRevision += 1
    projects.value = []
    currentProject.value = null
    error.value = ''
    loading.value = false
  }

  async function loadProjects() {
    const revision = ++listRevision
    loading.value = true
    error.value = ''
    try {
      const result = await getProjects()
      if (revision !== listRevision) return []
      projects.value = result?.data || []
      return projects.value
    } catch (cause) {
      if (revision !== listRevision) return []
      error.value = cause instanceof Error ? cause.message : '项目加载失败'
      return []
    } finally {
      if (revision === listRevision) loading.value = false
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
    if (currentProject.value?.id === project.id) currentProject.value = project
    projects.value = [
      project,
      ...projects.value.filter((item) => String(item.id) !== String(project.id)),
    ]
  }

  return {
    error,
    projects,
    currentProject,
    loading,
    loadProjects,
    loadProject,
    upsertProject,
    reset,
  }
})
