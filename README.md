# My Harness For Codex 前端

技术栈：Vue 3 Composition API、TypeScript strict、Vite、shadcn-vue（Reka UI）、Tailwind CSS 4、Axios、Pinia、Vue Router。

## 开发

建议使用 Node.js 24 LTS 的最新补丁版本。

```sh
npm ci
npm run dev
```

开发地址为 `http://localhost:8010`。Vite 将 `/api` 和 `/ws` 代理到本地 `9010` 端口。
可通过 `.env.local` 配置 `VITE_API_BASE_URL` 和 `VITE_WS_BASE_URL`；后者填写 WebSocket 服务的基础地址，不包含 `/ws/client`。

## 目录

- `src/views/`：页面和交互编排。
- `src/components/ui/`：通过 shadcn-vue CLI 安装的基础组件源码。
- `src/components/common/`：业务共享的表单、通知确认和控件组合。
- `src/components/<module>/`：独立业务弹窗和会话组件。
- `src/api/`：统一 Axios 实例、认证、错误归一化以及有类型的 API。
- `src/stores/`：Pinia 跨页面状态。
- `src/types/domain.ts`：与后端 VO 对齐的数据和消息类型。
- `src/router/index.js`：路由入口，转发到有类型的 `routes.ts`。
- `src/assets/styles/`：全部 SCSS、主题和 Tailwind 入口。
- `tests/`：消息回放、组件、Store 及浏览器回归测试。

## 样式与组件

界面采用白色和中性灰主题，无全局顶部导航。导航按权限展示，管理员可管理用户、机器分配、设备和 Skills；普通用户使用个人项目、会话与修改密码。新建项目只需选择已分配机器并填写名称，平台自动准备独占目录，支持准备状态与失败重试。手机端使用可收起的导航抽屉。完整方案与上线步骤见 [用户与机器授权](../docs/user-device-rbac.md)。

对话采用居中的单列阅读区：用户气泡靠右，Agent 回答无头像，输入区固定在阅读区底部。侧栏会话列表由独立 Pinia Store 管理，浏览项目不会切换正在阅读的会话；布局卸载时取消待处理的侧栏请求。

页面普通布局使用 Tailwind；复杂布局和 Markdown 排版保留为 SCSS。
样式通过 Vite 的 Sass 预处理后，再由 `@tailwindcss/postcss` 生成工具类。
`theme.scss` 中框架样式使用 CSS import，避免 Sass 将 Tailwind 的自定义语法当作 Sass 解析。

shadcn-vue 配置位于 `components.json`。新增组件可运行：

```sh
npx shadcn-vue@latest add <component>
```

新组件须保持 `template`、`script setup lang="ts"`、`style` 的顺序。
基础组件保持局部导入，不再全局注册 UI 库。
表格占满容器，超宽列由容器横向滚动；表单保留必填、格式和自定义校验。

## 请求和实时消息

API 统一返回 `ApiResponse<T>`；ZIP 下载单独返回 `Blob`。
错误提示和 401 跳转在请求层统一处理，取消请求不弹出错误通知。
Markdown 通过统一组件经 DOMPurify 清理后展示。

当前后端推送使用共享 WebSocket，此次迁移保持协议兼容，没有改造为尚不存在的 SSE 接口。
会话页面离开时取消快照请求、清理增量缓冲和监听；布局卸载时关闭 WebSocket 并移除监听。
实时帧先校验结构，再以 50ms / 最多 256 帧批量刷新。增量仅用于临时展示，重连和终态事件通过 REST 快照校准；临时消息序号不是服务端恢复游标。

## 验证

```sh
npm run typecheck
npm test
npm run test:unit
npx playwright install chromium
npm run test:e2e
npm run format:check
npm run build
```

浏览器测试使用独立的 `18011` 端口和模拟 API / WebSocket，覆盖登录校验、Enter 搜索、确认取消、注册码、Skill 版本和弹窗、Markdown、移动布局、Tailwind 计算样式，以及侧栏新建项目/会话、工作区搜索和移动导航。
这些测试不会操作真实设备或下发真实 Skill；真实 Agent 端到端联调仍需运行后端服务。

参考：[shadcn-vue 安装](https://www.shadcn-vue.com/docs/installation/vite)、[Tailwind PostCSS 安装](https://tailwindcss.com/docs/installation/using-postcss)。
