<template>
  <Badge
    :variant="tone === 'danger' ? 'destructive' : 'secondary'"
    :class="{
      'bg-success-surface text-success': tone === 'success',
      'bg-warning-surface text-warning': tone === 'warning',
    }"
    ><slot
  /></Badge>
</template>
<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
defineProps<{ tone?: string }>()
</script>
