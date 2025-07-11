import { useAuthStore } from '@/store'

export interface FetchRequestConfig {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: any
  signal?: AbortSignal
}

export interface FetchResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers: Headers
}

export interface SSEStreamOptions {
  onChunk?: (chunk: string) => void
  onError?: (error: Error) => void
  onComplete?: () => void
}

class FetchService {
  private baseURL: string
  private defaultHeaders: Record<string, string>

  constructor() {
    this.baseURL = import.meta.env.VITE_GLOB_API_URL || ''
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    }
  }

  // Request interceptor - automatically add authentication headers and other configurations
  private requestInterceptor(config: FetchRequestConfig): FetchRequestConfig {
    const token = useAuthStore().token
    const headers = { ...this.defaultHeaders, ...config.headers }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    return {
      ...config,
      headers,
    }
  }

  // Response interceptor - handle error status
  private async responseInterceptor(response: Response): Promise<Response> {
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    return response
  }

  // POST request
  async post<T = any>(config: FetchRequestConfig): Promise<FetchResponse<T>> {
    const processedConfig = this.requestInterceptor(config)
    const url = `${this.baseURL}${processedConfig.url}`

    const response = await fetch(url, {
      method: 'POST',
      headers: processedConfig.headers,
      body: typeof processedConfig.body === 'object'
        ? JSON.stringify(processedConfig.body)
        : processedConfig.body,
      signal: processedConfig.signal,
    })

    const processedResponse = await this.responseInterceptor(response)
    const data = await processedResponse.json()

    return {
      data,
      status: processedResponse.status,
      statusText: processedResponse.statusText,
      headers: processedResponse.headers,
    }
  }

  // SSE streaming request
  async postStream(config: FetchRequestConfig, options: SSEStreamOptions): Promise<void> {
    const processedConfig = this.requestInterceptor(config)
    const url = `${this.baseURL}${processedConfig.url}`

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: processedConfig.headers,
        body: typeof processedConfig.body === 'object'
          ? JSON.stringify(processedConfig.body)
          : processedConfig.body,
        signal: processedConfig.signal,
      })

      await this.responseInterceptor(response)

      if (!response.body) {
        throw new Error('ReadableStream not supported')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            options.onComplete?.()
            break
          }

          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true })

          // Process complete lines
          const lines = buffer.split('\n')
          // Keep the last potentially incomplete line
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim()) {
              options.onChunk?.(line)
            }
          }
        }
      }
      catch (error) {
        options.onError?.(error as Error)
        throw error
      }
    }
    catch (error) {
      options.onError?.(error as Error)
      throw error
    }
  }
}

// Create singleton instance
const fetchService = new FetchService()

export default fetchService
