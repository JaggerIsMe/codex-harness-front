<template>
  <aside class="policy-blocked-card" aria-label="平台策略拦截">
    <strong>平台策略拦截 · {{ typeLabel }}</strong>
    <p>{{ details.message }}</p>
    <div class="policy-blocked-card__details" tabindex="0" role="region" aria-label="被拦截的操作">
      <p v-if="operation.summary">{{ operation.summary }}</p>
      <dl class="approval-fields">
        <div v-for="(field, index) in operation.fields" :key="index">
          <dt>{{ field.label }}</dt>
          <dd>{{ field.value }}</dd>
        </div>
      </dl>
    </div>
    <p class="policy-blocked-card__guidance">{{ details.guidance }}</p>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { describeApproval } from '@/utils/approvalDetails'
import type { PolicyBlockDetails } from '@/utils/policyBlock'
const props = defineProps<{ details: PolicyBlockDetails }>()
const operation = computed(() => describeApproval(props.details.operation))
const typeLabel = computed(() =>
  props.details.approvalType === 'FILE_CHANGE' ? '文件变更' : '命令执行',
)
</script>
