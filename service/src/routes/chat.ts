import type { ResponseChunk } from '../chatgpt/types'
import type { ChatInfo, ChatOptions, UsageResponse, UserInfo } from '../storage/model'
import type { RequestProps } from '../types'
import * as console from 'node:console'
import * as process from 'node:process'
import Router from 'express'
import { ObjectId } from 'mongodb'
import { abortChatProcess, chatReplyProcess, containsSensitiveWords } from '../chatgpt'
import { auth } from '../middleware/auth'
import { limiter } from '../middleware/limiter'
import { getCacheConfig } from '../storage/config'
import { Status, UserRole } from '../storage/model'
import {
  clearChat,
  deleteAllChatRooms,
  deleteChat,
  existsChatRoom,
  getChat,
  getChatRoom,
  getChats,
  getUserById,
  insertChat,
  insertChatUsage,
  updateAmountMinusOne,
  updateChat,
} from '../storage/mongo'
import { isNotEmptyString } from '../utils/is'

export const router = Router()

router.get('/chat-history', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const roomId = +req.query.roomId
    const lastId = req.query.lastId as string
    const all = req.query.all as string
    if ((!roomId || !await existsChatRoom(userId, roomId)) && (all === null || all === 'undefined' || all === undefined || all.trim().length === 0)) {
      res.send({ status: 'Success', message: null, data: [] })
      return
    }

    // When 'all' parameter is not empty, it means requesting to view all users' chat history
    // This requires: 1) user must be an admin, 2) ADMIN_VIEW_CHAT_HISTORY_ENABLED environment variable must be set to 'true'
    if (all !== null && all !== 'undefined' && all !== undefined && all.trim().length !== 0) {
      const config = await getCacheConfig()
      if (config.siteConfig.loginEnabled) {
        try {
          const user = await getUserById(userId)
          if (user == null || user.status !== Status.Normal || !user.roles.includes(UserRole.Admin) || process.env.ADMIN_VIEW_CHAT_HISTORY_ENABLED !== 'true') {
            res.send({ status: 'Fail', message: '无权限 | No permission.', data: null })
            return
          }
        }
        catch (error) {
          res.send({ status: 'Unauthorized', message: error.message ?? 'Please authenticate.', data: null })
        }
      }
      else {
        res.send({ status: 'Fail', message: '无权限 | No permission.', data: null })
      }
    }

    const chats = await getChats(roomId, !isNotEmptyString(lastId) ? null : Number.parseInt(lastId), all)
    const result = []
    chats.forEach((c) => {
      if (c.status !== Status.InversionDeleted) {
        result.push({
          uuid: c.uuid,
          model: c.model,
          dateTime: new Date(c.dateTime),
          text: c.prompt,
          images: c.images,
          inversion: true,
          error: false,
          conversationOptions: null,
          requestOptions: {
            prompt: c.prompt,
            options: null,
          },
        })
      }
      if (c.status !== Status.ResponseDeleted) {
        const usage = c.options.completion_tokens
          ? {
              completion_tokens: c.options.completion_tokens || null,
              prompt_tokens: c.options.prompt_tokens || null,
              total_tokens: c.options.total_tokens || null,
              estimated: c.options.estimated || null,
            }
          : undefined

        // Build response object with tool-related fields
        const responseObj: any = {
          uuid: c.uuid,
          dateTime: new Date(c.dateTime),
          searchQuery: c.searchQuery,
          searchResults: c.searchResults,
          searchUsageTime: c.searchUsageTime,
          reasoning: c.reasoning,
          text: c.response,
          inversion: false,
          error: false,
          loading: false,
          responseCount: (c.previousResponse?.length ?? 0) + 1,
          conversationOptions: {
            parentMessageId: c.options.messageId,
          },
          requestOptions: {
            prompt: c.prompt,
            parentMessageId: c.options.parentMessageId,
            options: {
              parentMessageId: c.options.messageId,
            },
          },
          usage,
        }

        // Add tool-related fields if they exist
        if (c.tool_images)
          responseObj.tool_images = c.tool_images
        if (c.tool_calls)
          responseObj.tool_calls = c.tool_calls
        if (c.editImageId)
          responseObj.editImageId = c.editImageId

        result.push(responseObj)
      }
    })

    res.send({ status: 'Success', message: null, data: result })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Load error', data: null })
  }
})

router.get('/chat-response-history', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const roomId = +req.query.roomId
    const uuid = +req.query.uuid
    const index = +req.query.index
    if (!roomId || !await existsChatRoom(userId, roomId)) {
      res.send({ status: 'Success', message: null, data: [] })
      return
    }
    const chat = await getChat(roomId, uuid)
    if (chat.previousResponse === undefined || chat.previousResponse.length < index) {
      res.send({ status: 'Fail', message: 'Error', data: [] })
      return
    }
    const response = index >= chat.previousResponse.length
      ? chat
      : chat.previousResponse[index]
    const usage = response.options.completion_tokens
      ? {
          completion_tokens: response.options.completion_tokens || null,
          prompt_tokens: response.options.prompt_tokens || null,
          total_tokens: response.options.total_tokens || null,
          estimated: response.options.estimated || null,
        }
      : undefined
    res.send({
      status: 'Success',
      message: null,
      data: {
        uuid: chat.uuid,
        dateTime: new Date(chat.dateTime),
        reasoning: chat.reasoning,
        text: response.response,
        inversion: false,
        error: false,
        loading: false,
        responseCount: (chat.previousResponse?.length ?? 0) + 1,
        conversationOptions: {
          parentMessageId: response.options.messageId,
        },
        requestOptions: {
          prompt: chat.prompt,
          parentMessageId: response.options.parentMessageId,
          options: {
            parentMessageId: response.options.messageId,
          },
        },
        usage,
      },
    })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Load error', data: null })
  }
})

router.post('/chat-delete', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { roomId, uuid, inversion } = req.body as { roomId: number, uuid: number, inversion: boolean }
    if (!roomId || !await existsChatRoom(userId, roomId)) {
      res.send({ status: 'Fail', message: 'Unknown room', data: null })
      return
    }
    await deleteChat(roomId, uuid, inversion)
    res.send({ status: 'Success', message: null, data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Delete error', data: null })
  }
})

router.post('/chat-clear-all', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    await deleteAllChatRooms(userId)
    res.send({ status: 'Success', message: null, data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Delete error', data: null })
  }
})

router.post('/chat-clear', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { roomId } = req.body as { roomId: number }
    if (!roomId || !await existsChatRoom(userId, roomId)) {
      res.send({ status: 'Fail', message: 'Unknown room', data: null })
      return
    }
    await clearChat(roomId)
    res.send({ status: 'Success', message: null, data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Delete error', data: null })
  }
})

router.post('/chat-process', [auth, limiter], async (req, res) => {
  // set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control')

  let { roomId, uuid, regenerate, prompt, uploadFileKeys, options = {}, systemMessage, temperature, top_p, tools, previousResponseId } = req.body as RequestProps
  const userId = req.headers.userId.toString()
  const config = await getCacheConfig()
  const room = await getChatRoom(userId, roomId)
  if (room == null)
    globalThis.console.error(`Unable to get chat room \t ${userId}\t ${roomId}`)
  if (room != null && isNotEmptyString(room.prompt))
    systemMessage = room.prompt
  const model = room.chatModel

  let lastResponse
  let result
  let message: ChatInfo
  let user = await getUserById(userId)
  let errorMessage: string | null = null
  let shouldEarlyExit = false

  // SSE helper functions
  const sendSSEData = (eventType: string, data: any) => {
    res.write(`event: ${eventType}\n`)
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  }

  const sendSSEError = (error: string) => {
    sendSSEData('error', JSON.stringify({ message: error }))
  }

  const sendSSEEnd = () => {
    res.write('event: end\n')
    res.write('data: [DONE]\n\n')
  }

  try {
    // If use the fixed fakeuserid(some probability of duplicated with real ones), redefine user which is send to chatReplyProcess
    if (userId === '6406d8c50aedd633885fa16f') {
      user = { _id: userId, roles: [UserRole.User], useAmount: 999, limit_switch: false } as UserInfo
    }
    else {
      // If global usage count limit is enabled, check can use amount before process chat.
      if (config.siteConfig?.usageCountLimit) {
        const useAmount = user ? (user.useAmount ?? 0) : 0
        if (Number(useAmount) <= 0 && user.limit_switch) {
          sendSSEError('提问次数用完啦 | Question limit reached')
          sendSSEEnd()
          shouldEarlyExit = true
        }
      }
    }

    if (!shouldEarlyExit && (config.auditConfig.enabled || config.auditConfig.customizeEnabled)) {
      if (!user.roles.includes(UserRole.Admin) && await containsSensitiveWords(config.auditConfig, prompt)) {
        sendSSEError('含有敏感词 | Contains sensitive words')
        sendSSEEnd()
        shouldEarlyExit = true
      }
    }

    if (shouldEarlyExit) {
      // Early exit handled in finally block
    }
    else {
      message = regenerate ? await getChat(roomId, uuid) : await insertChat(uuid, prompt, uploadFileKeys, roomId, model, options as ChatOptions)

      result = await chatReplyProcess({
        message: prompt,
        uploadFileKeys,
        parentMessageId: options?.parentMessageId,
        previousResponseId,
        tools,
        process: (chunk: ResponseChunk) => {
          lastResponse = chunk

          // set sse event by different data type
          if (chunk.searching !== undefined) {
            sendSSEData('searching', { searching: chunk.searching })
          }
          if (chunk.generating !== undefined) {
            sendSSEData('generating', { generating: chunk.generating })
          }
          if (chunk.searchQuery) {
            sendSSEData('search_query', { searchQuery: chunk.searchQuery })
          }
          if (chunk.searchResults) {
            sendSSEData('search_results', {
              searchResults: chunk.searchResults,
              searchUsageTime: chunk.searchUsageTime,
            })
          }
          if (chunk.delta) {
            // send SSE event with delta type
            sendSSEData('delta', { m: chunk.delta })
          }
          else {
            // send all data
            sendSSEData('message', {
              id: chunk.id,
              reasoning: chunk.reasoning,
              text: chunk.text,
              role: chunk.role,
              finish_reason: chunk.finish_reason,
            })
          }
        },
        systemMessage,
        temperature,
        top_p,
        user,
        messageId: message._id.toString(),
        room,
        chatUuid: uuid,
      })

      // 发送最终完成数据
      if (result && result.status === 'Success') {
        sendSSEData('complete', result.data)
      }

      sendSSEEnd()
    }
  }
  catch (error) {
    errorMessage = error?.message || 'Unknown error'
    sendSSEError(errorMessage)
    sendSSEEnd()
  }
  finally {
    res.end()
    if (!shouldEarlyExit) {
      try {
        // 如果 message 未创建，无法保存错误信息
        if (message) {
          // 如果发生错误（catch 块中的错误或 result.status !== 'Success'），需要保存错误信息
          const finalErrorMessage = errorMessage || (result && result.status !== 'Success' ? result.message : null)

          if (finalErrorMessage) {
            await updateChat(
              message._id as unknown as string,
              '',
              finalErrorMessage,
              '',
              model,
              {} as UsageResponse,
              regenerate && message.options.messageId ? (message.previousResponse || []).concat([{ response: message.response, options: message.options }]) as [] : undefined,
            )
          }
          else {
            if (result == null || result === undefined || result.status !== 'Success') {
              if (result && result.status !== 'Success')
                lastResponse = { text: result.message }
              result = { data: lastResponse }
            }

            if (result.data !== undefined) {
              // Extract tool_calls, tool_images, and editImageId from result.data
              const tool_calls = result.data.tool_calls
              const editImageId = result.data.editImageId
              let tool_images: string[] | undefined
              if (tool_calls && Array.isArray(tool_calls)) {
                // Extract image file names from tool_calls where type is 'image_generation'
                tool_images = tool_calls
                  .filter((tool: any) => tool.type === 'image_generation' && tool.result)
                  .map((tool: any) => tool.result)
              }

              // 判断是否是生图请求（有 tool_images 或 tool_calls 中包含 image_generation）
              const isImageGeneration = tool_images && tool_images.length > 0

              if (regenerate && message.options.messageId) {
                const previousResponse = message.previousResponse || []
                previousResponse.push({ response: message.response, options: message.options })
                await updateChat(
                  message._id as unknown as string,
                  result.data.reasoning,
                  result.data.text,
                  result.data.id,
                  model,
                  result.data.detail?.usage as UsageResponse,
                  previousResponse as [],
                  tool_images,
                  tool_calls,
                  editImageId,
                  isImageGeneration, // 生图时更新完成时间
                )
              }
              else {
                await updateChat(
                  message._id as unknown as string,
                  result.data.reasoning,
                  result.data.text,
                  result.data.id,
                  model,
                  result.data.detail?.usage as UsageResponse,
                  undefined,
                  tool_images,
                  tool_calls,
                  editImageId,
                  isImageGeneration, // 生图时更新完成时间
                )
              }

              if (result.data.detail?.usage) {
                await insertChatUsage(new ObjectId(req.headers.userId), roomId, message._id, result.data.id, model, result.data.detail?.usage as UsageResponse)
              }
              // update personal useAmount moved here
              // if not fakeuserid, and has valid user info and valid useAmount set by admin nut null and limit is enabled
              if (config.siteConfig?.usageCountLimit) {
                if (userId !== '6406d8c50aedd633885fa16f' && user && user.useAmount && user.limit_switch)
                  await updateAmountMinusOne(userId)
              }
            }
            // 如果 result.data === undefined，什么也不做
          }
        }
        // 如果 !message，什么也不做
      }
      catch (error) {
        globalThis.console.error(error)
      }
    }
  }
})

router.post('/chat-abort', [auth, limiter], async (req, res) => {
  try {
    const userId = req.headers.userId.toString()
    const { chatUuid } = req.body as { chatUuid: number }
    abortChatProcess(userId, chatUuid)
    res.send({ status: 'Success', message: 'OK', data: null })
  }
  catch {
    res.send({ status: 'Fail', message: '中止会话失败 | Chat abort error', data: null })
  }
})
