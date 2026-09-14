<template>
  <AppDialog :model-value="modelValue" title="核实未结算请求" @update:model-value="close">
    <form ref="form" class="grid gap-3" @submit.prevent="save">
      <p class="break-all text-sm">{{ record?.requestId }}</p>
      <p class="text-sm text-muted-foreground">
        先结束对应 Turn，再依据供应商记录核实。确认未收费会释放预占；操作将永久记录原因。
      </p>
      <AppSelect v-model="mode" placeholder="选择核实结果"
        ><option value="usage">补录确证用量</option>
        <option value="free">确认未产生费用</option></AppSelect
      >
      <template v-if="mode === 'usage'">
        <label
          >输入 token<AppInput
            v-model="input"
            type="number"
            min="0"
            max="100000000"
            step="1"
            required
        /></label>
        <label
          >其中缓存命中<AppInput
            v-model="cached"
            type="number"
            min="0"
            max="100000000"
            step="1"
            required
        /></label>
        <label
          >输出 token<AppInput
            v-model="output"
            type="number"
            min="0"
            max="100000000"
            step="1"
            required
        /></label>
        <label
          >其中思考 token<AppInput
            v-model="reasoning"
            type="number"
            min="0"
            max="100000000"
            step="1"
            required
        /></label>
      </template>
      <label>核实依据与原因<AppInput v-model="reason" required maxlength="500" /></label>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    </form>
    <template #footer
      ><AppButton :disabled="saving" @click="close(false)">取消</AppButton
      ><AppButton tone="primary" :loading="saving" @click="save"
        >确认核实并结算</AppButton
      ></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppButton from '@/components/common/AppButton.vue'
import type { UsageRecord } from '@/types/usage'
import { resolveUsage } from '@/api/usage'
const props = defineProps<{ modelValue: boolean; record: UsageRecord | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const form = ref<HTMLFormElement | null>(null)
const mode = ref('usage'),
  input = ref(''),
  cached = ref(''),
  output = ref(''),
  reasoning = ref(''),
  reason = ref(''),
  error = ref('')
const saving = ref(false)
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      mode.value = 'usage'
      input.value = ''
      cached.value = ''
      output.value = ''
      reasoning.value = ''
      reason.value = ''
      error.value = ''
    }
  },
)
function close(value: boolean) {
  if (!saving.value) emit('update:modelValue', value)
}
async function save() {
  if (saving.value || !props.record || !form.value?.reportValidity()) return
  if (!reason.value.trim()) {
    error.value = '请填写核实原因'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const noCharge = mode.value === 'free'
    await resolveUsage(props.record.requestId, {
      noCharge,
      reason: reason.value.trim(),
      inputTokens: noCharge ? null : Number(input.value),
      cachedTokens: noCharge ? null : Number(cached.value),
      outputTokens: noCharge ? null : Number(output.value),
      reasoningTokens: noCharge ? null : Number(reasoning.value),
    })
    emit('saved')
    emit('update:modelValue', false)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '核实失败'
  } finally {
    saving.value = false
  }
}
</script>
