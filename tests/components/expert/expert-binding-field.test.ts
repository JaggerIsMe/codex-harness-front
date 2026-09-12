import { afterEach, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import ExpertBindingField from '@/components/expert/ExpertBindingField.vue'

let wrapper: VueWrapper
afterEach(() => wrapper?.unmount())
function setup(kind: 'Skills' | 'MCP' = 'Skills', selected: number[] = [1]) {
  wrapper = mount(ExpertBindingField, {
    props: {
      kind,
      title: kind,
      modelValue: selected,
      options: [
        { id: 1, label: 'review · 1.0' },
        { id: 2, label: 'research · 2.0', tag: '团队常用' },
        { id: 3, label: 'search · 1.0' },
        { id: 4, label: 'disabled · 1.0', unavailable: true },
      ],
      'onUpdate:modelValue': (value: number[]) => wrapper.setProps({ modelValue: value }),
    },
    global: {
      stubs: { AppDialog: { template: '<div role="dialog"><slot /><slot name="footer" /></div>' } },
    },
  })
}
async function click(text: string) {
  await wrapper
    .findAll('button')
    .find((button) => button.text() === text)!
    .trigger('click')
}

it.each(['Skills', 'MCP'] as const)(
  'shows only bound %s and adds searched choices after confirmation',
  async (kind) => {
    setup(kind)
    expect(wrapper.text()).toContain('review · 1.0')
    expect(wrapper.text()).not.toContain('research')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
    await click(`添加 ${kind}`)
    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.text()).not.toContain('review')
    expect(dialog.text()).not.toContain('disabled')
    await dialog.get('input[type="text"]').setValue('research')
    await dialog.get('input[type="text"]').trigger('keyup.enter')
    expect(dialog.findAll('input[type="checkbox"]')).toHaveLength(1)
    await dialog.get('input[type="checkbox"]').setValue(true)
    expect(wrapper.props('modelValue')).toEqual([1])
    await click('确认添加')
    expect(wrapper.props('modelValue')).toEqual([1, 2])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.findAll('li')).toHaveLength(2)
    await wrapper.get('button[aria-label="移除 review · 1.0"]').trigger('click')
    expect(wrapper.props('modelValue')).toEqual([2])
  },
)

it('finds Skill candidates by tag using Enter', async () => {
  setup('Skills')
  await click('添加 Skills')
  const dialog = wrapper.get('[role="dialog"]')
  await dialog.get('input[type="text"]').setValue('团队常用')
  await dialog.get('input[type="text"]').trigger('keyup.enter')
  expect(dialog.findAll('input[type="checkbox"]')).toHaveLength(1)
  expect(dialog.text()).toContain('research · 2.0')
  expect(dialog.text()).toContain('标签：团队常用')
  await dialog.get('input[type="checkbox"]').setValue(true)
  await click('确认添加')
  expect(wrapper.props('modelValue')).toEqual([1, 2])
})

it('starts empty for creation and discards unconfirmed additions when cancelled', async () => {
  setup('Skills', [])
  expect(wrapper.text()).toContain('尚未绑定 Skills')
  expect(wrapper.text()).not.toContain('review')
  await click('添加 Skills')
  await wrapper.get('input[type="checkbox"]').setValue(true)
  await click('取消')
  expect(wrapper.props('modelValue')).toEqual([])
  await click('添加 Skills')
  expect(
    wrapper
      .findAll('input[type="checkbox"]')
      .every((input) => !(input.element as HTMLInputElement).checked),
  ).toBe(true)
})
