<template>
  <AppDialog
    :model-value="modelValue"
    :title="`配置 ${device?.deviceName || ''} 的全局模型`"
    width="620px"
    @close="close"
  >
    <div class="space-y-4">
      <p class="text-sm text-muted-foreground">
        新 Turn 使用所选版本；已有 Conversation 会重启其独立 App Server 并恢复原 Codex thread。
      </p>
      <label class="block space-y-2"
        >模型版本<AppSelect v-model="selected"
          ><option value="" disabled>请选择模型版本</option>
          <option v-for="v in versions" :key="v.versionId" :value="String(v.versionId)">
            {{ v.name }} · {{ v.modelId }} · v{{ v.versionNo
            }}{{ v.inputModalities.includes('IMAGE') ? ' · Vision' : '' }}
          </option></AppSelect
        ></label
      >
      <p v-if="device && !device.managedModels" class="text-sm text-destructive">
        该 Agent 版本尚未声明托管模型能力，请先升级并重新连接。
      </p>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    </div>
    <template #footer
      ><AppButton v-if="assignment" tone="danger" :disabled="saving" @click="remove"
        >取消绑定</AppButton
      ><AppButton @click="close">关闭</AppButton
      ><AppButton
        tone="primary"
        :loading="saving"
        :disabled="!selected || !device?.managedModels"
        @click="save"
        >保存</AppButton
      ></template
    >
  </AppDialog>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppButton from '@/components/common/AppButton.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import type { Device } from '@/types/domain'
import type { DeviceModelAssignment, ModelSelectableVersion } from '@/types/model'
import {
  assignDeviceModel,
  getDeviceModelAssignment,
  listSelectableModelVersions,
  unassignDeviceModel,
} from '@/api/model'
const props = defineProps<{ modelValue: boolean; device: Device | null }>()
const emit = defineEmits<{ 'update:modelValue': [boolean]; saved: [] }>()
const versions = ref<ModelSelectableVersion[]>([])
const assignment = ref<DeviceModelAssignment | null>(null)
const selected = ref('')
const saving = ref(false)
const error = ref('')
watch(
  () => props.modelValue,
  async (open, _, onCleanup) => {
    if (!open || !props.device) return
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    error.value = ''
    try {
      const [v, a] = await Promise.all([
        listSelectableModelVersions(controller.signal),
        getDeviceModelAssignment(props.device.id, controller.signal),
      ])
      versions.value = v.data
      assignment.value = a.data
      selected.value = a.data ? String(a.data.modelConfigurationVersionId) : ''
    } catch (cause) {
      if (!controller.signal.aborted)
        error.value = cause instanceof Error ? cause.message : '加载失败'
    }
  },
)
function close() {
  if (!saving.value) emit('update:modelValue', false)
}
async function save() {
  if (!props.device || !selected.value) return
  saving.value = true
  try {
    await assignDeviceModel(
      props.device.id,
      Number(selected.value),
      assignment.value?.revision ?? 0,
    )
    emit('saved')
    close()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    saving.value = false
  }
}
async function remove() {
  if (!props.device || !assignment.value) return
  saving.value = true
  try {
    await unassignDeviceModel(props.device.id, assignment.value.revision)
    emit('saved')
    close()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '取消绑定失败'
  } finally {
    saving.value = false
  }
}
</script>
