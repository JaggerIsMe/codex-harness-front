<template>
  <AppDialog :model-value="modelValue" title="设置用户预算" @update:model-value="close">
    <form ref="form" class="grid gap-4" @submit.prevent="save">
      <p>{{ userLabel }}</p>
      <p class="text-sm text-muted-foreground">
        仅适用于托管第三方模型。单位为人民币；留空不限额，0 禁止使用。日/月周期按北京时间划分。
      </p>
      <p v-if="loading">加载中…</p>
      <template v-else>
        <label class="grid gap-1"
          >每日预算（元）<AppInput
            v-model="daily"
            label="每日预算（元）"
            type="number"
            min="0"
            max="99999999"
            step="0.00000001"
            placeholder="不限额"
        /></label>
        <label class="grid gap-1"
          >每月预算（元）<AppInput
            v-model="monthly"
            label="每月预算（元）"
            type="number"
            min="0"
            max="99999999"
            step="0.00000001"
            placeholder="不限额"
        /></label>
        <label class="grid gap-1"
          >同时运行的托管 Turn 数<AppInput
            v-model="concurrent"
            type="number"
            required
            min="1"
            max="100"
            step="1"
        /></label>
      </template>
      <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    </form>
    <template #footer
      ><AppButton :disabled="saving" @click="close(false)">取消</AppButton
      ><AppButton tone="primary" :disabled="loading || !loaded" :loading="saving" @click="save"
        >保存预算</AppButton
      ></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppInput from '@/components/common/AppInput.vue'
import type { Id } from '@/types/domain'
import { getQuotaPolicy, saveQuotaPolicy } from '@/api/usage'
const props = defineProps<{ modelValue: boolean; userId: Id | null; userLabel: string }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const form = ref<HTMLFormElement | null>(null)
const daily = ref(''),
  monthly = ref(''),
  concurrent = ref('1'),
  error = ref('')
const saving = ref(false),
  loading = ref(false),
  loaded = ref(false)
let controller: AbortController | null = null
watch(
  () => [props.modelValue, props.userId] as const,
  async ([open, id]) => {
    controller?.abort()
    loaded.value = false
    if (!open || id == null) return
    const active = new AbortController()
    controller = active
    loading.value = true
    error.value = ''
    try {
      const { data } = await getQuotaPolicy(id, active.signal)
      if (active.signal.aborted) return
      daily.value = data.dailyBudget == null ? '' : String(data.dailyBudget)
      monthly.value = data.monthlyBudget == null ? '' : String(data.monthlyBudget)
      concurrent.value = String(data.maxConcurrentTurns)
      loaded.value = true
    } catch (e) {
      if (!active.signal.aborted) error.value = e instanceof Error ? e.message : '加载失败'
    } finally {
      if (!active.signal.aborted) loading.value = false
    }
  },
)
onBeforeUnmount(() => controller?.abort())
function close(value: boolean) {
  if (!saving.value) emit('update:modelValue', value)
}
async function save() {
  if (saving.value || !loaded.value || props.userId == null || !form.value?.reportValidity()) return
  saving.value = true
  error.value = ''
  try {
    await saveQuotaPolicy(props.userId, {
      dailyBudget: daily.value === '' ? null : daily.value,
      monthlyBudget: monthly.value === '' ? null : monthly.value,
      maxConcurrentTurns: Number(concurrent.value),
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
