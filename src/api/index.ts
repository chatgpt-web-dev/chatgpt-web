import type { AxiosProgressEvent, GenericAbortSignal } from 'axios'
import type { AnnounceConfig, AuditConfig, ConfigState, GiftCard, KeyConfig, MailConfig, SearchConfig, SiteConfig, Status, UserInfo, UserPassword, UserPrompt } from '@/components/common/Setting/model'
import type { SettingsState } from '@/store/modules/user/helper'
import { useAuthStore, useUserStore } from '@/store'
import { get, post } from '@/utils/request'

export function fetchAnnouncement<T = any>() {
  return post<T>({
    url: '/announcement',
  })
}

export function fetchChatConfig<T = any>() {
  return post<T>({
    url: '/config',
  })
}

// SSE 事件处理器接口
interface SSEEventHandlers {
  onMessage?: (data: any) => void
  onDelta?: (delta: { reasoning?: string, text?: string }) => void
  onSearchQuery?: (data: { searchQuery: string }) => void
  onSearchResults?: (data: { searchResults: any[], searchUsageTime: number }) => void
  onComplete?: (data: any) => void
  onError?: (error: string) => void
  onEnd?: () => void
}

// 新的 SSE 聊天处理函数
export function fetchChatAPIProcessSSE(
  params: {
    roomId: number
    uuid: number
    regenerate?: boolean
    prompt: string
    uploadFileKeys?: string[]
    options?: { conversationId?: string, parentMessageId?: string }
    signal?: AbortSignal
  },
  handlers: SSEEventHandlers,
): Promise<void> {
  const userStore = useUserStore()
  const authStore = useAuthStore()

  const data: Record<string, any> = {
    roomId: params.roomId,
    uuid: params.uuid,
    regenerate: params.regenerate || false,
    prompt: params.prompt,
    uploadFileKeys: params.uploadFileKeys,
    options: params.options,
    systemMessage: userStore.userInfo.advanced.systemMessage,
    temperature: userStore.userInfo.advanced.temperature,
    top_p: userStore.userInfo.advanced.top_p,
  }

  return new Promise((resolve, reject) => {
    const baseURL = import.meta.env.VITE_GLOB_API_URL || ''
    const url = `${baseURL}/api/chat-process`

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authStore.token ? `Bearer ${authStore.token}` : '',
      },
      body: JSON.stringify(data),
      signal: params.signal,
    }).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new Error('No reader available')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      function readStream(): void {
        reader!.read().then(({ done, value }) => {
          if (done) {
            handlers.onEnd?.()
            resolve()
            return
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep the incomplete line in buffer

          for (const line of lines) {
            if (line.trim() === '')
              continue

            if (line.startsWith('event: ')) {
              // const _eventType = line.substring(7).trim()
              continue
            }

            if (line.startsWith('data: ')) {
              const data = line.substring(6).trim()

              if (data === '[DONE]') {
                handlers.onEnd?.()
                resolve()
                return
              }

              try {
                const jsonData = JSON.parse(data)

                // 根据前面的 event 类型分发到不同的处理器
                if (jsonData.message) {
                  handlers.onError?.(jsonData.message)
                }
                else if (jsonData.searchQuery) {
                  handlers.onSearchQuery?.(jsonData)
                }
                else if (jsonData.searchResults) {
                  handlers.onSearchResults?.(jsonData)
                }
                else if (jsonData.m) {
                  handlers.onDelta?.(jsonData.m)
                }
                else {
                  handlers.onMessage?.(jsonData)
                }
              }
              catch (e) {
                console.error('Failed to parse SSE data:', data, e)
              }
            }
          }

          readStream()
        }).catch(reject)
      }

      readStream()
    }).catch(reject)
  })
}

// 保持向后兼容的函数（如果需要的话）
export function fetchChatAPIProcess<T = any>(
  params: {
    roomId: number
    uuid: number
    regenerate?: boolean
    prompt: string
    uploadFileKeys?: string[]
    options?: { conversationId?: string, parentMessageId?: string }
    signal?: GenericAbortSignal
    onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void
  },
) {
  const userStore = useUserStore()

  const data: Record<string, any> = {
    roomId: params.roomId,
    uuid: params.uuid,
    regenerate: params.regenerate || false,
    prompt: params.prompt,
    uploadFileKeys: params.uploadFileKeys,
    options: params.options,
    systemMessage: userStore.userInfo.advanced.systemMessage,
    temperature: userStore.userInfo.advanced.temperature,
    top_p: userStore.userInfo.advanced.top_p,
  }

  return post<T>({
    url: '/chat-process',
    data,
    signal: params.signal,
    onDownloadProgress: params.onDownloadProgress,
  })
}

export function fetchChatStopResponding<T = any>(chatUuid: number) {
  return post<T>({
    url: '/chat-abort',
    data: { chatUuid },
  })
}

export function fetchChatResponseoHistory<T = any>(roomId: number, uuid: number, index: number) {
  return get<T>({
    url: '/chat-response-history',
    data: { roomId, uuid, index },
  })
}

export function fetchSession<T>() {
  return post<T>({
    url: '/session',
  })
}

export function fetchVerify<T>(token: string) {
  return post<T>({
    url: '/verify',
    data: { token },
  })
}

export function fetchVerifyAdmin<T>(token: string) {
  return post<T>({
    url: '/verifyadmin',
    data: { token },
  })
}

export function fetchLogin<T = any>(username: string, password: string, token?: string) {
  return post<T>({
    url: '/user-login',
    data: { username, password, token },
  })
}

export function fetchLogout<T = any>() {
  return post<T>({
    url: '/user-logout',
    data: {},
  })
}

export function fetchSendResetMail<T = any>(username: string) {
  return post<T>({
    url: '/user-send-reset-mail',
    data: { username },
  })
}

export function fetchResetPassword<T = any>(username: string, password: string, sign: string) {
  return post<T>({
    url: '/user-reset-password',
    data: { username, password, sign },
  })
}

export function fetchRegister<T = any>(username: string, password: string) {
  return post<T>({
    url: '/user-register',
    data: { username, password },
  })
}

export function fetchUpdateUserInfo<T = any>(name: string, avatar: string, description: string) {
  return post<T>({
    url: '/user-info',
    data: { name, avatar, description },
  })
}

// 提交用户兑换后额度
export function fetchUpdateUserAmt<T = any>(useAmount: number) {
  return post<T>({
    url: '/user-updateamtinfo',
    data: { useAmount },
  })
}
// 获取用户目前额度（因为兑换加总在前端完成，因此先查询一次实际额度）
export function fetchUserAmt<T = any>() {
  return get<T>({
    url: '/user-getamtinfo',
  })
}
// 获取兑换码对应的额度
export function decode_redeemcard<T = any>(redeemCardNo: string) {
  return post<T>({
    url: '/redeem-card',
    data: { redeemCardNo },
  })
}

export function fetchUpdateGiftCards<T = any>(data: GiftCard[], overRideSwitch: boolean) {
  return post<T>({
    url: '/giftcard-update',
    data: { data, overRideSwitch },
  })
}

export function fetchUpdateUserChatModel<T = any>(chatModel: string) {
  return post<T>({
    url: '/user-chat-model',
    data: { chatModel },
  })
}

export function fetchUpdateUserMaxContextCount<T = any>(maxContextCount: number) {
  return post<T>({
    url: '/user-max-context-count',
    data: { maxContextCount },
  })
}

export function fetchGetUsers<T = any>(page: number, size: number) {
  return get<T>({
    url: '/users',
    data: { page, size },
  })
}

export function fetchGetUser2FA<T = any>() {
  return get<T>({
    url: '/user-2fa',
  })
}

export function fetchVerifyUser2FA<T = any>(secretKey: string, token: string) {
  return post<T>({
    url: '/user-2fa',
    data: { secretKey, token },
  })
}

export function fetchDisableUser2FA<T = any>(token: string) {
  return post<T>({
    url: '/user-disable-2fa',
    data: { token },
  })
}

export function fetchDisableUser2FAByAdmin<T = any>(userId: string) {
  return post<T>({
    url: '/user-disable-2fa-admin',
    data: { userId },
  })
}

export function fetchUpdateUserStatus<T = any>(userId: string, status: Status) {
  return post<T>({
    url: '/user-status',
    data: { userId, status },
  })
}

// 增加useAmount信息 limit_switch
export function fetchUpdateUser<T = any>(userInfo: UserInfo) {
  return post<T>({
    url: '/user-edit',
    data: { userId: userInfo._id, roles: userInfo.roles, email: userInfo.email, password: userInfo.password, remark: userInfo.remark, useAmount: userInfo.useAmount, limit_switch: userInfo.limit_switch },
  })
}

export function fetchUpdateUserPassword<T = any>(pwd: UserPassword) {
  return post<T>({
    url: '/user-password',
    data: pwd,
  })
}

export function fetchGetChatRooms<T = any>() {
  return get<T>({
    url: '/chatrooms',
  })
}

export function fetchGetChatRoomsCount<T = any>(page: number, size: number, userId: string) {
  return get<T>({
    url: '/chatrooms-count',
    data: { page, size, userId },
  })
}

export function fetchCreateChatRoom<T = any>(title: string, roomId: number, chatModel?: string) {
  return post<T>({
    url: '/room-create',
    data: { title, roomId, chatModel },
  })
}

export function fetchRenameChatRoom<T = any>(title: string, roomId: number) {
  return post<T>({
    url: '/room-rename',
    data: { title, roomId },
  })
}

export function fetchUpdateChatRoomPrompt<T = any>(prompt: string, roomId: number) {
  return post<T>({
    url: '/room-prompt',
    data: { prompt, roomId },
  })
}

export function fetchUpdateChatRoomChatModel<T = any>(chatModel: string, roomId: number) {
  return post<T>({
    url: '/room-chatmodel',
    data: { chatModel, roomId },
  })
}

export function fetchUpdateChatRoomMaxContextCount<T = any>(maxContextCount: number, roomId: number) {
  return post<T>({
    url: '/room-max-context-count',
    data: { maxContextCount, roomId },
  })
}

export function fetchUpdateChatRoomUsingContext<T = any>(using: boolean, roomId: number) {
  return post<T>({
    url: '/room-context',
    data: { using, roomId },
  })
}

export function fetchUpdateChatRoomSearchEnabled<T = any>(searchEnabled: boolean, roomId: number) {
  return post<T>({
    url: '/room-search-enabled',
    data: { searchEnabled, roomId },
  })
}

export function fetchUpdateChatRoomThinkEnabled<T = any>(thinkEnabled: boolean, roomId: number) {
  return post<T>({
    url: '/room-think-enabled',
    data: { thinkEnabled, roomId },
  })
}

export function fetchDeleteChatRoom<T = any>(roomId: number) {
  return post<T>({
    url: '/room-delete',
    data: { roomId },
  })
}

export function fetchGetChatHistory<T = any>(roomId: number, lastId?: number, all?: string) {
  return get<T>({
    url: `/chat-history?roomId=${roomId}&lastId=${lastId}&all=${all}`,
  })
}

export function fetchClearAllChat<T = any>() {
  return post<T>({
    url: '/chat-clear-all',
    data: {},
  })
}

export function fetchClearChat<T = any>(roomId: number) {
  return post<T>({
    url: '/chat-clear',
    data: { roomId },
  })
}

export function fetchDeleteChat<T = any>(roomId: number, uuid: number, inversion?: boolean) {
  return post<T>({
    url: '/chat-delete',
    data: { roomId, uuid, inversion },
  })
}

export function fetchUpdateMail<T = any>(mail: MailConfig) {
  return post<T>({
    url: '/setting-mail',
    data: mail,
  })
}

export function fetchTestMail<T = any>(mail: MailConfig) {
  return post<T>({
    url: '/mail-test',
    data: mail,
  })
}

export function fetchUpdateAudit<T = any>(audit: AuditConfig) {
  return post<T>({
    url: '/setting-audit',
    data: audit,
  })
}

export function fetchTestAudit<T = any>(text: string, audit: AuditConfig) {
  return post<T>({
    url: '/audit-test',
    data: { audit, text },
  })
}

export function fetchUpdateSearch<T = any>(search: SearchConfig) {
  return post<T>({
    url: '/setting-search',
    data: search,
  })
}

export function fetchTestSearch<T = any>(text: string, search: SearchConfig) {
  return post<T>({
    url: '/search-test',
    data: { search, text },
  })
}

export function fetchUpdateAnnounce<T = any>(announce: AnnounceConfig) {
  return post<T>({
    url: '/setting-announce',
    data: announce,
  })
}

export function fetchUpdateAdvanced<T = any>(sync: boolean, advanced: SettingsState) {
  const data = { sync, ...advanced }
  return post<T>({
    url: '/setting-advanced',
    data,
  })
}

export function fetchResetAdvanced<T = any>() {
  return post<T>({
    url: '/setting-reset-advanced',
  })
}
export function fetchUpdateSite<T = any>(config: SiteConfig) {
  return post<T>({
    url: '/setting-site',
    data: config,
  })
}

export function fetchUpdateBaseSetting<T = any>(config: ConfigState) {
  return post<T>({
    url: '/setting-base',
    data: config,
  })
}

export function fetchUserStatistics<T = any>(userId: string, start: number, end: number) {
  return post<T>({
    url: '/statistics/by-day',
    data: { userId, start, end },
  })
}

export function fetchGetKeys<T = any>(page: number, size: number) {
  return get<T>({
    url: '/setting-keys',
    data: { page, size },
  })
}

export function fetchUpdateApiKeyStatus<T = any>(id: string, status: Status) {
  return post<T>({
    url: '/setting-key-status',
    data: { id, status },
  })
}

export function fetchUpsertApiKey<T = any>(keyConfig: KeyConfig) {
  return post<T>({
    url: '/setting-key-upsert',
    data: keyConfig,
  })
}

export function fetchUserPromptList<T = any>() {
  return get<T>({
    url: '/prompt-list',
  })
}

export function fetchUpsertUserPrompt<T = any>(userPrompt: UserPrompt) {
  return post<T>({
    url: '/prompt-upsert',
    data: userPrompt,
  })
}

export function fetchDeleteUserPrompt<T = any>(id: string) {
  return post<T>({
    url: '/prompt-delete',
    data: { id },
  })
}

export function fetchClearUserPrompt<T = any>() {
  return post<T>({
    url: '/prompt-clear',
  })
}

export function fetchImportUserPrompt<T = any>(dataProps: never[]) {
  return post<T>({
    url: '/prompt-import',
    data: dataProps,
  })
}
