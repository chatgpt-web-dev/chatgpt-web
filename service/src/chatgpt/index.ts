import type { ClientOptions } from 'openai'
import type { RequestInit } from 'undici'
import type { APIMODEL, AuditConfig, Config, KeyConfig, SearchResult, UserInfo } from '../storage/model'
import type { TextAuditService } from '../utils/textAudit'
import type { ChatMessage, RequestOptions } from './types'
import { tavily } from '@tavily/core'
import dayjs from 'dayjs'
import * as dotenv from 'dotenv'
import OpenAI from 'openai'
import * as undici from 'undici'
import { getCacheApiKeys, getCacheConfig, getOriginConfig } from '../storage/config'
import { Status, UsageResponse } from '../storage/model'
import { getChatByMessageId, updateChatSearchQuery, updateChatSearchResult } from '../storage/mongo'
import { sendResponse } from '../utils'
import { convertImageUrl } from '../utils/image'
import { hasAnyRole, isNotEmptyString } from '../utils/is'
import { textAuditServices } from '../utils/textAudit'

dotenv.config()

function renderSystemMessage(template: string, currentTime: string): string {
  return template.replace(/\{current_time\}/g, currentTime)
}

const ErrorCodeMessage: Record<string, string> = {
  401: '[OpenAI] 提供错误的API密钥 | Incorrect API key provided',
  403: '[OpenAI] 服务器拒绝访问，请稍后再试 | Server refused to access, please try again later',
  502: '[OpenAI] 错误的网关 |  Bad Gateway',
  503: '[OpenAI] 服务器繁忙，请稍后再试 | Server is busy, please try again later',
  504: '[OpenAI] 网关超时 | Gateway Time-out',
  500: '[OpenAI] 服务器繁忙，请稍后再试 | Internal Server Error',
}

let auditService: TextAuditService
const _lockedKeys: { key: string, lockedTime: number }[] = []

export async function initApi(key: KeyConfig) {
  const config = await getCacheConfig()
  const openaiBaseUrl = isNotEmptyString(key.baseUrl) ? key.baseUrl : config.apiBaseUrl

  const clientOptions: ClientOptions = {
    baseURL: openaiBaseUrl,
    apiKey: key.key,
  }

  const httpsProxy = config.httpsProxy
  if (httpsProxy && isNotEmptyString(httpsProxy)) {
    clientOptions.fetch = (input: string | URL | Request, init: RequestInit) => {
      return undici.fetch(input, {
        ...init,
        dispatcher: new undici.ProxyAgent({
          uri: httpsProxy,
        }),
      })
    }
  }
  return new OpenAI(clientOptions)
}

const processThreads: { userId: string, chatUuid: number, abort: AbortController }[] = []

async function chatReplyProcess(options: RequestOptions) {
  const globalConfig = await getCacheConfig()
  const model = options.room.chatModel
  const searchEnabled = options.room.searchEnabled
  const key = await getRandomApiKey(options.user, model)
  const userId = options.user._id.toString()
  const maxContextCount = options.room.maxContextCount ?? 10
  const messageId = options.messageId
  if (key == null || key === undefined)
    throw new Error('没有对应的apikeys配置。请再试一次 | No available apikeys configuration. Please try again.')

  const { message, uploadFileKeys, parentMessageId, process, systemMessage, temperature, top_p, chatUuid } = options
  let instructions = systemMessage

  try {
    // Initialize OpenAI client
    const openai = await initApi(key)

    // Create abort controller for cancellation
    const abort = new AbortController()
    processThreads.push({ userId, chatUuid, abort })

    // Prepare messages array for the chat completion
    const messages: Array<OpenAI.Chat.ChatCompletionMessageParam | OpenAI.Responses.ResponseInputItem> = []

    // Add previous messages from conversation history.
    await addPreviousMessages(parentMessageId, maxContextCount, messages, key.keyModel)

    if (key.keyModel === 'ResponsesAPI') {
      // Prepare the user message content (text and images)
      const content: string | OpenAI.Responses.ResponseInputContent[] = await createContentResponsesAPI(message, uploadFileKeys)

      // Add the user message
      messages.push({
        role: 'user',
        content,
      } as OpenAI.Responses.ResponseInputItem)
    }
    else {
      // Add system message if provided
      if (isNotEmptyString(systemMessage)) {
        messages.unshift({
          role: 'system',
          content: systemMessage,
        })
      }

      // Prepare the user message content (text and images)
      const content: string | OpenAI.Chat.ChatCompletionContentPart[] = await createContent(message, uploadFileKeys)

      // Add the user message
      messages.push({
        role: 'user',
        content,
      } as OpenAI.Chat.ChatCompletionMessageParam)
    }

    let hasSearchResult = false
    const searchConfig = globalConfig.searchConfig
    if (searchConfig.enabled && searchConfig?.options?.apiKey && searchEnabled) {
      try {
        const systemMessageGetSearchQuery = renderSystemMessage(searchConfig.systemMessageGetSearchQuery, dayjs().format('YYYY-MM-DD HH:mm:ss'))

        // Use Responses API or Chat Completions to get search query
        let searchQuery: string = ''
        if (key.keyModel === 'ResponsesAPI') {
          const response = await openai.responses.create({
            model,
            instructions: systemMessageGetSearchQuery,
            input: messages as OpenAI.Responses.ResponseInput,
            reasoning: {
              effort: 'minimal',
            },
            store: false,
          })
          searchQuery = response.output_text
        }
        else {
          (messages as OpenAI.Chat.ChatCompletionMessageParam[])[0].content = systemMessageGetSearchQuery
          const getSearchQueryChatCompletionCreateBody: OpenAI.ChatCompletionCreateParamsNonStreaming = {
            model,
            messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
          }
          if (key.keyModel === 'VLLM') {
            // @ts-expect-error vLLM supports a set of parameters that are not part of the OpenAI API.
            getSearchQueryChatCompletionCreateBody.chat_template_kwargs = {
              enable_thinking: false,
            }
          }
          else if (key.keyModel === 'FastDeploy') {
            getSearchQueryChatCompletionCreateBody.metadata = {
              // @ts-expect-error FastDeploy supports a set of parameters that are not part of the OpenAI API.
              enable_thinking: false,
            }
          }
          const completion = await openai.chat.completions.create(getSearchQueryChatCompletionCreateBody)
          searchQuery = completion.choices[0].message.content as string
        }
        const match = searchQuery.match(/<search_query>([\s\S]*)<\/search_query>/i)
        if (match)
          searchQuery = match[1].trim()
        else
          searchQuery = ''

        if (searchQuery) {
          await updateChatSearchQuery(messageId, searchQuery)

          process?.({
            searchQuery,
          })

          const tvly = tavily({ apiKey: searchConfig.options?.apiKey })
          const response = await tvly.search(
            searchQuery,
            {
              // https://docs.tavily.com/documentation/best-practices/best-practices-search#search-depth%3Dadvanced-ideal-for-higher-relevance-in-search-results
              searchDepth: 'advanced',
              chunksPerSource: 3,
              includeRawContent: searchConfig.options?.includeRawContent ? 'markdown' : false,
              // 0 <= x <= 20 https://docs.tavily.com/documentation/api-reference/endpoint/search#body-max-results
              // https://docs.tavily.com/documentation/best-practices/best-practices-search#max-results-limiting-the-number-of-results
              maxResults: searchConfig.options?.maxResults || 10,
              // Max 120s, default to 60 https://github.com/tavily-ai/tavily-js/blob/de69e479c5d3f6c5d443465fa2c29407c0d3515d/src/search.ts#L118
              timeout: 120,
            },
          )

          const searchResults = response.results as SearchResult[]
          const searchUsageTime = response.responseTime

          await updateChatSearchResult(messageId, searchResults, searchUsageTime)

          process?.({
            searchResults,
            searchUsageTime,
          })

          let searchResultContent = JSON.stringify(searchResults)
          // remove image url
          const base64Pattern = /!\[([^\]]*)\]\([^)]*\)/g
          searchResultContent = searchResultContent.replace(base64Pattern, '$1')

          messages.push({
            role: 'user',
            content: `Additional information from web searche engine.
search query: <search_query>${searchQuery}</search_query>
search result: <search_result>${searchResultContent}</search_result>`,
          })

          instructions = renderSystemMessage(searchConfig.systemMessageWithSearchResult, dayjs().format('YYYY-MM-DD HH:mm:ss'))
          if (key.keyModel !== 'ResponsesAPI') {
            (messages as OpenAI.Chat.ChatCompletionMessageParam[])[0].content = instructions
          }
          hasSearchResult = true
        }
      }
      catch (e) {
        globalThis.console.error('search error from tavily, ', e)
      }
    }

    if (!hasSearchResult && key.keyModel !== 'ResponsesAPI')
      (messages as OpenAI.Chat.ChatCompletionMessageParam[])[0].content = systemMessage

    // Choose API by key model
    // ResponsesAPI branch (OpenAI Responses API)
    if (key.keyModel === 'ResponsesAPI') {
      let reasoning: OpenAI.Reasoning
      if (options.room.thinkEnabled) {
        reasoning = {
          effort: 'high',
          summary: 'detailed',
        }
      }
      else {
        reasoning = {
          effort: 'minimal',
        }
      }
      const stream = await openai.responses.create(
        {
          model,
          instructions,
          input: messages as OpenAI.Responses.ResponseInput,
          reasoning,
          store: false,
          stream: true,
        },
        {
          signal: abort.signal,
        },
      )

      // Process the stream from Responses API
      let responseReasoning = ''
      let responseText = ''
      let responseId = ''
      const usage = new UsageResponse()

      for await (const event of stream) {
        if (event.type === 'response.reasoning_summary_text.delta') {
          const delta: string = event.delta || ''
          responseReasoning += delta
          process?.({
            delta: { reasoning: delta },
          })
        }
        else if (event.type === 'response.reasoning_summary_text.done') {
          responseReasoning += '\n'
          process?.({
            delta: { reasoning: '\n' },
          })
        }
        else if (event.type === 'response.output_text.delta') {
          const delta: string = event.delta || ''
          responseText += delta
          process?.({
            text: responseText,
            delta: { text: delta },
          })
        }
        else if (event.type === 'response.completed') {
          const resp = event.response
          responseId = resp.id
          usage.prompt_tokens = resp.usage.input_tokens
          usage.completion_tokens = resp.usage.output_tokens
          usage.total_tokens = resp.usage.total_tokens
        }
      }

      const response = {
        id: responseId || messageId,
        reasoning: responseReasoning,
        text: responseText,
        role: 'assistant',
        detail: { usage },
      }
      return sendResponse({ type: 'Success', data: response })
    }

    // Create the chat completion with streaming (Chat Completions API / compatible backends)
    const chatCompletionCreateBody: OpenAI.ChatCompletionCreateParamsStreaming = {
      model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      temperature: temperature ?? undefined,
      top_p: top_p ?? undefined,
      stream: true,
      stream_options: {
        include_usage: true,
      },
    }
    if (key.keyModel === 'VLLM') {
      // @ts-expect-error vLLM supports a set of parameters that are not part of the OpenAI API.
      chatCompletionCreateBody.chat_template_kwargs = {
        enable_thinking: options.room.thinkEnabled,
      }
    }
    else if (key.keyModel === 'FastDeploy') {
      chatCompletionCreateBody.metadata = {
        // @ts-expect-error FastDeploy supports a set of parameters that are not part of the OpenAI API.
        enable_thinking: options.room.thinkEnabled,
      }
    }
    const stream = await openai.chat.completions.create(
      chatCompletionCreateBody,
      {
        signal: abort.signal,
      },
    )

    // Process the stream
    let responseReasoning = ''
    let responseText = ''
    let responseId = ''
    const usage = new UsageResponse()

    for await (const chunk of stream) {
      // Extract the content from the chunk
      // @ts-expect-error For deepseek-reasoner model only. The reasoning contents of the assistant message, before the final answer.
      const reasoningContent = chunk.choices[0]?.delta?.reasoning_content || ''
      responseReasoning += reasoningContent
      const content = chunk.choices[0]?.delta?.content || ''
      responseText += content
      responseId = chunk.id

      const finish_reason = chunk.choices[0]?.finish_reason

      // Build incremental response object
      const responseChunk = {
        id: chunk.id,
        reasoning: responseReasoning, // Accumulated reasoning content
        text: responseText, // Accumulated text content
        role: 'assistant',
        finish_reason,
        // Incremental data
        delta: {
          reasoning: reasoningContent, // reasoning content in this chunk
          text: content, // text content in this chunk
        },
      }

      // Call the process callback if provided
      process?.(responseChunk)

      if (chunk?.usage?.total_tokens) {
        usage.total_tokens = chunk?.usage?.total_tokens
        usage.prompt_tokens = chunk?.usage?.prompt_tokens
        usage.completion_tokens = chunk?.usage?.completion_tokens
      }
    }

    // Final response object
    const response = {
      id: responseId || messageId,
      reasoning: responseReasoning,
      text: responseText,
      role: 'assistant',
      detail: {
        usage,
      },
    }

    return sendResponse({ type: 'Success', data: response })
  }
  catch (error: any) {
    const code = error.status || error.statusCode
    globalThis.console.error(error)
    if (Reflect.has(ErrorCodeMessage, code))
      return sendResponse({ type: 'Fail', message: ErrorCodeMessage[code] })
    return sendResponse({ type: 'Fail', message: error.message ?? 'Please check the back-end console' })
  }
  finally {
    const index = processThreads.findIndex(d => d.userId === userId)
    if (index > -1)
      processThreads.splice(index, 1)
  }
}

export function abortChatProcess(userId: string, chatUuid: number) {
  const index = processThreads.findIndex(d => d.userId === userId && d.chatUuid === chatUuid)
  if (index <= -1)
    return
  processThreads[index].abort.abort()
  processThreads.splice(index, 1)
}

export function initAuditService(audit: AuditConfig) {
  if (!audit || !audit.options || !audit.options.apiKey || !audit.options.apiSecret)
    return
  const Service = textAuditServices[audit.provider]
  auditService = new Service(audit.options)
}

async function containsSensitiveWords(audit: AuditConfig, text: string): Promise<boolean> {
  if (audit.customizeEnabled && isNotEmptyString(audit.sensitiveWords)) {
    const textLower = text.toLowerCase()
    const notSafe = audit.sensitiveWords.split('\n').filter(d => textLower.includes(d.trim().toLowerCase())).length > 0
    if (notSafe)
      return true
  }
  if (audit.enabled) {
    if (!auditService)
      initAuditService(audit)
    return await auditService.containsSensitiveWords(text)
  }
  return false
}

async function chatConfig() {
  const config = await getOriginConfig()
  return sendResponse<Config>({
    type: 'Success',
    data: config,
  })
}

async function getMessageById(id: string, model: APIMODEL): Promise<ChatMessage | undefined> {
  const isPrompt = id.startsWith('prompt_')
  const chatInfo = await getChatByMessageId(isPrompt ? id.substring(7) : id)

  if (chatInfo) {
    const parentMessageId = isPrompt
      ? chatInfo.options.parentMessageId
      : `prompt_${id}` // parent message is the prompt

    if (chatInfo.status !== Status.Normal) { // jumps over deleted messages
      return parentMessageId
        ? getMessageById(parentMessageId, model)
        : undefined
    }
    else {
      if (isPrompt) { // prompt
        let content: string | OpenAI.Chat.ChatCompletionContentPart[] | OpenAI.Responses.ResponseInputContent[]
        if (model === 'ResponsesAPI') {
          content = await createContentResponsesAPI(chatInfo.prompt, chatInfo.images)
        }
        else {
          content = await createContent(chatInfo.prompt, chatInfo.images)
        }
        return {
          id,
          parentMessageId,
          role: 'user',
          content,
        }
      }
      else {
        return { // completion
          id,
          parentMessageId,
          role: 'assistant',
          content: chatInfo.response,
        }
      }
    }
  }
  else { return undefined }
}

async function randomKeyConfig(keys: KeyConfig[]): Promise<KeyConfig | null> {
  if (keys.length <= 0)
    return null
  // cleanup old locked keys
  _lockedKeys.filter(d => d.lockedTime <= Date.now() - 1000 * 20).forEach(d => _lockedKeys.splice(_lockedKeys.indexOf(d), 1))

  let unsedKeys = keys.filter(d => _lockedKeys.filter(l => d.key === l.key).length <= 0)
  const start = Date.now()
  while (unsedKeys.length <= 0) {
    if (Date.now() - start > 3000)
      break
    await new Promise(resolve => setTimeout(resolve, 1000))
    unsedKeys = keys.filter(d => _lockedKeys.filter(l => d.key === l.key).length <= 0)
  }
  if (unsedKeys.length <= 0)
    return null
  const thisKey = unsedKeys[Math.floor(Math.random() * unsedKeys.length)]
  return thisKey
}

async function getRandomApiKey(user: UserInfo, chatModel: string): Promise<KeyConfig | undefined> {
  const keys = (await getCacheApiKeys()).filter(d => hasAnyRole(d.userRoles, user.roles)).filter(d => d.chatModels.includes(chatModel))

  return randomKeyConfig(keys)
}

// Helper function to create content with text and optional images
async function createContent(text: string, images?: string[]): Promise<string | OpenAI.Chat.ChatCompletionContentPart[]> {
  // If no images or empty array, return just the text
  if (!images || images.length === 0)
    return text

  // Create content with text and images
  const content: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text,
    },
  ]

  for (const image of images) {
    const imageUrl = await convertImageUrl(image)
    if (imageUrl) {
      content.push({
        type: 'image_url',
        image_url: {
          url: imageUrl,
        },
      })
    }
  }

  return content
}

// Helper function to create content with text and optional images when use responsesAPI
async function createContentResponsesAPI(text: string, images?: string[]): Promise<string | OpenAI.Responses.ResponseInputContent[]> {
  // If no images or empty array, return just the text
  if (!images || images.length === 0)
    return text

  // Create content with text and images
  const content: OpenAI.Responses.ResponseInputContent[] = [
    {
      type: 'input_text',
      text,
    },
  ]

  for (const image of images) {
    const imageUrl = await convertImageUrl(image)
    if (imageUrl) {
      content.push({
        detail: 'auto',
        type: 'input_image',
        image_url: imageUrl,
      })
    }
  }

  return content
}

// Helper function to add previous messages to the conversation context
async function addPreviousMessages(parentMessageId: string, maxContextCount: number, messages: Array<OpenAI.Chat.ChatCompletionMessageParam | OpenAI.Responses.ResponseInputItem>, model: APIMODEL): Promise<void> {
  // Recursively get previous messages
  let currentMessageId = parentMessageId

  while (currentMessageId) {
    const currentChatMessage: ChatMessage | undefined = await getMessageById(currentMessageId, model)

    messages.unshift({
      content: currentChatMessage.content,
      role: currentChatMessage.role,
    } as OpenAI.Chat.ChatCompletionMessage)

    currentMessageId = currentChatMessage?.parentMessageId

    if (messages.length >= maxContextCount)
      break
  }
}

export { chatConfig, chatReplyProcess, containsSensitiveWords }
