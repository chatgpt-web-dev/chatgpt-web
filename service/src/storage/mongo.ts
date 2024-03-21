import type { WithId } from 'mongodb'
import { MongoClient, ObjectId } from 'mongodb'
import * as dotenv from 'dotenv'
import dayjs from 'dayjs'
import { md5 } from '../utils/security'
import type { AdvancedConfig, ChatOptions, Config, GiftCard, KeyConfig, UsageResponse } from './model'
import { ChatInfo, ChatRoom, ChatUsage, Status, UserConfig, UserInfo, UserRole } from './model'
import { getCacheConfig } from './config'

dotenv.config()

const url = process.env.MONGODB_URL

let client: MongoClient
let dbName: string
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
  return await redeemCol.updateOne({ cardno: redeemCardNo.trim() }
    , { $set: { redeemed: 1, redeemed_date: new Date().toLocaleString(), redeemed_by: userId } })
}
// 使用对话后更新用户额度
export async function updateAmountMinusOne(userId: string) {
  const result = await userCol.updateOne({ _id: new ObjectId(userId) }
    , { $inc: { useAmount: -1 } })
  return result.modifiedCount > 0
}

export async function insertChat(uuid: number, text: string, images: string[], roomId: number, options?: ChatOptions) {
  const chatInfo = new ChatInfo(roomId, uuid, text, images, options)
  await chatCol.insertOne(chatInfo)
  return chatInfo
}

export async function getChat(roomId: number, uuid: number) {
  return await chatCol.findOne({ roomId, uuid })
}

export async function getChatByMessageId(messageId: string) {
  return await chatCol.findOne({ 'options.messageId': messageId })
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
    // @ts-expect-error https://jira.mongodb.org/browse/NODE-5214
    update.$set.previousResponse = previousResponse

  await chatCol.updateOne(query, update)
}

export async function insertChatUsage(userId: ObjectId,
  roomId: number,
  chatId: ObjectId,
  messageId: string,
  model: string,
  usage: UsageResponse) {
  const chatUsage = new ChatUsage(userId, roomId, chatId, messageId, model, usage)
  await usageCol.insertOne(chatUsage)
  return chatUsage
}

export async function createChatRoom(userId: string, title: string, roomId: number, chatModel: string) {
  const room = new ChatRoom(userId, title, roomId, chatModel)
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

export async function getChatRooms(userId: string) {
  const cursor = roomCol.find({ userId, status: { $ne: Status.Deleted } })
  const rooms = []
  for await (const doc of cursor)
    rooms.push(doc)
  return rooms
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

export async function getChats(roomId: number, lastId?: number): Promise<ChatInfo[]> {
  if (!lastId)
    lastId = new Date().getTime()
  const query = { roomId, uuid: { $lt: lastId }, status: { $ne: Status.Deleted } }
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
  if (status)
    userInfo.status = status

  userInfo.roles = roles
  userInfo.remark = remark
  if (limit_switch != null)
    userInfo.limit_switch = limit_switch
  if (useAmount != null)
    userInfo.useAmount = useAmount
  else
    userInfo.useAmount = config?.siteConfig?.globalAmount ?? 10
  await userCol.insertOne(userInfo)
  return userInfo
}

export async function updateUserInfo(userId: string, user: UserInfo) {
  await userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { name: user.name, description: user.description, avatar: user.avatar, useAmount: user.useAmount } })
}

// 兑换后更新用户对话额度（兑换计算目前在前端完成，将总数报给后端）
export async function updateUserAmount(userId: string, amt: number) {
  return userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { useAmount: amt } })
}

export async function updateUserChatModel(userId: string, chatModel: string) {
  await userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { 'config.chatModel': chatModel } })
}

export async function updateUserAdvancedConfig(userId: string, config: AdvancedConfig) {
  await userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { advanced: config } })
}

export async function updateUser2FA(userId: string, secretKey: string) {
  await userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { secretKey, updateTime: new Date().toLocaleString() } })
}

export async function disableUser2FA(userId: string) {
  await userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { secretKey: null, updateTime: new Date().toLocaleString() } })
}

export async function updateUserPassword(userId: string, password: string) {
  await userCol.updateOne({ _id: new ObjectId(userId) }
    , { $set: { password, updateTime: new Date().toLocaleString() } })
}

export async function updateUserPasswordWithVerifyOld(userId: string, oldPassword: string, newPassword: string) {
  return userCol.updateOne({ _id: new ObjectId(userId), password: oldPassword }
    , { $set: { password: newPassword, updateTime: new Date().toLocaleString() } })
}

export async function getUser(email: string): Promise<UserInfo> {
  email = email.toLowerCase()
  const userInfo = await userCol.findOne({ email })
  await initUserInfo(userInfo)
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
    userInfo.config.chatModel = 'gpt-3.5-turbo'
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
