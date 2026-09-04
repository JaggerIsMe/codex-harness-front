<template>
  <section
    v-if="viewItems.length"
    class="agent-process"
    :class="{ 'agent-process--streaming': streaming, 'is-expanded': expanded }"
  >
    <button
      type="button"
      class="agent-process__summary"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="agent-process__status">
        <span class="inline-flex animate-spin [&_svg]:size-4" v-if="streaming"><Loading /></span>
        <span class="inline-flex shrink-0 items-center [&_svg]:size-4" v-else><CircleCheck /></span>
      </span>
      <span class="agent-process__summary-copy">
        <strong>{{
          streaming
            ? 'Codex 正在处理'
            : incomplete
              ? 'Codex 处理已结束，部分结果未完成'
              : 'Codex 已完成处理'
        }}</strong>
        <small v-if="latestSummary">{{ latestSummary }}</small>
      </span>
      <span class="agent-process__count">{{ viewItems.length }} 个步骤</span>
      <span class="agent-process__chevron"><ArrowRight /></span>
    </button>

    <Transition>
      <div v-show="expanded" class="agent-process__timeline">
        <article
          v-for="(item, index) in viewItems"
          :key="`${item.key}-${index}`"
          class="process-step"
          :class="`process-step--${item.kind}`"
        >
          <div class="process-step__rail">
            <span class="process-step__icon">
              <span class="inline-flex shrink-0 items-center [&_svg]:size-4"
                ><ChatLineRound v-if="item.kind === 'commentary'" /><Aim
                  v-else-if="item.kind === 'reasoning'" /><Search
                  v-else-if="item.kind === 'search'" /><Monitor
                  v-else-if="item.kind === 'command' || item.kind === 'output'" /><Document
                  v-else-if="item.kind === 'file'" /><Warning
                  v-else-if="item.kind === 'error'" /><More v-else
              /></span>
            </span>
          </div>
          <div class="process-step__body">
            <header>
              <strong>{{ item.title }}</strong>
              <span v-if="streaming && item.streaming" class="process-step__live">进行中</span>
              <span v-else-if="item.status === 'INCOMPLETE' || item.status === 'INTERRUPTED'"
                >未完成</span
              >
            </header>
            <MessageContent v-if="item.narrative && item.content" :content="item.content" />
            <pre v-else-if="item.content">{{ item.content }}</pre>
          </div>
        </article>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import type { ProcessItem } from '@/types/domain'
import { computed, ref } from 'vue'
import {
  Target as Aim,
  ArrowRight,
  MessageCircle as ChatLineRound,
  CircleCheck,
  FileText as Document,
  LoaderCircle as Loading,
  Monitor,
  Ellipsis as More,
  Search,
  TriangleAlert as Warning,
} from 'lucide-vue-next'
import MessageContent from './MessageContent.vue'

const props = withDefaults(
  defineProps<{ items: ProcessItem[]; streaming?: boolean; incomplete?: boolean }>(),
  {
    streaming: false,
    incomplete: false,
  },
)
interface ActivityDetails {
  type?: string
  message?: string
  name?: string
  path?: string
  filePath?: string
  query?: string
  command?: string | string[]
  results?: unknown[]
  action?: { query?: string; queries?: string[] }
}
const expanded = ref(false)

const viewItems = computed(() => props.items.map(toViewItem).filter((item) => item !== null))
const latestSummary = computed(() => {
  const latest =
    [...viewItems.value].reverse().find((item) => item.content)?.content ||
    viewItems.value.at(-1)?.title ||
    ''
  const summary = latest.replace(/\s+/g, ' ').trim()
  return summary.length > 76 ? `${summary.slice(0, 76)}…` : summary
})

function toViewItem(item: ProcessItem) {
  const content = item.content?.trim() || ''
  if (item.messageType === 'COMMENTARY')
    return viewItem(item, 'commentary', '过程说明', content, true)
  if (item.messageType === 'REASONING')
    return viewItem(item, 'reasoning', '分析与计划', content, true)
  if (item.messageType === 'COMMAND')
    return viewItem(item, 'command', '执行命令', readableContent(content))
  if (item.messageType === 'COMMAND_OUTPUT') return viewItem(item, 'output', '命令输出', content)
  if (item.messageType === 'FILE_CHANGE')
    return viewItem(item, 'file', '修改文件', readableContent(content))
  if (item.messageType === 'ERROR')
    return viewItem(item, 'error', '遇到警告', readableContent(content), true)
  return activityViewItem(item, content)
}

function activityViewItem(item: ProcessItem, content: string) {
  const details = parseDetails(content)
  if (!details) return viewItem(item, 'activity', '处理步骤', content)
  if (details.type === 'reasoning') return null
  if (details.type === 'webSearch') {
    const query =
      details.query ||
      details.action?.query ||
      details.action?.queries?.filter(Boolean).join('、') ||
      ''
    const count = Array.isArray(details.results) ? details.results.length : 0
    return viewItem(
      item,
      'search',
      '搜索网页',
      [query, count ? `找到 ${count} 条结果` : ''].filter(Boolean).join(' · '),
    )
  }
  if (details.type === 'commandExecution')
    return viewItem(item, 'command', '执行命令', commandText(details))
  if (details.type === 'fileChange')
    return viewItem(item, 'file', '修改文件', readableContent(content))
  const labels: Record<string, string> = {
    plan: '更新计划',
    mcpToolCall: '调用工具',
    dynamicToolCall: '调用工具',
    imageView: '查看图片',
  }
  const label = labels[details.type || ''] || '处理步骤'
  return viewItem(item, 'activity', label, details.message || details.name || details.type || '')
}

function viewItem(
  item: ProcessItem,
  kind: string,
  title: string,
  content: string,
  narrative = false,
) {
  return { ...item, kind, title, content, narrative }
}

function readableContent(content: string) {
  const details = parseDetails(content)
  if (!details) return content
  return (
    commandText(details) ||
    details.message ||
    details.path ||
    details.filePath ||
    JSON.stringify(details, null, 2)
  )
}

function commandText(details: ActivityDetails) {
  if (typeof details.command === 'string') return details.command
  if (Array.isArray(details.command)) return details.command.join(' ')
  return ''
}

function parseDetails(content: string): ActivityDetails | null {
  if (!content.startsWith('{') && !content.startsWith('[')) return null
  try {
    const raw: unknown = JSON.parse(content)
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const value = raw as Record<string, unknown>
    const text = (key: string) =>
      typeof value[key] === 'string' ? (value[key] as string) : undefined
    const action =
      value.action && typeof value.action === 'object'
        ? (value.action as Record<string, unknown>)
        : {}
    return {
      type: text('type'),
      message: text('message'),
      name: text('name'),
      path: text('path'),
      filePath: text('filePath'),
      query: text('query'),
      command:
        typeof value.command === 'string'
          ? value.command
          : Array.isArray(value.command)
            ? value.command.filter((item): item is string => typeof item === 'string')
            : undefined,
      results: Array.isArray(value.results) ? value.results : undefined,
      action: {
        query: typeof action.query === 'string' ? action.query : undefined,
        queries: Array.isArray(action.queries)
          ? action.queries.filter((item): item is string => typeof item === 'string')
          : undefined,
      },
    }
  } catch {
    return null
  }
}
</script>
