<template>
  <AppDialog :model-value="modelValue" title="分配可执行机器" @update:model-value="close">
    <p>{{ user?.displayName }}（{{ user?.username }}）</p>
    <p class="my-3 text-sm text-muted-foreground">
      可选择多台机器。共用机器上的项目和目录仍各自独占。取消勾选会撤销使用权并请求中断相关运行；历史文件保留。
    </p>
    <p v-if="loading" role="status">正在加载机器…</p>
    <div v-else class="grid max-h-80 gap-3 overflow-y-auto">
      <label
        v-for="device in devices"
        :key="device.id"
        class="flex items-center gap-3 rounded border p-3"
      >
        <input v-model="selected" type="checkbox" :value="device.id" :disabled="saving" />
        <span>{{ device.deviceName }} · {{ device.status }}</span>
      </label>
      <p v-if="!devices.length && !error">暂无机器，请先在设备管理中注册机器。</p>
    </div>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <template #footer
      ><AppButton :disabled="saving" @click="close(false)">取消</AppButton
      ><AppButton tone="primary" :disabled="loading || !loaded" :loading="saving" @click="save"
        >保存授权</AppButton
      ></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ManagedUser, Device } from '@/types/domain'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import { assignDevices, getAssignableDevices } from '@/api/user'
const props = defineProps<{ modelValue: boolean; user: ManagedUser | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const devices = ref<Device[]>([]),
  selected = ref<number[]>([]),
  error = ref('')
const loading = ref(false),
  saving = ref(false),
  loaded = ref(false)
watch(
  () => props.modelValue,
  async (open, _, onCleanup) => {
    if (!open) return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    selected.value = [...(props.user?.deviceIds || [])]
    error.value = ''
    loaded.value = false
    loading.value = true
    try {
      const result = await getAssignableDevices(controller.signal)
      if (!controller.signal.aborted) {
        devices.value = result.data
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
    await assignDevices(props.user.id, selected.value)
    emit('update:modelValue', false)
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    saving.value = false
  }
}
</script>
