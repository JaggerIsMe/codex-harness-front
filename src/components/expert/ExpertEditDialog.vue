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
      <ExpertBindingField
        v-model="form.skillVersionIds"
        title="Skills（绑定固定版本）"
        kind="Skills"
        :options="options"
        :loading="loading"
        :disabled="saving"
      />
      <ExpertBindingField
        v-model="form.mcpBindings"
        title="MCP（绑定固定配置版本）"
        kind="MCP"
        :options="mcpOptions"
        :loading="loading"
        :disabled="saving"
      />
      <fieldset disabled class="rounded-lg border border-dashed p-4 text-muted-foreground">
        <legend class="px-2">知识库</legend>
        <p class="text-sm">暂未接入，后续拓展</p>
      </fieldset>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    </form>
    <template #footer
      ><AppButton :disabled="saving" @click="close">取消</AppButton
      ><AppButton tone="primary" :loading="saving" :disabled="loading" @click="save"
        >保存草稿</AppButton
      ></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import ExpertBindingField from '@/components/expert/ExpertBindingField.vue'
import { getSkillOptions } from '@/api/skill'
import { saveExpert } from '@/api/expert'
import { listSelectableMcpVersions } from '@/api/mcp'
import type { Expert, ExpertDraft, ExpertBindingOption } from '@/types/expert'
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
const options = ref<ExpertBindingOption[]>([])
const mcpOptions = ref<ExpertBindingOption[]>([])
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
    options.value = []
    mcpOptions.value = []
    loading.value = true
    try {
      const [result, mcpResult] = await Promise.all([
        getSkillOptions({ status: 'ENABLED' }, controller.signal),
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
          return [
            { id: latest.id, label: `${skill.skillName} · ${latest.version}`, tag: skill.tag },
          ]
        })
        form.skillVersionIds = [...selected]
        for (const id of selected) {
          if (!options.value.some((option) => option.id === id))
            options.value.push({
              id,
              label: `不可用 Skill 版本 #${id}（保存前需移除）`,
              unavailable: true,
            })
        }
        const selectedMcp = new Set(form.mcpBindings)
        for (const option of mcpResult.data) {
          if (option.previousVersionIds?.some((id) => selectedMcp.has(id))) {
            for (const id of option.previousVersionIds) selectedMcp.delete(id)
            selectedMcp.add(Number(option.versionId))
          }
        }
        form.mcpBindings = [...selectedMcp]
        mcpOptions.value = mcpResult.data.map((option) => ({
          id: Number(option.versionId),
          label: `${option.name} · v${option.versionNo} · ${option.serverCode} · ${option.transportType === 'STDIO' ? 'STDIO' : 'HTTP'}`,
        }))
        for (const id of selectedMcp) {
          if (!mcpOptions.value.some((option) => option.id === id))
            mcpOptions.value.push({
              id,
              label: `不可用 MCP 配置版本 #${id}（保存前需移除）`,
              unavailable: true,
            })
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
  if (saving.value || loading.value) return
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
