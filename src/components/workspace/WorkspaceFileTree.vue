<template>
  <ul class="workspace-file-tree" :aria-label="path || '工作区目录'">
    <li v-for="file in directory?.entries || []" :key="file.path">
      <div
        class="workspace-file-row"
        :class="{ 'workspace-file-row--selected': selected === file.path }"
      >
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
        <span v-else class="workspace-file-label" :title="file.path">
          <File :size="16" /><span>{{ file.name }}</span>
        </span>
        <button
          type="button"
          :aria-label="`复制 ${file.name} 相对路径`"
          title="复制相对路径"
          @click="emit('copy', file.path)"
        >
          <Copy :size="14" />
        </button>
        <button
          v-if="file.type === 'FILE'"
          type="button"
          :disabled="disabled"
          :aria-label="`下载 ${file.name}`"
          :title="`下载 · ${(file.sizeBytes / 1024).toFixed(1)} KB`"
          @click="emit('download', file)"
        >
          <Download :size="14" />
        </button>
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
        :disabled="disabled"
        @toggle="emit('toggle', $event)"
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
      v-else-if="directory?.loaded && !directory.entries.length"
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
import { ChevronDown, ChevronRight, Folder, File, Download, Copy } from 'lucide-vue-next'
import type { WorkspaceDirectoryState, WorkspaceFileEntry } from '@/types/workspace-file'
const props = defineProps<{
  path: string
  directories: Record<string, WorkspaceDirectoryState>
  expanded: string[]
  selected: string
  disabled: boolean
}>()
const emit = defineEmits<{
  toggle: [path: string]
  download: [file: WorkspaceFileEntry]
  copy: [path: string]
  more: [path: string, cursor: string]
  retry: [path: string]
}>()
const directory = computed(() => props.directories[props.path])
</script>
