<template>
  <div
    v-if="canRename || canDelete"
    ref="container"
    class="resource-actions-menu inline-flex shrink-0"
  >
    <DropdownMenuRoot>
      <DropdownMenuTrigger as-child>
        <AppButton
          :circle="compact"
          :link="compact"
          :class="compact ? 'size-[30px] rounded-md text-muted-foreground' : ''"
          :icon="Ellipsis"
          :loading="busy"
          :label="`${kind}操作：${name}`"
          :title="`${kind}操作`"
        >
          <span v-if="!compact">{{ kind }}操作</span>
        </AppButton>
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent
          align="end"
          :side-offset="4"
          class="z-50 min-w-36 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          @close-auto-focus="onCloseAutoFocus"
        >
          <DropdownMenuItem
            v-if="canRename"
            :disabled="busy"
            class="flex cursor-default items-center gap-2 rounded-sm px-3 py-2 text-sm outline-none data-[highlighted]:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            @select="select('rename')"
          >
            <Pencil class="size-4" aria-hidden="true" />修改{{ kind }}名称
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="canDelete"
            :disabled="busy"
            class="flex cursor-default items-center gap-2 rounded-sm px-3 py-2 text-sm text-destructive outline-none data-[highlighted]:bg-destructive/10 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            @select="select('delete')"
          >
            <Trash2 class="size-4" aria-hidden="true" />删除{{ kind }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
</template>
<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { Ellipsis, Pencil, Trash2 } from 'lucide-vue-next'
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuPortal,
  DropdownMenuContent,
  DropdownMenuItem,
} from 'reka-ui'
import AppButton from '@/components/common/AppButton.vue'

defineProps<{
  kind: string
  name: string
  compact?: boolean
  busy?: boolean
  canRename: boolean
  canDelete: boolean
}>()
const emit = defineEmits<{ rename: []; delete: [] }>()
const container = ref<HTMLElement | null>(null)
let selected: 'rename' | 'delete' | null = null
function select(action: 'rename' | 'delete') {
  selected = action
}
async function onCloseAutoFocus(event: Event) {
  const action = selected
  if (!action) return
  selected = null
  event.preventDefault()
  // Release the menu's focus scope before the selected action opens a modal dialog.
  await nextTick()
  if (action === 'rename') emit('rename')
  else emit('delete')
}
function focus() {
  container.value?.querySelector('button')?.focus()
}
defineExpose({ focus })
</script>
