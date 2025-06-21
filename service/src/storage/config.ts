import type { TextAuditServiceProvider } from 'src/utils/textAudit'
import * as process from 'node:process'
import * as dotenv from 'dotenv'
import { ObjectId } from 'mongodb'
import { isNotEmptyString, isTextAuditServiceProvider } from '../utils/is'
import { AdvancedConfig, AnnounceConfig, AuditConfig, Config, KeyConfig, MailConfig, SearchConfig, SiteConfig, TextAudioType, UserRole } from './model'
import { getConfig, getKeys, upsertKey } from './mongo'

dotenv.config()

let cachedConfig: Config | undefined
let cacheExpiration = 0

export async function getCacheConfig(): Promise<Config> {
  const now = Date.now()
  if (cachedConfig && cacheExpiration > now)
    return Promise.resolve(cachedConfig)

  const loadedConfig = await getOriginConfig()

  cachedConfig = loadedConfig
  cacheExpiration = now + 10 * 60 * 1000

  return Promise.resolve(cachedConfig)
}

export async function getOriginConfig() {
  let config = await getConfig()
  if (config == null) {
    config = new Config(new ObjectId(), !Number.isNaN(+process.env.TIMEOUT_MS) ? +process.env.TIMEOUT_MS : 600 * 1000, process.env.OPENAI_API_KEY, process.env.OPENAI_API_DISABLE_DEBUG === 'true', process.env.OPENAI_ACCESS_TOKEN, process.env.OPENAI_API_BASE_URL, process.env.API_REVERSE_PROXY, (process.env.SOCKS_PROXY_HOST && process.env.SOCKS_PROXY_PORT)
      ? (`${process.env.SOCKS_PROXY_HOST}:${process.env.SOCKS_PROXY_PORT}`)
      : '', (process.env.SOCKS_PROXY_USERNAME && process.env.SOCKS_PROXY_PASSWORD)
      ? (`${process.env.SOCKS_PROXY_USERNAME}:${process.env.SOCKS_PROXY_PASSWORD}`)
      : '', process.env.HTTPS_PROXY, new SiteConfig(
      process.env.SITE_TITLE || 'ChatGPT Web',
      isNotEmptyString(process.env.AUTH_SECRET_KEY),
      process.env.AUTH_PROXY_ENABLED === 'true',
      process.env.AUTH_SECRET_KEY,
      process.env.REGISTER_ENABLED === 'true',
      process.env.REGISTER_REVIEW === 'true',
      process.env.REGISTER_MAILS,
      process.env.SITE_DOMAIN,
    ), new MailConfig(process.env.SMTP_HOST, !Number.isNaN(+process.env.SMTP_PORT) ? +process.env.SMTP_PORT : 465, process.env.SMTP_TSL === 'true', process.env.SMTP_USERNAME, process.env.SMTP_PASSWORD, process.env.SMTP_FROM || process.env.SMTP_USERNAME))
  }
  else {
    if (config.siteConfig.loginEnabled === undefined)
      config.siteConfig.loginEnabled = isNotEmptyString(process.env.AUTH_SECRET_KEY)
    if (config.siteConfig.authProxyEnabled === undefined)
      config.siteConfig.authProxyEnabled = process.env.AUTH_PROXY_ENABLED === 'true'
    if (config.siteConfig.loginSalt === undefined)
      config.siteConfig.loginSalt = process.env.AUTH_SECRET_KEY
    if (config.apiDisableDebug === undefined)
      config.apiDisableDebug = process.env.OPENAI_API_DISABLE_DEBUG === 'true'
    if (config.socksAuth === undefined) {
      config.socksAuth = (process.env.SOCKS_PROXY_USERNAME && process.env.SOCKS_PROXY_PASSWORD)
        ? (`${process.env.SOCKS_PROXY_USERNAME}:${process.env.SOCKS_PROXY_PASSWORD}`)
        : ''
    }
    if (config.siteConfig.registerReview === undefined)
      config.siteConfig.registerReview = process.env.REGISTER_REVIEW === 'true'
  }

  if (config.auditConfig === undefined) {
    config.auditConfig = new AuditConfig(
      process.env.AUDIT_ENABLED === 'true',
      isTextAuditServiceProvider(process.env.AUDIT_PROVIDER)
        ? process.env.AUDIT_PROVIDER as TextAuditServiceProvider
        : 'baidu',
      {
        apiKey: process.env.AUDIT_API_KEY,
        apiSecret: process.env.AUDIT_API_SECRET,
        label: process.env.AUDIT_TEXT_LABEL,
      },
      getTextAuditServiceOptionFromString(process.env.AUDIT_TEXT_TYPE),
      false,
      '',
    )
  }

  if (!config.advancedConfig) {
    config.advancedConfig = new AdvancedConfig(
      'You are a large language model. Follow the user\'s instructions carefully. Respond using markdown (latex start with $).',
      0.8,
      1,
    )
  }

  if (!config.announceConfig) {
    config.announceConfig = new AnnounceConfig(
      false,
      '',
    )
  }

  if (!config.searchConfig) {
    config.searchConfig = new SearchConfig()
    config.searchConfig.enabled = false
    config.searchConfig.options = { apiKey: '', maxResults: 10 }
  }

  if (!isNotEmptyString(config.siteConfig.chatModels))
    config.siteConfig.chatModels = 'gpt-4.1,gpt-4.1-mini,gpt-4.1-nano'
  return config
}

function getTextAuditServiceOptionFromString(value: string): TextAudioType {
  if (value === undefined)
    return TextAudioType.None

  switch (value.toLowerCase()) {
    case 'request':
      return TextAudioType.Request
    case 'response':
      return TextAudioType.Response
    case 'all':
      return TextAudioType.All
    default:
      return TextAudioType.None
  }
}

export function clearConfigCache() {
  cacheExpiration = 0
  cachedConfig = null
}

let apiKeysCachedConfig: KeyConfig[] | undefined
let apiKeysCacheExpiration = 0

export async function getCacheApiKeys(): Promise<KeyConfig[]> {
  const now = Date.now()
  if (apiKeysCachedConfig && apiKeysCacheExpiration > now)
    return Promise.resolve(apiKeysCachedConfig)

  const loadedConfig = (await getApiKeys()).keys

  apiKeysCachedConfig = loadedConfig
  apiKeysCacheExpiration = now + 10 * 60 * 1000

  return Promise.resolve(apiKeysCachedConfig)
}

export function clearApiKeyCache() {
  apiKeysCacheExpiration = 0
  getCacheApiKeys()
}

export async function getApiKeys() {
  const result = await getKeys()
  const config = await getCacheConfig()
  if (result.keys.length <= 0) {
    result.keys.push(await upsertKey(new KeyConfig(config.apiKey, 'ChatGPTAPI', [], [], '')))
    result.total++
  }
  result.keys.forEach((key) => {
    if (key.userRoles == null || key.userRoles.length <= 0) {
      key.userRoles.push(UserRole.Admin)
      key.userRoles.push(UserRole.User)
      key.userRoles.push(UserRole.Guest)
    }
    if (key.chatModels == null || key.chatModels.length <= 0) {
      config.siteConfig.chatModels.split(',').forEach((chatModel) => {
        key.chatModels.push(chatModel)
      })
    }
  })
  return result
}

export const authProxyHeaderName = process.env.AUTH_PROXY_HEADER_NAME ?? 'X-Email'
