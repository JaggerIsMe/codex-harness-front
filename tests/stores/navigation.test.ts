import { beforeEach, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useNavigationStore } from '@/stores/navigation'
import { getConversations } from '@/api/conversation'
import type { ApiResponse, Conversation } from '@/types/domain'

vi.mock('@/api/conversation', () => ({ getConversations: vi.fn() }))
const conversation: Conversation = {
  id: 4,
  projectId: 3,
  projectName: 'Project',
  deviceId: 1,
  workspaceId: 2,
  title: 'Conversation',
  status: 'ACTIVE',
  codexThreadId: 'thread',
}
const result = (data: Conversation[]): ApiResponse<Conversation[]> => ({
  status: 'success',
  code: 200,
  info: '',
  data,
})
beforeEach(() => {
  vi.resetAllMocks()
  setActivePinia(createPinia())
})

it('merges newly created conversations with an older pending list without duplicates or truncation', async () => {
  let resolve!: (value: ApiResponse<Conversation[]>) => void
  vi.mocked(getConversations).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const store = useNavigationStore()
  const loading = store.load(3)
  await store.load(3)
  expect(getConversations).toHaveBeenCalledTimes(1)
  store.upsert({ ...conversation, title: 'Updated title' })
  store.upsert({ ...conversation, id: 5, title: 'Created while loading' })
  resolve(
    result([
      conversation,
      ...Array.from({ length: 110 }, (_, i) => ({ ...conversation, id: i + 10 })),
    ]),
  )
  await loading
  expect(store.conversations[3]).toHaveLength(112)
  expect(store.conversations[3].find((item) => item.id === 4)?.title).toBe('Updated title')
  expect(store.conversations[3].find((item) => item.id === 5)?.title).toBe('Created while loading')
})

it('aborts sidebar requests on reset and ignores late responses from the previous session', async () => {
  let resolve!: (value: ApiResponse<Conversation[]>) => void
  vi.mocked(getConversations).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const store = useNavigationStore()
  const loading = store.load(3)
  const signal = vi.mocked(getConversations).mock.calls[0][1]!
  store.reset()
  expect(signal.aborted).toBe(true)
  resolve(result([conversation]))
  await loading
  expect(store.conversations).toEqual({})
  expect(store.loading).toEqual({})
})
