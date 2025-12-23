import Router from 'express'
import { auth } from '../middleware/auth'
import { getCacheApiKeys } from '../storage/config'
import {
  createChatRoom,
  deleteChatRoom,
  existsChatRoom,
  getChatRooms,
  getChatRoomsCount,
  getUserById,
  renameChatRoom,
  updateRoomChatModel,
  updateRoomImageUploadEnabled,
  updateRoomMaxContextCount,
  updateRoomPrompt,
  updateRoomSearchEnabled,
  updateRoomThinkEnabled,
  updateRoomToolsEnabled,
  updateRoomUsingContext,
} from '../storage/mongo'
import { hasAnyRole } from '../utils/is'

export const router = Router()

router.get('/chatrooms', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const rooms = await getChatRooms(userId)
    const result = []
    rooms.forEach((r) => {
      result.push({
        roomId: r.roomId,
        title: r.title,
        isEdit: false,
        prompt: r.prompt,
        usingContext: r.usingContext === undefined ? true : r.usingContext,
        maxContextCount: r.maxContextCount === undefined ? 10 : r.maxContextCount,
        chatModel: r.chatModel,
        searchEnabled: !!r.searchEnabled,
        thinkEnabled: !!r.thinkEnabled,
        toolsEnabled: !!r.toolsEnabled,
        imageUploadEnabled: !!r.imageUploadEnabled,
      })
    })
    res.send({ status: 'Success', message: null, data: result })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Load error', data: [] })
  }
})

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

router.get('/chatrooms-count', auth, async (req, res) => {
  try {
    const userId = req.query.userId as string
    const page = +req.query.page
    const size = +req.query.size
    const rooms = await getChatRoomsCount(userId, page, size)
    const result = []
    rooms.data.forEach((r) => {
      result.push({
        roomId: r.roomId,
        title: r.title,
        userId: r.userId,
        name: r.username,
        lastTime: formatTimestamp(r.dateTime),
        chatCount: r.chatCount,
      })
    })
    res.send({ status: 'Success', message: null, data: { data: result, total: rooms.total } })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Load error', data: [] })
  }
})

router.post('/room-create', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const user = await getUserById(userId)
    const { title, roomId } = req.body as { title: string, roomId: number }
    const room = await createChatRoom(userId, title, roomId, user.config?.chatModel, user.config?.maxContextCount)
    // 根据chatModel判断并设置imageUploadEnabled
    if (user && room.chatModel) {
      // 解析模型名称，支持格式 "modelName|keyId"
      let actualModelName = room.chatModel
      let specifiedKeyId: string | undefined
      if (room.chatModel.includes('|')) {
        const parts = room.chatModel.split('|')
        actualModelName = parts[0]
        specifiedKeyId = parts[1]
      }

      const keys = (await getCacheApiKeys()).filter(d => hasAnyRole(d.userRoles, user.roles))
      let imageUploadEnabled = false
      let toolsEnabled = false
      if (specifiedKeyId) {
        // 如果指定了 keyId，使用该 key 的配置
        const specifiedKey = keys.find(key => key._id.toString() === specifiedKeyId && key.chatModel === actualModelName)
        if (specifiedKey) {
          imageUploadEnabled = specifiedKey.imageUploadEnabled || false
          toolsEnabled = specifiedKey.toolsEnabled || false
        }
      }
      else {
        // 如果没有指定 keyId，使用原有逻辑
        imageUploadEnabled = false
        toolsEnabled = false
      }

      await updateRoomImageUploadEnabled(userId, roomId, imageUploadEnabled || false)
      await updateRoomToolsEnabled(userId, roomId, toolsEnabled || false)
      if (toolsEnabled) {
        await updateRoomThinkEnabled(userId, roomId, false)
        await updateRoomSearchEnabled(userId, roomId, false)
        room.thinkEnabled = false
        room.searchEnabled = false
      }
      room.imageUploadEnabled = imageUploadEnabled || false
      room.toolsEnabled = toolsEnabled || false
    }
    res.send({ status: 'Success', message: null, data: room })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Create error', data: null })
  }
})

router.post('/room-rename', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { title, roomId } = req.body as { title: string, roomId: number }
    const success = await renameChatRoom(userId, title, roomId)
    if (success)
      res.send({ status: 'Success', message: null, data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Rename error', data: null })
  }
})

router.post('/room-prompt', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { prompt, roomId } = req.body as { prompt: string, roomId: number }
    const success = await updateRoomPrompt(userId, roomId, prompt)
    if (success)
      res.send({ status: 'Success', message: 'Saved successfully', data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Rename error', data: null })
  }
})

router.post('/room-chatmodel', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { chatModel, roomId } = req.body as { chatModel: string, roomId: number }
    const success = await updateRoomChatModel(userId, roomId, chatModel)

    if (success) {
      // 根据新选择的chatModel，动态判断toolsEnabled
      const user = await getUserById(userId)
      if (user) {
        // 解析模型名称，支持格式 "modelName|keyId"
        let actualModelName = chatModel
        let specifiedKeyId: string | undefined
        if (chatModel.includes('|')) {
          const parts = chatModel.split('|')
          actualModelName = parts[0]
          specifiedKeyId = parts[1]
        }

        const keys = (await getCacheApiKeys()).filter(d => hasAnyRole(d.userRoles, user.roles))

        let toolsEnabled = false
        let imageUploadEnabled = false

        if (specifiedKeyId) {
          // 如果指定了 keyId，使用该 key 的配置
          const specifiedKey = keys.find(key => key._id.toString() === specifiedKeyId && key.chatModel === actualModelName)
          if (specifiedKey) {
            toolsEnabled = specifiedKey.toolsEnabled || false
            imageUploadEnabled = specifiedKey.imageUploadEnabled || false
          }
        }
        else {
          toolsEnabled = false
          imageUploadEnabled = false
        }

        // 更新房间的toolsEnabled状态
        await updateRoomToolsEnabled(userId, roomId, toolsEnabled || false)
        // 更新房间的imageUploadEnabled状态
        await updateRoomImageUploadEnabled(userId, roomId, imageUploadEnabled || false)

        res.send({
          status: 'Success',
          message: 'Saved successfully',
          data: {
            toolsEnabled: toolsEnabled || false,
            imageUploadEnabled: imageUploadEnabled || false,
          },
        })
      }
      else {
        res.send({ status: 'Success', message: 'Saved successfully', data: null })
      }
    }
    else {
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
    }
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Rename error', data: null })
  }
})

router.post('/room-max-context-count', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { maxContextCount, roomId } = req.body as { maxContextCount: number, roomId: number }
    const success = await updateRoomMaxContextCount(userId, roomId, maxContextCount)
    if (success)
      res.send({ status: 'Success', message: 'Saved successfully', data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Update error', data: null })
  }
})

router.post('/room-search-enabled', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { searchEnabled, roomId } = req.body as { searchEnabled: boolean, roomId: number }
    const success = await updateRoomSearchEnabled(userId, roomId, searchEnabled)
    if (success)
      res.send({ status: 'Success', message: 'Saved successfully', data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Update error', data: null })
  }
})

router.post('/room-think-enabled', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { thinkEnabled, roomId } = req.body as { thinkEnabled: boolean, roomId: number }
    const success = await updateRoomThinkEnabled(userId, roomId, thinkEnabled)
    if (success)
      res.send({ status: 'Success', message: 'Saved successfully', data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Update error', data: null })
  }
})

router.post('/room-tools-enabled', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { toolsEnabled, roomId } = req.body as { toolsEnabled: boolean, roomId: number }
    const success = await updateRoomToolsEnabled(userId, roomId, toolsEnabled)
    if (success)
      res.send({ status: 'Success', message: 'Saved successfully', data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Update error', data: null })
  }
})

router.post('/room-context', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { using, roomId } = req.body as { using: boolean, roomId: number }
    const success = await updateRoomUsingContext(userId, roomId, using)
    if (success)
      res.send({ status: 'Success', message: 'Saved successfully', data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Rename error', data: null })
  }
})

router.post('/room-delete', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { roomId } = req.body as { roomId: number }
    if (!roomId || !await existsChatRoom(userId, roomId)) {
      res.send({ status: 'Fail', message: 'Unknown room', data: null })
      return
    }
    const success = await deleteChatRoom(userId, roomId)
    if (success)
      res.send({ status: 'Success', message: null, data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Delete error', data: null })
  }
})
