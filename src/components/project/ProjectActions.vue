<template>
  <ResourceActionsMenu
    ref="menu"
    kind="项目"
    :name="project.projectName"
    :compact="compact"
    :busy="deleting || renameVisible"
    :can-rename="auth.can('project:update')"
    :can-delete="auth.can('project:delete')"
    @rename="renameVisible = true"
    @delete="remove"
  />
  <RenameProjectDialog
    v-if="renameVisible"
    v-model="renameVisible"
    :project="project"
    @saved="emit('changed')"
  />
</template>
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import type { Project } from '@/types/domain'
import ResourceActionsMenu from '@/components/common/ResourceActionsMenu.vue'
import RenameProjectDialog from '@/components/project/RenameProjectDialog.vue'
import { useProjectConversationActions } from '@/composables/useProjectConversationActions'
import { useAuthStore } from '@/stores/auth'
import { confirmAction } from '@/lib/confirm'

const props = defineProps<{ project: Project; compact?: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const auth = useAuthStore()
const { removeProject } = useProjectConversationActions()
const menu = ref<InstanceType<typeof ResourceActionsMenu> | null>(null)
const renameVisible = ref(false)
const deleting = ref(false)
watch(renameVisible, async (open) => {
  if (!open) {
    await nextTick()
    menu.value?.focus()
  }
})
async function remove() {
  if (deleting.value || !auth.can('project:delete')) return
  const project = props.project
  deleting.value = true
  try {
    if (
      !(await confirmAction(
        `确定删除项目“${project.projectName}”及其全部会话和消息记录？`,
        '删除项目',
        '此操作无法撤销，请先自行下载保留项目文件。',
      ))
    )
      return
    await removeProject(project)
    toast.success('项目已删除')
    emit('changed')
  } catch (cause) {
    toast.error(cause instanceof Error ? cause.message : '删除项目失败')
  } finally {
    deleting.value = false
    await nextTick()
    menu.value?.focus()
  }
}
</script>
