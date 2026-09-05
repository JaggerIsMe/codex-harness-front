<template>
  <AppDialog :model-value="modelValue" title="分配专家" @update:model-value="close">
    <p>{{ user?.displayName }}（{{ user?.username }}）</p>
    <p class="my-3 text-sm text-muted-foreground">
      用户只能在专家市场和自己的项目中使用已分配的专家。取消分配后，该用户已有会话也不能继续使用对应专家。
    </p>
    <p v-if="loading" role="status">正在加载专家…</p>
    <div v-else class="grid max-h-80 gap-3 overflow-y-auto">
      <label
        v-for="expert in experts"
        :key="expert.id"
        class="flex items-start gap-3 rounded border p-3"
      >
        <input v-model="selected" type="checkbox" :value="Number(expert.id)" :disabled="saving" />
        <span
          ><strong>{{ expert.name }}</strong
          ><span class="block text-sm text-muted-foreground">{{ expert.description }}</span></span
        >
      </label>
      <p v-if="!experts.length && !error">暂无已发布专家，请先在专家管理中发布。</p>
    </div>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <template #footer>
      <AppButton :disabled="saving" @click="close(false)">取消</AppButton>
      <AppButton tone="primary" :disabled="loading || !loaded" :loading="saving" @click="save"
        >保存分配</AppButton
      >
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ManagedUser } from '@/types/domain'
import type { Expert } from '@/types/expert'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import { assignExperts } from '@/api/user'
import { listExperts } from '@/api/expert'

const props = defineProps<{ modelValue: boolean; user: ManagedUser | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const experts = ref<Expert[]>([])
const selected = ref<number[]>([])
const error = ref('')
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)

watch(
  () => props.modelValue,
  async (open, _, onCleanup) => {
    if (!open) return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    selected.value = [...(props.user?.expertIds || [])]
    error.value = ''
    loaded.value = false
    loading.value = true
    try {
      const response = await listExperts(true, '', controller.signal)
      if (!controller.signal.aborted) {
        experts.value = response.data.filter((item) => item.status === 'PUBLISHED')
        const available = new Set(experts.value.map((item) => Number(item.id)))
        selected.value = selected.value.filter((id) => available.has(id))
        loaded.value = true
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        error.value = cause instanceof Error ? cause.message : '加载失败'
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  },
)

function close(value: boolean) {
  if (!saving.value) emit('update:modelValue', value)
}

async function save() {
  if (saving.value || !props.user || !loaded.value) return
  saving.value = true
  error.value = ''
  try {
    await assignExperts(props.user.id, selected.value)
    emit('update:modelValue', false)
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    saving.value = false
  }
}
</script>
