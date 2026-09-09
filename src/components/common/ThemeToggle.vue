<template>
  <button
    type="button"
    class="theme-toggle"
    :class="{ 'theme-toggle--compact': compact }"
    :aria-label="actionLabel"
    :title="actionLabel"
    @click="theme.toggle"
  >
    <Sun v-if="theme.mode === 'light'" class="size-4" aria-hidden="true" />
    <Moon v-else class="size-4" aria-hidden="true" />
    <span v-if="!compact">{{ theme.mode === 'light' ? '浅色' : '深色' }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Moon, Sun } from 'lucide-vue-next'
import { useThemeStore } from '@/stores/theme'

defineProps<{ compact?: boolean }>()
const theme = useThemeStore()
const actionLabel = computed(() => `切换到${theme.mode === 'light' ? '深色' : '浅色'}主题`)
</script>

<style scoped src="../../assets/styles/theme.toggle.scss"></style>
