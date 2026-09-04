<template>
  <Button
    :class="
      link
        ? tone === 'danger'
          ? 'text-destructive'
          : tone === 'primary'
            ? 'text-primary'
            : ''
        : ''
    "
    :variant="
      link ? 'ghost' : tone === 'danger' ? 'destructive' : tone && !plain ? 'default' : 'outline'
    "
    :size="circle ? 'icon' : size === 'small' ? 'sm' : size === 'large' ? 'lg' : 'default'"
    :disabled="disabled || loading"
    :aria-busy="loading"
    :aria-label="label"
    type="button"
  >
    <LoaderCircle v-if="loading" class="size-4 animate-spin" /><component
      :is="icon"
      v-else-if="icon"
      class="size-4"
    /><slot />
  </Button>
</template>
<script setup lang="ts">
import type { Component } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
defineProps<{
  tone?: string
  link?: boolean
  plain?: boolean
  circle?: boolean
  size?: string
  loading?: boolean
  disabled?: boolean
  icon?: Component
  label?: string
}>()
</script>
