<template>
  <AppDialog
    :model-value="modelValue"
    :title="configuration ? '编辑 MCP 配置并创建新版本' : '创建 MCP 配置'"
    width="820px"
    @close="close"
  >
    <form class="space-y-4" @submit.prevent="save">
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block space-y-2">名称<AppInput v-model="form.name" maxlength="128" /></label>
        <label class="block space-y-2"
          >Server Code<AppInput v-model="form.serverCode" maxlength="64" placeholder="例如 github"
        /></label>
      </div>
      <label class="block space-y-2"
        >描述<AppInput v-model="form.description" type="textarea" :rows="2" maxlength="2000"
      /></label>
      <label class="block space-y-2"
        >Transport<AppSelect v-model="form.transportType"
          ><option value="STDIO">STDIO（本地进程）</option>
          <option value="STREAMABLE_HTTP">Streamable HTTP</option></AppSelect
        ></label
      >
      <fieldset v-if="form.transportType === 'STDIO'" class="rounded-lg border p-4">
        <legend class="px-2 font-medium">STDIO 运行参数</legend>
        <div class="space-y-4">
          <label class="block space-y-2"
            >Command<AppInput v-model="form.command" placeholder="例如 npx" maxlength="1024"
          /></label>
          <label class="block space-y-2"
            >Args（每行一个参数）<AppInput v-model="argsText" type="textarea" :rows="4"
          /></label>
          <label class="block space-y-2"
            >环境变量名（每行一个，不填写值）<AppInput
              v-model="envVarsText"
              type="textarea"
              :rows="3"
              placeholder="GITHUB_TOKEN"
          /></label>
          <label class="flex items-center gap-2"
            ><input v-model="workspaceCwd" type="checkbox" />以当前 Conversation Workspace 为
            cwd</label
          >
        </div>
      </fieldset>
      <fieldset v-else class="rounded-lg border p-4">
        <legend class="px-2 font-medium">Streamable HTTP 参数</legend>
        <div class="space-y-4">
          <label class="block space-y-2"
            >URL<AppInput v-model="form.url" placeholder="https://mcp.example.com/mcp"
          /></label>
          <label class="block space-y-2"
            >Header 密钥（每行 Header=密钥）<AppInput
              v-model="headersText"
              type="textarea"
              :rows="3"
              placeholder="X-Mcp-Key=实际密钥；Bearer 认证填写 Authorization=Bearer 实际令牌"
          /></label>
        </div>
      </fieldset>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block space-y-2"
          >启动超时（秒）<AppInput v-model="startupTimeout" type="number" min="1" max="120"
        /></label>
        <label class="block space-y-2"
          >工具超时（秒）<AppInput v-model="toolTimeout" type="number" min="1" max="600"
        /></label>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <label class="block space-y-2"
          >仅启用工具（每行一个，可留空）<AppInput
            v-model="enabledToolsText"
            type="textarea"
            :rows="3"
        /></label>
        <label class="block space-y-2"
          >禁用工具（每行一个，可留空）<AppInput
            v-model="disabledToolsText"
            type="textarea"
            :rows="3"
        /></label>
      </div>
      <label class="flex items-center gap-2"
        ><input v-model="form.required" type="checkbox" />MCP Server 启动失败时阻止 Turn</label
      >
      <p class="rounded-md bg-muted p-3 text-sm text-muted-foreground">
        HTTP Header 密钥由 Harness
        随不可变配置版本托管，查询时只显示掩码。编辑配置时必须重新填写全部密钥。
      </p>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
    </form>
    <template #footer>
      <AppButton :disabled="saving" @click="close">取消</AppButton>
      <AppButton tone="primary" :loading="saving" @click="save">{{
        configuration ? '保存新版本' : '创建'
      }}</AppButton>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import AppButton from '@/components/common/AppButton.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppSelect from '@/components/common/AppSelect.vue'
import { saveMcpConfiguration } from '@/api/mcp'
import type { McpConfiguration, McpConfigurationDraft } from '@/types/mcp'

const props = defineProps<{ modelValue: boolean; configuration: McpConfiguration | null }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; saved: [] }>()
const empty = (): McpConfigurationDraft => ({
  serverCode: '',
  name: '',
  description: '',
  transportType: 'STDIO',
  command: '',
  args: [],
  cwdMode: 'WORKSPACE',
  envVars: [],
  url: '',
  httpHeaders: {},
  startupTimeoutSeconds: 10,
  toolTimeoutSeconds: 60,
  required: true,
  enabledTools: [],
  disabledTools: [],
})
const form = reactive<McpConfigurationDraft>(empty())
const argsText = ref('')
const envVarsText = ref('')
const headersText = ref('')
const enabledToolsText = ref('')
const disabledToolsText = ref('')
const startupTimeout = ref('10')
const toolTimeout = ref('60')
const workspaceCwd = ref(true)
const saving = ref(false)
const error = ref('')

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    const current = props.configuration
    const next = current
      ? {
          ...current.runtimeSpec,
          serverCode: current.serverCode,
          name: current.name,
          description: current.description,
          revision: current.revision,
        }
      : empty()
    Object.assign(form, next)
    argsText.value = next.args.join('\n')
    envVarsText.value = next.envVars.join('\n')
    headersText.value = Object.keys(next.httpHeaders)
      .map((name) => `${name}=`)
      .join('\n')
    enabledToolsText.value = next.enabledTools.join('\n')
    disabledToolsText.value = next.disabledTools.join('\n')
    startupTimeout.value = String(next.startupTimeoutSeconds)
    toolTimeout.value = String(next.toolTimeoutSeconds)
    workspaceCwd.value = next.cwdMode === 'WORKSPACE'
    error.value = ''
  },
)

function lines(value: string) {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}
function headers(value: string) {
  const result: Record<string, string> = {}
  for (const line of lines(value)) {
    const separator = line.indexOf('=')
    if (separator < 1 || !line.slice(separator + 1).trim())
      throw new Error(`Header 密钥格式不正确：${line}`)
    result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return result
}
function close() {
  if (!saving.value) emit('update:modelValue', false)
}
async function save() {
  if (saving.value) return
  if (!form.name.trim() || !form.serverCode.trim()) {
    error.value = '请填写名称和 Server Code'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const payload: McpConfigurationDraft = {
      ...form,
      command: form.transportType === 'STDIO' ? form.command.trim() : '',
      args: form.transportType === 'STDIO' ? lines(argsText.value) : [],
      cwdMode: form.transportType === 'STDIO' && workspaceCwd.value ? 'WORKSPACE' : null,
      envVars: form.transportType === 'STDIO' ? lines(envVarsText.value) : [],
      url: form.transportType === 'STREAMABLE_HTTP' ? form.url.trim() : '',
      httpHeaders: form.transportType === 'STREAMABLE_HTTP' ? headers(headersText.value) : {},
      startupTimeoutSeconds: Number(startupTimeout.value),
      toolTimeoutSeconds: Number(toolTimeout.value),
      enabledTools: lines(enabledToolsText.value),
      disabledTools: lines(disabledToolsText.value),
    }
    await saveMcpConfiguration(props.configuration?.id ?? null, payload)
    emit('saved')
    emit('update:modelValue', false)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '保存失败'
  } finally {
    saving.value = false
  }
}
</script>
