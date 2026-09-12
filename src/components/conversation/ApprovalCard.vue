<template>
  <article class="approval-card">
    <div class="approval-card__heading">
      <div>
        <span class="inline-flex shrink-0 items-center [&_svg]:size-4"><Warning /></span
        ><strong
          >{{ isQuestion ? '等待回答' : '等待审批' }} ·
          {{ isQuestion ? '方案选择与补充信息' : approvalTypeLabel(approval.approvalType) }}</strong
        >
      </div>
      <span>Turn #{{ approval.turnId }}</span>
    </div>
    <p v-if="approval.approvalType === 'EXECUTION_CONFIRMATION'" class="approval-card__notice">
      仅确认本次操作；批准不会增加文件、网络或系统权限。
    </p>
    <div
      class="approval-card__body"
      tabindex="0"
      role="region"
      :aria-label="`Turn ${approval.turnId} 审批详情`"
    >
      <p v-if="details.summary" class="approval-card__summary">{{ details.summary }}</p>
      <section
        v-for="(question, index) in details.questions"
        :key="index"
        class="approval-question"
      >
        <h4>{{ question.title }}</h4>
        <p>{{ question.text }}</p>
        <fieldset v-if="isQuestion" class="approval-question__choices" :disabled="loading">
          <legend class="sr-only">{{ question.text }}</legend>
          <label
            v-for="(option, optionIndex) in question.options"
            :key="optionIndex"
            class="approval-question__choice"
          >
            <input
              v-model="selections[index]"
              type="radio"
              :name="`approval-${approval.id}-${index}`"
              :value="String(optionIndex)"
            />
            <span
              ><strong>{{ option.label }}</strong
              ><span>{{ option.description }}</span></span
            >
          </label>
          <label
            v-if="question.isOther && question.options.length"
            class="approval-question__choice"
          >
            <input
              v-model="selections[index]"
              type="radio"
              :name="`approval-${approval.id}-${index}`"
              value="other"
            />
            <span>其他方式 / 补充说明</span>
          </label>
          <label
            v-if="!question.options.length || selections[index] === 'other'"
            class="approval-question__answer"
          >
            {{ question.isSecret ? '填写所需信息（隐藏显示）' : '填写你的回答' }}
            <input
              v-if="question.isSecret"
              v-model="freeText[index]"
              type="password"
              autocomplete="off"
              maxlength="4000"
            />
            <textarea v-else v-model="freeText[index]" rows="3" maxlength="4000" />
          </label>
        </fieldset>
        <dl v-else-if="question.options.length" class="approval-question__options">
          <div v-for="(option, optionIndex) in question.options" :key="optionIndex">
            <dt>{{ option.label }}</dt>
            <dd>{{ option.description }}</dd>
          </div>
        </dl>
      </section>
      <dl v-if="details.fields.length" class="approval-fields">
        <div v-for="(field, index) in details.fields" :key="index">
          <dt>{{ field.label }}</dt>
          <dd>
            <code v-if="field.code">{{ field.value }}</code
            ><span v-else>{{ field.value }}</span>
          </dd>
        </div>
      </dl>
      <p
        v-if="!details.summary && !details.questions.length && !details.fields.length"
        class="approval-card__empty"
      >
        未提供具体操作说明，请核对原始请求。
      </p>
      <details class="approval-card__raw">
        <summary>查看原始请求</summary>
        <pre>{{ details.raw }}</pre>
      </details>
    </div>
    <div class="approval-actions">
      <AppButton
        size="small"
        tone="success"
        :loading="loading"
        :disabled="isQuestion && !canSubmit"
        @click="submit"
        >{{ isQuestion ? '提交选择' : '批准本次' }}</AppButton
      >
      <AppButton
        size="small"
        tone="warning"
        plain
        :loading="loading"
        @click="emit('decision', 'DECLINE')"
        >{{ isQuestion ? '跳过回答' : '拒绝操作' }}</AppButton
      >
      <AppButton
        size="small"
        tone="danger"
        plain
        :loading="loading"
        @click="emit('decision', 'CANCEL')"
        >拒绝并中断</AppButton
      >
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Approval, Decision, ApprovalAnswers } from '@/types/domain'
import AppButton from '@/components/common/AppButton.vue'
import { TriangleAlert as Warning } from 'lucide-vue-next'
import { describeApproval } from '@/utils/approvalDetails'
const props = defineProps<{ approval: Approval; loading?: boolean }>()
const emit = defineEmits<{ decision: [value: Decision, answers?: ApprovalAnswers] }>()
const details = computed(() => describeApproval(props.approval.details))
const isQuestion = computed(
  () => props.approval.approvalType === 'MCP_TOOL_CALL' && details.value.questions.length > 0,
)
const selections = ref<Record<number, string>>({})
const freeText = ref<Record<number, string>>({})
watch(
  () => JSON.stringify([props.approval.id, details.value.raw]),
  () => {
    selections.value = {}
    freeText.value = {}
  },
)
function answer(index: number): string {
  const question = details.value.questions[index]!
  if (!question.options.length || selections.value[index] === 'other')
    return freeText.value[index]?.trim() || ''
  return question.options[Number(selections.value[index])]?.label || ''
}
const canSubmit = computed(
  () =>
    details.value.questions.length > 0 &&
    details.value.questions.every((question, index) => question.id && answer(index)),
)
function submit() {
  if (props.loading || (isQuestion.value && !canSubmit.value)) return
  if (!isQuestion.value) {
    emit('decision', 'ACCEPT')
    return
  }
  const answers: ApprovalAnswers = Object.fromEntries(
    details.value.questions.map((question, index) => [question.id, { answers: [answer(index)] }]),
  )
  emit('decision', 'ACCEPT', answers)
}

function approvalTypeLabel(type: string) {
  return (
    (
      {
        COMMAND_EXECUTION: '命令执行',
        FILE_CHANGE: '文件变更',
        MCP_TOOL_CALL: 'MCP 工具调用',
        EXECUTION_CONFIRMATION: '执行前确认',
      } as Record<string, string>
    )[type] || type
  )
}
</script>
