<template>
  <main class="login-page">
    <section class="login-intro">
      <div class="login-intro__content">
        <div class="login-logo"><span>H</span> My Harness For Codex</div>
        <p class="login-intro__eyebrow">REMOTE CODEX OPERATIONS</p>
        <h1>把每一台开发设备，<br />连接成一个可控的执行网络。</h1>
        <p class="login-intro__description">
          从一个中台发起 Codex 会话，实时查看执行过程，并在高风险操作发生前做出决定。
        </p>
        <div class="login-features">
          <div><strong>实时</strong><span>任务流与设备状态</span></div>
          <div><strong>受控</strong><span>工作区与操作审批</span></div>
          <div><strong>清晰</strong><span>会话记录与审计轨迹</span></div>
        </div>
      </div>
    </section>

    <section class="login-panel">
      <div class="login-card">
        <p class="login-card__eyebrow">WELCOME BACK</p>
        <h2>登录管理中台</h2>
        <p class="login-card__hint">使用管理员账号继续</p>

        <AppForm ref="formRef" :model="form" :rules="rules" @keyup.enter="submitLogin">
          <FormField label="用户名" prop="username">
            <AppInput v-model.trim="form.username" size="large" placeholder="请输入用户名" />
          </FormField>
          <FormField label="密码" prop="password">
            <AppInput
              v-model="form.password"
              size="large"
              type="password"
              placeholder="请输入密码"
            />
          </FormField>
          <AppButton
            class="login-submit"
            tone="primary"
            size="large"
            :loading="submitting"
            @click="submitLogin"
          >
            登录
            <span class="inline-flex shrink-0 items-center [&_svg]:size-4" v-if="!submitting"
              ><Right
            /></span>
          </AppButton>
        </AppForm>

        <p class="login-card__security">凭证仅用于连接 Harness Server，不会发送到目标设备。</p>
      </div>
      <p class="login-panel__footer">My Harness For Codex · V1.0</p>
    </section>
  </main>
</template>

<script setup lang="ts">
import FormField from '@/components/common/FormField.vue'
import AppForm from '@/components/common/AppForm.vue'
import AppInput from '@/components/common/AppInput.vue'
import AppButton from '@/components/common/AppButton.vue'
import type { FormRules, FormHandle } from '@/components/common/form'
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight as Right } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useAuthStore } from '../../stores/auth'
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const formRef = ref<FormHandle | null>(null)
const submitting = ref(false)
const form = reactive({
  username: '',
  password: '',
})
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function submitLogin() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    await authStore.signIn(form)
    toast.success('登录成功')
    const redirect =
      typeof route.query.redirect === 'string' &&
      route.query.redirect.startsWith('/') &&
      !route.query.redirect.startsWith('//')
        ? route.query.redirect
        : authStore.home
    await router.replace(redirect)
  } catch {
    // 错误提示由请求层统一展示。
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped src="../../assets/styles/login.scss"></style>
