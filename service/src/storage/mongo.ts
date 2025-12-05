import type { Filter, WithId } from 'mongodb'
import type {
  AdvancedConfig,
  BuiltInPrompt,
  ChatOptions,
  Config,
  GiftCard,
  KeyConfig,
  SearchResult,
  UsageResponse,
  UserPrompt,
} from './model'
import * as process from 'node:process'
import dayjs from 'dayjs'
import * as dotenv from 'dotenv'
import { MongoClient, ObjectId } from 'mongodb'
import { md5 } from '../utils/security'
import { getCacheConfig } from './config'
import { ChatInfo, ChatRoom, ChatUsage, Status, UserConfig, UserInfo, UserRole } from './model'

dotenv.config()

const url = process.env.MONGODB_URL

let client: MongoClient
let dbName: string
let isInitialized = false

try {
  client = new MongoClient(url)
  const parsedUrl = new URL(url)
  dbName = (parsedUrl.pathname && parsedUrl.pathname !== '/') ? parsedUrl.pathname.substring(1) : 'chatgpt'
}
catch (e) {
  globalThis.console.error('MongoDB url invalid. please ensure set valid env MONGODB_URL.', e.message)
  process.exit(1)
}

const chatCol = client.db(dbName).collection<ChatInfo>('chat')
const roomCol = client.db(dbName).collection<ChatRoom>('chat_room')
const userCol = client.db(dbName).collection<UserInfo>('user')
const configCol = client.db(dbName).collection<Config>('config')
const usageCol = client.db(dbName).collection<ChatUsage>('chat_usage')
const keyCol = client.db(dbName).collection<KeyConfig>('key_config')
const builtInPromptCol = client.db(dbName).collection<BuiltInPrompt>('built_in_prompt')
const userPromptCol = client.db(dbName).collection<UserPrompt>('user_prompt')
// 新增兑换券的数据库
// {
//   "_id": { "$comment": "Mongodb系统自动" , "$type": "ObjectId" },
//   "cardno": { "$comment": "卡号（可以用csv导入）", "$type": "String" },
//   "amount": { "$comment": "卡号对应的额度", "$type": "Int32" },
//   "redeemed": { "$comment": "标记是否已被兑换，0｜1表示false｜true，目前类型为Int是为图方便和测试考虑以后识别泄漏啥的（多次被兑换）", "$type": "Int32" },
//   "redeemed_by": { "$comment": "执行成功兑换的用户", "$type": "String" },
//   "redeemed_date": { "$comment": "执行成功兑换的日期，考虑通用性选择了String类型，由new Date().toLocaleString()产生", "$type": "String" }
// }
const redeemCol = client.db(dbName).collection<GiftCard>('giftcards')

/**
 * Initialize all database indexes
 * This should be called once when the application starts
 * Note: createIndex is idempotent - it won't fail if index already exists
 */

async function initializeIndexes() {
  try {
    // ============================================
    // chat_room collection indexes
    // ============================================
    // Index for /api/chatrooms: getChatRooms(userId)
    // Query: { userId, status: { $ne: Status.Deleted } }
    await roomCol.createIndex({ userId: 1, status: 1 }, { name: 'idx_userId_status' })

    // Index for getChatRoom: { userId, roomId, status: { $ne: Status.Deleted } }
    await roomCol.createIndex({ userId: 1, roomId: 1, status: 1 }, { name: 'idx_userId_roomId_status' })

    // Index for existsChatRoom: { roomId, userId }
    await roomCol.createIndex({ roomId: 1, userId: 1 }, { name: 'idx_roomId_userId' })

    // Index for getChatRoomsCount aggregation lookup
    await roomCol.createIndex({ roomId: 1 }, { name: 'idx_roomId' })

    globalThis.console.log('✓ chat_room collection indexes created')

    // ============================================
    // chat collection indexes
    // ============================================
    // Index for /api/chat-history: getChats(roomId, lastId, all)
    // Query: { roomId, uuid: { $lt: lastId }, status: { $ne: Status.Deleted } }
    // Sort: { dateTime: -1 }
    await chatCol.createIndex(
      { roomId: 1, uuid: -1, dateTime: -1, status: 1 },
      { name: 'idx_roomId_uuid_dateTime_status' },
    )

    // Alternative index for queries without status filter
    await chatCol.createIndex(
      { roomId: 1, uuid: -1, dateTime: -1 },
      { name: 'idx_roomId_uuid_dateTime' },
    )

    // Index for getChat: { roomId, uuid }
    await chatCol.createIndex({ roomId: 1, uuid: 1 }, { name: 'idx_roomId_uuid' })

    // Index for getChatByMessageId: { 'options.messageId': messageId }
    await chatCol.createIndex({ 'options.messageId': 1 }, { name: 'idx_options_messageId' })

    // Index for getChatRoomsCount aggregation lookup
    await chatCol.createIndex({ roomId: 1, dateTime: -1 }, { name: 'idx_roomId_dateTime' })

    // Index for deleteAllChatRooms: updateMany({ userId, status: Status.Normal }, ...)
    await chatCol.createIndex({ userId: 1, status: 1 }, { name: 'idx_userId_status' })

    globalThis.console.log('✓ chat collection indexes created')

    // ============================================
    // user collection indexes
    // ============================================
    // Index for getUser: { email }
    try {
      await userCol.createIndex({ email: 1 }, { name: 'idx_email', unique: true })
    }
    catch (error: any) {
      // Ignore error if unique index already exists
      if (!error.message?.includes('E11000') && !error.message?.includes('duplicate key')) {
        throw error
      }
    }

    // Index for getUsers: { status: { $ne: Status.Deleted } } with sort by createTime
    await userCol.createIndex({ status: 1, createTime: -1 }, { name: 'idx_status_createTime' })

    globalThis.console.log('✓ user collection indexes created')

    // ============================================
    // chat_usage collection indexes
    // ============================================
    // Index for getUserStatisticsByDay: { dateTime, userId }
    await usageCol.createIndex({ dateTime: 1, userId: 1 }, { name: 'idx_dateTime_userId' })

    globalThis.console.log('✓ chat_usage collection indexes created')

    // ============================================
    // giftcards collection indexes
    // ============================================
    // Index for getAmtByCardNo: { cardno }
    try {
      await redeemCol.createIndex({ cardno: 1 }, { name: 'idx_cardno', unique: true })
    }
    catch (error: any) {
      // Ignore error if unique index already exists
      if (!error.message?.includes('E11000') && !error.message?.includes('duplicate key')) {
        throw error
      }
    }

    globalThis.console.log('✓ giftcards collection indexes created')

    // ============================================
    // user_prompt collection indexes
    // ============================================
    // Index for getUserPromptList: { userId }
    await userPromptCol.createIndex({ userId: 1 }, { name: 'idx_userId' })

    globalThis.console.log('✓ user_prompt collection indexes created')

    // ============================================
    // key_config collection indexes
    // ============================================
    // Index for getKeys: { status: { $ne: Status.Disabled } }
    await keyCol.createIndex({ status: 1 }, { name: 'idx_status' })

    globalThis.console.log('✓ key_config collection indexes created')

    globalThis.console.log('✓ All database indexes initialized successfully')
  }
  catch (error: any) {
    // Log error but don't throw - allow application to start even if index creation fails
    globalThis.console.error('⚠ Warning: Error initializing database indexes:', error.message)
    globalThis.console.error('  Application will continue to start. You may need to create indexes manually.')
  }
}

/**
 * Initialize MongoDB connection and indexes
 * This should be called once when the application starts
 */
export async function initializeMongoDB() {
  if (isInitialized) {
    return
  }

  try {
    // Connect to MongoDB
    await client.connect()
    globalThis.console.log('✓ MongoDB connected successfully')

    // Initialize indexes
    await initializeIndexes()

    isInitialized = true
  }
  catch (error: any) {
    globalThis.console.error('✗ Error initializing MongoDB:', error.message)
    // Don't throw - allow application to continue
    // MongoDB operations will fail gracefully if connection is not established
  }
}

/**
 * 插入聊天信息
 * @param uuid
 * @param text 内容 prompt or response
 * @param roomId
 * @param options
 * @returns model
 */

// 获取、比对兑换券号码
export async function getAmtByCardNo(redeemCardNo: string) {
  // const chatInfo = new ChatInfo(roomId, uuid, text, options)
  const amt_isused = await redeemCol.findOne({ cardno: redeemCardNo.trim() }) as GiftCard
  return amt_isused
}
// 兑换后更新兑换券信息
export async function updateGiftCard(redeemCardNo: string, userId: string) {
  return await redeemCol.updateOne({ cardno: redeemCardNo.trim() }, { $set: { redeemed: 1, redeemed_date: new Date().toLocaleString(), redeemed_by: userId } })
}
// 使用对话后更新用户额度
export async function updateAmountMinusOne(userId: string) {
  const result = await userCol.updateOne({ _id: new ObjectId(userId) }, { $inc: { useAmount: -1 } })
  return result.modifiedCount > 0
}

// update giftcards database
export async function updateGiftCards(data: GiftCard[], overRide = true) {
  if (overRide) {
    // i am not sure is there a drop option for the node driver reference https://mongodb.github.io/node-mongodb-native/6.4/
    // await redeemCol.deleteMany({})
    await redeemCol.drop()
  }
  const insertResult = await redeemCol.insertMany(data)
  return insertResult
}

export async function insertChat(uuid: number, text: string, images: string[], roomId: number, model: string, options?: ChatOptions) {
  const chatInfo = new ChatInfo(roomId, uuid, text, images, model, options)
  await chatCol.insertOne(chatInfo)
  return chatInfo
}

export async function getChat(roomId: number, uuid: number) {
  return await chatCol.findOne({ roomId, uuid })
}

export async function getChatByMessageId(messageId: string) {
  return await chatCol.findOne({ 'options.messageId': messageId })
}

export async function updateChat(chatId: string, reasoning: string, response: string, messageId: string, model: string, usage: UsageResponse, previousResponse?: []) {
  const query = { _id: new ObjectId(chatId) }
  const update = {
    $set: {
      'reasoning': reasoning,
      'response': response,
      'model': model || '',
      'options.messageId': messageId,
      'options.prompt_tokens': usage?.prompt_tokens,
      'options.completion_tokens': usage?.completion_tokens,
      'options.total_tokens': usage?.total_tokens,
      'options.estimated': usage?.estimated,
    },
  }

  if (previousResponse)
  // @ts-expect-error https://jira.mongodb.org/browse/NODE-5214
    update.$set.previousResponse = previousResponse

  await chatCol.updateOne(query, update)
}

export async function updateChatSearchQuery(chatId: string, searchQuery: string) {
  const query = { _id: new ObjectId(chatId) }
  const update = {
    $set: {
      searchQuery,
    },
  }
  const result = await chatCol.updateOne(query, update)
  return result.modifiedCount > 0
}

export async function updateChatSearchResult(chatId: string, searchResults: SearchResult[], searchUsageTime: number) {
  const query = { _id: new ObjectId(chatId) }
  const update = {
    $set: {
      searchResults,
      searchUsageTime,
    },
  }
  const result = await chatCol.updateOne(query, update)
  return result.modifiedCount > 0
}

export async function insertChatUsage(userId: ObjectId, roomId: number, chatId: ObjectId, messageId: string, model: string, usage: UsageResponse) {
  const chatUsage = new ChatUsage(userId, roomId, chatId, messageId, model, usage)
  await usageCol.insertOne(chatUsage)
  return chatUsage
}

export async function createChatRoom(userId: string, title: string, roomId: number, chatModel: string, maxContextCount: number) {
  const config = await getCacheConfig()
  if (!chatModel) {
    chatModel = config?.siteConfig?.chatModels.split(',')[0]
  }
  if (maxContextCount === undefined) {
    maxContextCount = 10
  }
  const room = new ChatRoom(userId, title, roomId, chatModel, true, maxContextCount, true, false)
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
  const result = await roomCol.updateOne(query, update)
  return result.modifiedCount > 0
}

export async function deleteChatRoom(userId: string, roomId: number) {
  const result = await roomCol.updateOne({ roomId, userId }, { $set: { status: Status.Deleted } })
  await clearChat(roomId)
  return result.modifiedCount > 0
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

export async function updateRoomChatModel(userId: string, roomId: number, chatModel: string) {
  const query = { userId, roomId }
  const update = {
    $set: {
      chatModel,
    },
  }
  const result = await roomCol.updateOne(query, update)
  return result.modifiedCount > 0
}

export async function updateRoomSearchEnabled(userId: string, roomId: number, searchEnabled: boolean) {
  const query = { userId, roomId }
  const update = {
    $set: {
      searchEnabled,
    },
  }
  const result = await roomCol.updateOne(query, update)
  return result.modifiedCount > 0
}

export async function updateRoomThinkEnabled(userId: string, roomId: number, thinkEnabled: boolean) {
  const query = { userId, roomId }
  const update = {
    $set: {
      thinkEnabled,
    },
  }
  const result = await roomCol.updateOne(query, update)
  return result.modifiedCount > 0
}

export async function updateRoomMaxContextCount(userId: string, roomId: number, maxContextCount: number) {
  const query = { userId, roomId }
  const update = {
    $set: {
      maxContextCount,
    },
  }
  const result = await roomCol.updateOne(query, update)
  return result.modifiedCount > 0
}

export async function getChatRooms(userId: string) {
  const cursor = roomCol.find({ userId, status: { $ne: Status.Deleted } })
  const rooms = []
  for await (const doc of cursor)
    rooms.push(doc)
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
        let: { roomId: '$roomId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$roomId', '$$roomId'] },
                  { $ne: ['$status', Status.InversionDeleted] },
                ],
              },
            },
          },
          {
            $sort: { dateTime: -1 },
          },
          {
            $group: {
              _id: null,
              chatCount: { $sum: 1 },
              lastChat: { $first: '$$ROOT' },
            },
          },
        ],
        as: 'chatInfo',
      },
    },
    {
      $addFields: {
        chatCount: {
          $ifNull: [{ $arrayElemAt: ['$chatInfo.chatCount', 0] }, 0],
        },
        lastChat: {
          $arrayElemAt: ['$chatInfo.lastChat', 0],
        },
        user_ObjectId: {
          $toObjectId: '$userId',
        },
      },
    },
    {
      $lookup: {
        from: 'user',
        localField: 'user_ObjectId',
        foreignField: '_id',
        as: 'user',
        pipeline: [
          {
            $project: {
              name: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: {
        path: '$user',
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $project: {
        userId: 1,
        title: { $ifNull: ['$lastChat.prompt', ''] },
        username: '$user.name',
        roomId: 1,
        chatCount: 1,
        dateTime: { $ifNull: ['$lastChat.dateTime', null] },
      },
    },
    {
      $sort: {
        dateTime: -1,
      },
    },
    {
      $skip: skip,
    },
    {
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

export async function getChats(roomId: number, lastId?: number, all?: string): Promise<ChatInfo[]> {
  if (!lastId)
    lastId = new Date().getTime()
  let query = {}
  if (all === null || all === 'undefined' || all === undefined || all.trim().length === 0)
    query = { roomId, uuid: { $lt: lastId }, status: { $ne: Status.Deleted } }
  else
    query = { roomId, uuid: { $lt: lastId } }

  const limit = 20
  const cursor = chatCol.find(query).sort({ dateTime: -1 }).limit(limit)
  const chats = []
  for await (const doc of cursor)
    chats.push(doc)
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

// createUser、updateUserInfo中加入useAmount limit_switch
export async function createUser(email: string, password: string, roles?: UserRole[], status?: Status, remark?: string, useAmount?: number, limit_switch?: boolean): Promise<UserInfo> {
  email = email.toLowerCase()
  const userInfo = new UserInfo(email, password)
  const config = await getCacheConfig()

  if (roles && roles.includes(UserRole.Admin))
    userInfo.status = Status.Normal
  // Using `if (status !== null)` check because status.Normal value is 0, so `if (status)` would fail when status is Normal
  if (status !== null)
    userInfo.status = status

  userInfo.roles = roles
  userInfo.remark = remark

  // Initialize user configuration with default settings
  if (limit_switch != null)
    userInfo.limit_switch = limit_switch
  if (useAmount != null)
    userInfo.useAmount = useAmount
  else
    userInfo.useAmount = config?.siteConfig?.globalAmount ?? 10

  // Use the first item from the globally available chatModel configuration as the default model for new users
  userInfo.config = new UserConfig()
  userInfo.config.chatModel = config?.siteConfig?.chatModels.split(',')[0]
  userInfo.config.maxContextCount = 10

  await userCol.insertOne(userInfo)
  return userInfo
}

export async function updateUserInfo(userId: string, user: UserInfo) {
  await userCol.updateOne({ _id: new ObjectId(userId) }, { $set: { name: user.name, description: user.description, avatar: user.avatar, useAmount: user.useAmount } })
}

// 兑换后更新用户对话额度（兑换计算目前在前端完成，将总数报给后端）
export async function updateUserAmount(userId: string, amt: number) {
  return userCol.updateOne({ _id: new ObjectId(userId) }, { $set: { useAmount: amt } })
}

export async function updateUserChatModel(userId: string, chatModel: string) {
  await userCol.updateOne({ _id: new ObjectId(userId) }, { $set: { 'config.chatModel': chatModel } })
}

export async function updateUserMaxContextCount(userId: string, maxContextCount: number) {
  await userCol.updateOne({ _id: new ObjectId(userId) }, { $set: { 'config.maxContextCount': maxContextCount } })
}

export async function updateUserAdvancedConfig(userId: string, config: AdvancedConfig) {
  await userCol.updateOne({ _id: new ObjectId(userId) }, { $set: { advanced: config } })
}

export async function updateUser2FA(userId: string, secretKey: string) {
  await userCol.updateOne({ _id: new ObjectId(userId) }, { $set: { secretKey, updateTime: new Date().toLocaleString() } })
}

export async function disableUser2FA(userId: string) {
  await userCol.updateOne({ _id: new ObjectId(userId) }, { $set: { secretKey: null, updateTime: new Date().toLocaleString() } })
}

export async function updateUserPassword(userId: string, password: string) {
  await userCol.updateOne({ _id: new ObjectId(userId) }, { $set: { password, updateTime: new Date().toLocaleString() } })
}

export async function updateUserPasswordWithVerifyOld(userId: string, oldPassword: string, newPassword: string) {
  return userCol.updateOne({ _id: new ObjectId(userId), password: oldPassword }, { $set: { password: newPassword, updateTime: new Date().toLocaleString() } })
}

export async function getUser(email: string): Promise<UserInfo> {
  email = email.toLowerCase()
  const userInfo = await userCol.findOne({ email })
  await initUserInfo(userInfo)
  return userInfo
}

export async function getUsers(page: number, size: number, search?: string): Promise<{ users: UserInfo[], total: number }> {
  const query: Filter<UserInfo> = { status: { $ne: Status.Deleted } }
  if (search && search.trim()) {
    query.email = { $regex: search.trim(), $options: 'i' }
  }
  const cursor = userCol.find(query).sort({ createTime: -1 })
  const total = await userCol.countDocuments(query)
  const skip = (page - 1) * size
  const limit = size
  const pagedCursor = cursor.skip(skip).limit(limit)
  const users: UserInfo[] = []
  for await (const doc of pagedCursor)
    users.push(doc)
  users.forEach((user) => {
    initUserInfo(user)
  })
  return { users, total }
}

export async function getUserById(userId: string): Promise<UserInfo> {
  const userInfo = await userCol.findOne({ _id: new ObjectId(userId) })
  await initUserInfo(userInfo)
  return userInfo
}

async function initUserInfo(userInfo: WithId<UserInfo>) {
  if (userInfo == null)
    return
  if (userInfo.config == null)
    userInfo.config = new UserConfig()
  if (userInfo.config.chatModel == null)
    userInfo.config.chatModel = ''
  if (userInfo.roles == null || userInfo.roles.length <= 0) {
    userInfo.roles = []
    if (process.env.ROOT_USER === userInfo.email.toLowerCase())
      userInfo.roles.push(UserRole.Admin)
    userInfo.roles.push(UserRole.User)
  }
  if (!userInfo.advanced)
    userInfo.advanced = (await getCacheConfig()).advancedConfig
}

export async function verifyUser(email: string, status: Status) {
  email = email.toLowerCase()
  await userCol.updateOne({ email }, { $set: { status, verifyTime: new Date().toLocaleString() } })
}

export async function updateUserStatus(userId: string, status: Status) {
  await userCol.updateOne({ _id: new ObjectId(userId) }, { $set: { status, verifyTime: new Date().toLocaleString() } })
}

// 增加了useAmount信息 and limit_switch
export async function updateUser(userId: string, roles: UserRole[], password: string, remark?: string, useAmount?: number, limit_switch?: boolean) {
  const user = await getUserById(userId)
  const query = { _id: new ObjectId(userId) }
  if (user.password !== password && user.password) {
    const newPassword = md5(password)
    await userCol.updateOne(query, { $set: { roles, verifyTime: new Date().toLocaleString(), password: newPassword, remark, useAmount, limit_switch } })
  }
  else {
    await userCol.updateOne(query, { $set: { roles, verifyTime: new Date().toLocaleString(), remark, useAmount, limit_switch } })
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

    const dateData = aggStatics.find(x => x._id === date) || { _id: date, promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    result.promptTokens += dateData.promptTokens
    result.completionTokens += dateData.completionTokens
    result.totalTokens += dateData.totalTokens
    result.chartData.push(dateData)
  }

  return result
}

export async function getKeys(): Promise<{ keys: KeyConfig[], total: number }> {
  const query = { status: { $ne: Status.Disabled } }
  const cursor = keyCol.find(query)
  const total = await keyCol.countDocuments(query)
  const keys = []
  for await (const doc of cursor)
    keys.push(doc)
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
  await keyCol.updateOne({ _id: new ObjectId(id) }, { $set: { status } })
}

export async function getBuiltInPromptList(): Promise<{ data: BuiltInPrompt[], total: number }> {
  const total = await builtInPromptCol.countDocuments()
  const cursor = builtInPromptCol.find().sort({ _id: -1 })
  const data = await cursor.toArray()
  return { data, total }
}

export async function upsertUserPrompt(userPrompt: UserPrompt): Promise<UserPrompt> {
  if (userPrompt._id === undefined) {
    const doc = await userPromptCol.insertOne(userPrompt)
    userPrompt._id = doc.insertedId
  }
  else {
    await userPromptCol.replaceOne({ _id: userPrompt._id }, userPrompt, { upsert: true })
  }
  return userPrompt
}
export async function getUserPromptList(userId: string): Promise<{ data: UserPrompt[], total: number }> {
  const query = { userId }
  const total = await userPromptCol.countDocuments(query)
  const cursor = userPromptCol.find(query).sort({ _id: -1 })
  const data = await cursor.toArray()
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
