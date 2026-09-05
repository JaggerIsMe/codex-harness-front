<template>
  <AppDialog
    :model-value="modelValue"
    :title="skill ? `上传 ${skill.skillName} 新版本` : '上传 Skill'"
    width="560px"
    @close="close"
  >
    <AppForm ref="formRef" :model="form" :rules="rules">
      <template v-if="!skill">
        <FormField label="Skill 名称" prop="skillName"
          ><AppInput v-model="form.skillName" maxlength="128" placeholder="例如 code-review"
        /></FormField>
        <FormField label="描述" prop="description"
          ><AppInput v-model="form.description" type="textarea" :rows="3" maxlength="1000"
        /></FormField>
      </template>
      <FormField label="版本号" prop="version"
        ><AppInput v-model="form.version" maxlength="64" placeholder="例如 1.0.0"
      /></FormField>
      <FormField label="Skill ZIP" prop="file">
        <input
          type="file"
          accept=".zip,application/zip"
          class="block w-full rounded-md border p-3"
          @change="selectFile"
        />
        <p class="text-xs text-muted-foreground">
          最大 20MB；根目录或唯一顶层目录必须包含 SKILL.md。
        </p>
      </FormField>
    </AppForm>
    <template #footer
      ><AppButton @click="close">取消</AppButton
      ><AppButton tone="primary" :loading="submitting" @click="submit"
        >上传并启用</AppButton
      ></template
    >
  </AppDialog>
</template>

<script setup lang="ts">
import type { Skill, SkillVersion } from '@/types/domain'
import FormField from '@/components/common/FormField.vue'
import AppForm from '@/components/common/AppForm.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import type { FormRules, FormHandle } from '@/components/common/form'
import { computed, reactive, ref, watch } from 'vue'
import { createSkill, uploadSkillVersion } from '../../api/skill'
const props = defineProps<{ modelValue: boolean; skill: Skill | null }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  uploaded: [value: Skill | SkillVersion]
}>()
const formRef = ref<FormHandle | null>(null)
const submitting = ref(false)
const form = reactive<{
  skillName: string
  description: string
  version: string
  file: File | null
}>({ skillName: '', description: '', version: '', file: null })
const segmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const rules = computed<FormRules>(() => ({
  skillName: props.skill
    ? []
    : [
        { required: true, message: '请输入 Skill 名称', trigger: 'blur' },
        {
          pattern: segmentPattern,
          message: '只能包含字母、数字、点、下划线和连字符',
          trigger: 'blur',
        },
      ],
  version: [
    { required: true, message: '请输入版本号', trigger: 'blur' },
    { pattern: segmentPattern, message: '版本号格式不正确', trigger: 'blur' },
  ],
  file: [
    {
      validator: (_rule, value, callback) =>
        value ? callback() : callback(new Error('请选择 Skill ZIP')),
      trigger: 'change',
    },
  ],
}))

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) Object.assign(form, { skillName: '', description: '', version: '', file: null })
  },
)
function selectFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0] || null
  form.file =
    file && file.size <= 20 * 1024 * 1024 && file.name.toLowerCase().endsWith('.zip') ? file : null
  void formRef.value?.validateField('file')
}

async function submit() {
  if (submitting.value) return
  if (!(await formRef.value?.validate()) || submitting.value) return
  submitting.value = true
  try {
    const data = new FormData()
    data.append('version', form.version.trim())
    data.append('file', form.file!)
    let response
    if (props.skill) response = await uploadSkillVersion(props.skill.id, data)
    else {
      data.append('skillName', form.skillName.trim())
      data.append('description', form.description.trim())
      response = await createSkill(data)
    }
    emit('uploaded', response.data)
    close()
  } finally {
    submitting.value = false
  }
}
function close() {
  emit('update:modelValue', false)
}
</script>

<style scoped src="../../assets/styles/skill.management.scss"></style>
