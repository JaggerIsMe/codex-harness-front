<template>
  <ul class="workspace-file-tree" :aria-label="path || '工作区目录'">
    <li v-for="file in entries" :key="file.path">
      <div
        class="workspace-file-row"
        :class="{
          'workspace-file-row--selected': selected === file.path || previewPath === file.path,
        }"
      >
        <input
          v-if="multiSelect && file.type === 'FILE'"
          type="checkbox"
          class="size-4 shrink-0 accent-primary"
          :aria-label="`选择 ${file.path}`"
          :checked="selectedPaths?.includes(file.path)"
          @change="emit('select', file)"
        />
        <button
          v-if="file.type === 'DIRECTORY'"
          type="button"
          class="workspace-file-label"
          :title="file.path"
          :aria-expanded="expanded.includes(file.path)"
          @click="emit('toggle', file.path)"
        >
          <ChevronDown v-if="expanded.includes(file.path)" :size="14" /><ChevronRight
            v-else
            :size="14"
          />
          <Folder :size="16" /><span>{{ file.name }}</span>
        </button>
        <button
          v-else-if="file.type === 'FILE'"
          type="button"
          class="workspace-file-label"
          :title="file.path"
          :aria-label="`预览 ${file.name}`"
          :aria-pressed="previewPath === file.path"
          :disabled="disabled"
          @click="emit('preview', file)"
        >
          <File :size="16" /><span>{{ file.name }}</span>
        </button>
        <span v-else class="workspace-file-label" :title="file.path">
          <File :size="16" /><span>{{ file.name }}</span>
        </span>
        <button
          v-if="file.type === 'FILE' && !directoriesOnly"
          type="button"
          :disabled="disabled"
          :aria-label="`下载 ${file.name}`"
          :title="`下载 · ${(file.sizeBytes / 1024).toFixed(1)} KB`"
          @click="emit('download', file)"
        >
          <Download :size="14" />
        </button>
        <DropdownMenuRoot v-if="file.type !== 'UNAVAILABLE' && !directoriesOnly">
          <DropdownMenuTrigger as-child
            ><button type="button" :aria-label="`${file.name} 更多操作`" title="更多操作">
              <Ellipsis :size="16" /></button
          ></DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent class="workspace-file-menu" :side-offset="4" align="end">
              <DropdownMenuItem
                v-if="file.type === 'FILE'"
                :disabled="disabled"
                @select="emit('preview', file)"
                >预览</DropdownMenuItem
              >
              <DropdownMenuItem
                v-if="file.type === 'FILE'"
                :disabled="disabled"
                @select="emit('download', file)"
                >下载</DropdownMenuItem
              >
              <DropdownMenuItem
                :disabled="!mutationEnabled || !file.entryRevision"
                @select="emit('rename', file)"
                >重命名</DropdownMenuItem
              >
              <DropdownMenuItem
                v-if="file.type === 'FILE'"
                :disabled="!mutationEnabled || !file.entryRevision"
                @select="emit('move', file)"
                >移动到</DropdownMenuItem
              >
              <DropdownMenuItem
                :disabled="!mutationEnabled || !file.entryRevision"
                class="text-destructive"
                @select="emit('delete', file)"
                >删除</DropdownMenuItem
              >
              <DropdownMenuItem @select="emit('copy', file.path)">复制相对路径</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
        <span v-if="file.type === 'UNAVAILABLE'" class="text-xs text-muted-foreground"
          >不可访问</span
        >
      </div>
      <WorkspaceFileTree
        v-if="file.type === 'DIRECTORY' && expanded.includes(file.path)"
        :path="file.path"
        :directories="directories"
        :expanded="expanded"
        :selected="selected"
        :preview-path="previewPath"
        :disabled="disabled"
        :directories-only="directoriesOnly"
        :multi-select="multiSelect"
        :selected-paths="selectedPaths"
        :mutation-enabled="mutationEnabled"
        @select="emit('select', $event)"
        @rename="emit('rename', $event)"
        @move="emit('move', $event)"
        @delete="emit('delete', $event)"
        @toggle="emit('toggle', $event)"
        @preview="emit('preview', $event)"
        @download="emit('download', $event)"
        @copy="emit('copy', $event)"
        @more="(directoryPath, cursor) => emit('more', directoryPath, cursor)"
        @retry="emit('retry', $event)"
      />
    </li>
    <li v-if="directory?.loading" class="px-3 py-2 text-xs text-muted-foreground" role="status">
      同步中…
    </li>
    <li
      v-else-if="directory?.loaded && !entries.length"
      class="px-3 py-2 text-xs text-muted-foreground"
    >
      空目录
    </li>
    <li v-if="directory?.error" class="px-3 py-2 text-xs text-destructive" role="alert">
      {{ directory.error }}
      <button type="button" class="underline" :disabled="disabled" @click="emit('retry', path)">
        重试
      </button>
    </li>
    <li v-if="directory?.nextCursor" class="px-3 py-2">
      <button
        type="button"
        class="text-xs text-primary underline"
        :disabled="disabled || directory.loading"
        @click="emit('more', path, directory.nextCursor)"
      >
        加载更多文件
      </button>
    </li>
  </ul>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, ChevronRight, Folder, File, Download, Ellipsis } from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
} from 'reka-ui'
import type { WorkspaceDirectoryState, WorkspaceFileEntry } from '@/types/workspace-file'
const props = defineProps<{
  path: string
  directories: Record<string, WorkspaceDirectoryState>
  expanded: string[]
  previewPath?: string
  selected: string
  disabled: boolean
  directoriesOnly?: boolean
  multiSelect?: boolean
  selectedPaths?: string[]
  mutationEnabled?: boolean
}>()
const emit = defineEmits<{
  toggle: [path: string]
  preview: [file: WorkspaceFileEntry]
  download: [file: WorkspaceFileEntry]
  copy: [path: string]
  more: [path: string, cursor: string]
  retry: [path: string]
  select: [file: WorkspaceFileEntry]
  rename: [file: WorkspaceFileEntry]
  move: [file: WorkspaceFileEntry]
  delete: [file: WorkspaceFileEntry]
}>()
const directory = computed(() => props.directories[props.path])
const entries = computed(() =>
  (directory.value?.entries || []).filter(
    (entry) => !props.directoriesOnly || entry.type === 'DIRECTORY',
  ),
)
</script>
