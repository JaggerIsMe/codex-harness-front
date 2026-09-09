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
      </div>
      <input
        ref="picker"
        type="file"
        multiple
        class="hidden"
        aria-label="上传工作区文件"
        @change="choose"
      />
      <p v-if="!root.supported" class="text-xs text-amber-700">请升级 Agent 以启用文件管理。</p>
      <p v-else-if="!root.online && !root.loading" class="text-xs text-amber-700">
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
        @toggle="toggle"
        @download="download"
        @preview="emit('preview', $event)"
        @copy="copy"
        @more="(path, cursor) => load(path, true, cursor)"
        @retry="(path) => load(path, true)"
      />
    </div>
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
  </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { FolderRoot, PanelRightClose } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import type { WorkspaceFileEntry } from '@/types/workspace-file'
import type { Id } from '@/types/domain'
import AppButton from '@/components/common/AppButton.vue'
import WorkspaceFileTree from './WorkspaceFileTree.vue'
import CreateWorkspaceDirectoryDialog from './CreateWorkspaceDirectoryDialog.vue'
import { useWorkspaceFiles } from '@/composables/useWorkspaceFiles'
const props = defineProps<{ projectId: Id; previewPath?: string }>()
const emit = defineEmits<{ close: []; preview: [file: WorkspaceFileEntry] }>()
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
} = useWorkspaceFiles(props.projectId)
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
