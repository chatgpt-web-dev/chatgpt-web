import type { App } from 'vue'
import type { Language } from '@/store/modules/app/helper'
import { createI18n } from 'vue-i18n'
import { useAppStoreWithOut } from '@/store/modules/app'
import enUS from './en-US.json'
import koKR from './ko-KR.json'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'

const appStore = useAppStoreWithOut()

const defaultLocale = appStore.language || 'zh-CN'

// Type-define 'en-US' as the master schema for the resource
type MessageSchema = typeof enUS

const i18n = createI18n<[MessageSchema], Language>({
  legacy: false,
  globalInjection: false,
  locale: defaultLocale,
  fallbackLocale: 'en-US',
  messages: {
    'en-US': enUS,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    'ko-KR': koKR,
  },
})

export function setLocale(locale: Language) {
  // @ts-expect-error i18n.global.locale is ComputedRefImpl
  i18n.global.locale.value = locale
  appStore.setLanguage(locale)
}

export function setupI18n(app: App) {
  app.use(i18n)
}
