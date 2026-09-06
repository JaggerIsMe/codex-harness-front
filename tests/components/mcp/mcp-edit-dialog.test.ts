import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import McpEditDialog from '@/components/mcp/McpEditDialog.vue'
import { saveMcpConfiguration } from '@/api/mcp'
import type { McpConfiguration } from '@/types/mcp'

vi.mock('@/api/mcp', () => ({ saveMcpConfiguration: vi.fn() }))

let wrapper: VueWrapper
afterEach(() => wrapper?.unmount())

it('requires re-entry of masked HTTP secrets and submits literal headers only', async () => {
  const configuration: McpConfiguration = {
    id: 7,
    serverCode: 'LingXing-MCP',
    name: '领星 MCP',
    description: '',
    status: 'ENABLED',
    currentVersionId: 70,
    currentVersionNo: 1,
    configDigest: 'a'.repeat(64),
    revision: 3,
    runtimeSpec: {
      transportType: 'STREAMABLE_HTTP',
      command: null,
      args: [],
      cwdMode: null,
      envVars: [],
      url: 'https://openmcp.lingxing.com/mcp-servers/lingxing-mcp',
      httpHeaders: { 'X-Mcp-Key': '******' },
      startupTimeoutSeconds: 10,
      toolTimeoutSeconds: 60,
      required: true,
      enabledTools: [],
      disabledTools: [],
    },
    createdAt: '',
    updatedAt: '',
  }
  vi.mocked(saveMcpConfiguration).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: configuration,
  })
  wrapper = mount(McpEditDialog, {
    props: { modelValue: false, configuration },
    global: { stubs: { AppDialog: { template: '<div><slot /><slot name="footer" /></div>' } } },
  })

  await wrapper.setProps({ modelValue: true })
  const headerInput = wrapper
    .findAll('textarea')
    .find((input) => (input.element as HTMLTextAreaElement).value.includes('X-Mcp-Key'))!
  expect((headerInput.element as HTMLTextAreaElement).value).toBe('X-Mcp-Key=')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '保存新版本')!
    .trigger('click')
  expect(wrapper.text()).toContain('Header 密钥格式不正确')
  expect(saveMcpConfiguration).not.toHaveBeenCalled()

  await headerInput.setValue('X-Mcp-Key=actual-secret')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '保存新版本')!
    .trigger('click')
  await flushPromises()

  expect(saveMcpConfiguration).toHaveBeenCalledWith(
    7,
    expect.objectContaining({ httpHeaders: { 'X-Mcp-Key': 'actual-secret' }, revision: 3 }),
  )
  const payload = vi.mocked(saveMcpConfiguration).mock.calls[0]![1] as unknown as Record<
    string,
    unknown
  >
  expect(payload).not.toHaveProperty('envHttpHeaders')
  expect(payload).not.toHaveProperty('bearerTokenEnvVar')
})
