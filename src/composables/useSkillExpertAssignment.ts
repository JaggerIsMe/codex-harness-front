import { computed, onBeforeUnmount, ref } from 'vue'
import type { Skill } from '@/types/domain'
import type {
  AssignmentCandidate,
  AssignmentPreview,
  AssignmentSubmission,
} from '@/types/skill-assignment'
import {
  getAssignmentCandidates,
  previewAssignment,
  commitAssignment,
  getAssignment,
  getBatchAssignmentCandidates,
  previewBatchAssignment,
} from '@/api/skill-assignment'
import { captureAuthSession } from '@/utils/auth'
import { ApiError } from '@/api/request'
export function useSkillExpertAssignment(skills: () => Skill[], completed: () => void) {
  const batchMode = ref(false)
  const versionIds = ref<number[]>([])
  const versionId = ref<number | null>(null),
    keyword = ref(''),
    page = ref(1),
    total = ref(0)
  const candidates = ref<AssignmentCandidate[]>([]),
    selected = ref<AssignmentCandidate[]>([])
  const preview = ref<AssignmentPreview | null>(null),
    result = ref<AssignmentSubmission | null>(null)
  const confirmed = ref(false),
    busy = ref(false),
    loading = ref(false),
    error = ref(''),
    pending = ref<string | null>(null)
  const target = computed(() =>
    skills().find((s) => s.versions.some((v) => v.id === versionId.value)),
  )
  const targets = computed(() =>
    (batchMode.value ? versionIds.value : versionId.value ? [versionId.value] : []).flatMap(
      (id) => {
        const skill = skills().find((s) => s.versions.some((v) => v.id === id))
        return skill ? [{ skillId: skill.id, versionId: id }] : []
      },
    ),
  )
  const hasTargets = computed(() => targets.value.length > 0)
  let query: AbortController | null = null,
    operation: AbortController | null = null,
    generation = 0,
    storageKey = ''
  const locked = computed(() => busy.value || !!pending.value || !!result.value)
  function invalidate() {
    preview.value = null
    confirmed.value = false
    error.value = ''
  }
  function remember(id: string | null) {
    pending.value = id
    try {
      if (id) sessionStorage.setItem(storageKey, id)
      else sessionStorage.removeItem(storageKey)
    } catch {
      /* In-memory recovery remains available. */
    }
  }
  async function open(initial: number | null, initialVersions?: number[]) {
    cancel()
    storageKey = `harness.skill-assignment.${captureAuthSession().sessionId ?? 'anonymous'}`
    pending.value = null
    try {
      pending.value = sessionStorage.getItem(storageKey)
    } catch {
      /* No persisted state. */
    }
    versionId.value = initial
    batchMode.value = initialVersions !== undefined
    versionIds.value = [...(initialVersions ?? [])]
    selected.value = []
    candidates.value = []
    total.value = 0
    keyword.value = ''
    page.value = 1
    result.value = null
    invalidate()
    if (!pending.value) await search(1)
  }
  async function search(nextPage = 1) {
    query?.abort()
    candidates.value = []
    total.value = 0
    page.value = nextPage
    if (!hasTargets.value || pending.value) {
      loading.value = false
      return
    }
    const controller = new AbortController()
    query = controller
    loading.value = true
    error.value = ''
    try {
      const response = batchMode.value
        ? await getBatchAssignmentCandidates(
            targets.value,
            keyword.value.trim(),
            nextPage,
            controller.signal,
          )
        : await getAssignmentCandidates(
            target.value!.id,
            versionId.value!,
            keyword.value.trim(),
            nextPage,
            controller.signal,
          )
      if (!controller.signal.aborted) {
        candidates.value = response.data.items
        total.value = response.data.total
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        error.value = cause instanceof Error ? cause.message : '候选专家加载失败'
    } finally {
      if (query === controller) loading.value = false
    }
  }
  function changeVersion() {
    selected.value = []
    invalidate()
    void search(1)
  }
  function toggle(candidate: AssignmentCandidate, checked: boolean) {
    if (locked.value || candidate.action === 'BLOCKED') return
    if (checked && !selected.value.some((i) => i.expertId === candidate.expertId)) {
      if (selected.value.length >= 50) {
        error.value = '每批最多选择 50 位专家'
        return
      }
      selected.value.push(candidate)
    } else if (!checked)
      selected.value = selected.value.filter((i) => i.expertId !== candidate.expertId)
    invalidate()
  }
  async function validate() {
    if (locked.value || !hasTargets.value || !selected.value.length) return
    busy.value = true
    error.value = ''
    const run = generation
    const controller = new AbortController()
    operation = controller
    try {
      const response = batchMode.value
        ? await previewBatchAssignment(
            targets.value,
            selected.value.map((i) => i.expertId),
            controller.signal,
          )
        : await previewAssignment(
            target.value!.id,
            versionId.value!,
            selected.value.map((i) => i.expertId),
            controller.signal,
          )
      if (run === generation) {
        preview.value = response.data
        confirmed.value = false
      }
    } catch (cause) {
      if (run === generation) error.value = cause instanceof Error ? cause.message : '预览失败'
    } finally {
      if (run === generation) busy.value = false
    }
  }
  async function submit() {
    if (
      busy.value ||
      (!pending.value &&
        (!preview.value ||
          !confirmed.value ||
          preview.value.items.some((i) => i.action === 'BLOCKED')))
    )
      return
    if (!pending.value) remember(preview.value!.batchId)
    busy.value = true
    error.value = ''
    const run = generation
    const controller = new AbortController()
    operation = controller
    try {
      const saved = await getAssignment(pending.value!, controller.signal)
      const response = saved.data.complete
        ? saved
        : await commitAssignment(pending.value!, controller.signal)
      if (run !== generation) return
      result.value = response.data
      if (response.data.targets?.length) {
        const restored = response.data.targets.map((t) => t.versionId)
        batchMode.value = batchMode.value || restored.length > 1
        versionIds.value = restored
        versionId.value = restored.length === 1 ? restored[0]! : null
      }
      if (response.data.complete) {
        remember(null)
        completed()
      }
    } catch (cause) {
      if (run === generation) {
        if (cause instanceof ApiError && [400, 403, 404, 409].includes(cause.code ?? 0)) {
          remember(null)
          invalidate()
          error.value = cause.message
        } else
          error.value = `${cause instanceof Error ? cause.message : '请求失败'}。提交结果待确认，请恢复原提交；关闭窗口不会撤销已完成的分配。`
      }
    } finally {
      if (run === generation) busy.value = false
    }
  }
  function startNew() {
    if (busy.value || pending.value) return
    selected.value = []
    result.value = null
    invalidate()
    void search(1)
  }
  function retryFailed() {
    if (!result.value?.complete || !preview.value) return
    const ids = new Set(
      result.value.items.filter((i) => i.status === 'FAILED').map((i) => i.expertId),
    )
    selected.value = preview.value.items.filter((i) => ids.has(i.expertId))
    result.value = null
    invalidate()
    void search(1)
  }
  function cancel() {
    generation++
    query?.abort()
    operation?.abort()
    busy.value = false
    loading.value = false
  }
  onBeforeUnmount(cancel)
  return {
    batchMode,
    versionIds,
    hasTargets,
    versionId,
    keyword,
    page,
    total,
    candidates,
    selected,
    preview,
    result,
    confirmed,
    busy,
    loading,
    error,
    pending,
    locked,
    open,
    search,
    changeVersion,
    toggle,
    validate,
    submit,
    startNew,
    retryFailed,
    cancel,
  }
}
