import { computed, onBeforeUnmount, ref } from 'vue'
import {
  commitSkillImport,
  discardSkillImport,
  previewSkillImport,
  uploadSkillImport,
} from '@/api/skill'
import { ApiError } from '@/api/request'
import { captureAuthSession } from '@/utils/auth'
import type { Skill } from '@/types/domain'
import type {
  SkillImportCommit,
  SkillImportInput,
  SkillImportMode,
  SkillImportPreview,
  SkillImportSubmission,
} from '@/types/skill-import'

export interface SkillImportRow extends SkillImportInput {
  file: File
  uploadState: 'WAITING' | 'UPLOADING' | 'UPLOADED' | 'FAILED'
  message: string
}

export function useSkillImport(completed: (result: SkillImportSubmission) => void) {
  const mode = ref<SkillImportMode>('CREATE')
  const rows = ref<SkillImportRow[]>([])
  const preview = ref<SkillImportPreview | null>(null)
  const result = ref<SkillImportSubmission | null>(null)
  const error = ref('')
  const busy = ref(false)
  const uploading = ref(false)
  const pending = ref<SkillImportCommit | null>(null)
  const controllers = new Set<AbortController>()
  const locked = computed(
    () => busy.value || uploading.value || pending.value !== null || result.value !== null,
  )
  const canPreview = computed(
    () =>
      !locked.value &&
      rows.value.length > 0 &&
      rows.value.every((r) => r.uploadState === 'UPLOADED'),
  )
  const canCommit = computed(
    () =>
      canPreview.value &&
      !!preview.value &&
      preview.value.items.every((i) => i.status !== 'INVALID'),
  )
  let generation = 0
  let notified = ''
  let storageKey = ''

  function remember(value: SkillImportCommit | null) {
    pending.value = value
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value))
      else sessionStorage.removeItem(storageKey)
    } catch {
      /* The current dialog still retains the submission identifier. */
    }
  }
  function open(nextMode: SkillImportMode) {
    const nextKey = `harness.skill-import.${captureAuthSession().sessionId ?? 'anonymous'}`
    if (storageKey !== nextKey) {
      cancelRequests()
      rows.value = []
      preview.value = null
      result.value = null
      pending.value = null
      storageKey = nextKey
    }
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
      if (
        stored &&
        typeof stored === 'object' &&
        'previewId' in stored &&
        'submissionId' in stored &&
        typeof stored.previewId === 'string' &&
        typeof stored.submissionId === 'string'
      )
        pending.value = { previewId: stored.previewId, submissionId: stored.submissionId }
    } catch {
      /* Invalid local recovery state is ignored. */
    }
    if (!pending.value && mode.value !== nextMode) {
      clearRows()
      mode.value = nextMode
    }
  }
  function invalidate() {
    preview.value = null
    error.value = ''
  }
  function clearRows() {
    rows.value.forEach((row) => {
      if (row.uploadId) void discardSkillImport(row.uploadId).catch(() => undefined)
    })
    rows.value = []
    preview.value = null
    result.value = null
    error.value = ''
  }
  function startNew() {
    if (!busy.value && !pending.value) clearRows()
  }
  function remove(itemId: string) {
    if (locked.value) return
    const row = rows.value.find((r) => r.itemId === itemId)
    if (row?.uploadId) void discardSkillImport(row.uploadId).catch(() => undefined)
    rows.value = rows.value.filter((r) => r.itemId !== itemId)
    invalidate()
  }
  async function add(files: File[], selected: Skill[]) {
    if (locked.value) return
    if (rows.value.length + files.length > 50) {
      error.value = '每批最多 50 个文件'
      return
    }
    invalidate()
    for (const file of files) {
      const valid =
        file.name.toLowerCase().endsWith('.zip') && file.size > 0 && file.size <= 20 * 1024 * 1024
      rows.value.push({
        itemId: crypto.randomUUID(),
        uploadId: '',
        skillId: null,
        skillName: '',
        description: '',
        tag: mode.value === 'CREATE' ? '' : undefined,
        version: '',
        file,
        uploadState: valid ? 'WAITING' : 'FAILED',
        message: valid ? '待上传' : '请选择非空 ZIP，且不超过 20MB',
      })
    }
    await uploadQueue(selected)
  }
  async function uploadQueue(selected: Skill[]) {
    if (uploading.value || busy.value || pending.value) return
    uploading.value = true
    const run = generation
    const queue = rows.value.filter((r) => r.uploadState === 'WAITING')
    let cursor = 0
    async function worker() {
      while (cursor < queue.length && run === generation) {
        const row = queue[cursor++]!
        const controller = new AbortController()
        controllers.add(controller)
        row.uploadState = 'UPLOADING'
        row.message = '上传中'
        try {
          const response = await uploadSkillImport(row.file, controller.signal)
          if (run !== generation) return
          row.uploadId = response.data.uploadId
          row.skillName = response.data.skillName
          row.description = response.data.description
          row.skillId = response.data.matchedSkillId
          if (
            mode.value === 'UPDATE' &&
            !row.skillId &&
            selected.length === 1 &&
            rows.value.length === 1
          )
            row.skillId = selected[0]!.id
          row.uploadState = 'UPLOADED'
          row.message = '上传完成，请配置并预览'
        } catch (cause) {
          if (run === generation) {
            row.uploadState = 'FAILED'
            row.message = cause instanceof Error ? cause.message : '上传失败'
          }
        } finally {
          controllers.delete(controller)
        }
      }
    }
    await Promise.all([worker(), worker(), worker()])
    if (run === generation) uploading.value = false
  }
  async function retryUploads(selected: Skill[]) {
    if (locked.value) return
    for (const row of rows.value) if (row.uploadState === 'FAILED') row.uploadState = 'WAITING'
    await uploadQueue(selected)
  }
  async function replace(itemId: string, file: File, selected: Skill[]) {
    remove(itemId)
    await add([file], selected)
  }
  async function validate() {
    if (!canPreview.value) return
    busy.value = true
    error.value = ''
    const run = generation
    const controller = new AbortController()
    controllers.add(controller)
    try {
      const response = await previewSkillImport(
        mode.value,
        rows.value.map(({ itemId, uploadId, skillId, skillName, description, tag, version }) => ({
          itemId,
          uploadId,
          skillId,
          skillName,
          description,
          tag,
          version,
        })),
        controller.signal,
      )
      if (run === generation) preview.value = response.data
    } catch (cause) {
      if (run === generation) error.value = cause instanceof Error ? cause.message : '预览失败'
    } finally {
      controllers.delete(controller)
      if (run === generation) busy.value = false
    }
  }
  async function submit() {
    if (busy.value || (!pending.value && !canCommit.value)) return
    if (!pending.value)
      remember({ previewId: preview.value!.previewId, submissionId: crypto.randomUUID() })
    busy.value = true
    error.value = ''
    const run = generation
    const controller = new AbortController()
    controllers.add(controller)
    try {
      const response = await commitSkillImport(pending.value!, controller.signal)
      if (run !== generation) return
      result.value = response.data
      if (response.data.complete) {
        remember(null)
        if (notified !== response.data.submissionId) {
          notified = response.data.submissionId
          completed(response.data)
        }
      }
    } catch (cause) {
      if (run !== generation) return
      if (cause instanceof ApiError && [400, 404, 409].includes(cause.code ?? 0)) {
        remember(null)
        preview.value = null
        error.value = cause.message
      } else
        error.value = '提交结果尚未确认，请点击“恢复提交结果”。关闭页面不会撤销服务端已提交的操作。'
    } finally {
      controllers.delete(controller)
      if (run === generation) busy.value = false
    }
  }
  function retryFailed() {
    if (!result.value?.complete || pending.value) return
    const failed = new Set(
      result.value.items.filter((r) => r.status === 'FAILED').map((r) => r.itemId),
    )
    rows.value = rows.value.filter((r) => failed.has(r.itemId))
    result.value = null
    invalidate()
  }
  async function keepValid() {
    if (!preview.value || locked.value) return
    const invalid = preview.value.items.filter((i) => i.status === 'INVALID').map((i) => i.itemId)
    invalid.forEach(remove)
    if (rows.value.length) await validate()
  }
  function cancelRequests() {
    generation++
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
    for (const row of rows.value)
      if (['UPLOADING', 'WAITING'].includes(row.uploadState)) {
        row.uploadState = 'FAILED'
        row.message = '上传已中断，可重试'
      }
    uploading.value = false
    busy.value = false
  }
  onBeforeUnmount(cancelRequests)
  return {
    mode,
    rows,
    preview,
    result,
    error,
    busy,
    uploading,
    pending,
    locked,
    canPreview,
    canCommit,
    open,
    invalidate,
    add,
    remove,
    replace,
    retryUploads,
    validate,
    submit,
    retryFailed,
    keepValid,
    cancelRequests,
    startNew,
  }
}
