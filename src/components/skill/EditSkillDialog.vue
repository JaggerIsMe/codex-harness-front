<template>
  <AppDialog :model-value="modelValue" title="编辑 Skill" width="520px" @close="close">
    <AppForm ref="formRef" :model="form" :rules="rules">
      <FormField label="Skill 名称" prop="skillName"
        ><AppInput v-model="form.skillName" maxlength="128"
      /></FormField>
      <FormField label="描述" prop="description"
        ><AppInput v-model="form.description" type="textarea" :rows="4" maxlength="1000"
      /></FormField>
      <FormField label="状态" prop="status"
        ><AppSelect v-model="form.status"
          ><option value="ENABLED">启用</option>
          <option value="DISABLED">停用</option></AppSelect
        ></FormField
      >
    </AppForm>
    <template #footer
      ><AppButton @click="close">取消</AppButton
      ><AppButton tone="primary" :loading="submitting" @click="submit">保存</AppButton></template
    >
  </AppDialog>
</template>

<script setup lang="ts">
import type { Skill } from '@/types/domain'
import FormField from '@/components/common/FormField.vue'
import AppForm from '@/components/common/AppForm.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import type { FormRules, FormHandle } from '@/components/common/form'
import { reactive, ref, watch } from 'vue'
import { updateSkill } from '../../api/skill'
const props = defineProps<{ modelValue: boolean; skill: Skill | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [value: Skill] }>()
const formRef = ref<FormHandle | null>(null)
const submitting = ref(false)
const form = reactive({ skillName: '', description: '', status: 'ENABLED' })
const rules: FormRules = {
  skillName: [
    { required: true, message: '请输入 Skill 名称', trigger: 'blur' },
    { pattern: /^[A-Za-z0-9][A-Za-z0-9._-]*$/, message: 'Skill 名称格式不正确', trigger: 'blur' },
  ],
}
watch(
  () => props.modelValue,
  (visible) => {
    if (visible && props.skill)
      Object.assign(form, {
        skillName: props.skill.skillName,
        description: props.skill.description,
        status: props.skill.status,
      })
  },
)
async function submit() {
  if (submitting.value || !props.skill || !(await formRef.value?.validate())) return
  submitting.value = true
  try {
    const response = await updateSkill(props.skill.id, { ...form })
    emit('saved', response.data)
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
