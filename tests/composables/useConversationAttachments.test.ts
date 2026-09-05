import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { flushPromises } from '@vue/test-utils'
import * as api from '@/api/attachment'
import { useConversationAttachments } from '@/composables/useConversationAttachments'
import type { ApiResponse } from '@/types/domain'
vi.mock('@/api/attachment', () => ({
  getAttachmentLimits: vi.fn(),
  getPendingAttachments: vi.fn(),
  uploadAttachment: vi.fn(),
  removeAttachment: vi.fn(),
}))
const scopes: ReturnType<typeof effectScope>[] = []
const attachment = {
  id: '9',
  fileName: 'hello.txt',
  sizeBytes: 5,
  mediaType: 'text/plain',
  sha256: 'abc',
}
function result<T>(data: T): ApiResponse<T> {
  return { status: 'success', code: 200, info: '', data }
}
function create() {
  const scope = effectScope()
  scopes.push(scope)
  return { scope, state: scope.run(() => useConversationAttachments(2, 3))! }
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getAttachmentLimits).mockResolvedValue(
    result({ maxFileBytes: 10, maxFiles: 2, maxTotalBytes: 15, agentSupported: true }),
  )
  vi.mocked(api.getPendingAttachments).mockResolvedValue(result([]))
})
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
})
it('restores server drafts and keeps them available for attachment-only messages', async () => {
  vi.mocked(api.getPendingAttachments).mockResolvedValue(result([attachment]))
  const { state } = create()
  await flushPromises()
  expect(state.selected.value).toEqual([attachment])
  expect(state.blocked.value).toBe(false)
  state.clearSent()
  expect(state.selected.value).toEqual([])
  expect(api.removeAttachment).not.toHaveBeenCalled()
})
it('blocks sending during upload and aborts on conversation disposal, ignoring late results', async () => {
  let finish!: (value: ApiResponse<typeof attachment>) => void
  vi.mocked(api.uploadAttachment).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const { state, scope } = create()
  await flushPromises()
  state.add([new File(['hello'], 'hello.txt')])
  expect(state.blocked.value).toBe(true)
  const signal = vi.mocked(api.uploadAttachment).mock.calls[0]![3]
  scope.stop()
  expect(signal.aborted).toBe(true)
  finish(result(attachment))
  await flushPromises()
  expect(state.selected.value).toEqual([])
})
it('enforces configured limits before uploading and keeps failed uploads retryable', async () => {
  vi.mocked(api.uploadAttachment)
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(result(attachment))
  const { state } = create()
  await flushPromises()
  state.add([new File(['too many bytes'], 'large.txt')])
  expect(api.uploadAttachment).not.toHaveBeenCalled()
  state.add([new File(['hello'], 'hello.txt')])
  await flushPromises()
  expect(state.blocked.value).toBe(true)
  expect(state.rows.value[0]!.status).toBe('error')
  await state.upload(state.rows.value[0]!)
  expect(state.blocked.value).toBe(false)
  expect(state.selected.value).toEqual([attachment])
})
it('keeps an uploaded draft when server rejects removal', async () => {
  vi.mocked(api.getPendingAttachments).mockResolvedValue(result([attachment]))
  vi.mocked(api.removeAttachment).mockRejectedValue(new Error('Already sent'))
  const { state } = create()
  await flushPromises()
  await state.remove(state.rows.value[0]!)
  expect(state.selected.value).toEqual([attachment])
  expect(state.error.value).toBe('Already sent')
})
