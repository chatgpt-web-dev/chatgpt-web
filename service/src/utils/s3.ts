import type { Buffer } from 'node:buffer'
import type { SiteConfig } from '../storage/model'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getCacheConfig } from '../storage/config'

let s3Client: S3Client | null = null
let configHash: string | null = null

/**
 * Generate a config hash for comparison.
 */
function getConfigHash(config: SiteConfig): string {
  return `${config.s3Enabled}-${config.s3AccessKeyId}-${config.s3Region}-${config.s3Bucket}-${config.s3Endpoint}-${config.s3CustomDomain}`
}

/**
 * Initialize the S3 client.
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

  // If a custom endpoint is configured (e.g., MinIO), use it.
  if (config.s3Endpoint) {
    clientConfig.endpoint = config.s3Endpoint
    clientConfig.forcePathStyle = true // MinIO需要这个选项
  }

  return new S3Client(clientConfig)
}

/**
 * Get the S3 client instance.
 */
export async function getS3Client(): Promise<S3Client | null> {
  const config = await getCacheConfig()
  const siteConfig = config.siteConfig

  if (!siteConfig) {
    return null
  }

  // Validate the configuration.
  if (!siteConfig.s3Enabled || !siteConfig.s3AccessKeyId || !siteConfig.s3SecretAccessKey || !siteConfig.s3Bucket) {
    s3Client = null
    configHash = null
    return null
  }

  // Generate a new config hash.
  const newConfigHash = getConfigHash(siteConfig)

  // Return the cached client if config has not changed.
  if (s3Client && configHash === newConfigHash) {
    return s3Client
  }

  // Initialize a new client.
  s3Client = initS3Client(siteConfig)
  configHash = newConfigHash
  return s3Client
}

/**
 * Upload a file to S3.
 * @param fileBuffer File buffer
 * @param fileName File name
 * @param contentType MIME type
 * @returns S3 key or null when upload fails
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

    // Build the object key.
    const pathPrefix = siteConfig.s3PathPrefix || 'uploads/'
    const key = `${pathPrefix}${fileName}`

    // Upload the file.
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
 * Get the access URL for an S3 file.
 * @param key S3 object key
 * @param expiresIn URL expiration time (seconds), default 1 hour (pre-signed URL only)
 * @returns File URL or null
 */
export async function getS3FileUrl(key: string, expiresIn: number = 3600): Promise<string | null> {
  try {
    const config = await getCacheConfig()
    const siteConfig = config.siteConfig
    if (!siteConfig || !siteConfig.s3Bucket) {
      return null
    }

    // If a custom domain is configured, build the URL from it.
    if (siteConfig.s3CustomDomain) {
      try {
        const customDomain = siteConfig.s3CustomDomain.trim()
        // Ensure the custom domain ends with / (if key does not start with /).
        const origin = new URL(customDomain).origin
        return `${origin}/${key}`
      }
      catch (error) {
        globalThis.console.error('Invalid custom domain format:', error)
        // If custom domain is invalid, fall back to a pre-signed URL.
      }
    }

    // If no custom domain is configured, use a pre-signed URL.
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
 * Check whether S3 storage is enabled.
 */
export async function isS3Enabled(): Promise<boolean> {
  const config = await getCacheConfig()
  return config.siteConfig?.s3Enabled === true
}
