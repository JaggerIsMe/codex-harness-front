import { computed, onScopeDispose, ref, watch } from 'vue'
import { useWorkspaceFileStore } from '@/stores/workspace-file'
import { useAgentStore } from '@/stores/agent'
import * as api from '@/api/workspace-file'
import type { Id } from '@/types/domain'
import type { WorkspaceFileEntry } from '@/types/workspace-file'
import { ApiError } from '@/api/request'
import {
  insideWorkspacePath,
  mapWorkspacePath,
  workspaceChangeEvent,
} from '@/utils/workspaceFileActions'

export function useWorkspaceFiles(pid: Id) {
  const store = useWorkspaceFileStore()
  const agent = useAgentStore()
  const lifetime = new AbortController()
  const running = new Set<string>()
  const selected = ref('')
  const busy = ref(false)
  const operationText = ref('')
  const error = ref('')
  const root = computed(() => store.directory(pid, ''))
  const expanded = computed(() => store.expanded[String(pid)] || [])
  const directories = computed(() => store.projects[String(pid)] || {})
  const writable = computed(() => root.value.online && root.value.supported && !busy.value)

  async function load(path: string, refresh = false, cursor = '') {
    const requestEpoch = store.epoch(pid)
    const key = requestEpoch + '\n' + path + '\n' + cursor
    if (running.has(key) || lifetime.signal.aborted) return
    running.add(key)
    const state = store.directory(pid, path)
    const baseGeneration = state.generation
    state.loading = true
    state.error = ''
    try {
      let { data } = await api.getWorkspaceDirectory(pid, path, cursor, refresh, lifetime.signal)
      if (lifetime.signal.aborted) return
      if (requestEpoch !== store.epoch(pid)) return
      if (!cursor) store.apply(pid, data, '', baseGeneration, requestEpoch)
      if (data.online && data.operation && ['QUEUED', 'RUNNING'].includes(data.operation.status)) {
        await api.waitWorkspaceOperation(pid, data.operation.id, lifetime.signal)
        data = (await api.getWorkspaceDirectory(pid, path, cursor, false, lifetime.signal)).data
      }
      if (lifetime.signal.aborted) return
      if (data.operation?.status === 'FAILED')
        throw new Error(data.operation.error || '目录同步失败')
      store.apply(pid, data, cursor, baseGeneration, requestEpoch)
    } catch (cause) {
      if (!lifetime.signal.aborted && requestEpoch === store.epoch(pid)) {
        state.error = cause instanceof Error ? cause.message : '目录加载失败'
        if (cause instanceof ApiError && [401, 403, 404].includes(cause.code || 0)) {
          store.projects[String(pid)] = {}
          store.expanded[String(pid)] = []
          store.directory(pid, '').error = state.error
        }
      }
    } finally {
      if (requestEpoch === store.epoch(pid)) state.loading = false
      running.delete(key)
    }
  }
  async function refresh(force = true) {
    await Promise.all(['', ...expanded.value].map((path) => load(path, force)))
  }
  function toggle(path: string) {
    selected.value = path
    store.toggle(pid, path)
    if (expanded.value.includes(path)) void load(path, true)
  }
  async function upload(files: File[]) {
    if (!writable.value) return
    busy.value = true
    error.value = ''
    const parent = selected.value
    try {
      for (const file of files) {
        if (file.size > root.value.maxFileBytes) throw new Error(`${file.name} 超过文件大小限制`)
        operationText.value = `上传 ${file.name}`
        const { data } = await api.uploadWorkspaceFile(
          pid,
          parent,
          file,
          crypto.randomUUID(),
          lifetime.signal,
          (value) => {
            operationText.value = `上传 ${file.name} ${value}%`
          },
        )
        operationText.value = `正在写入工作区：${file.name}`
        await api.waitWorkspaceOperation(pid, data.id, lifetime.signal)
        await load(parent, true)
      }
      operationText.value = '文件已写入工作区'
    } catch (cause) {
      if (!lifetime.signal.aborted)
        error.value = cause instanceof Error ? cause.message : '上传失败'
    } finally {
      busy.value = false
    }
  }
  async function createDirectory(name: string, requestKey: string) {
    if (!writable.value) throw new Error('工作区当前不可写')
    const parent = selected.value
    busy.value = true
    try {
      const path = parent ? `${parent}/${name}` : name
      const { data } = await api.createWorkspaceDirectory(pid, path, requestKey, lifetime.signal)
      await api.waitWorkspaceOperation(pid, data.id, lifetime.signal)
      if (lifetime.signal.aborted) return
      await load(parent, true)
      selected.value = path
      if (!expanded.value.includes(path)) store.toggle(pid, path)
      await load(path, true)
    } finally {
      busy.value = false
    }
  }
  async function download(file: WorkspaceFileEntry) {
    if (!root.value.online || busy.value) return
    busy.value = true
    error.value = ''
    operationText.value = `正在准备下载：${file.name}`
    try {
      const { data } = await api.prepareWorkspaceDownload(
        pid,
        file.path,
        crypto.randomUUID(),
        lifetime.signal,
      )
      await api.waitWorkspaceOperation(pid, data.id, lifetime.signal)
      const blob = await api.downloadWorkspaceContent(pid, data.id, lifetime.signal)
      if (lifetime.signal.aborted) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      operationText.value = '下载已开始'
    } catch (cause) {
      if (!lifetime.signal.aborted)
        error.value = cause instanceof Error ? cause.message : '下载失败'
    } finally {
      busy.value = false
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  async function poll() {
    await refresh(false)
    if (!lifetime.signal.aborted) timer = setTimeout(poll, 15000)
  }
  watch(
    () => agent.eventRevision,
    () => {
      const event = agent.lastEvent
      if (
        event?.type === 'WORKSPACE_FILES_CHANGED' &&
        String(event.payload?.projectId) === String(pid)
      ) {
        const change = workspaceChangeEvent(event.payload)
        if (change) store.applyChange(pid, change)
        void refresh(false)
      }
    },
    { flush: 'sync' },
  )
  watch(
    () => agent.connectionState,
    (value) => {
      if (value === 'CONNECTED') {
        store.invalidate(pid)
        void refresh(true)
      }
    },
  )
  watch(
    () => store.lastChange[String(pid)],
    (change) => {
      if (!change || change.status !== 'SUCCEEDED') return
      if (
        change.kind === 'DELETE_WORKSPACE_ENTRY' &&
        insideWorkspacePath(selected.value, change.sourcePath)
      )
        selected.value = ''
      else if (change.targetPath)
        selected.value = mapWorkspacePath(selected.value, change.sourcePath, change.targetPath)
    },
    { flush: 'sync' },
  )
  watch(
    () => store.resetEpochs[String(pid)],
    () => (selected.value = ''),
    { flush: 'sync' },
  )
  onScopeDispose(() => {
    lifetime.abort()
    clearTimeout(timer)
  })
  void refresh(true).then(() => {
    if (!lifetime.signal.aborted) timer = setTimeout(poll, 15000)
  })
  return {
    root,
    directories,
    expanded,
    selected,
    busy,
    writable,
    operationText,
    error,
    load,
    refresh,
    toggle,
    upload,
    createDirectory,
    download,
    signal: lifetime.signal,
  }
}
