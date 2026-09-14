<template>
  <div class="w-full min-w-0 space-y-4 p-4 md:p-6">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">工作流画布</h1>
        <p class="text-sm text-muted-foreground">自定义 Expert、职责和条件路径，按连线串行执行。</p>
      </div>
      <div v-if="!canvasFullscreen" class="flex flex-wrap gap-2">
        <RouterLink
          :to="{ name: 'project-orchestrations', params: { projectId } }"
          :class="buttonVariants({ variant: 'outline' })"
          >返回编排</RouterLink
        ><AppButton :disabled="loading || submitting" @click="saveDraft">保存草稿</AppButton
        ><AppButton
          tone="primary"
          :disabled="loading || !enabled"
          :loading="submitting"
          @click="submit"
          >创建并执行</AppButton
        >
      </div>
    </header>
    <p v-if="loading" role="status">正在加载工作流…</p>
    <p v-if="!loading && !enabled && !error" role="status">多 Expert 编排尚未启用。</p>
    <p v-if="error" role="alert" class="whitespace-pre-line text-sm text-destructive">
      {{ error }}
    </p>
    <p v-if="notice" role="status" class="text-sm text-muted-foreground">{{ notice }}</p>
    <fieldset :disabled="loading || submitting || !enabled" class="min-w-0 space-y-4">
      <div class="grid gap-3 md:grid-cols-2">
        <FormField label="编排名称"
          ><AppInput v-model="title" label="编排名称" maxlength="120" placeholder="为工作流命名"
        /></FormField>
        <FormField label="工作流目标（按需通过变量引用）"
          ><AppInput
            v-model="goal"
            label="工作流目标"
            type="textarea"
            :rows="2"
            maxlength="12000"
            placeholder="填写此次工作流的目标"
        /></FormField>
      </div>
    </fieldset>
    <WorkflowWorkspace
      v-model="workflow"
      :selected-id="selectedId"
      :disabled="loading || submitting || !enabled"
      @select="selectedId = $event"
      @fullscreen-change="canvasFullscreen = $event"
    >
      <template #actions="{ fullscreen }">
        <AppButton :disabled="workflow.nodes.length >= 41" @click="add('EXPERT')"
          >添加 Expert 节点</AppButton
        ><AppButton :disabled="workflow.nodes.length >= 41" @click="add('BRANCH')"
          >添加条件节点</AppButton
        ><AppButton :disabled="workflow.nodes.length >= 41" @click="add('END')"
          >添加结束节点</AppButton
        ><AppButton v-if="fullscreen" @click="saveDraft">保存草稿</AppButton>
        <span class="self-center text-xs text-muted-foreground"
          >{{ workflow.nodes.length - 1 }}/40 个流程节点 · 默认 1 个开始节点 · 最后一个 Expert
          不连接出口即结束</span
        >
      </template>
      <template #status>
        <p v-if="error" role="alert" class="whitespace-pre-line text-sm text-destructive">
          {{ error }}
        </p>
        <p v-if="notice" role="status" class="text-sm text-muted-foreground">{{ notice }}</p>
      </template>
      <template v-if="selected" #inspector>
        <WorkflowNodeInspector
          :node="selected"
          :workflow="workflow"
          :experts="experts"
          :project-id="projectId"
          @change="update"
          @remove="remove"
          @close="selectedId = ''"
        />
      </template>
    </WorkflowWorkspace>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { Workflow, WorkflowNode, CreateOrchestration } from '@/types/orchestration'
import type { ProjectExpert } from '@/types/expert'
import { getProjectExperts } from '@/api/expert'
import { createOrchestration, getOrchestration, orchestrationAvailable } from '@/api/orchestration'
import { useAuthStore } from '@/stores/auth'
import { createWorkflow, withStartNode, removeNode, validateWorkflow } from '@/utils/workflow'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import FormField from '@/components/common/FormField.vue'
import { buttonVariants } from '@/components/ui/button'
import WorkflowWorkspace from '@/components/orchestration/WorkflowWorkspace.vue'
import WorkflowNodeInspector from '@/components/orchestration/WorkflowNodeInspector.vue'
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore()
const projectId = computed(() => Number(route.params.projectId))
const workflow = ref<Workflow>(createWorkflow())
const canvasFullscreen = ref(false)
const selectedId = ref(''),
  title = ref(''),
  goal = ref(''),
  error = ref(''),
  notice = ref('')
const loading = ref(false),
  submitting = ref(false),
  enabled = ref(false),
  experts = ref<ProjectExpert[]>([])
const selected = computed(() => workflow.value.nodes.find((n) => n.id === selectedId.value))
const draftKey = computed(() => `harness-workflow-draft:${auth.user?.id}:${projectId.value}`)
let requestKey = '',
  fingerprint = '',
  generation = 0
watch(
  () => [projectId.value, route.query.copy],
  async (_, __, cleanup) => {
    const version = ++generation,
      controller = new AbortController()
    cleanup(() => {
      controller.abort()
      generation++
    })
    workflow.value = createWorkflow()
    title.value = ''
    goal.value = ''
    selectedId.value = ''
    error.value = ''
    notice.value = ''
    enabled.value = false
    experts.value = []
    requestKey = ''
    fingerprint = ''
    loading.value = true
    try {
      const [available, list] = await Promise.all([
        orchestrationAvailable(projectId.value, controller.signal),
        getProjectExperts(projectId.value, controller.signal),
      ])
      if (version !== generation) return
      enabled.value = available.data
      experts.value = list.data.experts
      if (typeof route.query.copy === 'string') {
        const source = await getOrchestration(projectId.value, route.query.copy, controller.signal)
        if (version !== generation) return
        if (!source.data.workflow) throw new Error('旧版执行不提供固定模板，请从空画布创建')
        workflow.value = withStartNode(source.data.workflow)
        title.value = source.data.title
        goal.value = source.data.goal
        notice.value = '已复制工作流，修改后创建新的执行。'
      } else restoreDraft()
    } catch (cause) {
      if (!controller.signal.aborted && version === generation)
        error.value = cause instanceof Error ? cause.message : '加载失败'
    } finally {
      if (version === generation) loading.value = false
    }
  },
  { immediate: true },
)
function add(kind: Exclude<WorkflowNode['kind'], 'START'>) {
  if (workflow.value.nodes.length >= 41) return
  const count = workflow.value.nodes.length,
    id = `n_${crypto.randomUUID().replaceAll('-', '')}`
  const node: WorkflowNode = {
    id,
    kind,
    name: `${kind === 'EXPERT' ? '任务' : kind === 'END' ? '结束' : '条件'} ${count}`,
    expertId: null,
    objective: '',
    next: null,
    condition:
      kind === 'BRANCH'
        ? {
            sourceNodeId: '',
            operator: 'EQUALS',
            pointer: '',
            value: '',
            whenTrue: null,
            whenFalse: null,
          }
        : null,
    x: 350 + ((count - 1) % 3) * 310,
    y: 40 + Math.floor((count - 1) / 3) * 250,
  }
  workflow.value = {
    ...workflow.value,
    nodes: [
      ...workflow.value.nodes.map((n) =>
        count === 1 && n.kind === 'START' ? { ...n, next: id } : n,
      ),
      node,
    ],
  }
  selectedId.value = id
}
function update(node: WorkflowNode) {
  workflow.value = {
    ...workflow.value,
    schemaVersion: 4,
    nodes: workflow.value.nodes.map((n) => (n.id === node.id ? node : n)),
  }
}
function remove() {
  workflow.value = removeNode(workflow.value, selectedId.value)
  selectedId.value = ''
}
function saveDraft() {
  try {
    localStorage.setItem(
      draftKey.value,
      JSON.stringify({
        title: title.value,
        goal: goal.value,
        workflow: workflow.value,
        requestKey,
        fingerprint,
      }),
    )
    notice.value = '草稿已保存到当前浏览器。'
    return true
  } catch {
    error.value = '浏览器无法保存草稿，请检查存储空间或权限。'
    return false
  }
}
function restoreDraft() {
  try {
    const raw = localStorage.getItem(draftKey.value)
    if (!raw) return
    const draft = JSON.parse(raw) as {
      title: string
      goal: string
      workflow: Workflow
      requestKey?: string
      fingerprint?: string
    }
    if (
      typeof draft.title !== 'string' ||
      typeof draft.goal !== 'string' ||
      ![2, 3, 4].includes(draft.workflow?.schemaVersion) ||
      !Array.isArray(draft.workflow.nodes) ||
      draft.workflow.nodes.length > (draft.workflow.schemaVersion === 4 ? 41 : 40)
    )
      throw new Error()
    // Check shape before handing saved browser data to the canvas.
    for (const n of draft.workflow.nodes)
      if (
        !n ||
        typeof n.id !== 'string' ||
        typeof n.name !== 'string' ||
        typeof n.objective !== 'string' ||
        !Number.isFinite(n.x) ||
        !Number.isFinite(n.y) ||
        n.x < 0 ||
        n.y < 0 ||
        n.x > 10000 ||
        n.y > 10000 ||
        !['START', 'EXPERT', 'BRANCH', 'END'].includes(n.kind) ||
        (n.kind === 'BRANCH' && !n.condition)
      )
        throw new Error()
    title.value = draft.title
    goal.value = draft.goal
    const starts = draft.workflow.nodes.filter((n) => n.kind === 'START')
    if (starts.length > 1 || (starts.length === 1 && starts[0]!.id !== draft.workflow.startNodeId))
      throw new Error()
    workflow.value = withStartNode(draft.workflow)
    requestKey = typeof draft.requestKey === 'string' ? draft.requestKey : ''
    fingerprint = typeof draft.fingerprint === 'string' ? draft.fingerprint : ''
    notice.value = '已恢复当前浏览器中的工作流草稿。'
  } catch {
    notice.value = '本地草稿不可用，请重新编辑。'
  }
}
async function submit() {
  if (submitting.value || loading.value || !enabled.value) return
  const issues = validateWorkflow(workflow.value)
  if (!title.value.trim() || !goal.value.trim()) issues.unshift('请填写编排名称和工作流目标')
  if (
    workflow.value.nodes.some(
      (n) =>
        n.kind === 'EXPERT' &&
        !experts.value.some((e) => String(e.expertId) === String(n.expertId) && e.available),
    )
  )
    issues.push('请为所有 Expert 节点选择可用的项目专家')
  if (issues.length) {
    error.value = issues.join('\n')
    return
  }
  const content = JSON.stringify({ title: title.value, goal: goal.value, workflow: workflow.value })
  if (content !== fingerprint || !requestKey) {
    fingerprint = content
    requestKey = crypto.randomUUID()
  }
  if (!saveDraft()) return
  const input: CreateOrchestration = { ...JSON.parse(content), requestKey }
  const version = generation,
    pid = projectId.value,
    key = draftKey.value
  submitting.value = true
  error.value = ''
  try {
    const result = await createOrchestration(pid, input)
    if (version !== generation) return
    localStorage.removeItem(key)
    await router.push({
      name: 'project-orchestrations',
      params: { projectId: pid },
      query: { execution: result.data.id },
    })
  } catch (cause) {
    if (version === generation)
      error.value = cause instanceof Error ? cause.message : '创建失败；重试将使用相同请求标识'
  } finally {
    submitting.value = false
  }
}
</script>
