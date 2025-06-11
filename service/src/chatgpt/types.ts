import type OpenAI from 'openai'
import type { ChatRoom, SearchResult, UserInfo } from 'src/storage/model'

export interface ChatMessage {
  id: string
  content: string | OpenAI.Chat.ChatCompletionContentPart[]
  role: OpenAI.Chat.ChatCompletionRole
  name?: string
  delta?: string
  detail?: string
  parentMessageId?: string
}

export interface ResponseChunk {
  id?: string
  searchQuery?: string
  searchResults?: SearchResult[]
  searchUsageTime?: number
  text?: string
  reasoning?: string
  role?: string
  finish_reason?: string
}

export interface RequestOptions {
  message: string
  uploadFileKeys?: string[]
  parentMessageId?: string
  process?: (chunk: ResponseChunk) => void
  systemMessage?: string
  temperature?: number
  top_p?: number
  user: UserInfo
  messageId: string
  room: ChatRoom
  chatUuid: number
}

export interface BalanceResponse {
  total_usage: number
}
