import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import MessageArtifacts from '@/components/conversation/MessageArtifacts.vue'
import * as api from '@/api/artifact'
import type { ConversationArtifact } from '@/types/domain'

vi.mock('@/api/artifact', () => ({ downloadArtifact: vi.fn(), retryArtifact: vi.fn() }))
const artifact: ConversationArtifact = {
  id: '9',
  turnId: '7',
  fileName: '报告.txt',
  sizeBytes: 5,
  mediaType: 'application/octet-stream',
  sha256: 'abc',
  status: 'READY',
  errorMessage: null,
}
const wrappers: ReturnType<typeof mount>[] = []
function create(value = artifact) {
  const wrapper = mount(MessageArtifacts, {
    props: { artifacts: [value], projectId: 2, conversationId: 3 },
  })
  wrappers.push(wrapper)
  return wrapper
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:artifact'), revokeObjectURL: vi.fn() }),
  )
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
it('downloads using the artifact ID and Chinese filename, then releases URLs on unmount', async () => {
  vi.mocked(api.downloadArtifact).mockResolvedValue(new Blob(['hello']))
  let filename = ''
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    filename = this.download
  })
  const wrapper = create()
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(api.downloadArtifact).toHaveBeenCalledWith(2, 3, '9', expect.any(AbortSignal))
  expect(filename).toBe('报告.txt')
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  wrapper.unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:artifact')
})
it('retries only file publication and asks the parent to reload status', async () => {
  vi.mocked(api.retryArtifact).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: { ...artifact, status: 'UPLOADING' },
  })
  const wrapper = create({ ...artifact, status: 'FAILED' })
  expect(wrapper.text()).toContain('重试上传')
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(api.retryArtifact).toHaveBeenCalledWith(2, 3, '9', expect.any(AbortSignal))
  expect(wrapper.emitted('changed')).toHaveLength(1)
  expect(api.downloadArtifact).not.toHaveBeenCalled()
})
it('does not offer download until READY and aborts an in-flight download on disposal', async () => {
  const preparing = create({ ...artifact, status: 'UPLOADING' })
  expect(preparing.find('button').exists()).toBe(false)
  expect(preparing.text()).toContain('正在准备下载')
  let resolve!: (blob: Blob) => void
  vi.mocked(api.downloadArtifact).mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const wrapper = create()
  await wrapper.get('button').trigger('click')
  const signal = vi.mocked(api.downloadArtifact).mock.calls[0]![3]!
  wrapper.unmount()
  expect(signal.aborted).toBe(true)
  resolve(new Blob(['late']))
  await flushPromises()
  expect(URL.createObjectURL).not.toHaveBeenCalled()
})
