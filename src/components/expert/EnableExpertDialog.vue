<template>
  <AppDialog :model-value="modelValue" title="启用项目专家" @close="close">
    <p class="mb-4">将「{{ expert?.name }}」启用到项目，项目内所有会话均可选择。</p>
    <label class="block space-y-2"
      >项目<AppSelect v-model="projectId" :disabled="busy || loading" placeholder="选择项目"
        ><option v-for="project in projects" :key="project.id" :value="String(project.id)">
          {{ project.projectName }}
        </option></AppSelect
      ></label
    >
    <p v-if="loading" role="status" class="mt-3">正在加载项目…</p>
    <p v-else-if="!projects.length" class="mt-3 text-muted-foreground">
      暂无可用项目，请先创建项目并等待准备完成。
    </p>
    <div class="mt-3 flex items-center gap-2">
      <AppInput
        v-model="projectSearch"
        maxlength="200"
        placeholder="搜索项目"
        @keyup.enter="searchProjects"
      />
      <AppButton :loading="loading" @click="searchProjects">搜索</AppButton>
      <AppButton v-if="hasMore" :loading="loading" @click="query.loadMore()"
        >加载更多项目</AppButton
      >
    </div>
    <p v-if="queryError" role="alert" class="mt-3 text-destructive">
      {{ queryError }} <AppButton link @click="query.retry()">重试</AppButton>
    </p>
    <p class="mt-3 text-sm text-muted-foreground">
      已启用同一专家时将升级到市场发布版本。兼容链完整的既有会话会自动原地升级；其他既有会话保留旧版本。Skills
      在首次执行时下载和校验。
    </p>
    <p v-if="error" role="alert" class="mt-3 text-destructive">{{ error }}</p>
    <template #footer
      ><AppButton :disabled="busy" @click="close">取消</AppButton
      ><AppButton tone="primary" :loading="busy" :disabled="!projectId || loading" @click="enable"
        >启用 / 升级</AppButton
      ></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppInput from '@/components/common/AppInput.vue'
import { getProject } from '@/api/project'
import { useProjectQuery } from '@/composables/useProjectQuery'
import { getProjectExperts, bindExpert } from '@/api/expert'
import type { Id } from '@/types/domain'
import type { Expert } from '@/types/expert'
const props = defineProps<{
  modelValue: boolean
  expert: Expert | null
  initialProjectId?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; enabled: [projectId: Id] }>()
const query = useProjectQuery()
const { loading, error: queryError, hasMore } = query
const projects = computed(() =>
  query.items.value.filter((p) => p.status === 'ACTIVE' && p.provisioningStatus === 'READY'),
)
const projectSearch = ref('')
function searchProjects() {
  projectId.value = ''
  void query.search(projectSearch.value)
}
const projectId = ref(''),
  busy = ref(false),
  error = ref('')
watch(
  () => props.modelValue,
  async (open, _, cleanup) => {
    if (!open) return
    let active = true
    const selectionController = new AbortController()
    cleanup(() => {
      active = false
      query.cancel()
      selectionController.abort()
    })
    error.value = ''
    projectSearch.value = ''
    projectId.value = props.initialProjectId || ''
    try {
      await query.search()
      if (
        active &&
        projectId.value &&
        !query.items.value.some((item) => String(item.id) === projectId.value)
      ) {
        const result = await getProject(projectId.value, selectionController.signal)
        if (active) query.items.value = [result.data, ...query.items.value]
      }
    } catch (cause) {
      if (active) error.value = cause instanceof Error ? cause.message : '项目加载失败'
    }
  },
)
function close() {
  if (!busy.value) emit('update:modelValue', false)
}
async function enable() {
  if (busy.value || !projectId.value || !props.expert?.publishedVersionId) return
  busy.value = true
  error.value = ''
  const id = projectId.value,
    version = props.expert.publishedVersionId
  try {
    const state = await getProjectExperts(id)
    await bindExpert(id, version, state.data.projectRevision)
    toast.success('项目专家已启用')
    emit('enabled', id)
    emit('update:modelValue', false)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '启用失败'
  } finally {
    busy.value = false
  }
}
</script>
