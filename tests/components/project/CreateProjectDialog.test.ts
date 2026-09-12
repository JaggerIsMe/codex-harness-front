import { expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CreateProjectDialog from '@/components/project/CreateProjectDialog.vue'
import { getExecutableDevices } from '@/api/project'

vi.mock('@/api/project', () => ({ getExecutableDevices: vi.fn(), createProject: vi.fn() }))
vi.mock('@/stores/project', () => ({ useProjectStore: () => ({ upsertProject: vi.fn() }) }))

it('allows verified Linux and native Windows devices and disables the old write-only mode', async () => {
  vi.mocked(getExecutableDevices).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: [
      {
        id: 1,
        deviceName: 'Linux',
        status: 'ONLINE',
        isolationMode: 'LINUX_PROJECT_PROFILE_V1',
        provisioningAvailable: true,
      },
      {
        id: 3,
        deviceName: 'Windows LPAC',
        status: 'ONLINE',
        isolationMode: 'WINDOWS_LPAC_V1',
        provisioningAvailable: true,
      },
      {
        id: 2,
        deviceName: 'Windows',
        status: 'ONLINE',
        isolationMode: 'WINDOWS_PROJECT_PROFILE',
        provisioningAvailable: true,
      },
    ],
  })
  const wrapper = mount(CreateProjectDialog, {
    props: { modelValue: false },
    global: {
      stubs: {
        AppDialog: { template: '<div><slot /><slot name="footer" /></div>' },
        AppSelect: { template: '<select><slot /></select>' },
        AppInput: true,
        AppButton: true,
      },
    },
  })
  await wrapper.setProps({ modelValue: true })
  await flushPromises()
  expect(wrapper.get('option[value="1"]').attributes('disabled')).toBeUndefined()
  expect(wrapper.get('option[value="3"]').attributes('disabled')).toBeUndefined()
  expect(wrapper.get('option[value="2"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('option[value="2"]').text()).toContain('尚未启用读取隔离')
  wrapper.unmount()
})
