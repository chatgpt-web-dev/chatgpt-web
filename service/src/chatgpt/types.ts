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
  // Support streaming responses.
  delta?: {
    reasoning?: string
    text?: string
    heartbeat?: boolean
  }
  // Tool call result.
  tool_calls?: Array<{
    type: string
    result?: any
  }>
  // File ID used for image edits (stored as previousResponseId).
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
