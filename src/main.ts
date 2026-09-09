import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'vue-sonner/style.css'
import './assets/styles/theme.scss'
import './assets/styles/index.scss'
import { toast } from 'vue-sonner'
import { ApiError } from './api/request'
import App from './App.vue'
import router from './router/index.js'
import { useThemeStore } from './stores/theme'
const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
useThemeStore(pinia)
app.use(router)
app.config.errorHandler = (error) => {
  if (!(error instanceof ApiError))
    toast.error(error instanceof Error ? error.message : '操作失败，请重试')
}
app.mount('#app')
