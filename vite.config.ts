import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 8010,
    proxy: {
      '/api': {
        target: 'http://localhost:9010',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:9010',
        ws: true,
      },
    },
  },
})
