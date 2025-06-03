import type { GlobalThemeOverrides } from 'naive-ui'
import { darkTheme, useOsTheme } from 'naive-ui'
import { useAppStore } from '@/store'

export function useTheme() {
  const appStore = useAppStore()

  const OsTheme = useOsTheme()

  const isDark = computed(() => {
    if (appStore.theme === 'auto')
      return OsTheme.value === 'dark'
    else
      return appStore.theme === 'dark'
  })

  const theme = computed(() => {
    return isDark.value ? darkTheme : undefined
  })

  const themeOverrides = computed<GlobalThemeOverrides>(() => {
    if (isDark.value) {
      return {
        common: {},
      }
    }
    return {}
  })

  watch(
    () => isDark.value,
    (dark) => {
      if (dark) {
        document.documentElement.classList.add('dark')
        document.querySelector('head meta[name="theme-color"]')?.setAttribute('content', '#121212')
      }
      else {
        document.documentElement.classList.remove('dark')
        document.querySelector('head meta[name="theme-color"]')?.setAttribute('content', '#eee')
      }
    },
    { immediate: true },
  )

  return { theme, themeOverrides }
}
