import * as dotenv from 'dotenv'
import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { AuditConfig, KeyConfig, UserInfo } from '../storage/model'
import { Status, UsageResponse } from '../storage/model'
import { convertImageUrl } from '../utils/image'
import type { TextAuditService } from '../utils/textAudit'
import { textAuditServices } from '../utils/textAudit'
import { getCacheApiKeys, getCacheConfig, getOriginConfig } from '../storage/config'
import { sendResponse } from '../utils'
import { hasAnyRole, isNotEmptyString } from '../utils/is'
import type { ModelConfig } from '../types'
import { getChatByMessageId, updateRoomChatModel } from '../storage/mongo'
import type { ChatMessage, RequestOptions } from './types'

dotenv.config()

const ErrorCodeMessage: Record<string, string> = {
  401: '[OpenAI] 提供错误的API密钥 | Incorrect API key provided',
  403: '[OpenAI] 服务器拒绝访问，请稍后再试 | Server refused to access, please try again later',
  502: '[OpenAI] 错误的网关 |  Bad Gateway',
  503: '[OpenAI] 服务器繁忙，请稍后再试 | Server is busy, please try again later',
  504: '[OpenAI] 网关超时 | Gateway Time-out',
  500: '[OpenAI] 服务器繁忙，请稍后再试 | Internal Server Error',
}

let auditService: TextAuditService
const _lockedKeys: { key: string; lockedTime: number }[] = []

export async function initApi(key: KeyConfig) {
  const config = await getCacheConfig()
  const openaiBaseUrl = isNotEmptyString(key.baseUrl) ? key.baseUrl : config.apiBaseUrl

  let httpAgent: HttpsProxyAgent<any> | undefined
  if (isNotEmptyString(config.httpsProxy)) {
    const httpsProxy = config.httpsProxy
    if (httpsProxy)
      httpAgent = new HttpsProxyAgent(httpsProxy)
  }

  const client = new OpenAI({
    baseURL: openaiBaseUrl,
    apiKey: key.key,
    httpAgent,
  })
  return client
}

const processThreads: { userId: string; abort: AbortController; messageId: string }[] = []

async function chatReplyProcess(options: RequestOptions) {
  const model = options.room.chatModel
  const key = await getRandomApiKey(options.user, model)
  const userId = options.user._id.toString()
  const maxContextCount = options.user.advanced.maxContextCount ?? 20
  const messageId = options.messageId
  if (key == null || key === undefined)
    throw new Error('没有对应的apikeys配置。请再试一次 | No available apikeys configuration. Please try again.')

  // Add Chat Record
  updateRoomChatModel(userId, options.room.roomId, model)

  const { message, uploadFileKeys, parentMessageId, process, systemMessage, temperature, top_p } = options

  try {
    // Initialize OpenAI client
    const openai = await initApi(key)

    // Create abort controller for cancellation
    const abort = new AbortController()
    processThreads.push({ userId, abort, messageId })

    // Prepare messages array for the chat completion
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []

    // Add previous messages from conversation history.
    await addPreviousMessages(parentMessageId, maxContextCount, messages)

    // Add system message if provided
    if (isNotEmptyString(systemMessage)) {
      messages.unshift({
        role: 'system',
        content: systemMessage,
      })
    }

    // Prepare the user message content (text and images)
    let content: string | OpenAI.Chat.ChatCompletionContentPart[] = message

    // Handle image uploads if present
    if (uploadFileKeys && uploadFileKeys.length > 0) {
      content = [
        {
          type: 'text',
          text: message,
        },
      ]
      for (const uploadFileKey of uploadFileKeys) {
        content.push({
          type: 'image_url',
          image_url: {
            url: await convertImageUrl(uploadFileKey),
          },
        })
      }
    }

    // Add the user message
    messages.push({
      role: 'user',
      content,
    })

    // Create the chat completion with streaming
    const stream = await openai.chat.completions.create({
      model,
      messages,
      temperature: temperature ?? undefined,
      top_p: top_p ?? undefined,
      stream: true,
      stream_options: {
        include_usage: true,
      },
    }, {
      signal: abort.signal,
    })

    // Process the stream
    let responseText = ''
    let responseId = ''
    const usage = new UsageResponse()

    for await (const chunk of stream) {
      // Extract the content from the chunk
      const content = chunk.choices[0]?.delta?.content || ''
      responseText += content
      responseId = chunk.id

      const finish_reason = chunk.choices[0]?.finish_reason

      // Build response object similar to the original implementation
      const responseChunk = {
        id: chunk.id,
        text: responseText,
        role: 'assistant',
        finish_reason,
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

export function abortChatProcess(userId: string) {
  const index = processThreads.findIndex(d => d.userId === userId)
  if (index <= -1)
    return
  const messageId = processThreads[index].messageId
  processThreads[index].abort.abort()
  processThreads.splice(index, 1)
  return messageId
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
  const config = await getOriginConfig() as ModelConfig
  return sendResponse<ModelConfig>({
    type: 'Success',
    data: config,
  })
}

async function getMessageById(id: string): Promise<ChatMessage | undefined> {
  const isPrompt = id.startsWith('prompt_')
  const chatInfo = await getChatByMessageId(isPrompt ? id.substring(7) : id)

  if (chatInfo) {
    const parentMessageId = isPrompt
      ? chatInfo.options.parentMessageId
      : `prompt_${id}` // parent message is the prompt

    if (chatInfo.status !== Status.Normal) { // jumps over deleted messages
      return parentMessageId
        ? getMessageById(parentMessageId)
        : undefined
    }
    else {
      if (isPrompt) { // prompt
        let content: string | OpenAI.Chat.ChatCompletionContentPart[] = chatInfo.prompt
        if (chatInfo.images && chatInfo.images.length > 0) {
          content = [
            {
              type: 'text',
              text: chatInfo.prompt,
            },
          ]
          for (const image of chatInfo.images) {
            const imageUrlBase64 = await convertImageUrl(image)
            if (imageUrlBase64) {
              content.push({
                type: 'image_url',
                image_url: {
                  url: await convertImageUrl(image),
                },
              })
            }
          }
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
  const keys = (await getCacheApiKeys()).filter(d => hasAnyRole(d.userRoles, user.roles))
    .filter(d => d.chatModels.includes(chatModel))

  return randomKeyConfig(keys)
}

// Helper function to add previous messages to the conversation context
async function addPreviousMessages(parentMessageId: string, maxContextCount: number, messages: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<void> {
  // Recursively get previous messages
  let currentMessageId = parentMessageId

  while (currentMessageId) {
    const currentChatMessage: ChatMessage | undefined = await getMessageById(currentMessageId)

    messages.unshift({
      content: currentChatMessage.content,
      role: currentChatMessage.role,
    } as OpenAI.Chat.ChatCompletionMessage)

    currentMessageId = currentChatMessage?.parentMessageId

    if (messages.length >= maxContextCount)
      break
  }
}

export { chatReplyProcess, chatConfig, containsSensitiveWords }
