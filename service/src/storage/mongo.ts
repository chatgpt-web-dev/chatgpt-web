import dayjs from 'dayjs'
import * as dotenv from 'dotenv'
import { MongoClient, ObjectId } from 'mongodb'
import { md5 } from '../utils/security'
import type { CHATMODEL, ChatOptions, Config, KeyConfig, UsageResponse, UserPrompt } from './model'
import { ChatInfo, ChatRoom, ChatUsage, Status, UserConfig, UserInfo, UserRole } from './model'

dotenv.config()

const url = process.env.MONGODB_URL
const parsedUrl = new URL(url)
const dbName = (parsedUrl.pathname && parsedUrl.pathname !== '/') ? parsedUrl.pathname.substring(1) : 'chatgpt'
const client = new MongoClient(url)
const chatCol = client.db(dbName).collection('chat')
const roomCol = client.db(dbName).collection('chat_room')
const userCol = client.db(dbName).collection('user')
const configCol = client.db(dbName).collection('config')
const usageCol = client.db(dbName).collection('chat_usage')
const keyCol = client.db(dbName).collection('key_config')
const userPromptCol = client.db(dbName).collection('user_prompt')

/**
 * 插入聊天信息
 * @param uuid
 * @param text 内容 prompt or response
 * @param roomId
 * @param options
 * @returns model
 */
export async function insertChat(uuid: number, text: string, roomId: number, options?: ChatOptions) {
  const chatInfo = new ChatInfo(roomId, uuid, text, options)
  await chatCol.insertOne(chatInfo)
  return chatInfo
}

export async function getChat(roomId: number, uuid: number) {
  return await chatCol.findOne({ roomId, uuid }) as ChatInfo
}

export async function getChatByMessageId(messageId: string) {
  return await chatCol.findOne({ 'options.messageId': messageId }) as ChatInfo
}

export async function updateChat(chatId: string, response: string, messageId: string, conversationId: string, usage: UsageResponse, previousResponse?: []) {
  const query = { _id: new ObjectId(chatId) }
  const update = {
    $set: {
      'response': response,
      'options.messageId': messageId,
      'options.conversationId': conversationId,
      'options.prompt_tokens': usage?.prompt_tokens,
      'options.completion_tokens': usage?.completion_tokens,
      'options.total_tokens': usage?.total_tokens,
      'options.estimated': usage?.estimated,
    },
  }

  if (previousResponse)
    update.$set.previousResponse = previousResponse

  await chatCol.updateOne(query, update)
}

export async function insertChatUsage(userId: ObjectId, roomId: number, chatId: ObjectId, messageId: string, usage: UsageResponse) {
  const chatUsage = new ChatUsage(userId, roomId, chatId, messageId, usage)
  await usageCol.insertOne(chatUsage)
  return chatUsage
}

export async function createChatRoom(userId: string, title: string, roomId: number) {
  const room = new ChatRoom(userId, title, roomId)
  await roomCol.insertOne(room)
  return room
}
export async function renameChatRoom(userId: string, title: string, roomId: number) {
  const query = { userId, roomId }
  const update = {
    $set: {
      title,
    },
  }
  return await roomCol.updateOne(query, update)
}

export async function deleteChatRoom(userId: string, roomId: number) {
  const result = await roomCol.updateOne({ roomId, userId }, { $set: { status: Status.Deleted } })
  await clearChat(roomId)
  return result
}

export async function updateRoomPrompt(userId: string, roomId: number, prompt: string) {
  const query = { userId, roomId }
  const update = {
    $set: {
      prompt,
    },
  }
  const result = await roomCol.updateOne(query, update)
  return result.modifiedCount > 0
}

export async function updateRoomUsingContext(userId: string, roomId: number, using: boolean) {
  const query = { userId, roomId }
  const update = {
    $set: {
      usingContext: using,
    },
  }
  const result = await roomCol.updateOne(query, update)
  return result.modifiedCount > 0
}

export async function updateRoomAccountId(userId: string, roomId: number, accountId: string) {
  const query = { userId, roomId }
  const update = {
    $set: {
      accountId,
    },
  }
  const result = await roomCol.updateOne(query, update)
  return result.modifiedCount > 0
}

export async function updateRoomChatModel(userId: string, roomId: number, chatModel: CHATMODEL) {
  const query = { userId, roomId }
  const update = {
    $set: {
      chatModel,
    },
  }
  const result = await roomCol.updateOne(query, update)
  return result.modifiedCount > 0
}

export async function getChatRooms(userId: string) {
  const cursor = await roomCol.find({ userId, status: { $ne: Status.Deleted } })
  const rooms = []
  await cursor.forEach(doc => rooms.push(doc))
  return rooms
}

export async function getChatRoomsCount(userId: string, page: number, size: number) {
  let total = 0
  const skip = (page - 1) * size
  const limit = size
  const agg = []
  if (userId !== null && userId !== 'undefined' && userId !== undefined && userId.trim().length !== 0) {
    agg.push({
      $match: {
        userId,
      },
    })
    total = await roomCol.countDocuments({ userId })
  }
  else {
    total = await roomCol.countDocuments()
  }
  const agg2 = [
    {
      $lookup: {
        from: 'chat',
        localField: 'roomId',
        foreignField: 'roomId',
        as: 'chat',
      },
    }, {
      $addFields: {
        title: '$chat.prompt',
        user_ObjectId: {
          $toObjectId: '$userId',
        },
      },
    }, {
      $lookup: {
        from: 'user',
        localField: 'user_ObjectId',
        foreignField: '_id',
        as: 'user',
      },
    }, {
      $unwind: {
        path: '$user',
        preserveNullAndEmptyArrays: false,
      },
    }, {
      $sort: {
        'chat.dateTime': -1,
      },
    }, {
      $addFields: {
        chatCount: {
          $size: '$chat',
        },
        chat: {
          $arrayElemAt: [
            {
              $slice: [
                '$chat', -1,
              ],
            }, 0,
          ],
        },
      },
    }, {
      $project: {
        userId: 1,
        title: '$chat.prompt',
        username: '$user.name',
        roomId: 1,
        chatCount: 1,
        dateTime: '$chat.dateTime',
      },
    }, {
      $sort: {
        dateTime: -1,
      },
    }, {
      $skip: skip,
    }, {
      $limit: limit,
    },
  ]
  Array.prototype.push.apply(agg, agg2)

  const cursor = roomCol.aggregate(agg)
  const data = await cursor.toArray()
  return { total, data }
}

export async function getChatRoom(userId: string, roomId: number) {
  return await roomCol.findOne({ userId, roomId, status: { $ne: Status.Deleted } }) as ChatRoom
}

export async function existsChatRoom(userId: string, roomId: number) {
  const room = await roomCol.findOne({ roomId, userId })
  return !!room
}

export async function deleteAllChatRooms(userId: string) {
  await roomCol.updateMany({ userId, status: Status.Normal }, { $set: { status: Status.Deleted } })
  await chatCol.updateMany({ userId, status: Status.Normal }, { $set: { status: Status.Deleted } })
}

export async function getChats(roomId: number, lastId?: number, all?: string) {
  if (!lastId)
    lastId = new Date().getTime()
  let query = {}
  if (all === null || all === 'undefined' || all === undefined || all.trim().length === 0)
    query = { roomId, uuid: { $lt: lastId }, status: { $ne: Status.Deleted } }
  else
    query = { roomId, uuid: { $lt: lastId } }

  const limit = 20
  const cursor = await chatCol.find(query).sort({ dateTime: -1 }).limit(limit)
  const chats = []
  await cursor.forEach(doc => chats.push(doc))
  chats.reverse()
  return chats
}

export async function clearChat(roomId: number) {
  const query = { roomId }
  const update = {
    $set: {
      status: Status.Deleted,
    },
  }
  await chatCol.updateMany(query, update)
}

export async function deleteChat(roomId: number, uuid: number, inversion: boolean) {
  const query = { roomId, uuid }
  let update = {
    $set: {
      status: Status.Deleted,
    },
  }
  const chat = await chatCol.findOne(query)
  if (chat.status === Status.InversionDeleted && !inversion) { /* empty */ }
  else if (chat.status === Status.ResponseDeleted && inversion) { /* empty */ }
  else if (inversion) {
    update = {
      $set: {
        status: Status.InversionDeleted,
      },
    }
  }
  else {
    update = {
      $set: {
        status: Status.ResponseDeleted,
      },
    }
  }
  await chatCol.updateOne(query, update)
}

export async function createUser(email: string, password: string, roles?: UserRole[], remark?: string): Promise<UserInfo> {
  email = email.toLowerCase()
  const userInfo = new UserInfo(email, password)
  if (roles && roles.includes(UserRole.Admin))
    userInfo.status = Status.Normal
  userInfo.roles = roles
  userInfo.remark = remark
  await userCol.insertOne(userInfo)
  return userInfo
}

export async function updateUserInfo(userId: string, user: UserInfo) {
  return userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { name: user.name, description: user.description, avatar: user.avatar, temperature: user.temperature, top_p: user.top_p, presencePenalty: user.presencePenalty, systemRole: user.systemRole } })
}

export async function updateUserChatModel(userId: string, chatModel: CHATMODEL) {
  return userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { 'config.chatModel': chatModel } })
}

export async function updateUser2FA(userId: string, secretKey: string) {
  return userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { secretKey, updateTime: new Date().toLocaleString() } })
}

export async function disableUser2FA(userId: string) {
  return userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { secretKey: null, updateTime: new Date().toLocaleString() } })
}

export async function updateUserPassword(userId: string, password: string) {
  return userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { password, updateTime: new Date().toLocaleString() } })
}

export async function updateUserPasswordWithVerifyOld(userId: string, oldPassword: string, newPassword: string) {
  return userCol.updateOne({ _id: new ObjectId(userId), password: oldPassword }
    , { $set: { password: newPassword, updateTime: new Date().toLocaleString() } })
}

export async function getUser(email: string): Promise<UserInfo> {
  email = email.toLowerCase()
  const userInfo = await userCol.findOne({ email }) as UserInfo
  initUserInfo(userInfo)
  return userInfo
}

export async function getUsers(page: number, size: number): Promise<{ users: UserInfo[]; total: number }> {
  const query = { status: { $ne: Status.Deleted } }
  const cursor = userCol.find(query).sort({ createTime: -1 })
  const total = await userCol.countDocuments(query)
  const skip = (page - 1) * size
  const limit = size
  const pagedCursor = cursor.skip(skip).limit(limit)
  const users: UserInfo[] = []
  await pagedCursor.forEach(doc => users.push(doc))
  users.forEach((user) => {
    initUserInfo(user)
  })
  return { users, total }
}

export async function getUserById(userId: string): Promise<UserInfo> {
  const userInfo = await userCol.findOne({ _id: new ObjectId(userId) }) as UserInfo
  initUserInfo(userInfo)
  return userInfo
}

function initUserInfo(userInfo: UserInfo) {
  if (userInfo == null)
    return
  if (userInfo.config == null)
    userInfo.config = new UserConfig()
  if (userInfo.config.chatModel == null)
    userInfo.config.chatModel = 'gpt-3.5-turbo'
  if (userInfo.roles == null || userInfo.roles.length <= 0) {
    userInfo.roles = [UserRole.User]
    if (process.env.ROOT_USER === userInfo.email.toLowerCase())
      userInfo.roles.push(UserRole.Admin)
  }
}

export async function verifyUser(email: string, status: Status) {
  email = email.toLowerCase()
  return await userCol.updateOne({ email }, { $set: { status, verifyTime: new Date().toLocaleString() } })
}

export async function updateUserStatus(userId: string, status: Status) {
  return await userCol.updateOne({ _id: new ObjectId(userId) }, { $set: { status, verifyTime: new Date().toLocaleString() } })
}

export async function updateUser(userId: string, roles: UserRole[], password: string, remark?: string) {
  const user = await getUserById(userId)
  const query = { _id: new ObjectId(userId) }
  if (user.password !== password && user.password) {
    const newPassword = md5(password)
    return await userCol.updateOne(query, { $set: { roles, verifyTime: new Date().toLocaleString(), password: newPassword, remark } })
  }
  else {
    return await userCol.updateOne(query, { $set: { roles, verifyTime: new Date().toLocaleString(), remark } })
  }
}

export async function getConfig(): Promise<Config> {
  return await configCol.findOne() as Config
}

export async function updateConfig(config: Config): Promise<Config> {
  const result = await configCol.replaceOne({ _id: config._id }, config, { upsert: true })
  if (result.modifiedCount > 0 || result.upsertedCount > 0)
    return config
  if (result.matchedCount > 0 && result.modifiedCount <= 0 && result.upsertedCount <= 0)
    return config
  return null
}

export async function getUserStatisticsByDay(userId: ObjectId, start: number, end: number): Promise<any> {
  const pipeline = [
    { // filter by dateTime
      $match: {
        dateTime: {
          $gte: start,
          $lte: end,
        },
        userId,
      },
    },
    { // convert dateTime to date
      $addFields: {
        date: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: {
              $toDate: '$dateTime',
            },
          },
        },
      },
    },
    { // group by date
      $group: {
        _id: '$date',
        promptTokens: {
          $sum: '$promptTokens',
        },
        completionTokens: {
          $sum: '$completionTokens',
        },
        totalTokens: {
          $sum: '$totalTokens',
        },
      },
    },
    { // sort by date
      $sort: {
        _id: 1,
      },
    },
  ]

  const aggStatics = await usageCol.aggregate(pipeline).toArray()

  const step = 86400000 // 1 day in milliseconds
  const result = {
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    chartData: [],
  }
  for (let i = start; i <= end; i += step) {
    // Convert the timestamp to a Date object
    const date = dayjs(i, 'x').format('YYYY-MM-DD')

    const dateData = aggStatics.find(x => x._id === date)
      || { _id: date, promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    result.promptTokens += dateData.promptTokens
    result.completionTokens += dateData.completionTokens
    result.totalTokens += dateData.totalTokens
    result.chartData.push(dateData)
  }

  return result
}

export async function getKeys(): Promise<{ keys: KeyConfig[]; total: number }> {
  const query = { status: { $ne: Status.Disabled } }
  const cursor = await keyCol.find(query)
  const total = await keyCol.countDocuments(query)
  const keys = []
  await cursor.forEach(doc => keys.push(doc))
  return { keys, total }
}

export async function upsertKey(key: KeyConfig): Promise<KeyConfig> {
  if (key._id === undefined)
    await keyCol.insertOne(key)
  else
    await keyCol.replaceOne({ _id: key._id }, key, { upsert: true })
  return key
}

export async function updateApiKeyStatus(id: string, status: Status) {
  return await keyCol.updateOne({ _id: new ObjectId(id) }, { $set: { status } })
}

export async function upsertUserPrompt(userPrompt: UserPrompt): Promise<UserPrompt> {
  if (userPrompt._id === undefined)
    await userPromptCol.insertOne(userPrompt)
  else
    await userPromptCol.replaceOne({ _id: userPrompt._id }, userPrompt, { upsert: true })
  return userPrompt
}
export async function getUserPromptList(userId: string): Promise<{ data: UserPrompt[]; total: number }> {
  const query = { userId }
  const total = await userPromptCol.countDocuments(query)
  const cursor = userPromptCol.find(query).sort({ _id: -1 })
  const data = []
  await cursor.forEach(doc => data.push(doc))
  return { data, total }
}

export async function deleteUserPrompt(id: string) {
  const query = { _id: new ObjectId(id) }
  await userPromptCol.deleteOne(query)
}

export async function clearUserPrompt(userId: string) {
  const query = { userId }
  await userPromptCol.deleteMany(query)
}

export async function importUserPrompt(userPromptList: UserPrompt[]) {
  await userPromptCol.insertMany(userPromptList)
}
