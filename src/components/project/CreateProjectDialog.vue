<template>
  <AppDialog :model-value="modelValue" title="创建项目" @update:model-value="close">
    <form id="create-project-form" class="grid gap-4" @submit.prevent="submit">
      <label class="grid gap-2"
        >项目名称
        <AppInput
          v-model="projectName"
          label="项目名称"
          required
          maxlength="128"
          placeholder="例如：订单服务"
        />
      </label>
      <label class="grid gap-2"
        >可执行机器
        <AppSelect v-model="deviceId" :disabled="loading || submitting" required>
          <option value="">请选择机器</option>
          <option
            v-for="device in devices"
            :key="device.id"
            :value="String(device.id)"
            :disabled="!ready(device)"
          >
            {{ device.deviceName }} · {{ ready(device) ? '可用' : '离线或尚未配置执行环境' }}
          </option>
        </AppSelect>
      </label>
      <p v-if="loading" role="status">正在加载已分配机器…</p>
      <p v-else-if="!devices.length" class="text-sm text-muted-foreground">
        暂无已分配机器，请联系管理员分配。
      </p>
      <p class="text-sm text-muted-foreground">
        平台会自动准备项目独占目录，目录就绪后即可开始会话。
      </p>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    </form>
    <template #footer>
      <AppButton :disabled="submitting" @click="close(false)">取消</AppButton>
      <AppButton
        tone="primary"
        :loading="submitting"
        :disabled="loading || !deviceId"
        @click="submit"
        >创建项目</AppButton
      >
    </template>
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Project, ExecutableDevice } from '@/types/domain'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppButton from '@/components/common/AppButton.vue'
import { getExecutableDevices, createProject } from '@/api/project'
import { useProjectStore } from '@/stores/project'
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [value: Project] }>()
const store = useProjectStore()
const devices = ref<ExecutableDevice[]>([])
const projectName = ref('')
const deviceId = ref('')
const requestKey = ref('')
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const ready = (d: ExecutableDevice) =>
  d.status === 'ONLINE' && d.isolationMode === 'WINDOWS_PROJECT_PROFILE' && d.provisioningAvailable
watch(
  () => props.modelValue,
  async (open, _, onCleanup) => {
    if (!open) return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    projectName.value = ''
    deviceId.value = ''
    error.value = ''
    devices.value = []
    requestKey.value = crypto.randomUUID()
    loading.value = true
    try {
      const result = await getExecutableDevices(controller.signal)
      if (!controller.signal.aborted) devices.value = result.data
    } catch (cause) {
      if (!controller.signal.aborted)
        error.value = cause instanceof Error ? cause.message : '机器加载失败'
    } finally {
      if (!controller.signal.aborted) loading.value = false
    }
  },
)
// Changing the intended project starts a new idempotent request; network retries keep the same key.
watch([projectName, deviceId], () => {
  requestKey.value = crypto.randomUUID()
})
function close(open: boolean) {
  if (!submitting.value) emit('update:modelValue', open)
}
async function submit() {
  if (submitting.value) return
  if (!projectName.value.trim() || !deviceId.value) {
    error.value = '请填写项目名称并选择机器'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    const result = await createProject({
      projectName: projectName.value.trim(),
      deviceId: Number(deviceId.value),
      requestKey: requestKey.value,
    })
    store.upsertProject(result.data)
    emit('created', result.data)
    emit('update:modelValue', false)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '创建失败'
  } finally {
    submitting.value = false
  }
}
</script>
