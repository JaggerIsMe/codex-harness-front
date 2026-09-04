<template>
  <AppDialog :model-value="modelValue" title="生成一次性注册码" width="480px" @close="handleClose">
    <div v-if="!result" class="dialog-form-copy">
      <p>注册码仅可成功消费一次，请在有效期内交给目标电脑上的 Harness Agent。</p>
      <AppForm>
        <FormField label="有效时长">
          <input
            type="number"
            class="rounded-md border border-input p-2"
            v-model.number="expiresInMinutes"
            :min="1"
            :max="1440"
            controls-position="right"
          />
          <span class="form-unit">分钟</span>
        </FormField>
      </AppForm>
    </div>
    <div v-else class="enrollment-result">
      <EmptyState
        icon="success"
        title="注册码已生成"
        sub-title="关闭弹窗后仍可重新生成，但当前注册码不会再次展示。"
      />
      <div class="code-box">
        <span>{{ result.enrollmentCode }}</span>
        <AppButton :icon="CopyDocument" label="复制注册码" circle @click="copyCode" />
      </div>
      <p>有效期至 {{ formatDate(result.expiresAt) }}</p>
    </div>
    <template #footer>
      <AppButton @click="handleClose">{{ result ? '完成' : '取消' }}</AppButton>
      <AppButton v-if="!result" tone="primary" :loading="submitting" @click="submit"
        >生成注册码</AppButton
      >
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import type { Enrollment } from '@/types/domain'
import EmptyState from '@/components/common/EmptyState.vue'
import FormField from '@/components/common/FormField.vue'
import AppForm from '@/components/common/AppForm.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import { ref, watch } from 'vue'
import { Copy as CopyDocument } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { createEnrollment } from '../../api/agent'
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
const expiresInMinutes = ref(10)
const submitting = ref(false)
const result = ref<Enrollment | null>(null)

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      expiresInMinutes.value = 10
      result.value = null
    }
  },
)

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '--'
}

async function submit() {
  if (submitting.value) return
  if (
    !Number.isInteger(expiresInMinutes.value) ||
    expiresInMinutes.value < 1 ||
    expiresInMinutes.value > 1440
  ) {
    toast.warning('有效时长应为 1–1440 分钟')
    return
  }
  submitting.value = true
  try {
    const response = await createEnrollment({ expiresInMinutes: expiresInMinutes.value })
    result.value = response.data
  } finally {
    submitting.value = false
  }
}

async function copyCode() {
  await navigator.clipboard.writeText(result.value!.enrollmentCode)
  toast.success('注册码已复制')
}

function handleClose() {
  emit('update:modelValue', false)
}
</script>

<style scoped src="../../assets/styles/management.scss"></style>
