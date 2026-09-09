<template>
  <router-view />
  <ThemeToggle v-if="route.name === 'login'" class="login-theme-toggle" />
  <Toaster :theme="theme.mode" rich-colors position="top-right" />
  <ConfirmDialog />
</template>
<script setup lang="ts">
import { useRoute } from 'vue-router'
import { Toaster } from 'vue-sonner'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import ThemeToggle from '@/components/common/ThemeToggle.vue'
import { useThemeStore } from '@/stores/theme'

const route = useRoute()
const theme = useThemeStore()
</script>
