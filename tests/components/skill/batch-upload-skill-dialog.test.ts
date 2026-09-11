import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import BatchUploadSkillDialog from '@/components/skill/BatchUploadSkillDialog.vue'
import {
  commitSkillImport,
  discardSkillImport,
  previewSkillImport,
  uploadSkillImport,
} from '@/api/skill'
import type { Skill } from '@/types/domain'
import type {
  SkillImportPreview,
  SkillImportSubmission,
  SkillImportUpload,
} from '@/types/skill-import'

vi.mock('@/api/skill', () => ({
  commitSkillImport: vi.fn(),
  discardSkillImport: vi.fn(),
  previewSkillImport: vi.fn(),
  uploadSkillImport: vi.fn(),
}))
vi.mock('@/utils/auth', () => ({ captureAuthSession: () => ({ sessionId: 'test-session' }) }))
vi.mock('@/api/request', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public code?: number,
    ) {
      super(message)
    }
  },
}))

const skill: Skill = {
  id: 42,
  skillName: 'review',
  description: '',
  status: 'ENABLED',
  versionCount: 1,
  createdAt: '',
  updatedAt: '',
  versions: [
    { id: 11, skillId: 42, version: '1', status: 'ACTIVE', sha256: '', fileSize: 5, createdAt: '' },
  ],
}
let wrapper: VueWrapper
function response<T>(data: T) {
  return { status: 'success' as const, code: 200, info: '', data }
}
function upload(file: File): SkillImportUpload {
  return {
    uploadId: file.name,
    filename: file.name,
    fileSize: file.size,
    sha256: 'abc',
    skillName: 'review',
    description: '',
    matchedSkillId: 42,
    expiresAt: '2099-01-01',
  }
}
beforeEach(() => {
  sessionStorage.clear()
  vi.mocked(discardSkillImport).mockResolvedValue(response(undefined))
  vi.mocked(uploadSkillImport).mockImplementation(async (file) => response(upload(file)))
  vi.mocked(previewSkillImport).mockImplementation(async (_mode, items) =>
    response<SkillImportPreview>({
      previewId: 'preview-1',
      expiresAt: '2099-01-01',
      affectedExpertCount: 1,
      items: items.map((item) => ({
        ...item,
        currentVersion: '1',
        status: 'READY',
        message: '校验通过',
        fingerprint: 'snapshot',
        experts: [
          {
            expertId: 1,
            expertName: '审查专家',
            expertStatus: 'PUBLISHED',
            source: 'VERSION',
            expertVersionId: 8,
            expertVersionNo: 2,
            skillVersionId: 11,
          },
          {
            expertId: 1,
            expertName: '审查专家',
            expertStatus: 'DRAFT',
            source: 'DRAFT',
            expertVersionId: null,
            expertVersionNo: null,
            skillVersionId: 11,
          },
        ],
      })),
    }),
  )
  vi.mocked(commitSkillImport).mockImplementation(async (request) =>
    response<SkillImportSubmission>({
      submissionId: request.submissionId,
      complete: true,
      successCount: 1,
      failedCount: 0,
      skippedCount: 0,
      items: [
        {
          itemId: vi.mocked(previewSkillImport).mock.calls.at(-1)![1][0]!.itemId,
          status: 'SUCCESS',
          message: '上传成功',
          skillId: 42,
          versionId: 12,
        },
      ],
    }),
  )
})
afterEach(() => wrapper?.unmount())
async function open() {
  wrapper = mount(BatchUploadSkillDialog, {
    props: { modelValue: true, initialMode: 'UPDATE', skills: [skill], selectedSkills: [skill] },
    global: { stubs: { AppDialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
  })
  await flushPromises()
}
async function files(names = ['review.zip']) {
  const input = wrapper.get('input[multiple]')
  Object.defineProperty(input.element, 'files', {
    value: names.map((name) => new File(['zip'], name)),
    configurable: true,
  })
  await input.trigger('change')
  await flushPromises()
}
function button(text: string) {
  return wrapper.findAll('button').find((button) => button.text() === text)!
}
async function preview() {
  await wrapper.get('input[placeholder="例如 1.1.0"]').setValue('2')
  await button('应用到全部').trigger('click')
  await button('校验预览').trigger('click')
  await flushPromises()
}

it('uses the preview when the formerly active version has been disabled', async () => {
  await open()
  await files()
  vi.mocked(previewSkillImport).mockImplementationOnce(async (_mode, items) =>
    response({
      previewId: 'no-active',
      expiresAt: '2099-01-01',
      affectedExpertCount: 0,
      items: items.map((item) => ({
        ...item,
        currentVersion: null,
        status: 'READY',
        message: '校验通过',
        fingerprint: 'none',
        experts: [],
      })),
    }),
  )
  await preview()
  expect(wrapper.findAll('tbody tr')[0]!.findAll('td')[2]!.text()).toBe('无')
  expect(wrapper.text()).toContain('未发现依赖将被停用版本的专家')
})

it('requires impact confirmation and invalidates the preview after edits', async () => {
  await open()
  await files()
  await preview()
  expect(wrapper.text()).toContain('受影响专家共 1 个')
  expect(wrapper.text()).toContain('专家版本 v2')
  expect(wrapper.text()).toContain('草稿，后续发布受影响')
  expect(button('批量更新并启用').attributes('disabled')).toBeDefined()
  await wrapper.get('input[type="checkbox"]').setValue(true)
  expect(button('批量更新并启用').attributes('disabled')).toBeUndefined()
  await wrapper.get('input[aria-label="review.zip 新版本"]').setValue('3')
  expect(wrapper.text()).not.toContain('受影响专家共 1 个')
  expect(button('批量更新并启用').attributes('disabled')).toBeDefined()
  await button('校验预览').trigger('click')
  await flushPromises()
  await wrapper.get('input[type="checkbox"]').setValue(true)
  await button('批量更新并启用').trigger('click')
  await flushPromises()
  expect(commitSkillImport).toHaveBeenCalledOnce()
  expect(wrapper.emitted('completed')).toHaveLength(1)
  expect(wrapper.text()).toContain('成功 1 项')
})

it('recovers an uncertain submission with the same identifier after reopening', async () => {
  await open()
  await files()
  await preview()
  await wrapper.get('input[type="checkbox"]').setValue(true)
  vi.mocked(commitSkillImport).mockRejectedValueOnce(new Error('network timeout'))
  await button('批量更新并启用').trigger('click')
  await flushPromises()
  const submitted = vi.mocked(commitSkillImport).mock.calls[0]![0]
  expect(wrapper.text()).toContain('提交结果待确认')
  wrapper.unmount()
  await open()
  await button('恢复提交结果').trigger('click')
  await flushPromises()
  expect(vi.mocked(commitSkillImport).mock.calls[1]![0]).toEqual(submitted)
  expect(wrapper.text()).toContain('成功 1 项')
})

it('retains only failed entries for a new preview after partial success', async () => {
  await open()
  await files(['a.zip', 'b.zip'])
  await preview()
  vi.mocked(commitSkillImport).mockImplementationOnce(async (request) => {
    const entries = vi.mocked(previewSkillImport).mock.calls.at(-1)![1]
    return response({
      submissionId: request.submissionId,
      complete: true,
      successCount: 1,
      failedCount: 1,
      skippedCount: 0,
      items: [
        {
          itemId: entries[0]!.itemId,
          status: 'SUCCESS',
          message: '上传成功',
          skillId: 42,
          versionId: 12,
        },
        {
          itemId: entries[1]!.itemId,
          status: 'FAILED',
          message: '保存失败',
          skillId: 43,
          versionId: null,
        },
      ],
    })
  })
  await wrapper.get('input[type="checkbox"]').setValue(true)
  await button('批量更新并启用').trigger('click')
  await flushPromises()
  await button('只重试失败项').trigger('click')
  expect(wrapper.find('input[aria-label="a.zip 新版本"]').exists()).toBe(false)
  expect(wrapper.find('input[aria-label="b.zip 新版本"]').exists()).toBe(true)
  expect(button('批量更新并启用').attributes('disabled')).toBeDefined()
  await button('校验预览').trigger('click')
  await flushPromises()
  expect(vi.mocked(previewSkillImport).mock.calls.at(-1)![1]).toHaveLength(1)
})

it('limits concurrent uploads to three and cancels active requests on close', async () => {
  const complete: (() => void)[] = []
  vi.mocked(uploadSkillImport).mockImplementation(
    (file) =>
      new Promise((resolve) => {
        complete.push(() => resolve(response(upload(file))))
      }),
  )
  await open()
  await files(['1.zip', '2.zip', '3.zip', '4.zip', '5.zip'])
  expect(uploadSkillImport).toHaveBeenCalledTimes(3)
  complete[0]!()
  await flushPromises()
  expect(uploadSkillImport).toHaveBeenCalledTimes(4)
  const signal = vi.mocked(uploadSkillImport).mock.calls[3]![1]!
  await button('关闭').trigger('click')
  expect(signal.aborted).toBe(true)
  complete.forEach((resolve) => resolve())
  await flushPromises()
  expect(uploadSkillImport).toHaveBeenCalledTimes(4)
})
