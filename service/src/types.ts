import type { JwtPayload } from 'jsonwebtoken'

import 'openai'

export interface RequestProps {
  roomId: number
  uuid: number
  regenerate: boolean
  prompt: string
  uploadFileKeys?: string[]
  options?: ChatContext
  systemMessage: string
  temperature?: number
  top_p?: number
}

export interface ChatContext {
  conversationId?: string
  parentMessageId?: string
}

export interface ModelConfig {
  apiModel?: APIMODEL
  reverseProxy?: string
  timeoutMs?: number
  socksProxy?: string
  socksAuth?: string
  httpsProxy?: string
  allowRegister?: boolean
  balance?: string
  accessTokenExpiredTime?: string
}

export type APIMODEL = 'ChatGPTAPI' | 'ChatGPTUnofficialProxyAPI' | undefined

export interface AuthJwtPayload extends JwtPayload {
  name: string
  avatar: string
  description: string
  userId: string
  root: boolean
  config: any
}

export class TwoFAConfig {
  enaled: boolean
  userName: string
  secretKey: string
  otpauthUrl: string
  constructor() {
    this.enaled = false
    this.userName = ''
    this.secretKey = ''
    this.otpauthUrl = ''
  }
} // 必须导入原始模块以进行扩展

declare module 'openai/resources/chat/completions' {
  // OpenAI SDK v4 中, delta 对象的类型是 ChatCompletionChunk.Choice.Delta
  // 我们需要扩展这个嵌套的接口
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ChatCompletionChunk {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Choice {
      interface Delta {
        reasoning_content?: string | null
        reasoning?: string | null
      }
    }
  }
}
