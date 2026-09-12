# AGENTS.md

## 作用域

- 本文件适用于 `harness-front`。根目录 `AGENTS.md` 的跨项目、安全和 Git 约束继续生效。
- 当前工程使用 Vue 3 + TypeScript + Vite；Web 前端通过平台 HTTP API 和共享 WebSocket 获取业务数据与实时事件。

## 工程与目录

- Vue 单文件组件统一使用 Composition API 和 `<script setup lang="ts">`，文件内容顺序为 `template`、`script`、`style`。
- `.vue` 文件使用 PascalCase，目录使用 kebab-case。
- 页面放在 `src/views/<module>/`，通用业务组件放在 `src/components/`，shadcn-vue 基础组件只放在 `src/components/ui/`。
- 生产源码只放在 `src/`；测试源码统一放在顶层 `tests/` 并镜像被测模块目录。测试通过生产模块的 Interface 使用实现，`src/` 不得依赖 `tests/`。
- 路由入口固定为 `src/router/index.js`，转发到 `src/router/routes.ts` 统一维护路由；页面组件不自行注册全局路由。
- API 模块放在 `src/api/`，Axios 实例、超时、认证、错误归一化和拦截器只维护一份。跨页面状态放在 `src/stores/`，页面局部状态留在组件内。
- 全局样式和确有必要的复杂样式放在 `src/assets/styles/`；页面布局和普通样式优先使用 Tailwind CSS。

## 组件与交互

- 页面负责查询条件、加载状态和子组件编排；新增/编辑表单、确认操作及复杂详情分别封装成 Dialog、Sheet 或 AlertDialog 组件。
- 组件 Props、Emits、表单模型、路由参数、Store 和 API 类型必须显式声明；仅在外部数据边界短暂使用 `unknown` 并完成收窄，避免 `any`。
- 搜索区使用 Tailwind `flex` 或 `grid`；输入框 Enter 与搜索按钮调用同一个搜索动作。
- 表格默认占满容器；列宽超出时由外层提供横向滚动，不能压缩到内容不可读。
- 所有异步页面明确呈现 loading、empty、error 和 success 状态；破坏性操作必须二次确认并防止重复提交。
- 交互控件支持键盘操作、可见焦点和可辨识标签；图标按钮必须提供可访问名称。

## AI 对话与流式资源

- 消息模型使用可区分的结构化内容块；Markdown 和代码块经过统一、安全的渲染入口，不在组件中散落 `v-html`。
- WebSocket/流式请求保存明确的会话、Turn、事件序号和连接状态；重连遵守服务端游标语义，不用客户端文本拼接推断权威状态。
- 使用 `AbortController` 或等价机制管理取消；会话切换或页面卸载时取消对应请求并移除会话监听器，布局卸载时关闭共享 WebSocket。用户停止生成通过中断接口处理，并等待终态校准消息。
- 流式增量使用有界缓冲和批量刷新，避免每个 token 触发全页面深层响应式更新。
