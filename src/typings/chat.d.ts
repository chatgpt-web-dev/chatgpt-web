declare namespace Chat {
  interface SearchResult {
    title: string
    url: string
    content: string
  }

  interface Chat {
    uuid?: number
    dateTime: string
    searching?: boolean
    searchQuery?: string
    searchResults?: SearchResult[]
    searchUsageTime?: number
    reasoning?: string
    finish_reason?: string
    text: string
    images?: string[]
    tool_calls?: Array<{ type: string, result?: string }>
    tool_images?: string[] // Local file names from tool calls (stored as local file names, e.g., "image-xxx.png", accessible via /uploads/filename)
    editImageId?: string // OpenAI file ID for editing images (used as previousResponseId)
    inversion?: boolean
    responseCount?: number
    error?: boolean
    loading?: boolean
    conversationOptions?: ConversationRequest | null
    requestOptions: { prompt: string, options?: ConversationRequest | null }
    usage?: {
      completion_tokens: number
      prompt_tokens: number
      total_tokens: number
      estimated: boolean
    }
  }

  interface ChatRoom {
    title: string
    isEdit: boolean
    roomId: number
    loading?: boolean
    all?: boolean
    prompt?: string
    usingContext: boolean
    maxContextCount: number
    chatModel: string
    searchEnabled: boolean
    thinkEnabled: boolean
    toolsEnabled?: boolean
    imageUploadEnabled?: boolean
  }

  interface ConversationRequest {
    conversationId?: string
    parentMessageId?: string
  }

  interface ConversationResponse {
    conversationId: string
    detail: {
      choices: { finish_reason: string, index: number, logprobs: any, text: string }[]
      created: number
      id: string
      model: string
      object: string
      usage: { completion_tokens: number, prompt_tokens: number, total_tokens: number }
    }
    id: string
    parentMessageId: string
    role: string
    text: string
  }
}
