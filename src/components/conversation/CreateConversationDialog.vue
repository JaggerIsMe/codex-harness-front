<template>
  <AppDialog :model-value="modelValue" title="创建 Codex 会话" width="540px" @close="close">
    <AppForm ref="formRef" :model="form" :rules="rules">
      <AppAlert
        type="info"
        :closable="false"
        show-icon
        title="会话继承当前项目的独占目录与 elevated 沙箱边界"
      />
      <FormField label="会话标题" prop="title">
        <AppInput v-model="form.title" maxlength="255" placeholder="例如：修复订单导出问题" />
      </FormField>
      <FormField label="模型（可选）">
        <AppInput v-model="form.model" maxlength="128" placeholder="留空时使用 Agent 默认模型" />
      </FormField>
    </AppForm>
    <template #footer>
      <AppButton @click="close">取消</AppButton>
      <AppButton tone="primary" :loading="submitting" @click="submit">创建并连接</AppButton>
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
import AppButton from '@/components/common/AppButton.vue'
import type { FormRules, FormHandle } from '@/components/common/form'
import { reactive, ref, watch } from 'vue'
import { createConversation } from '../../api/conversation'
const props = defineProps<{ modelValue: boolean; projectId: Id }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  created: [value: Conversation]
}>()
const formRef = ref<FormHandle | null>(null)
const submitting = ref(false)
const form = reactive({ title: '', model: '' })
const rules: FormRules = {}

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    Object.assign(form, { title: '', model: '' })
  },
)

async function submit() {
  if (submitting.value) return
  if (!(await formRef.value?.validate()) || submitting.value) return
  submitting.value = true
  try {
    const response = await createConversation(props.projectId, {
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
