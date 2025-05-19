import type { UserRole } from '@/components/common/Setting/model'
import { UserConfig } from '@/components/common/Setting/model'
import { ss } from '@/utils/storage'

const LOCAL_NAME = 'userStorage'

export interface UserInfo {
  avatar: string
  name: string
  description: string
  root: boolean
  config: UserConfig
  roles: UserRole[]
  advanced: SettingsState
  limit?: boolean
  useAmount?: number // chat usage amount
  redeemCardNo?: string // add giftcard info
}

export interface UserState {
  userInfo: UserInfo
}

export interface SettingsState {
  systemMessage: string
  temperature: number
  top_p: number
  maxContextCount: number
}

export function defaultSetting(): UserState {
  return {
    userInfo: {
      avatar: '',
      name: '',
      description: '',
      root: false,
      config: { chatModel: '' },
      roles: [],
      advanced: {
        systemMessage: 'You are a large language model. Follow the user\'s instructions carefully. Respond using markdown (latex start with $).',
        temperature: 0.8,
        top_p: 1,
        maxContextCount: 20,
      },
      useAmount: 1, // chat usage amount
    },
  }
}

export function getLocalState(): UserState {
  const localSetting: UserState | undefined = ss.get(LOCAL_NAME)
  if (localSetting != null && localSetting.userInfo != null) {
    if (localSetting.userInfo.config == null) {
      localSetting.userInfo.config = new UserConfig()
      localSetting.userInfo.config.chatModel = ''
    }
    if (!localSetting.userInfo.advanced) {
      localSetting.userInfo.advanced = {
        systemMessage: 'You are a large language model. Follow the user\'s instructions carefully. Respond using markdown (latex start with $).',
        temperature: 0.8,
        top_p: 1,
        maxContextCount: 20,
      }
    }
  }
  return { ...defaultSetting(), ...localSetting }
}

export function setLocalState(setting: UserState): void {
  ss.set(LOCAL_NAME, setting)
}
