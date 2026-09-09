<template>
  <div class="file-preview-renderer">
    <div class="file-preview-tools">
      <button type="button" :aria-pressed="source" @click="source = !source">
        {{ source ? '查看表格' : '查看源码' }}
      </button>
    </div>
    <TextFilePreview v-if="source" :text="text" />
    <template v-else>
      <p v-if="table.error" role="alert" class="file-preview-notice">{{ table.error }}</p>
      <p v-else-if="!table.rows.length" class="file-preview-notice">空文件</p>
      <p v-if="table.truncated" role="status" class="file-preview-notice">
        表格已截断：最多显示 {{ maxRows }} 行、{{ maxColumns }} 列，源码和下载保留完整内容。
      </p>
      <div class="file-table-preview">
        <table>
          <tbody>
            <tr v-for="(row, index) in table.rows" :key="index">
              <th scope="row">{{ index + 1 }}</th>
              <td v-for="(cell, column) in row" :key="column">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import TextFilePreview from './TextFilePreview.vue'
import { parsePreviewTable } from '@/utils/workspacePreview'
const props = defineProps<{
  text: string
  delimiter: string
  maxRows: number
  maxColumns: number
}>()
const source = ref(false)
const table = computed(() =>
  parsePreviewTable(props.text, props.delimiter, props.maxRows, props.maxColumns),
)
</script>
