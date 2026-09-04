<template>
  <Badge
    :variant="tone === 'danger' ? 'destructive' : 'secondary'"
    :class="{
      'bg-emerald-50 text-emerald-700': tone === 'success',
      'bg-amber-50 text-amber-700': tone === 'warning',
    }"
    ><slot
  /></Badge>
</template>
<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
defineProps<{ tone?: string }>()
</script>
