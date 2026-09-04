<template>
  <AppDialog :model-value="modelValue" title="下发 Skill" width="560px" @close="close">
    <div class="dialog-form-copy">
      <p>全局 Skill 对执行机器上的所有项目生效；项目级 Skill 仅安装到所选项目工作区。</p>
    </div>
    <AppForm ref="formRef" :model="form" :rules="rules">
      <FormField label="作用域" prop="scopeType">
        <AppSelect v-model="form.scopeType"
          ><option value="GLOBAL">执行机器全局</option>
          <option value="PROJECT">指定项目</option></AppSelect
        >
      </FormField>
      <FormField label="Skill 版本" prop="versionId">
        <AppSelect v-model="form.versionId" placeholder="选择已激活版本">
          <optgroup
            v-for="skillItem in deployableSkills"
            :key="skillItem.id"
            :label="skillItem.skillName"
          >
            <option
              v-for="version in activeVersions(skillItem)"
              :key="version.id"
              :value="version.id"
            >
              {{ `${skillItem.skillName} · ${version.version}` }}
            </option>
          </optgroup>
        </AppSelect>
      </FormField>
      <FormField v-if="form.scopeType === 'GLOBAL'" label="目标执行机器" prop="deviceIds">
        <AppSelect v-model="form.deviceIds" multiple placeholder="选择在线 Agent">
          <option v-for="device in onlineDevices" :key="device.id" :value="device.id">
            {{ `${device.deviceName} · ${device.deviceCode}` }}
          </option>
        </AppSelect>
      </FormField>
      <FormField v-else label="目标项目" prop="projectId">
        <AppSelect v-model="form.projectId" placeholder="选择工作区已就绪且 Agent 在线的项目">
          <option v-for="project in onlineProjects" :key="project.id" :value="project.id">
            {{ `${project.projectName} · ${project.deviceName}` }}
          </option>
        </AppSelect>
      </FormField>
    </AppForm>
    <AppAlert
      v-if="form.scopeType === 'GLOBAL' && !onlineDevices.length"
      title="当前没有在线执行机器"
      type="warning"
      :closable="false"
      show-icon
    />
    <AppAlert
      v-if="form.scopeType === 'PROJECT' && !onlineProjects.length"
      title="当前没有可下发的在线项目"
      type="warning"
      :closable="false"
      show-icon
    />
    <template #footer
      ><AppButton @click="close">取消</AppButton
      ><AppButton tone="primary" :disabled="!hasTarget" :loading="submitting" @click="submit">{{
        form.scopeType === 'GLOBAL' ? `下发到 ${form.deviceIds.length || 0} 台` : '下发到项目'
      }}</AppButton></template
    >
  </AppDialog>
</template>

<script setup lang="ts">
import type { Skill, DeploymentResult } from '@/types/domain'
import AppAlert from '@/components/common/AppAlert.vue'
import FormField from '@/components/common/FormField.vue'
import AppForm from '@/components/common/AppForm.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppButton from '@/components/common/AppButton.vue'
import type { FormRules, FormHandle } from '@/components/common/form'
import { computed, reactive, ref, watch } from 'vue'
import { deploySkill } from '../../api/agent'
import { useAgentStore } from '../../stores/agent'
import { useProjectStore } from '../../stores/project'
const props = defineProps<{
  modelValue: boolean
  skills: Skill[]
  initialVersionId: number | null
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  deployed: [value: DeploymentResult]
}>()
const agentStore = useAgentStore()
const projectStore = useProjectStore()
const formRef = ref<FormHandle | null>(null)
const submitting = ref(false)
const form = reactive<{
  scopeType: string
  deviceIds: number[]
  projectId: number | null
  versionId: number | null
}>({ scopeType: 'GLOBAL', deviceIds: [], projectId: null, versionId: null })
const validateDevices: NonNullable<import('@/components/common/form').Rule['validator']> = (
  _rule,
  value,
  callback,
) =>
  form.scopeType !== 'GLOBAL' || (Array.isArray(value) && value.length)
    ? callback()
    : callback(new Error('请选择至少一台在线机器'))
const validateProject: NonNullable<import('@/components/common/form').Rule['validator']> = (
  _rule,
  value,
  callback,
) => (form.scopeType !== 'PROJECT' || value ? callback() : callback(new Error('请选择项目')))
const rules: FormRules = {
  scopeType: [{ required: true }],
  deviceIds: [{ validator: validateDevices, trigger: 'change' }],
  projectId: [{ validator: validateProject, trigger: 'change' }],
  versionId: [{ required: true, message: '请选择 Skill 版本', trigger: 'change' }],
}
const onlineDevices = computed(() => agentStore.devices.filter((item) => item.status === 'ONLINE'))
const onlineProjects = computed(() =>
  projectStore.projects.filter(
    (item) =>
      item.status === 'ACTIVE' &&
      item.deviceStatus === 'ONLINE' &&
      item.workspaceStatus === 'ENABLED',
  ),
)
const hasTarget = computed(() =>
  form.scopeType === 'GLOBAL' ? onlineDevices.value.length > 0 : onlineProjects.value.length > 0,
)
const deployableSkills = computed(() =>
  props.skills.filter((item) => item.status === 'ENABLED' && activeVersions(item).length),
)
function activeVersions(skill: Skill) {
  return (skill.versions || []).filter((item) => item.status === 'ACTIVE')
}
watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return
    Object.assign(form, {
      scopeType: 'GLOBAL',
      deviceIds: [],
      projectId: null,
      versionId: props.initialVersionId,
    })
    await Promise.all([agentStore.loadDevices(), projectStore.loadProjects()])
  },
)
watch(
  () => form.scopeType,
  () => {
    formRef.value?.clearValidate(['deviceIds', 'projectId'])
  },
)
async function submit() {
  if (submitting.value) return
  if (!(await formRef.value?.validate()) || submitting.value) return
  submitting.value = true
  try {
    const targets = form.scopeType === 'GLOBAL' ? form.deviceIds : [form.projectId]
    const results = await Promise.allSettled(
      targets.map((targetId) => deploySkill(form.scopeType, targetId!, form.versionId!)),
    )
    const deployed = results
      .filter((item) => item.status === 'fulfilled')
      .map((item) => item.value.data)
    emit('deployed', { deployments: deployed, failedCount: results.length - deployed.length })
    if (deployed.length) close()
  } finally {
    submitting.value = false
  }
}
function close() {
  emit('update:modelValue', false)
}
</script>

<style scoped src="../../assets/styles/skill.management.scss"></style>
