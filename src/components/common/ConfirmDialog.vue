<template>
  <AlertDialog
    v-for="item in confirmation ? [confirmation] : []"
    :key="item.id"
    :open="true"
    @update:open="
      (open) => {
        if (!open) finishConfirmation(false, item)
      }
    "
  >
    <AlertDialogContent
      ><AlertDialogHeader
        ><AlertDialogTitle>{{ item.title }}</AlertDialogTitle
        ><AlertDialogDescription>
          <span>{{ item.message }}</span>
          <span v-if="item.warning" class="mt-2 block text-destructive">{{ item.warning }}</span>
        </AlertDialogDescription></AlertDialogHeader
      >
      <AlertDialogFooter
        ><AlertDialogCancel @click="finishConfirmation(false, item)">取消</AlertDialogCancel
        ><AppButton tone="primary" @click="finishConfirmation(true, item)"
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
