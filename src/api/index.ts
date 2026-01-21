import type { AnnounceConfig, AuditConfig, BuiltInPrompt, ConfigState, GiftCard, KeyConfig, MailConfig, SearchConfig, SiteConfig, Status, UserInfo, UserPassword, UserPrompt } from '@/components/common/Setting/model'
import { get, post } from '@/utils/request'
import fetchService from '@/utils/request/fetchService'

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

// SSE event handler interface
interface SSEEventHandlers {
  onMessage?: (data: any) => void
  onDelta?: (delta: { reasoning?: string, text?: string }) => void
  onSearching?: (data: { searching: boolean }) => void
  onGenerating?: (data: { generating: boolean }) => void
  onSearchQuery?: (data: { searchQuery: string }) => void
  onSearchResults?: (data: { searchResults: any[], searchUsageTime: number }) => void
  onToolCalls?: (data: { tool_calls?: Array<{ type: string, result?: string }> }) => void
  onComplete?: (data: any) => void
  onError?: (error: string) => void
  onEnd?: () => void
}

// SSE chat processing function using custom fetch service
export function fetchChatAPIProcessSSE(
  params: {
    roomId: number
    uuid: number
    regenerate?: boolean
    prompt: string
    uploadFileKeys?: string[]
    options?: { conversationId?: string, parentMessageId?: string }
    tools?: Array<Chat.ImageGenerationTool>
    previousResponseId?: string
    signal?: AbortSignal
  },
  handlers: SSEEventHandlers,
): Promise<void> {
  const data: Record<string, any> = {
    roomId: params.roomId,
    uuid: params.uuid,
    regenerate: params.regenerate || false,
    prompt: params.prompt,
    uploadFileKeys: params.uploadFileKeys,
    options: params.options,
  }

  if (params.tools && params.tools.length > 0) {
    data.tools = params.tools
  }
  if (params.previousResponseId) {
    data.previousResponseId = params.previousResponseId
  }

  return new Promise((resolve, reject) => {
    let currentEventType: string | null = null

    fetchService.postStream(
      {
        url: '/chat-process',
        body: data,
        signal: params.signal,
      },
      {
        onChunk: (line: string) => {
          if (line.trim() === '')
            return

          if (line.startsWith('event: ')) {
            currentEventType = line.substring(7).trim()
            return
          }

          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6).trim()

            if (dataStr === '[DONE]') {
              handlers.onEnd?.()
              resolve()
              return
            }

            try {
              if (currentEventType === 'error') {
                const errorDataStr = JSON.parse(dataStr)
                const errorData = JSON.parse(errorDataStr)
                if (errorData.message) {
                  handlers.onError?.(errorData.message)
                }
                currentEventType = null
                return
              }

              const jsonData = JSON.parse(dataStr)

              // Dispatch to different handlers based on data type
              if (jsonData.message) {
                handlers.onError?.(jsonData.message)
              }
              else if (jsonData.searching !== undefined) {
                handlers.onSearching?.(jsonData)
              }
              else if (jsonData.generating !== undefined) {
                handlers.onGenerating?.(jsonData)
              }
              else if (jsonData.searchQuery) {
                handlers.onSearchQuery?.(jsonData)
              }
              else if (jsonData.searchResults) {
                handlers.onSearchResults?.(jsonData)
              }
              else if (jsonData.tool_calls) {
                handlers.onToolCalls?.(jsonData)
              }
              else if (jsonData.m) {
                handlers.onDelta?.(jsonData.m)
              }
              else {
                handlers.onMessage?.(jsonData)
              }

              // Reset event type.
              currentEventType = null
            }
            catch (e) {
              console.error('Failed to parse SSE data:', dataStr, e)
              currentEventType = null
            }
          }
        },
        onError: (error: Error) => {
          handlers.onError?.(error.message)
          reject(error)
        },
        onComplete: () => {
          handlers.onEnd?.()
          resolve()
        },
      },
    )
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

// Submit usage after redeeming.
export function fetchUpdateUserAmt<T = any>(useAmount: number) {
  return post<T>({
    url: '/user-updateamtinfo',
    data: { useAmount },
  })
}
// Get current usage (redeem totals are summed in the frontend, so fetch the actual value once).
export function fetchUserAmt<T = any>() {
  return get<T>({
    url: '/user-getamtinfo',
  })
}
// Get usage amount for the redeem code.
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

export function fetchGetUsers<T = any>(page: number, size: number, search?: string) {
  return get<T>({
    url: '/users',
    data: { page, size, search },
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

// Add useAmount with limit_switch.
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

export function fetchCreateChatRoom<T = any>(title: string, roomId: number, chatModel?: string, modelId?: string) {
  return post<T>({
    url: '/room-create',
    data: { title, roomId, chatModel, modelId },
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

export function fetchUpdateChatRoomToolsEnabled<T = any>(toolsEnabled: boolean, roomId: number) {
  return post<T>({
    url: '/room-tools-enabled',
    data: { toolsEnabled, roomId },
  })
}

export function fetchDeleteChatRoom<T = any>(roomId: number) {
  return post<T>({
    url: '/room-delete',
    data: { roomId },
  })
}

export function fetchGetChatHistory<T = any>(roomId: number, lastId?: number, all?: string) {
  let url = `/chat-history?roomId=${roomId}`
  if (lastId !== undefined && lastId !== null) {
    url += `&lastId=${lastId}`
  }
  if (all !== undefined && all !== null) {
    url += `&all=${all}`
  }
  return get<T>({
    url,
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

export function fetchUserStatisticsByModel<T = any>(start?: number, end?: number) {
  return post<T>({
    url: '/statistics/by-model',
    data: { start, end },
  })
}

export function fetchGetKeys<T = any>() {
  return get<T>({
    url: '/setting-keys',
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

export function fetchBuiltInPromptList<T = any>() {
  return get<T>({
    url: '/prompt-built-in-list',
  })
}

export function fetchUpsertUserPrompt<T = any>(userPrompt: UserPrompt) {
  return post<T>({
    url: '/prompt-upsert',
    data: userPrompt,
  })
}

export function fetchUpsertBuiltInPrompt<T = any>(builtInPrompt: BuiltInPrompt) {
  return post<T>({
    url: '/prompt-built-in-upsert',
    data: builtInPrompt,
  })
}

export function fetchDeleteUserPrompt<T = any>(id: string) {
  return post<T>({
    url: '/prompt-delete',
    data: { id },
  })
}

export function fetchDeleteBuiltInPrompt<T = any>(id: string) {
  return post<T>({
    url: '/prompt-built-in-delete',
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
