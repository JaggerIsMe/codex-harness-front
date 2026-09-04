import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import AppSelect from '@/components/common/AppSelect.vue'

it('emits the updated numeric selection so dependent directory loading receives the selected device', async () => {
  const selected: unknown[] = []
  const wrapper = mount(
    defineComponent({
      components: { AppSelect },
      setup() {
        return {
          device: ref<number | null>(null),
          changed: (value: unknown) => selected.push(value),
        }
      },
      template:
        '<AppSelect v-model="device" @change="changed"><option :value="1">One</option><option :value="2">Two</option></AppSelect>',
    }),
  )
  await wrapper.find('select').setValue('1')
  await wrapper.find('select').setValue('2')
  expect(selected).toEqual([1, 2])
  wrapper.unmount()
})
