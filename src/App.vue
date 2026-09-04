<template><router-view /><Toaster rich-colors position="top-right" /><ConfirmDialog /></template>
<script setup lang="ts">
import { Toaster } from 'vue-sonner'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
</script>
