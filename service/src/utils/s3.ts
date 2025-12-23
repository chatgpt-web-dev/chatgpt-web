import type { SiteConfig } from '../storage/model'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getCacheConfig } from '../storage/config'

let s3Client: S3Client | null = null
let configHash: string | null = null

/**
 * 生成配置哈希用于比较
 */
function getConfigHash(config: SiteConfig): string {
  return `${config.s3Enabled}-${config.s3AccessKeyId}-${config.s3Region}-${config.s3Bucket}-${config.s3Endpoint}-${config.s3CustomDomain}`
}

/**
 * 初始化S3客户端
 */
function initS3Client(config: SiteConfig): S3Client | null {
  if (!config.s3Enabled || !config.s3AccessKeyId || !config.s3SecretAccessKey || !config.s3Bucket) {
    return null
  }

  const clientConfig: any = {
    credentials: {
      accessKeyId: config.s3AccessKeyId,
      secretAccessKey: config.s3SecretAccessKey,
    },
    region: config.s3Region || 'us-east-1',
  }

  // 如果配置了自定义端点（如MinIO），使用自定义端点
  if (config.s3Endpoint) {
    clientConfig.endpoint = config.s3Endpoint
    clientConfig.forcePathStyle = true // MinIO需要这个选项
  }

  return new S3Client(clientConfig)
}

/**
 * 获取S3客户端实例
 */
export async function getS3Client(): Promise<S3Client | null> {
  const config = await getCacheConfig()
  const siteConfig = config.siteConfig

  if (!siteConfig) {
    return null
  }

  // 检查配置是否有效
  if (!siteConfig.s3Enabled || !siteConfig.s3AccessKeyId || !siteConfig.s3SecretAccessKey || !siteConfig.s3Bucket) {
    s3Client = null
    configHash = null
    return null
  }

  // 生成新的配置哈希
  const newConfigHash = getConfigHash(siteConfig)

  // 如果配置没有变化，返回缓存的客户端
  if (s3Client && configHash === newConfigHash) {
    return s3Client
  }

  // 初始化新的客户端
  s3Client = initS3Client(siteConfig)
  configHash = newConfigHash
  return s3Client
}

/**
 * 上传文件到S3
 * @param fileBuffer 文件缓冲区
 * @param fileName 文件名
 * @param contentType MIME类型
 * @returns 文件的S3 key或null（如果上传失败）
 */
export async function uploadToS3(fileBuffer: Buffer, fileName: string, contentType: string): Promise<string | null> {
  try {
    const client = await getS3Client()
    if (!client) {
      return null
    }

    const config = await getCacheConfig()
    const siteConfig = config.siteConfig
    if (!siteConfig || !siteConfig.s3Bucket) {
      return null
    }

    // 构建文件路径
    const pathPrefix = siteConfig.s3PathPrefix || 'uploads/'
    const key = `${pathPrefix}${fileName}`

    // 上传文件
    const command = new PutObjectCommand({
      Bucket: siteConfig.s3Bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    })

    await client.send(command)

    return key
  }
  catch (error) {
    globalThis.console.error('Error uploading to S3:', error)
    return null
  }
}

/**
 * 获取S3文件的访问URL
 * @param key S3文件key
 * @param expiresIn URL过期时间（秒），默认1小时（仅在使用预签名URL时有效）
 * @returns 文件的访问URL或null
 */
export async function getS3FileUrl(key: string, expiresIn: number = 3600): Promise<string | null> {
  try {
    const config = await getCacheConfig()
    const siteConfig = config.siteConfig
    if (!siteConfig || !siteConfig.s3Bucket) {
      return null
    }

    // 如果配置了自定义域名，直接使用自定义域名构建URL
    if (siteConfig.s3CustomDomain) {
      try {
        const customDomain = siteConfig.s3CustomDomain.trim()
        // 确保自定义域名以 / 结尾（如果key不以/开头）
        const origin = new URL(customDomain).origin
        return `${origin}/${key}`
      }
      catch (error) {
        globalThis.console.error('Invalid custom domain format:', error)
        // 如果自定义域名格式错误，回退到预签名URL
      }
    }

    // 如果没有配置自定义域名，使用预签名URL
    const client = await getS3Client()
    if (!client) {
      return null
    }

    const command = new GetObjectCommand({
      Bucket: siteConfig.s3Bucket,
      Key: key,
    })

    const url = await getSignedUrl(client, command, { expiresIn })
    return url
  }
  catch (error) {
    globalThis.console.error('Error getting S3 file URL:', error)
    return null
  }
}

/**
 * 检查是否启用了S3存储
 */
export async function isS3Enabled(): Promise<boolean> {
  const config = await getCacheConfig()
  return config.siteConfig?.s3Enabled === true
}
