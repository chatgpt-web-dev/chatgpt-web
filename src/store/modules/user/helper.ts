import type { UserRole } from '@/components/common/Setting/model'
import { UserConfig } from '@/components/common/Setting/model'
import { ss } from '@/utils/storage'

const LOCAL_NAME = 'userStorage'

export interface UserInfo {
  avatar: string
  name: string
  systemRole: string
  temperature: number
  top_p: number
  presencePenalty: number
  description: string
  root: boolean
  config: UserConfig
  roles: UserRole[]
}

export interface UserState {
  userInfo: UserInfo
}

export function defaultSetting(): UserState {
  return {
    userInfo: {
      avatar: '',
      systemRole: '',
      temperature: 0.8,
      top_p: 0.9,
      presencePenalty: 0.6,
      name: '',
      description: '',
      root: false,
      config: { chatModel: 'gpt-3.5-turbo' },
      roles: [],
    },
  }
}

export function getLocalState(): UserState {
  const localSetting: UserState | undefined = ss.get(LOCAL_NAME)
  if (localSetting != null && localSetting.userInfo != null && localSetting.userInfo.config == null) {
    localSetting.userInfo.config = new UserConfig()
    localSetting.userInfo.config.chatModel = 'gpt-3.5-turbo'
  }
  return { ...defaultSetting(), ...localSetting }
}

export function setLocalState(setting: UserState): void {
  ss.set(LOCAL_NAME, setting)
}
