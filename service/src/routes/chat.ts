import type { ResponseChunk } from '../chatgpt/types'
import type { ChatInfo, ChatOptions, UsageResponse, UserInfo } from '../storage/model'
import type { RequestProps } from '../types'
import * as console from 'node:console'
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

    if (all !== null && all !== 'undefined' && all !== undefined && all.trim().length !== 0) {
      const config = await getCacheConfig()
      if (config.siteConfig.loginEnabled) {
        try {
          const user = await getUserById(userId)
          if (user == null || user.status !== Status.Normal || !user.roles.includes(UserRole.Admin)) {
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
          dateTime: new Date(c.dateTime).toLocaleString(),
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
        result.push({
          uuid: c.uuid,
          dateTime: new Date(c.dateTime).toLocaleString(),
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
        })
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
        dateTime: new Date(chat.dateTime).toLocaleString(),
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
  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control')

  let { roomId, uuid, regenerate, prompt, uploadFileKeys, options = {}, systemMessage, temperature, top_p } = req.body as RequestProps
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

  // SSE 辅助函数
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
          res.end()
          return
        }
      }
    }

    if (config.auditConfig.enabled || config.auditConfig.customizeEnabled) {
      if (!user.roles.includes(UserRole.Admin) && await containsSensitiveWords(config.auditConfig, prompt)) {
        sendSSEError('含有敏感词 | Contains sensitive words')
        sendSSEEnd()
        res.end()
        return
      }
    }

    message = regenerate ? await getChat(roomId, uuid) : await insertChat(uuid, prompt, uploadFileKeys, roomId, model, options as ChatOptions)

    result = await chatReplyProcess({
      message: prompt,
      uploadFileKeys,
      parentMessageId: options?.parentMessageId,
      process: (chunk: ResponseChunk) => {
        lastResponse = chunk

        // 根据数据类型发送不同的 SSE 事件
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
          // 发送增量数据
          sendSSEData('delta', { m: chunk.delta })
        }
        else {
          // 兼容现有格式，发送完整数据但标记为增量类型
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
  catch (error) {
    sendSSEError(error?.message || 'Unknown error')
    sendSSEEnd()
  }
  finally {
    res.end()
    try {
      if (result == null || result === undefined || result.status !== 'Success') {
        if (result && result.status !== 'Success')
          lastResponse = { text: result.message }
        result = { data: lastResponse }
      }

      if (result.data === undefined)
        // eslint-disable-next-line no-unsafe-finally
        return

      if (regenerate && message.options.messageId) {
        const previousResponse = message.previousResponse || []
        previousResponse.push({ response: message.response, options: message.options })
        await updateChat(message._id as unknown as string, result.data.reasoning, result.data.text, result.data.id, model, result.data.detail?.usage as UsageResponse, previousResponse as [])
      }
      else {
        await updateChat(message._id as unknown as string, result.data.reasoning, result.data.text, result.data.id, model, result.data.detail?.usage as UsageResponse)
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
    catch (error) {
      globalThis.console.error(error)
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
