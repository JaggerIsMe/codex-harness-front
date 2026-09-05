import { afterEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import ProjectExperts from '@/views/expert/ProjectExperts.vue'
import { useProjectExpertUpgradeNotice } from '@/composables/useProjectExpertUpgradeNotice'
import { bindExpert, getProjectExperts } from '@/api/expert'
import type { ProjectExperts as ProjectExpertsState } from '@/types/expert'

vi.mock('vue-router', () => ({ useRoute: () => ({ params: { projectId: 3 } }) }))
vi.mock('vue-sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('@/api/expert', () => ({
  getProjectExperts: vi.fn(),
  bindExpert: vi.fn(),
  unbindExpert: vi.fn(),
}))

let wrapper: VueWrapper
afterEach(() => wrapper?.unmount())

const state = (upgraded: boolean): ProjectExpertsState => ({
  projectRevision: upgraded ? 2 : 1,
  experts: [
    {
      expertId: 10,
      expertVersionId: upgraded ? 101 : 100,
      versionNo: upgraded ? 2 : 1,
      latestVersionId: 101,
      latestVersionNo: 2,
      upgradeAvailable: !upgraded,
      name: 'Java 开发专家',
      description: 'Java 开发',
      available: true,
      unavailableReason: null,
    },
  ],
})

it('signals an available project expert upgrade', async () => {
  vi.mocked(getProjectExperts).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: state(false),
  })
  wrapper = mount(
    defineComponent({
      setup() {
        const projectId = ref(3)
        return { available: useProjectExpertUpgradeNotice(projectId) }
      },
      template: '<span v-if="available" aria-label="项目专家有新版本"></span>',
    }),
  )
  await flushPromises()
  expect(wrapper.get('[aria-label="项目专家有新版本"]').exists()).toBe(true)
})

it('upgrades a specified expert from the project expert list', async () => {
  vi.mocked(getProjectExperts).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: state(false),
  })
  vi.mocked(bindExpert).mockResolvedValue({
    status: 'success',
    code: 200,
    info: '',
    data: state(true),
  })
  wrapper = mount(ProjectExperts, {
    global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
  })
  await flushPromises()

  expect(wrapper.text()).toContain('可升级至 v2')
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '升级到 v2')!
    .trigger('click')
  await flushPromises()

  expect(bindExpert).toHaveBeenCalledWith('3', 101, 1)
  expect(wrapper.text()).not.toContain('可升级至 v2')
  expect(wrapper.text()).toContain('v2')
})
