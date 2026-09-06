<template>
  <AppDialog
    :model-value="modelValue"
    :title="configuration ? '编辑模型并发布新版本' : '添加第三方模型'"
    width="680px"
    @close="close"
  >
    <form class="space-y-4" @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="space-y-2">名称<AppInput v-model="form.name" maxlength="128" /></label
        ><label class="space-y-2"
          >配置编码<AppInput
            v-model="form.configurationCode"
            maxlength="64"
            placeholder="deepseek_v4_flash"
        /></label>
      </div>
      <label class="block space-y-2"
        >Provider 名称<AppInput v-model="form.providerName" maxlength="128" placeholder="DeepSeek"
      /></label>
      <label class="block space-y-2"
        >API Base URL<AppInput v-model="form.baseUrl" placeholder="https://api.example.com/v1"
      /></label>
      <label class="block space-y-2"
        >模型 ID<AppInput
          v-model="form.modelId"
          maxlength="128"
          placeholder="DeepSeek-V4-Flash-Vision-Exp"
      /></label>
      <label class="block space-y-2"
        >API Key<AppInput
          v-model="form.apiKey"
          type="password"
          maxlength="4096"
          placeholder="保存后仅显示掩码；编辑时需重新填写"
      /></label>
      <label class="flex items-center gap-2"
        ><input v-model="vision" type="checkbox" />支持图片输入</label
      >
      <label class="block space-y-2"
        >上下文窗口（Token）<AppInput
          v-model="contextWindowTokens"
          type="number"
          min="1024"
          max="2000000"
      /></label>
      <label class="block space-y-2"
        >描述<AppInput v-model="form.description" type="textarea" :rows="2" maxlength="2000"
      /></label>
      <p class="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        每次编辑都会创建不可变版本；API Key 加密保存，只会下发给被绑定 Device 的 Agent。
      </p>
      <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>
    </form>
    <template #footer
      ><AppButton :disabled="saving" @click="close">取消</AppButton
      ><AppButton tone="primary" :loading="saving" @click="save">{{
        configuration ? '发布新版本' : '创建'
      }}</AppButton></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import { saveModelConfiguration } from '@/api/model'
import type { ModelConfiguration, ModelConfigurationDraft } from '@/types/model'
const props = defineProps<{ modelValue: boolean; configuration: ModelConfiguration | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const empty = (): ModelConfigurationDraft => ({
  configurationCode: '',
  name: '',
  description: '',
  providerName: '',
  baseUrl: '',
  modelId: '',
  inputModalities: ['TEXT'],
  contextWindowTokens: 128000,
  apiKey: '',
})
const form = reactive<ModelConfigurationDraft>(empty())
const vision = ref(false)
const contextWindowTokens = ref('128000')
const saving = ref(false)
const error = ref('')
watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const c = props.configuration
    Object.assign(
      form,
      c
        ? {
            configurationCode: c.configurationCode,
            name: c.name,
            description: c.description,
            providerName: c.runtime.providerName,
            baseUrl: c.runtime.baseUrl,
            modelId: c.runtime.modelId,
            inputModalities: c.runtime.inputModalities,
            contextWindowTokens: c.runtime.contextWindowTokens,
            apiKey: '',
            revision: c.revision,
          }
        : empty(),
    )
    vision.value = Boolean(c?.runtime.inputModalities.includes('IMAGE'))
    contextWindowTokens.value = String(c?.runtime.contextWindowTokens ?? 128000)
    error.value = ''
  },
)
function close() {
  if (!saving.value) emit('update:modelValue', false)
}
async function save() {
  if (saving.value) return
  if (
    !form.name.trim() ||
    !form.configurationCode.trim() ||
    !form.providerName.trim() ||
    !form.baseUrl.trim() ||
    !form.modelId.trim() ||
    !form.apiKey.trim() ||
    !Number.isInteger(Number(contextWindowTokens.value)) ||
    Number(contextWindowTokens.value) < 1024 ||
    Number(contextWindowTokens.value) > 2000000
  ) {
    error.value = '请完整填写模型连接信息，并确认上下文窗口在 1024 到 2000000 Token 之间'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await saveModelConfiguration(props.configuration?.id ?? null, {
      ...form,
      inputModalities: vision.value ? ['TEXT', 'IMAGE'] : ['TEXT'],
      contextWindowTokens: Number(contextWindowTokens.value),
    })
    emit('saved')
    emit('update:modelValue', false)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    saving.value = false
  }
}
</script>
