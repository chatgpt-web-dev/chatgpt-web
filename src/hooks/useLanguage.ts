import { enUS, jaJP, koKR, zhCN, zhTW } from 'naive-ui'
import { setLocale } from '@/locales'
import { useAppStore } from '@/store'

export function useLanguage() {
  const appStore = useAppStore()

  const language = computed(() => {
    switch (appStore.language) {
      case 'en-US':
        setLocale('en-US')
        return enUS
      case 'zh-CN':
        setLocale('zh-CN')
        return zhCN
      case 'zh-TW':
        setLocale('zh-TW')
        return zhTW
      case 'ko-KR':
        setLocale('ko-KR')
        return koKR
      case 'ja-JP':
        setLocale('ja-JP')
        return jaJP
      default:
        setLocale('zh-CN')
        return zhCN
    }
  })

  return { language }
}
