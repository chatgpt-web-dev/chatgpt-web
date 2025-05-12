import * as dotenv from 'dotenv'
import OpenAI from 'openai'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { AuditConfig, KeyConfig, UserInfo } from '../storage/model'

import { Status, UsageResponse } from '../storage/model' // UsageResponse is imported here
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

  return new OpenAI({
    baseURL: openaiBaseUrl,
    apiKey: key.key,
    httpAgent,
  })
}

const processThreads: { userId: string; abort: AbortController; messageId: string }[] = []

// --- Helper function to parse <think> tags from delta.content ---
function parseDeltaContentForThinkTags(
  deltaContent: string,
  currentIsInsideThinkTagState: boolean,
): { textPart: string; reasoningPart: string; newIsInsideThinkTag: boolean } {
  let localText = ''
  let localReasoning = ''
  let contentToProcess = deltaContent
  let newIsInsideThinkTag = currentIsInsideThinkTagState

  while (contentToProcess.length > 0) {
    if (newIsInsideThinkTag) {
      // Currently inside a <think> tag, look for the end tag </think>
      const endTagIndex = contentToProcess.indexOf('</think>')
      if (endTagIndex !== -1) {
        // Found the end tag
        localReasoning += contentToProcess.substring(0, endTagIndex)
        contentToProcess = contentToProcess.substring(endTagIndex + '</think>'.length)
        newIsInsideThinkTag = false // Exited the <think> tag
      }
      else {
        // No end tag found, so the rest of contentToProcess is reasoning
        localReasoning += contentToProcess
        contentToProcess = ''
      }
    }
    else {
      // Currently outside a <think> tag, look for the start tag <think>
      const startTagIndex = contentToProcess.indexOf('<think>')
      if (startTagIndex !== -1) {
        // Found the start tag
        localText += contentToProcess.substring(0, startTagIndex)
        contentToProcess = contentToProcess.substring(startTagIndex + '<think>'.length)
        newIsInsideThinkTag = true // Entered the <think> tag
      }
      else {
        // No start tag found, so the rest of contentToProcess is regular text
        localText += contentToProcess
        contentToProcess = ''
      }
    }
  }
  return { textPart: localText, reasoningPart: localReasoning, newIsInsideThinkTag }
}

// --- Optimized stream processing logic ---
async function optimizedProcessStreamInternal(
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
  processCallback: ((chunk: any) => void) | undefined,
  initialMessageId: string,
): Promise<{
  id: string
  reasoning: string
  text: string
  role: OpenAI.Chat.Completions.ChatCompletionRole
  finish_reason: string | null
  usage: UsageResponse
}> {
  let accumulatedResponseReasoning = ''
  let accumulatedResponseText = ''
  let lastResponseId = ''
  const usage = new UsageResponse()

  let isInsideThinkTagGlobal = false
  // Use the standard OpenAI SDK type for finish_reason.
  // If your IDE still flags this, ensure your OpenAI SDK version and TS setup are compatible.
  // As a last resort, you could use `string | null` but standard types are preferred.
  let lastFinishReason: string | null
  let finalRole: OpenAI.Chat.Completions.ChatCompletionRole = 'assistant'

  for await (const chunk of stream) {
    // The delta object is of type OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta | undefined
    const delta = chunk.choices[0]?.delta as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta

    if (chunk.id)
      lastResponseId = chunk.id

    if (!delta || Object.keys(delta).length === 0) {
      if (chunk.choices?.[0]?.finish_reason)
        lastFinishReason = chunk.choices[0].finish_reason

      if (chunk.usage?.total_tokens !== undefined) {
        usage.total_tokens = chunk.usage.total_tokens
        usage.prompt_tokens = chunk.usage.prompt_tokens
        usage.completion_tokens = chunk.usage.completion_tokens
      }
      if (processCallback && (lastFinishReason || chunk.usage?.total_tokens !== undefined)) {
        const responseChunkPayload = {
          id: lastResponseId || initialMessageId,
          reasoning: accumulatedResponseReasoning,
          text: accumulatedResponseText,
          role: finalRole,
          finish_reason: lastFinishReason,
        }
        processCallback(responseChunkPayload)
      }
      continue
    }

    if (delta.role)
      finalRole = delta.role

    // 1. Extract structured reasoning content.
    // With module augmentation for `reasoning_content` and `reasoning` on `Delta`,
    // `as any` is no longer needed.
    const structuredReasoningFromDelta = delta.reasoning_content || delta.reasoning || ''
    if (structuredReasoningFromDelta)
      accumulatedResponseReasoning += structuredReasoningFromDelta

    // 2. Extract and process delta.content
    const deltaContent = delta.content || ''
    if (deltaContent) {
      const { textPart, reasoningPart, newIsInsideThinkTag } = parseDeltaContentForThinkTags(deltaContent, isInsideThinkTagGlobal)

      if (textPart)
        accumulatedResponseText += textPart

      if (reasoningPart)
        accumulatedResponseReasoning += reasoningPart

      isInsideThinkTagGlobal = newIsInsideThinkTag
    }

    const currentFinishReason = chunk.choices[0]?.finish_reason
    if (currentFinishReason)
      lastFinishReason = currentFinishReason

    const responseChunkPayload = {
      id: lastResponseId || initialMessageId,
      reasoning: accumulatedResponseReasoning,
      text: accumulatedResponseText,
      role: delta.role || finalRole,
      finish_reason: lastFinishReason,
    }

    processCallback?.(responseChunkPayload)

    if (chunk.usage?.total_tokens !== undefined) {
      usage.total_tokens = chunk.usage.total_tokens
      usage.prompt_tokens = chunk.usage.prompt_tokens
      usage.completion_tokens = chunk.usage.completion_tokens
    }
  }

  return {
    id: lastResponseId || initialMessageId,
    reasoning: accumulatedResponseReasoning,
    text: accumulatedResponseText,
    role: finalRole,
    finish_reason: lastFinishReason,
    usage,
  }
}

async function chatReplyProcess(options: RequestOptions) {
  const model = options.room.chatModel
  const key = await getRandomApiKey(options.user, model)
  const userId = options.user._id.toString()
  const maxContextCount = options.user.advanced.maxContextCount ?? 20
  const messageId = options.messageId // Will be used as initialMessageId

  if (key == null)
    throw new Error('没有对应的apikeys配置。请再试一次 | No available apikeys configuration. Please try again.')

  updateRoomChatModel(userId, options.room.roomId, model)

  const { message, uploadFileKeys, parentMessageId, process, systemMessage, temperature, top_p } = options

  try {
    const openai = await initApi(key)
    const abort = new AbortController()
    processThreads.push({ userId, abort, messageId })

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    await addPreviousMessages(parentMessageId, maxContextCount, messages) // parentMessageId can be undefined

    if (isNotEmptyString(systemMessage))
      messages.unshift({ role: 'system', content: systemMessage })

    let contentForApi: string | OpenAI.Chat.ChatCompletionContentPart[] = message
    if (uploadFileKeys && uploadFileKeys.length > 0) {
      contentForApi = [{ type: 'text', text: message }]
      for (const uploadFileKey of uploadFileKeys) {
        contentForApi.push({
          type: 'image_url',
          image_url: { url: await convertImageUrl(uploadFileKey) },
        })
      }
    }
    messages.push({ role: 'user', content: contentForApi })

    const stream = await openai.chat.completions.create(
      {
        model,
        messages,
        temperature: temperature ?? undefined,
        top_p: top_p ?? undefined,
        stream: true,
        stream_options: { include_usage: true },
      },
      { signal: abort.signal },
    )

    // Process the stream using the optimized internal function
    const streamResult = await optimizedProcessStreamInternal(stream, process, messageId)

    // Construct the final response object
    const response = {
      id: streamResult.id,
      reasoning: streamResult.reasoning,
      text: streamResult.text,
      role: streamResult.role,
      detail: {
        usage: streamResult.usage,
        finish_reason: streamResult.finish_reason, // Include finish_reason in detail
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
      initAuditService(audit) // Ensure auditService is initialized if enabled
    // Check if auditService was successfully initialized before calling its methods
    if (auditService) {
      return await auditService.containsSensitiveWords(text)
    }
    else {
      console.warn('Audit service is enabled but not initialized. Skipping audit.')
      return false
    }
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
      : `prompt_${id}`

    if (chatInfo.status !== Status.Normal) {
      return parentMessageId
        ? getMessageById(parentMessageId)
        : undefined
    }
    else {
      if (isPrompt) {
        let content: string | OpenAI.Chat.ChatCompletionContentPart[] = chatInfo.prompt
        if (chatInfo.images && chatInfo.images.length > 0) {
          content = [{ type: 'text', text: chatInfo.prompt }]
          for (const image of chatInfo.images) {
            const imageUrlBase64 = await convertImageUrl(image) // Ensure this returns the correct URL format
            if (imageUrlBase64) { // Should check if conversion was successful
              content.push({
                type: 'image_url',
                image_url: { url: imageUrlBase64 }, // Use the converted URL
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
        return {
          id,
          parentMessageId,
          role: 'assistant', // Assuming response is always from assistant
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
    if (Date.now() - start > 3000) // Timeout to prevent infinite loop
      break
    await new Promise(resolve => setTimeout(resolve, 1000)) // Wait and retry
    unsedKeys = keys.filter(d => _lockedKeys.filter(l => d.key === l.key).length <= 0)
  }
  if (unsedKeys.length <= 0)
    return null
  return unsedKeys[Math.floor(Math.random() * unsedKeys.length)]
}

async function getRandomApiKey(user: UserInfo, chatModel: string): Promise<KeyConfig | undefined> {
  const allKeys = await getCacheApiKeys()
  const eligibleKeys = allKeys
    .filter(d => hasAnyRole(d.userRoles, user.roles))
    .filter(d => d.chatModels.includes(chatModel))

  return randomKeyConfig(eligibleKeys)
}

async function addPreviousMessages(
  parentMessageId: string | undefined, // Can be undefined
  maxContextCount: number,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): Promise<void> {
  let currentMessageId = parentMessageId

  while (currentMessageId && messages.length < maxContextCount) {
    const currentChatMessage: ChatMessage | undefined = await getMessageById(currentMessageId)

    if (!currentChatMessage) { // If a message in the chain is not found, stop.
      break
    }

    // Ensure role is compatible. OpenAI.Chat.ChatCompletionMessageParam['role']
    // is "system" | "user" | "assistant" | "tool". Assuming ChatMessage.role fits.
    messages.unshift({
      content: currentChatMessage.content,
      role: currentChatMessage.role as OpenAI.Chat.ChatCompletionMessageParam['role'], // Explicit cast if needed
    } as OpenAI.Chat.ChatCompletionMessage)

    currentMessageId = currentChatMessage.parentMessageId
  }
}

export { chatReplyProcess, chatConfig, containsSensitiveWords }
