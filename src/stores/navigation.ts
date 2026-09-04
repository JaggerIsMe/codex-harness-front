import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getConversations } from '@/api/conversation'
import type { Conversation, Id } from '@/types/domain'

/** Browsing the sidebar never activates or clears the conversation being read. */
export const useNavigationStore = defineStore('navigation', () => {
  const conversations = ref<Record<string, Conversation[]>>({})
  const loading = ref<Record<string, boolean>>({})
  const errors = ref<Record<string, string>>({})
  const expanded = ref<Record<string, boolean>>({})
  const controllers = new Map<string, AbortController>()
  const pendingUpdates = new Map<string, Map<Id, Conversation>>()
  async function load(projectId: Id, force = false) {
    const key = String(projectId)
    if (controllers.has(key) || (!force && conversations.value[key])) return
    const controller = new AbortController()
    controllers.set(key, controller)
    loading.value[key] = true
    errors.value[key] = ''
    try {
      const result = await getConversations(projectId, controller.signal)
      if (!controller.signal.aborted) {
        const updates = [...(pendingUpdates.get(key)?.values() || [])]
        const ids = new Set(updates.map((item) => item.id))
        conversations.value[key] = [
          ...updates,
          ...(result.data || []).filter((item) => !ids.has(item.id)),
        ]
        pendingUpdates.delete(key)
      }
    } catch (error) {
      if (!controller.signal.aborted)
        errors.value[key] = error instanceof Error ? error.message : '会话加载失败'
    } finally {
      if (controllers.get(key) === controller) {
        controllers.delete(key)
        loading.value[key] = false
      }
    }
  }
  function upsert(value: Conversation) {
    const key = String(value.projectId)
    if (controllers.has(key)) {
      const updates = pendingUpdates.get(key) || new Map<Id, Conversation>()
      updates.set(value.id, value)
      pendingUpdates.set(key, updates)
    }
    conversations.value[key] = [
      value,
      ...(conversations.value[key] || []).filter((item) => item.id !== value.id),
    ]
    expanded.value[key] = true
  }
  function reset() {
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
    pendingUpdates.clear()
    conversations.value = {}
    loading.value = {}
    errors.value = {}
    expanded.value = {}
  }
  return { conversations, loading, errors, expanded, load, upsert, reset }
})
