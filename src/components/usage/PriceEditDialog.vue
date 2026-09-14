<template>
  <AppDialog :model-value="modelValue" title="设置模型价格" @update:model-value="close">
    <form ref="form" class="grid gap-4" @submit.prevent="save">
      <p class="text-sm text-muted-foreground">
        CNY / 百万 token。保存后生成新价格版本，仅后续请求使用。请按实际供应商价格填写。
      </p>
      <label class="grid gap-1"
        >模型配置版本<AppSelect v-model="version" :disabled="saving" placeholder="选择模型版本"
          ><option v-for="v in versions" :key="v.versionId" :value="String(v.versionId)">
            {{ v.name }} · v{{ v.versionNo }} · {{ v.modelId }}
          </option></AppSelect
        ></label
      >
      <label class="grid gap-1"
        >未命中输入单价<AppInput
          v-model="input"
          required
          type="number"
          min="0"
          max="99999999"
          step="0.00000001"
      /></label>
      <label class="grid gap-1"
        >缓存命中输入单价<AppInput
          v-model="cached"
          required
          type="number"
          min="0"
          max="99999999"
          step="0.00000001"
      /></label>
      <label class="grid gap-1"
        >输出单价<AppInput
          v-model="output"
          required
          type="number"
          min="0"
          max="99999999"
          step="0.00000001"
      /></label>
      <label class="grid gap-1"
        >单次最大输出 token<AppInput v-model="maxOutput" required type="number" min="1" step="1"
      /></label>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    </form>
    <template #footer
      ><AppButton :disabled="saving" @click="close(false)">取消</AppButton
      ><AppButton tone="primary" :loading="saving" @click="save">保存价格版本</AppButton></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import type { ModelSelectableVersion } from '@/types/model'
import type { UsagePrice } from '@/types/usage'
import { saveUsagePrice } from '@/api/usage'
const props = defineProps<{
  modelValue: boolean
  versions: ModelSelectableVersion[]
  prices: UsagePrice[]
}>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const form = ref<HTMLFormElement | null>(null)
const version = ref(''),
  input = ref(''),
  cached = ref(''),
  output = ref(''),
  maxOutput = ref('8192'),
  error = ref('')
const saving = ref(false)
watch(version, () => {
  const p = props.prices.find((p) => String(p.modelVersionId) === version.value)
  input.value = p ? String(p.inputRate) : ''
  cached.value = p ? String(p.cachedRate) : ''
  output.value = p ? String(p.outputRate) : ''
  maxOutput.value = String(p?.maxOutputTokens ?? 8192)
})
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      version.value = ''
      error.value = ''
    }
  },
)
function close(value: boolean) {
  if (!saving.value) emit('update:modelValue', value)
}
async function save() {
  if (saving.value || !form.value?.reportValidity()) return
  if (!version.value) {
    error.value = '请选择模型版本'
    return
  }
  saving.value = true
  error.value = ''
  try {
    await saveUsagePrice({
      modelVersionId: version.value,
      inputRate: input.value,
      cachedRate: cached.value,
      outputRate: output.value,
      maxOutputTokens: Number(maxOutput.value),
    })
    emit('saved')
    emit('update:modelValue', false)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '保存失败'
  } finally {
    saving.value = false
  }
}
</script>
