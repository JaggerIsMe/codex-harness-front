<template>
  <form class="space-y-5" novalidate @submit.prevent>
    <slot />
    <p v-if="summary" role="alert" class="text-sm text-destructive">{{ summary }}</p>
  </form>
</template>
<script setup lang="ts">
import { computed, provide, ref } from 'vue'
import { formContext, type FormRules, type FormHandle } from './form'
const props = defineProps<{ model?: object; rules?: FormRules }>()
const errors = ref<Record<string, string>>({})
provide(formContext, errors)
const summary = computed(() => Object.values(errors.value).join('；'))
async function validateField(field: string): Promise<boolean> {
  const model = props.model as Record<string, unknown> | undefined
  const value = model?.[field]
  delete errors.value[field]
  for (const rule of props.rules?.[field] || []) {
    let error: Error | undefined
    if (rule.required && (value == null || value === '' || (Array.isArray(value) && !value.length)))
      error = new Error(rule.message || '请填写必填项')
    if (rule.pattern && typeof value === 'string' && !rule.pattern.test(value))
      error = new Error(rule.message || '格式不正确')
    if (rule.validator)
      rule.validator(rule, value, (result) => {
        error = result
      })
    if (error) {
      errors.value[field] = error.message
      return false
    }
  }
  return true
}
async function validate() {
  const results = await Promise.all(Object.keys(props.rules || {}).map(validateField))
  return results.every(Boolean)
}
function clearValidate() {
  errors.value = {}
}
defineExpose<FormHandle>({ validate, clearValidate, validateField })
</script>
