<template>
  <AppDialog :model-value="modelValue" title="创建 Codex 会话" width="540px" @close="close">
    <AppForm ref="formRef" :model="form" :rules="rules">
      <AppAlert
        type="info"
        :closable="false"
        show-icon
        title="会话继承当前项目的独占目录与 elevated 沙箱边界"
      />
      <FormField label="会话专家" prop="expertId">
        <AppSelect v-model="form.expertId" :disabled="loadingExperts">
          <option value="" disabled>请选择专家</option>
          <option v-for="expert in experts" :key="expert.expertId" :value="String(expert.expertId)">
            {{ expert.name }} · v{{ expert.versionNo }}
          </option>
        </AppSelect>
        <p v-if="!loadingExperts && !experts.length" class="mt-2 text-sm text-destructive">
          当前项目没有可用专家，请先由管理员分配专家并在项目中启用。
        </p>
        <p v-if="expertError" class="mt-2 text-sm text-destructive" role="alert">
          {{ expertError }}
        </p>
      </FormField>
      <FormField label="会话标题" prop="title">
        <AppInput v-model="form.title" maxlength="255" placeholder="例如：修复订单导出问题" />
      </FormField>
      <FormField label="模型（可选）">
        <AppInput v-model="form.model" maxlength="128" placeholder="留空时使用 Agent 默认模型" />
      </FormField>
    </AppForm>
    <template #footer>
      <AppButton @click="close">取消</AppButton>
      <AppButton
        tone="primary"
        :loading="submitting"
        :disabled="loadingExperts || !form.expertId"
        @click="submit"
        >创建并连接</AppButton
      >
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import type { Conversation, Id } from '@/types/domain'
import AppAlert from '@/components/common/AppAlert.vue'
import FormField from '@/components/common/FormField.vue'
import AppForm from '@/components/common/AppForm.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppButton from '@/components/common/AppButton.vue'
import type { FormRules, FormHandle } from '@/components/common/form'
import { reactive, ref, watch } from 'vue'
import { createConversation } from '../../api/conversation'
import { getProjectExperts } from '@/api/expert'
import type { ProjectExpert } from '@/types/expert'
const props = defineProps<{ modelValue: boolean; projectId: Id }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [value: Conversation]
}>()
const formRef = ref<FormHandle | null>(null)
const submitting = ref(false)
const loadingExperts = ref(false)
const expertError = ref('')
const experts = ref<ProjectExpert[]>([])
const form = reactive({ expertId: '', title: '', model: '' })
const rules: FormRules = {}

watch(
  () => props.modelValue,
  async (visible, _, onCleanup) => {
    if (!visible) return
    Object.assign(form, { expertId: '', title: '', model: '' })
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    loadingExperts.value = true
    expertError.value = ''
    try {
      const response = await getProjectExperts(props.projectId, controller.signal)
      if (!controller.signal.aborted) {
        experts.value = response.data.experts.filter((item) => item.available)
        if (experts.value.length === 1) form.expertId = String(experts.value[0].expertId)
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        expertError.value = cause instanceof Error ? cause.message : '专家加载失败'
    } finally {
      if (!controller.signal.aborted) loadingExperts.value = false
    }
  },
)

async function submit() {
  if (submitting.value || !form.expertId) return
  if (!(await formRef.value?.validate()) || submitting.value) return
  submitting.value = true
  try {
    const response = await createConversation(props.projectId, {
      expertId: Number(form.expertId),
      title: form.title.trim() || undefined,
      model: form.model.trim() || undefined,
    })
    emit('created', response.data)
    close()
  } finally {
    submitting.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}
</script>
