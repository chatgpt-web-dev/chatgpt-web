import type { ObjectId } from 'mongodb'
import type { TextAuditServiceOptions, TextAuditServiceProvider } from 'src/utils/textAudit'

export enum Status {
  Normal = 0,
  Deleted = 1,
  InversionDeleted = 2,
  ResponseDeleted = 3,
  PreVerify = 4,
  AdminVerify = 5,
  Disabled = 6,
}

export enum UserRole {
  Admin = 0,
  User = 1,
  Guest = 2,
  Support = 3,
  Viewer = 4,
  Contributor = 5,
  Developer = 6,
  Tester = 7,
  Partner = 8,
}
// 新增一个兑换码的类
export class GiftCard {
  _id: ObjectId
  cardno: string
  amount: number
  redeemed: number // boolean
  redeemed_by: string
  redeemed_date: string
  constructor(amount: number, redeemed: number) {
    this.amount = amount
    this.redeemed = redeemed
  }
}

export class UserInfo {
  _id: ObjectId
  name: string
  email: string
  password: string
  status: Status
  createTime: string
  verifyTime?: string
  avatar?: string
  description?: string
  updateTime?: string
  config?: UserConfig
  roles?: UserRole[]
  remark?: string
  secretKey?: string // 2fa
  advanced?: AdvancedConfig
  useAmount?: number // chat usage amount
  limit_switch?: boolean // chat amount limit switch
  constructor(email: string, password: string) {
    this.name = email
    this.email = email
    this.password = password
    this.status = Status.PreVerify
    this.createTime = new Date().toLocaleString()
    this.verifyTime = null
    this.updateTime = new Date().toLocaleString()
    this.roles = [UserRole.User]
    this.remark = null
    this.useAmount = null
    this.limit_switch = true
  }
}

export class UserConfig {
  chatModel: string
}

export class ChatRoom {
  _id: ObjectId
  roomId: number
  userId: string
  title: string
  prompt: string
  usingContext: boolean
  status: Status = Status.Normal
  // only access token used
  accountId?: string
  chatModel: string
  constructor(userId: string, title: string, roomId: number, chatModel: string) {
    this.userId = userId
    this.title = title
    this.prompt = undefined
    this.roomId = roomId
    this.usingContext = true
    this.accountId = null
    this.chatModel = chatModel
  }
}

export class ChatOptions {
  parentMessageId?: string
  messageId?: string
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  estimated?: boolean
  constructor(parentMessageId?: string, messageId?: string) {
    this.parentMessageId = parentMessageId
    this.messageId = messageId
  }
}

export class previousResponse {
  response: string
  options: ChatOptions
}

export class ChatInfo {
  _id: ObjectId
  roomId: number
  model: string
  uuid: number
  dateTime: number
  prompt: string
  images?: string[]
  response?: string
  status: Status = Status.Normal
  options: ChatOptions
  previousResponse?: previousResponse[]
  constructor(roomId: number, uuid: number, prompt: string, images: string[], model: string, options: ChatOptions) {
    this.roomId = roomId
    this.model = model
    this.uuid = uuid
    this.prompt = prompt
    this.images = images
    this.options = options
    this.dateTime = new Date().getTime()
  }
}

export class UsageResponse {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  estimated: boolean
}

export class ChatUsage {
  _id: ObjectId
  userId: ObjectId
  roomId: number
  chatId: ObjectId
  messageId: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimated: boolean
  dateTime: number
  constructor(userId: ObjectId, roomId: number, chatId: ObjectId, messageId: string, model: string, usage?: UsageResponse) {
    this.userId = userId
    this.roomId = roomId
    this.chatId = chatId
    this.messageId = messageId
    this.model = model
    if (usage) {
      this.promptTokens = usage.prompt_tokens
      this.completionTokens = usage.completion_tokens
      this.totalTokens = usage.total_tokens
      this.estimated = usage.estimated
    }
    this.dateTime = new Date().getTime()
  }
}

export class Config {
  constructor(
    public _id: ObjectId,
    public timeoutMs: number,
    public apiKey?: string,
    public apiDisableDebug?: boolean,
    public accessToken?: string,
    public apiBaseUrl?: string,
    public apiModel?: APIMODEL,
    public reverseProxy?: string,
    public socksProxy?: string,
    public socksAuth?: string,
    public httpsProxy?: string,
    public siteConfig?: SiteConfig,
    public mailConfig?: MailConfig,
    public auditConfig?: AuditConfig,
    public advancedConfig?: AdvancedConfig,
    public announceConfig?: AnnounceConfig,
  ) { }
}

export class SiteConfig {
  constructor(
    public siteTitle?: string,
    public loginEnabled?: boolean,
    public authProxyEnabled?: boolean,
    public loginSalt?: string,
    public registerEnabled?: boolean,
    public registerReview?: boolean,
    public registerMails?: string,
    public siteDomain?: string,
    public chatModels?: string,
    public globalAmount?: number,
    public usageCountLimit?: boolean,
    public showWatermark?: boolean,
  ) { }
}

export class AnnounceConfig {
  constructor(
    public enabled: boolean,
    public announceWords: string,
  ) { }
}

export class MailConfig {
  constructor(
    public smtpHost: string,
    public smtpPort: number,
    public smtpTsl: boolean,
    public smtpUserName: string,
    public smtpPassword: string,
    public smtpFrom?: string,
  ) { }
}

export class AuditConfig {
  constructor(
    public enabled: boolean,
    public provider: TextAuditServiceProvider,
    public options: TextAuditServiceOptions,
    public textType: TextAudioType,
    public customizeEnabled: boolean,
    public sensitiveWords: string,
  ) { }
}

export class AdvancedConfig {
  constructor(
    public systemMessage: string,
    public temperature: number,
    public top_p: number,
    public maxContextCount: number,
  ) { }
}

export enum TextAudioType {
  None = 0,
  Request = 1 << 0, // 二进制 01
  Response = 1 << 1, // 二进制 10
  All = Request | Response, // 二进制 11
}

export class KeyConfig {
  _id: ObjectId
  key: string
  keyModel: APIMODEL
  chatModels: string[]
  userRoles: UserRole[]
  status: Status
  remark: string
  baseUrl?: string
  constructor(key: string, keyModel: APIMODEL, chatModels: string[], userRoles: UserRole[], remark: string) {
    this.key = key
    this.keyModel = keyModel
    this.chatModels = chatModels
    this.userRoles = userRoles
    this.status = Status.Normal
    this.remark = remark
  }
}

export class UserPrompt {
  _id: ObjectId
  userId: string
  title: string
  value: string
  constructor(userId: string, title: string, value: string) {
    this.userId = userId
    this.title = title
    this.value = value
  }
}

export type APIMODEL = 'ChatGPTAPI'
