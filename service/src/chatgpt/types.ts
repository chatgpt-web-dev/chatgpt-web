import type OpenAI from 'openai'
import type { ChatRoom, ImageUsageItem, SearchResult, UserInfo } from 'src/storage/model'
import type { ImageGenerationTool } from '../types'

export interface ChatMessage {
  id: string
  content: string | OpenAI.Chat.ChatCompletionContentPart[] | OpenAI.Responses.ResponseInputContent[]
  role: OpenAI.Chat.ChatCompletionRole
  name?: string
  delta?: string
  detail?: string
  parentMessageId?: string
}

export interface ResponseChunk {
  id?: string
  searching?: boolean
  generating?: boolean
  searchQuery?: string
  searchResults?: SearchResult[]
  searchUsageTime?: number
  text?: string
  reasoning?: string
  role?: string
  finish_reason?: string
  // 支持增量响应
  delta?: {
    reasoning?: string
    text?: string
    heartbeat?: boolean
  }
  // 工具调用结果
  tool_calls?: Array<{
    type: string
    result?: any
  }>
  // 编辑图片时使用的文件 ID（用于后续作为 previousResponseId）
  editImageId?: string
  image_usage?: ImageUsageItem[]
}

export interface RequestOptions {
  message: string
  uploadFileKeys?: string[]
  parentMessageId?: string
  previousResponseId?: string
  tools?: Array<ImageGenerationTool>
  process?: (chunk: ResponseChunk) => void
  systemMessage?: string
  user: UserInfo
  messageId: string
  room: ChatRoom
  chatUuid: number
}

export interface BalanceResponse {
  total_usage: number
}
