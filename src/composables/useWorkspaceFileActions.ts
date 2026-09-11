import { computed, onScopeDispose, ref, watch } from 'vue'
import * as api from '@/api/workspace-file'
import { useWorkspaceFileStore } from '@/stores/workspace-file'
import { useAgentStore } from '@/stores/agent'
import { useAuthStore } from '@/stores/auth'
import type { Id } from '@/types/domain'
import type {
  WorkspaceFileEntry,
  WorkspaceFileOperation,
  WorkspaceDeletePlan,
  WorkspaceOperationItem,
} from '@/types/workspace-file'
import { mappedSelection, operationChange, mutationKind } from '@/utils/workspaceFileActions'
import type { useWorkspaceFiles } from './useWorkspaceFiles'

export function useWorkspaceFileActions(pid: Id, files: ReturnType<typeof useWorkspaceFiles>) {
  const store = useWorkspaceFileStore()
  const agent = useAgentStore()
  const auth = useAuthStore()
  const multiSelect = ref(false)
  const selection = ref<WorkspaceFileEntry[]>([])
  const operations = ref<WorkspaceFileOperation[]>([])
  const nextCursor = ref<string | null>(null)
  const restoring = ref(false)
  const working = ref(false)
  const historyError = ref('')
  const urls = new Map<string, ReturnType<typeof setTimeout>>()
  const controller = new AbortController()
  const signal = controller.signal
  const pending = new Set<string>()
  const reconciling = new Set<string>()
  const partialDetails = new Set<string>()
  const selectedPaths = computed(() => selection.value.map((file) => file.path))
  const selectedBytes = computed(() =>
    selection.value.reduce((sum, file) => sum + file.sizeBytes, 0),
  )
  const mutationEnabled = computed(
    () =>
      !!files.root.value.capabilities?.mutations.enabled &&
      files.root.value.online &&
      !working.value &&
      !files.busy.value,
  )
  const archiveEnabled = computed(
    () =>
      !!files.root.value.capabilities?.archive.enabled && files.root.value.online && !working.value,
  )
  const archiveProblem = computed(() => {
    if (!selection.value.length) return '请勾选文件'
    if (selection.value.some((file) => !file.entryRevision))
      return '部分文件等待重新核验，请刷新相应目录'
    const limits = files.root.value.limits
    if (!limits) return '请刷新目录取得下载限制'
    if (selection.value.length > limits.maxArchiveFiles)
      return `最多选择 ${limits.maxArchiveFiles} 个文件`
    if (selectedBytes.value > limits.maxArchiveSourceBytes) return '所选文件总大小超限'
    if (selection.value.some((file) => file.sizeBytes > limits.maxFileBytes))
      return '部分文件超过单文件大小限制'
    return ''
  })
  function select(file: WorkspaceFileEntry) {
    if (!multiSelect.value || file.type !== 'FILE') return
    selection.value = selectedPaths.value.includes(file.path)
      ? selection.value.filter((item) => item.path !== file.path)
      : [...selection.value, { ...file }]
  }
  function clearSelection() {
    selection.value = []
  }
  watch(() => store.resetEpochs[String(pid)], clearSelection, { flush: 'sync' })
  watch(multiSelect, (value) => {
    if (!value) clearSelection()
  })
  watch(
    () => auth.sessionId,
    () => {
      clearSelection()
      operations.value = []
      controller.abort()
    },
  )
  watch(
    () => agent.connectionState,
    (value) => {
      if (value === 'CONNECTED') {
        // A missed event stream may have outlived the history window; do not guess old paths.
        clearSelection()
        void restore()
      }
    },
  )
  watch(
    () => store.lastChange[String(pid)],
    (change) => {
      if (change) selection.value = mappedSelection(selection.value, change)
    },
    { flush: 'sync' },
  )
  watch(
    () => Object.values(files.directories.value).flatMap((directory) => directory.entries),
    (entries) => {
      const current = new Map(entries.map((entry) => [entry.path, entry]))
      selection.value = selection.value.map((entry) =>
        current.get(entry.path)?.entryRevision ? { ...current.get(entry.path)! } : entry,
      )
    },
  )
  function record(operation: WorkspaceFileOperation) {
    const previous = operations.value.find((item) => String(item.id) === String(operation.id))
    if (previous && !canAdvance(previous, operation)) return
    operations.value = (
      previous
        ? operations.value.map((item) =>
            String(item.id) === String(operation.id) ? operation : item,
          )
        : [operation, ...operations.value]
    ).sort((a, b) => (BigInt(a.id) > BigInt(b.id) ? -1 : 1))
    const change = operationChange(operation)
    if (change && store.applyChange(pid, change)) void files.refresh(true)
    if (
      operation.status === 'PARTIAL_FAILED' &&
      change &&
      !partialDetails.has(String(operation.id))
    )
      void applyPartialDetails(operation)
  }
  async function applyPartialDetails(operation: WorkspaceFileOperation) {
    partialDetails.add(String(operation.id))
    try {
      let cursor = ''
      const items: WorkspaceOperationItem[] = []
      do {
        const page = await api.getWorkspaceOperationItems(pid, operation.id, cursor, signal)
        if (signal.aborted) return
        items.push(...page.data.items)
        cursor = page.data.nextCursor || ''
        if (items.length > 10000) throw new Error('操作明细超过上限，请刷新目录核实')
      } while (cursor)
      const change = operationChange(operation)
      if (change) {
        change.items = items
        store.applyChange(pid, change)
      }
    } catch (cause) {
      if (!signal.aborted) {
        partialDetails.delete(String(operation.id))
        historyError.value =
          cause instanceof Error ? cause.message : '部分删除明细读取失败，请刷新状态'
      }
    }
  }
  function canAdvance(previous: WorkspaceFileOperation, next: WorkspaceFileOperation) {
    if (previous.status === next.status) return true
    if (['SUCCEEDED', 'FAILED', 'PARTIAL_FAILED', 'EXPIRED'].includes(previous.status)) return false
    return previous.status !== 'UNKNOWN' || !['QUEUED', 'RUNNING'].includes(next.status)
  }
  async function track(operation: WorkspaceFileOperation) {
    record(operation)
    if (!['QUEUED', 'RUNNING'].includes(operation.status)) {
      if (operation.status !== 'SUCCEEDED') throw new api.WorkspaceOperationError(operation)
      return operation
    }
    try {
      const result = await api.waitWorkspaceOperation(pid, operation.id, signal)
      if (signal.aborted) throw new DOMException('已停止等待', 'AbortError')
      record(result)
      return result
    } catch (cause) {
      if (!signal.aborted && cause instanceof api.WorkspaceOperationError) record(cause.operation)
      throw cause
    }
  }
  async function submit(create: () => Promise<{ data: WorkspaceFileOperation }>) {
    if (working.value) throw new Error('文件操作正在处理中')
    working.value = true
    try {
      return await track((await create()).data)
    } finally {
      working.value = false
    }
  }
  function revision(file: WorkspaceFileEntry) {
    if (!file.entryRevision) throw new Error('目录条目缺少版本，请先刷新目录')
    return file.entryRevision
  }
  async function rename(file: WorkspaceFileEntry, name: string, requestKey: string) {
    await submit(() =>
      api.renameWorkspaceEntry(
        pid,
        { path: file.path, name, expectedRevision: revision(file), requestKey },
        signal,
      ),
    )
  }
  async function move(file: WorkspaceFileEntry, targetDirectory: string, requestKey: string) {
    await submit(() =>
      api.moveWorkspaceEntry(
        pid,
        { path: file.path, targetDirectory, expectedRevision: revision(file), requestKey },
        signal,
      ),
    )
  }
  async function planDeletion(
    file: WorkspaceFileEntry,
    requestKey: string,
  ): Promise<WorkspaceDeletePlan> {
    const result = await submit(() =>
      api.prepareWorkspaceDeletion(
        pid,
        { path: file.path, expectedRevision: revision(file), requestKey },
        signal,
      ),
    )
    if (!result.result?.plan) throw new Error('Agent 未返回删除检查结果，请重新检查')
    return { ...result.result.plan, attachmentCount: result.attachmentCount }
  }
  async function remove(plan: WorkspaceDeletePlan, requestKey: string) {
    await submit(() =>
      api.deleteWorkspaceEntry(
        pid,
        { planId: plan.planId, planDigest: plan.planDigest, requestKey },
        signal,
      ),
    )
  }
  async function downloadOperation(operation: WorkspaceFileOperation) {
    historyError.value = ''
    try {
      const blob = await api.downloadWorkspaceContent(pid, operation.id, signal)
      if (signal.aborted) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download =
        operation.kind === 'PREPARE_WORKSPACE_ARCHIVE'
          ? `workspace-${operation.id}.zip`
          : operation.path.split('/').at(-1) || 'download'
      link.click()
      urls.set(
        url,
        setTimeout(() => {
          URL.revokeObjectURL(url)
          urls.delete(url)
        }, 1000),
      )
    } catch (cause) {
      if (!signal.aborted) historyError.value = cause instanceof Error ? cause.message : '下载失败'
    }
  }
  async function archive() {
    if (!archiveEnabled.value || archiveProblem.value) return
    const input = {
      items: selection.value.map((file) => ({ path: file.path, expectedRevision: revision(file) })),
      requestKey: crypto.randomUUID(),
    }
    if (
      new TextEncoder().encode(JSON.stringify(input)).length >
      (files.root.value.limits?.maxRequestBytes || 0) - 32768
    ) {
      historyError.value = '所选路径总长度超限，请减少选择'
      return
    }
    historyError.value = ''
    try {
      const operation = await submit(() => api.prepareWorkspaceArchive(pid, input, signal))
      await downloadOperation(operation)
    } catch (cause) {
      if (!signal.aborted) historyError.value = cause instanceof Error ? cause.message : '打包失败'
    }
  }
  async function follow(operation: WorkspaceFileOperation) {
    const key = String(operation.id)
    if (pending.has(key) || signal.aborted) return
    pending.add(key)
    try {
      await track(operation)
    } catch (cause) {
      if (!signal.aborted && !(cause instanceof api.WorkspaceOperationError))
        historyError.value = cause instanceof Error ? cause.message : '等待操作失败'
    } finally {
      pending.delete(key)
    }
  }
  async function restore(more = false) {
    if (restoring.value || signal.aborted) return
    restoring.value = true
    historyError.value = ''
    try {
      const { data } = await api.getWorkspaceOperations(
        pid,
        more ? nextCursor.value || '' : '',
        signal,
      )
      if (signal.aborted) return
      for (const item of data.items)
        if (mutationKind(item.kind)) store.observeOperation(pid, item.id, item.status)
      // A history page lists newest first; apply filesystem changes in original order.
      for (const item of [...data.items].reverse()) {
        if (
          !mutationKind(item.kind) &&
          !['PREPARE_WORKSPACE_ARCHIVE', 'PREPARE_WORKSPACE_DELETE'].includes(item.kind)
        )
          continue
        // Historical operations are for recovery, not replaying old path transformations on a freshly scanned tree.
        const prior = operations.value.find((old) => String(old.id) === String(item.id))
        if (prior && !canAdvance(prior, item)) continue
        if (prior && prior.status !== item.status) record(item)
        else
          operations.value = [
            prior?.contentState === 'EXPIRED' ? { ...item, contentState: 'EXPIRED' } : item,
            ...operations.value.filter((old) => String(old.id) !== String(item.id)),
          ]
        if (prior && item.status === 'PARTIAL_FAILED' && !partialDetails.has(String(item.id)))
          void applyPartialDetails(item)
        if (['QUEUED', 'RUNNING'].includes(item.status)) void follow(item)
      }
      nextCursor.value = data.nextCursor
      operations.value.sort((a, b) => (BigInt(a.id) > BigInt(b.id) ? -1 : 1))
    } catch (cause) {
      if (!signal.aborted)
        historyError.value = cause instanceof Error ? cause.message : '读取近期操作失败'
    } finally {
      restoring.value = false
    }
  }
  async function reconcile(operation: WorkspaceFileOperation) {
    const key = String(operation.id)
    if (reconciling.has(key)) return
    reconciling.add(key)
    historyError.value = ''
    try {
      const { data } = await api.reconcileWorkspaceOperation(
        pid,
        operation.id,
        crypto.randomUUID(),
        signal,
      )
      await follow(data)
    } catch (cause) {
      if (!signal.aborted) historyError.value = cause instanceof Error ? cause.message : '核实失败'
    } finally {
      reconciling.delete(key)
    }
  }
  async function details(
    operation: WorkspaceFileOperation,
    cursor = '',
  ): Promise<{ items: WorkspaceOperationItem[]; nextCursor: string | null }> {
    return (await api.getWorkspaceOperationItems(pid, operation.id, cursor, signal)).data
  }
  watch(
    () => agent.eventRevision,
    () => {
      if (
        agent.lastEvent?.type === 'WORKSPACE_FILES_CHANGED' &&
        String(agent.lastEvent.payload?.projectId) === String(pid)
      )
        void restore()
    },
  )
  onScopeDispose(() => {
    controller.abort()
    selection.value = []
    for (const [url, timer] of urls) {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
    }
    urls.clear()
  })
  void restore()
  return {
    multiSelect,
    selection,
    selectedPaths,
    selectedBytes,
    clearSelection,
    select,
    operations,
    nextCursor,
    restoring,
    working,
    historyError,
    mutationEnabled,
    archiveEnabled,
    archiveProblem,
    rename,
    move,
    planDeletion,
    remove,
    archive,
    restore,
    reconcile,
    downloadOperation,
    details,
  }
}
