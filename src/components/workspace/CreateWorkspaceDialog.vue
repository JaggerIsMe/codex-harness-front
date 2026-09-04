<template>
  <AppDialog :model-value="modelValue" title="新建工作区" width="520px" @close="close">
    <div class="dialog-form-copy">
      <p>在目标 Agent 预授权的父目录下创建一个独立空项目。Web 端不会接收或提交任意绝对路径。</p>
      <AppForm ref="formRef" :model="form" :rules="rules" @keyup.enter="submit">
        <FormField label="目标 Agent" prop="deviceId">
          <AppSelect
            v-model="form.deviceId"
            placeholder="选择在线 Agent"
            :loading="loadingDevices"
            @change="loadRoots"
          >
            <option v-for="device in onlineDevices" :key="device.id" :value="device.id">
              {{ device.deviceName }}
            </option>
          </AppSelect>
        </FormField>
        <FormField label="授权父目录" prop="parentName">
          <AppSelect
            v-model="form.parentName"
            placeholder="选择 Agent 预授权目录"
            :loading="loadingRoots"
            :disabled="!form.deviceId"
          >
            <option v-for="root in roots" :key="root.id" :value="root.rootName">
              {{ root.rootName }}
            </option>
          </AppSelect>
          <span v-if="form.deviceId && !loadingRoots && !roots.length" class="field-hint"
            >该 Agent 尚未配置 workspace-roots。</span
          >
        </FormField>
        <FormField label="工作区名称" prop="workspaceName">
          <AppInput v-model="form.workspaceName" maxlength="64" placeholder="例如 order-service" />
        </FormField>
        <FormField label="项目类型" prop="projectType">
          <AppSelect v-model="form.projectType">
            <option value="empty">空项目</option>
          </AppSelect>
        </FormField>
      </AppForm>
    </div>
    <template #footer>
      <AppButton @click="close">取消</AppButton>
      <AppButton tone="primary" :loading="submitting" :disabled="!roots.length" @click="submit"
        >创建工作区</AppButton
      >
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import type { Workspace, Id } from '@/types/domain'
import FormField from '@/components/common/FormField.vue'
import AppForm from '@/components/common/AppForm.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import type { FormRules, FormHandle } from '@/components/common/form'
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { useAgentStore } from '../../stores/agent'
const props = defineProps<{ modelValue: boolean; initialDeviceId?: Id }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [value: Workspace] }>()
const agentStore = useAgentStore()
const formRef = ref<FormHandle | null>(null)
const loadingDevices = ref(false)
const loadingRoots = ref(false)
const submitting = ref(false)
const form = reactive<{
  deviceId: Id
  parentName: string
  workspaceName: string
  projectType: string
}>({ deviceId: '', parentName: '', workspaceName: '', projectType: 'empty' })
const onlineDevices = computed(() => agentStore.devices.filter((item) => item.status === 'ONLINE'))
const roots = computed(() => agentStore.workspaceRootsByDevice[form.deviceId || ''] || [])
const rules: FormRules = {
  deviceId: [{ required: true, message: '请选择在线 Agent', trigger: 'change' }],
  parentName: [{ required: true, message: '请选择授权父目录', trigger: 'change' }],
  workspaceName: [
    { required: true, message: '请输入工作区名称', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
      message: '仅支持字母、数字、点、下划线和短横线',
      trigger: 'blur',
    },
  ],
}

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    form.deviceId = props.initialDeviceId ? Number(props.initialDeviceId) : ''
    form.parentName = ''
    form.workspaceName = ''
    form.projectType = 'empty'
    loadingDevices.value = true
    try {
      await agentStore.loadDevices()
      if (form.deviceId && onlineDevices.value.some((item) => item.id === form.deviceId))
        await loadRoots(form.deviceId)
      else form.deviceId = ''
    } finally {
      loadingDevices.value = false
    }
  },
)

async function loadRoots(deviceId: Id) {
  form.parentName = ''
  if (!deviceId) return
  loadingRoots.value = true
  try {
    await agentStore.loadWorkspaceRoots(deviceId)
  } finally {
    loadingRoots.value = false
  }
}

async function submit() {
  if (submitting.value) return
  if (!(await formRef.value?.validate()) || submitting.value) return
  submitting.value = true
  try {
    const workspace = await agentStore.createWorkspace(form.deviceId, {
      parentName: form.parentName,
      workspaceName: form.workspaceName.trim(),
      projectType: form.projectType,
    })
    toast.success('创建请求已提交，请关注工作区状态')
    emit('created', workspace)
    close()
  } finally {
    submitting.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}
</script>

<style scoped src="../../assets/styles/management.scss"></style>
