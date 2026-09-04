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
        ><AlertDialogAction @click="finishConfirmation(true)"
          >确认</AlertDialogAction
        ></AlertDialogFooter
      >
    </AlertDialogContent>
  </AlertDialog>
</template>
<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { confirmation, finishConfirmation } from '@/lib/confirm'
onBeforeUnmount(() => finishConfirmation(false))
</script>
