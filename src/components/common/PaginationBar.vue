<template>
  <nav
    aria-label="分页"
    class="mt-4 flex shrink-0 flex-wrap items-center justify-end gap-3 text-sm"
  >
    <span>共 {{ total }} 条 · 第 {{ page }} / {{ pages }} 页</span>
    <label class="flex items-center gap-2"
      >每页
      <select
        class="rounded border bg-background px-2 py-1"
        aria-label="每页条数"
        :value="size"
        :disabled="loading"
        @change="emit('change', 1, Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="value in [20, 50, 100]" :key="value" :value="value">{{ value }} 条</option>
      </select>
    </label>
    <AppButton :disabled="loading || page <= 1" @click="emit('change', page - 1, size)"
      >上一页</AppButton
    >
    <AppButton :disabled="loading || page >= pages" @click="emit('change', page + 1, size)"
      >下一页</AppButton
    >
  </nav>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '@/components/common/AppButton.vue'
const props = defineProps<{ page: number; size: number; total: number; loading?: boolean }>()
const emit = defineEmits<{ change: [page: number, size: number] }>()
const pages = computed(() => Math.max(1, Math.ceil(props.total / props.size)))
</script>
