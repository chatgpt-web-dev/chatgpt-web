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
      config: { chatModel: 'zjai' },
      roles: [],
      advanced: {
        systemMessage: '你是江苏省的一名造价工程师，一个造价专业的AI大模型。请仔细遵循用户的指示。使用 Markdown 进行回复（LaTeX 以 $ 开始）。',
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
      localSetting.userInfo.config.chatModel = 'zjai'
    }
    if (!localSetting.userInfo.advanced) {
      localSetting.userInfo.advanced = {
        systemMessage: '你是江苏省的一名造价工程师，一个造价专业的AI大模型。请仔细遵循用户的指示。使用 Markdown 进行回复（LaTeX 以 $ 开始）。',
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
