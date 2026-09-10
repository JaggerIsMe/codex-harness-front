<template>
  <aside class="workspace-file-panel" aria-label="工作区文件">
    <header class="flex items-center justify-between gap-2 border-b p-3">
      <strong class="text-sm">工作区文件</strong>
      <div class="flex gap-1">
        <AppButton size="small" :disabled="!root.online || root.loading" @click="refresh()"
          >刷新</AppButton
        >
        <AppButton size="small" aria-label="收起工作区文件" @click="emit('close')"
          ><PanelRightClose :size="16"
        /></AppButton>
      </div>
    </header>
    <div class="space-y-2 border-b p-3">
      <p class="truncate text-xs text-muted-foreground" :title="selected || '工作区根目录'">
        上传位置：{{ selected || '工作区根目录' }}
      </p>
      <div class="flex gap-2">
        <AppButton size="small" :disabled="!writable" @click="picker?.click()">上传文件</AppButton>
        <AppButton size="small" :disabled="!writable" @click="creating = true"
          >新建文件夹</AppButton
        >
        <AppButton
          size="small"
          :disabled="!root.capabilities?.archive.supported"
          :aria-pressed="multiSelect"
          @click="multiSelect = !multiSelect"
          >{{ multiSelect ? '退出多选' : '多选' }}</AppButton
        >
      </div>
      <p v-if="root.capabilities?.mutations.reason" class="text-xs text-muted-foreground">
        {{ root.capabilities.mutations.reason }}
      </p>
      <p
        v-if="!root.capabilities?.mutations.supported && root.supported"
        class="text-xs text-muted-foreground"
      >
        升级 Agent 后可重命名、移动和删除文件。
      </p>
      <div v-if="multiSelect" class="space-y-2 rounded border p-2">
        <p class="text-xs" role="status">
          已选 {{ selection.length }} 个，已知大小 {{ formatWorkspaceBytes(selectedBytes) }}
        </p>
        <div class="flex gap-2">
          <AppButton size="small" :disabled="!selection.length" @click="clearSelection"
            >清空</AppButton
          >
          <AppButton
            size="small"
            :loading="working"
            :disabled="!archiveEnabled || !!archiveProblem"
            @click="archive"
            >下载 ZIP</AppButton
          >
        </div>
        <p v-if="archiveProblem" class="text-xs text-muted-foreground">{{ archiveProblem }}</p>
        <p v-if="root.limits" class="text-xs text-muted-foreground">
          最多 {{ root.limits.maxArchiveFiles }} 个文件，合计
          {{ formatWorkspaceBytes(root.limits.maxArchiveSourceBytes) }}
        </p>
        <details v-if="selection.length" class="text-xs">
          <summary class="cursor-pointer">查看已选文件</summary>
          <ul class="max-h-36 overflow-auto">
            <li
              v-for="file in selection"
              :key="file.path"
              class="flex items-center gap-2 break-all py-1"
            >
              <span class="min-w-0 flex-1"
                >{{ file.path }}{{ file.entryRevision ? '' : '（待核验）' }}</span
              ><button
                type="button"
                :aria-label="`取消选择 ${file.path}`"
                class="shrink-0 underline"
                @click="select(file)"
              >
                移除
              </button>
            </li>
          </ul>
        </details>
      </div>
      <input
        ref="picker"
        type="file"
        multiple
        class="hidden"
        aria-label="上传工作区文件"
        @change="choose"
      />
      <p v-if="!root.supported" class="text-xs text-warning">请升级 Agent 以启用文件管理。</p>
      <p v-else-if="!root.online && !root.loading" class="text-xs text-warning">
        Device 离线，显示上次同步结果。
      </p>
      <p v-if="operationText" role="status" class="text-xs text-muted-foreground">
        {{ operationText }}
      </p>
      <p v-if="error" role="alert" class="text-xs text-destructive">{{ error }}</p>
    </div>
    <div class="workspace-file-panel__tree" @dragover.prevent @drop.prevent="drop">
      <button
        type="button"
        class="workspace-file-root"
        :class="{ 'workspace-file-row--selected': selected === '' }"
        @click="selected = ''"
      >
        <FolderRoot :size="16" /><span>工作区根目录</span>
      </button>
      <WorkspaceFileTree
        path=""
        :directories="directories"
        :expanded="expanded"
        :selected="selected"
        :preview-path="previewPath"
        :disabled="!root.online || busy"
        :multi-select="multiSelect"
        :selected-paths="selectedPaths"
        :mutation-enabled="mutationEnabled"
        @select="select"
        @rename="renaming = $event"
        @move="moving = $event"
        @delete="deleting = $event"
        @toggle="toggle"
        @download="download"
        @preview="emit('preview', $event)"
        @copy="copy"
        @more="(path, cursor) => load(path, true, cursor)"
        @retry="(path) => load(path, true)"
      />
    </div>
    <WorkspaceRecentOperations
      :operations="operations"
      :loading="restoring"
      :error="historyError"
      :next-cursor="nextCursor"
      :details="details"
      @refresh="restore()"
      @more="restore(true)"
      @reconcile="reconcile"
      @download="downloadOperation"
    />
    <footer class="border-t p-3 text-xs text-muted-foreground">
      {{
        root.scannedAt ? `上次同步 ${new Date(root.scannedAt).toLocaleTimeString()}` : '尚未同步'
      }}
      <span v-if="root.maxFileBytes">
        · 单文件 {{ Math.round(root.maxFileBytes / 1048576) }} MB</span
      >
    </footer>
    <CreateWorkspaceDirectoryDialog
      v-model="creating"
      :parent="selected"
      :create="createDirectory"
    />
    <RenameWorkspaceEntryDialog :file="renaming" :rename="rename" @close="renaming = null" />
    <MoveWorkspaceFileDialog
      :file="moving"
      :directories="directories"
      :load="load"
      :move="move"
      @close="moving = null"
    />
    <DeleteWorkspaceEntryDialog
      :file="deleting"
      :prepare="planDeletion"
      :remove="remove"
      @close="deleting = null"
    />
  </aside>
</template>

<script setup lang="ts">
import { ref, shallowRef } from 'vue'
import { FolderRoot, PanelRightClose } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { WorkspaceFileEntry } from '@/types/workspace-file'
import type { Id } from '@/types/domain'
import AppButton from '@/components/common/AppButton.vue'
import WorkspaceFileTree from './WorkspaceFileTree.vue'
import CreateWorkspaceDirectoryDialog from './CreateWorkspaceDirectoryDialog.vue'
import { useWorkspaceFiles } from '@/composables/useWorkspaceFiles'
import { useWorkspaceFileActions } from '@/composables/useWorkspaceFileActions'
import { formatWorkspaceBytes } from '@/utils/workspaceFileActions'
import RenameWorkspaceEntryDialog from './RenameWorkspaceEntryDialog.vue'
import MoveWorkspaceFileDialog from './MoveWorkspaceFileDialog.vue'
import DeleteWorkspaceEntryDialog from './DeleteWorkspaceEntryDialog.vue'
import WorkspaceRecentOperations from './WorkspaceRecentOperations.vue'
const props = defineProps<{ projectId: Id; previewPath?: string }>()
const emit = defineEmits<{ close: []; preview: [file: WorkspaceFileEntry] }>()
const files = useWorkspaceFiles(props.projectId)
const {
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
} = files
const {
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
} = useWorkspaceFileActions(props.projectId, files)
const renaming = shallowRef<WorkspaceFileEntry | null>(null)
const moving = shallowRef<WorkspaceFileEntry | null>(null)
const deleting = shallowRef<WorkspaceFileEntry | null>(null)
const picker = ref<HTMLInputElement | null>(null)
const creating = ref(false)
function choose(event: Event) {
  const input = event.target as HTMLInputElement
  void upload(Array.from(input.files || []))
  input.value = ''
}
function drop(event: DragEvent) {
  if (writable.value) void upload(Array.from(event.dataTransfer?.files || []))
}
async function copy(path: string) {
  try {
    await navigator.clipboard.writeText(path)
    toast.success('相对路径已复制')
  } catch {
    error.value = '无法复制路径，请从文件名称提示中查看相对路径'
  }
}
</script>
