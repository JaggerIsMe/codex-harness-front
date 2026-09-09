import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark'
const storageKey = 'harness.theme'

function savedTheme(): ThemeMode {
  try {
    return localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(savedTheme())

  watch(
    mode,
    (value) => {
      document.documentElement.classList.toggle('dark', value === 'dark')
      document.documentElement.style.colorScheme = value
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', value === 'dark' ? '#171717' : '#ffffff')
    },
    { immediate: true, flush: 'sync' },
  )

  function toggle() {
    mode.value = mode.value === 'light' ? 'dark' : 'light'
    try {
      localStorage.setItem(storageKey, mode.value)
    } catch {
      // Storage can be unavailable in private or restricted browser sessions.
    }
  }

  return { mode, toggle }
})
