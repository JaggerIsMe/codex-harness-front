<template>
  <AlertDialog
    :open="Boolean(confirmation)"
    @update:open="
      (open) => {
        if (!open) finishConfirmation(false)
      }
    "
  >
    <AlertDialogContent
      ><AlertDialogHeader
        ><AlertDialogTitle>{{ confirmation?.title }}</AlertDialogTitle
        ><AlertDialogDescription>{{
          confirmation?.message
        }}</AlertDialogDescription></AlertDialogHeader
      >
      <AlertDialogFooter
        ><AlertDialogCancel @click="finishConfirmation(false)">取消</AlertDialogCancel
        ><AppButton tone="primary" @click="finishConfirmation(true)"
          >确认</AppButton
        ></AlertDialogFooter
      >
    </AlertDialogContent>
  </AlertDialog>
</template>
<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import AppButton from '@/components/common/AppButton.vue'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { confirmation, finishConfirmation } from '@/lib/confirm'
// Resolve the choice before closing. AlertDialogAction closes first and would resolve cancellation.
onBeforeUnmount(() => finishConfirmation(false))
</script>
