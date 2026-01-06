export class ConfigState {
  timeoutMs?: number
  apiKey?: string
  apiBaseUrl?: string
  reverseProxy?: string
  socksProxy?: string
  socksAuth?: string
  httpsProxy?: string
  balance?: number
  siteConfig?: SiteConfig
  mailConfig?: MailConfig
  auditConfig?: AuditConfig
  searchConfig?: SearchConfig
  announceConfig?: AnnounceConfig
  toolsEnabled?: boolean
}

export class UserConfig {
  chatModel?: string
  maxContextCount?: number
}

// https://platform.openai.com/docs/models/overview
export class SiteConfig {
  siteTitle?: string
  loginEnabled?: boolean
  loginSalt?: string
  registerEnabled?: boolean
  registerReview?: boolean
  registerMails?: string
  siteDomain?: string
  chatModels?: string
  globalAmount?: number
  usageCountLimit?: boolean
  showWatermark?: boolean
  s3Enabled?: boolean
  s3AccessKeyId?: string
  s3SecretAccessKey?: string
  s3Region?: string
  s3Bucket?: string
  s3Endpoint?: string
  s3PathPrefix?: string
  s3CustomDomain?: string
  externalChatSites?: Array<{ name: string, url: string }>
}

export class MailConfig {
  smtpHost?: string
  smtpPort?: number
  smtpTsl?: boolean
  smtpUserName?: string
  smtpPassword?: string
  smtpFrom?: string
}
export type TextAuditServiceProvider = 'baidu' //  | 'ali'

export interface TextAuditServiceOptions {
  apiKey: string
  apiSecret: string
  label?: string
}
export enum TextAudioType {
  None = 0,
  Request = 1, // 二进制 01
  Response = 2, // 二进制 10
  All = 3, // 二进制 11
}

export class AuditConfig {
  enabled?: boolean
  provider?: TextAuditServiceProvider
  options?: TextAuditServiceOptions
  textType?: TextAudioType
  customizeEnabled?: boolean
  sensitiveWords?: string
}

export class AnnounceConfig {
  enabled?: boolean
  announceWords?: string
}

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

export class KeyConfig {
  _id?: string
  key: string
  keyModel: APIMODEL
  chatModel: string
  modelAlias?: string
  userRoles: UserRole[]
  status: Status
  remark: string
  baseUrl?: string
  toolsEnabled?: boolean
  imageUploadEnabled?: boolean
  inputFidelity?: 'low' | 'medium' | 'high'
  quality?: 'low' | 'medium' | 'high'
  imageModel?: 'gpt-image-1' | 'gpt-image-1.5'
  constructor(key: string, keyModel: APIMODEL, chatModel: string, userRoles: UserRole[], remark: string) {
    this.key = key
    this.keyModel = keyModel
    this.chatModel = chatModel
    this.userRoles = userRoles
    this.status = Status.Normal
    this.remark = remark
  }
}

export class UserPrompt {
  _id?: string
  title: string
  value: string
  type?: 'built-in' | 'user-defined'
  constructor(title: string, value: string) {
    this.title = title
    this.value = value
  }
}

export type APIMODEL = 'ChatGPTAPI' | 'VLLM' | 'FastDeploy' | 'ResponsesAPI'

export const apiModelOptions = ['ChatGPTAPI', 'VLLM', 'FastDeploy', 'ResponsesAPI'].map((model: string) => {
  return {
    label: model,
    key: model,
    value: model,
  }
})

export const userRoleOptions = Object.values(UserRole).filter(d => Number.isNaN(Number(d))).map((role) => {
  return {
    label: role as string,
    key: role as string,
    value: UserRole[role as keyof typeof UserRole],
  }
})

export class UserInfo {
  _id?: string
  email?: string
  password?: string
  roles: UserRole[]
  remark?: string
  useAmount?: number
  // Add usage info and its switch for the refactor.
  limit_switch?: boolean
  constructor(roles: UserRole[]) {
    this.roles = roles
  }
}

export class UserPassword {
  oldPassword?: string
  newPassword?: string
  confirmPassword?: string
}

export class TwoFAConfig {
  enaled: boolean
  userName: string
  secretKey: string
  otpauthUrl: string
  testCode: string
  constructor() {
    this.enaled = false
    this.userName = ''
    this.secretKey = ''
    this.otpauthUrl = ''
    this.testCode = ''
  }
}

export interface GiftCard {
  cardno: string
  amount: number
  redeemed: number
}

export type SearchServiceProvider = 'tavily' | ''

export interface SearchServiceOptions {
  apiKey: string
  maxResults?: number
  includeRawContent?: boolean
}

export class SearchConfig {
  enabled: boolean
  provider: SearchServiceProvider
  options: SearchServiceOptions
  systemMessageWithSearchResult: string
  systemMessageGetSearchQuery: string
  constructor(enabled: boolean, provider: SearchServiceProvider, options: SearchServiceOptions, systemMessageWithSearchResult: string, systemMessageGetSearchQuery: string) {
    this.enabled = enabled
    this.provider = provider
    this.options = options
    this.systemMessageWithSearchResult = systemMessageWithSearchResult
    this.systemMessageGetSearchQuery = systemMessageGetSearchQuery
    if (!this.options.maxResults) {
      this.options.maxResults = 10
    }
  }
}
