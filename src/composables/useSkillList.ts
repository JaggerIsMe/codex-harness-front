import { onBeforeUnmount, reactive, ref } from 'vue'
import { getSkills } from '@/api/skill'
import type { Skill } from '@/types/domain'
import { normalizePageResult } from '@/utils/pagination'

export function useSkillList() {
  const skills = ref<Skill[]>([])
  const page = ref(1),
    size = ref(20),
    total = ref(0)
  const loadingSkills = ref(false),
    skillError = ref('')
  const selectedSkillIds = ref<number[]>([])
  const skillSearch = reactive({ keyword: '', status: '' })
  let appliedSearch = { ...skillSearch }
  let request: AbortController | null = null

  async function loadSkills(nextPage = page.value, nextSize = size.value) {
    request?.abort()
    const current = new AbortController()
    request = current
    loadingSkills.value = true
    skillError.value = ''
    skills.value = []
    try {
      const response = await getSkills(
        { ...appliedSearch, page: nextPage, size: nextSize },
        current.signal,
      )
      if (current.signal.aborted) return
      const result = normalizePageResult(response.data, nextPage, nextSize)
      const lastPage = Math.max(1, Math.ceil(result.total / result.size))
      if (result.page > lastPage) {
        await loadSkills(lastPage, nextSize)
        return
      }
      skills.value = result.items
      page.value = result.page
      size.value = result.size
      total.value = result.total
    } catch (cause) {
      if (!current.signal.aborted)
        skillError.value = cause instanceof Error ? cause.message : 'Skill 加载失败'
    } finally {
      if (request === current) loadingSkills.value = false
    }
  }
  function searchSkills() {
    appliedSearch = { keyword: skillSearch.keyword.trim(), status: skillSearch.status }
    return loadSkills(1)
  }
  function resetSkills() {
    Object.assign(skillSearch, { keyword: '', status: '' })
    return searchSkills()
  }
  function selectPage(checked: boolean) {
    if (loadingSkills.value) return
    const ids = new Set(skills.value.map((s) => s.id))
    selectedSkillIds.value = checked
      ? [...new Set([...selectedSkillIds.value, ...ids])]
      : selectedSkillIds.value.filter((id) => !ids.has(id))
  }
  onBeforeUnmount(() => request?.abort())
  return {
    skills,
    page,
    size,
    total,
    loadingSkills,
    skillError,
    selectedSkillIds,
    skillSearch,
    loadSkills,
    searchSkills,
    resetSkills,
    selectPage,
  }
}
