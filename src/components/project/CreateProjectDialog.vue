<template>
  <AppDialog :model-value="modelValue" title="创建隔离项目" width="560px" @close="close">
    <AppAlert class="isolation-alert" type="info" :closable="false" show-icon>
      <template #title>项目将独占一个执行目录，并强制使用 Windows elevated 沙箱</template>
    </AppAlert>
    <AppForm ref="formRef" :model="form" :rules="rules">
      <FormField label="项目名称" prop="projectName">
        <AppInput
          v-model="form.projectName"
          maxlength="128"
          placeholder="例如：订单服务"
          @keyup.enter="submit"
        />
      </FormField>
      <FormField label="强隔离设备" prop="deviceId">
        <AppSelect
          v-model="form.deviceId"
          placeholder="选择已启用 Windows elevated 的在线机器"
          :loading="loadingDevices"
          @change="loadWorkspaces"
        >
          <option v-for="device in isolatedDevices" :key="device.id" :value="device.id">
            {{ `${device.deviceName} · ${device.deviceCode}` }}
          </option>
        </AppSelect>
      </FormField>
      <FormField label="独占执行目录" prop="workspaceId">
        <AppSelect
          v-model="form.workspaceId"
          placeholder="选择尚未绑定项目的目录"
          :loading="loadingWorkspaces"
          :disabled="!form.deviceId"
        >
          <option
            v-for="workspace in availableWorkspaces"
            :key="workspace.id"
            :value="workspace.id"
          >
            {{ workspace.workspaceName }}
          </option>
        </AppSelect>
        <button
          v-if="form.deviceId"
          type="button"
          class="mt-2 text-xs text-muted-foreground underline underline-offset-4"
          @click="workspaceVisible = true"
        >
          没有可用目录？新建执行目录
        </button>
      </FormField>
    </AppForm>
    <template #footer>
      <AppButton @click="close">取消</AppButton>
      <AppButton tone="primary" :loading="submitting" @click="submit">创建项目</AppButton>
    </template>
  </AppDialog>
  <CreateWorkspaceDialog
    v-model="workspaceVisible"
    :initial-device-id="form.deviceId || ''"
    @created="workspaceCreated"
  />
</template>

<script setup lang="ts">
import type { Project, Workspace } from '@/types/domain'
import CreateWorkspaceDialog from '@/components/workspace/CreateWorkspaceDialog.vue'
import AppAlert from '@/components/common/AppAlert.vue'
import FormField from '@/components/common/FormField.vue'
import AppForm from '@/components/common/AppForm.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import type { FormRules, FormHandle } from '@/components/common/form'
import { computed, reactive, ref, watch } from 'vue'
import { createProject } from '../../api/project'
import { useAgentStore } from '../../stores/agent'
import { useProjectStore } from '../../stores/project'
const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; created: [value: Project] }>()
const agentStore = useAgentStore()
const projectStore = useProjectStore()
const formRef = ref<FormHandle | null>(null)
const loadingDevices = ref(false)
const loadingWorkspaces = ref(false)
const submitting = ref(false)
const workspaceVisible = ref(false)
const form = reactive<{ projectName: string; deviceId: number | null; workspaceId: number | null }>(
  { projectName: '', deviceId: null, workspaceId: null },
)
const rules: FormRules = {
  projectName: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
  deviceId: [{ required: true, message: '请选择强隔离在线设备', trigger: 'change' }],
  workspaceId: [{ required: true, message: '请选择独占执行目录', trigger: 'change' }],
}
const isolatedDevices = computed(() =>
  agentStore.devices.filter(
    (item) => item.status === 'ONLINE' && item.isolationMode === 'WINDOWS_ELEVATED',
  ),
)
const occupiedWorkspaceIds = computed(
  () => new Set(projectStore.projects.map((item) => String(item.workspaceId))),
)
const availableWorkspaces = computed(() =>
  (agentStore.workspacesByDevice[form.deviceId || ''] || []).filter(
    (item) => item.status === 'ENABLED' && !occupiedWorkspaceIds.value.has(String(item.id)),
  ),
)

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    Object.assign(form, { projectName: '', deviceId: null, workspaceId: null })
    loadingDevices.value = true
    try {
      await Promise.all([agentStore.loadDevices(), projectStore.loadProjects()])
    } finally {
      loadingDevices.value = false
    }
  },
)

async function loadWorkspaces(deviceId: number | null) {
  form.workspaceId = null
  if (!deviceId) return
  loadingWorkspaces.value = true
  try {
    await agentStore.loadWorkspaces(deviceId)
  } finally {
    loadingWorkspaces.value = false
  }
}

async function submit() {
  if (submitting.value) return
  if (!(await formRef.value?.validate()) || submitting.value) return
  submitting.value = true
  try {
    const response = await createProject({
      deviceId: form.deviceId!,
      workspaceId: form.workspaceId!,
      projectName: form.projectName.trim(),
    })
    projectStore.upsertProject(response.data)
    emit('created', response.data)
    close()
  } finally {
    submitting.value = false
  }
}

function close() {
  workspaceVisible.value = false
  emit('update:modelValue', false)
}

async function workspaceCreated(workspace: Workspace) {
  if (workspace.deviceId !== form.deviceId) return
  await agentStore.loadWorkspaces(workspace.deviceId)
  if (availableWorkspaces.value.some((item) => item.id === workspace.id))
    form.workspaceId = workspace.id
}
</script>
