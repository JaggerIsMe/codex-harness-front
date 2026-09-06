<template>
  <AppDialog
    :model-value="modelValue"
    :title="expert ? '编辑专家草稿' : '创建专家'"
    width="760px"
    @close="close"
  >
    <form class="space-y-4" @submit.prevent="save">
      <label class="block space-y-2"
        >名称<AppInput v-model="form.name" label="名称" maxlength="128"
      /></label>
      <label class="block space-y-2"
        >描述<AppInput
          v-model="form.description"
          label="描述"
          type="textarea"
          :rows="2"
          maxlength="2000"
      /></label>
      <label class="block space-y-2"
        >系统提示词<AppInput
          v-model="form.systemPrompt"
          label="系统提示词"
          type="textarea"
          :rows="8"
          maxlength="30000"
          placeholder="描述专家职责、工作方式和输出要求"
      /></label>
      <fieldset class="rounded-lg border p-4">
        <legend class="px-2 font-medium">Skills（绑定固定版本）</legend>
        <p v-if="loading" role="status">正在加载 Skills…</p>
        <p v-else-if="!options.length" class="text-sm text-muted-foreground">
          暂无可用 Skills，可先创建不依赖 Skills 的专家。
        </p>
        <label v-for="option in options" :key="option.id" class="flex items-center gap-2 py-1">
          <input v-model="form.skillVersionIds" type="checkbox" :value="option.id" />{{
            option.label
          }}
        </label>
      </fieldset>
      <fieldset class="rounded-lg border p-4">
        <legend class="px-2 font-medium">MCP（绑定固定配置版本）</legend>
        <p v-if="loading" role="status">正在加载 MCP 配置…</p>
        <p v-else-if="!mcpOptions.length" class="text-sm text-muted-foreground">
          暂无可用 MCP 配置，可在“MCP管理”中创建。
        </p>
        <label v-for="option in mcpOptions" :key="option.id" class="flex items-center gap-2 py-1">
          <input v-model="form.mcpBindings" type="checkbox" :value="option.id" />{{ option.label }}
        </label>
      </fieldset>
      <fieldset disabled class="rounded-lg border border-dashed p-4 text-muted-foreground">
        <legend class="px-2">知识库</legend>
        <p class="text-sm">暂未接入，后续拓展</p>
      </fieldset>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    </form>
    <template #footer
      ><AppButton :disabled="saving" @click="close">取消</AppButton
      ><AppButton tone="primary" :loading="saving" @click="save">保存草稿</AppButton></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import { getSkills } from '@/api/skill'
import { saveExpert } from '@/api/expert'
import { listSelectableMcpVersions } from '@/api/mcp'
import type { Expert, ExpertDraft } from '@/types/expert'
const props = defineProps<{ modelValue: boolean; expert: Expert | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
const form = reactive<ExpertDraft>({
  name: '',
  description: '',
  systemPrompt: '',
  skillVersionIds: [],
  mcpBindings: [],
  knowledgeBindings: [],
})
const options = ref<{ id: number; label: string }[]>([])
const mcpOptions = ref<{ id: number; label: string }[]>([])
const loading = ref(false),
  saving = ref(false),
  error = ref('')
watch(
  () => props.modelValue,
  async (open, _, onCleanup) => {
    if (!open) return
    let active = true
    const controller = new AbortController()
    onCleanup(() => {
      active = false
      controller.abort()
    })
    const value = props.expert
    Object.assign(form, {
      name: value?.name || '',
      description: value?.description || '',
      systemPrompt: value?.systemPrompt || '',
      skillVersionIds: [...(value?.skillVersionIds || [])],
      mcpBindings: [...(value?.mcpBindings || [])],
      knowledgeBindings: [],
      revision: value?.revision,
    })
    error.value = ''
    loading.value = true
    try {
      const [result, mcpResult] = await Promise.all([
        getSkills({ status: 'ENABLED' }, controller.signal),
        listSelectableMcpVersions(controller.signal),
      ])
      if (active) {
        const selected = new Set(form.skillVersionIds)
        options.value = result.data.flatMap((skill) => {
          const latest = skill.versions.find((version) => version.status === 'ACTIVE')
          if (!latest) return []
          if (skill.versions.some((version) => selected.has(version.id))) {
            for (const version of skill.versions) selected.delete(version.id)
            selected.add(latest.id)
          }
          return [{ id: latest.id, label: `${skill.skillName} · ${latest.version}` }]
        })
        form.skillVersionIds = options.value
          .filter((option) => selected.has(option.id))
          .map((option) => option.id)
        const selectedMcp = new Set(form.mcpBindings)
        mcpOptions.value = mcpResult.data.map((option) => ({
          id: Number(option.versionId),
          label: `${option.name} · v${option.versionNo} · ${option.serverCode} · ${option.transportType === 'STDIO' ? 'STDIO' : 'HTTP'}`,
        }))
        for (const id of selectedMcp) {
          if (!mcpOptions.value.some((option) => option.id === id))
            mcpOptions.value.push({ id, label: `不可用 MCP 配置版本 #${id}（保存前需取消）` })
        }
      }
    } catch (cause) {
      if (active) error.value = cause instanceof Error ? cause.message : 'Skills 加载失败'
    } finally {
      if (active) loading.value = false
    }
  },
)
function close() {
  if (!saving.value) emit('update:modelValue', false)
}
async function save() {
  if (saving.value) return
  if (!form.name.trim() || !form.systemPrompt.trim()) {
    error.value = '请填写名称和系统提示词'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await saveExpert(props.expert?.id ?? null, { ...form })
    emit('saved')
    emit('update:modelValue', false)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    saving.value = false
  }
}
</script>
