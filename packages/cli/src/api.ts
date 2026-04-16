import type { Config } from './config.js'

export class GfApi {
  constructor(private host: string, private apiKey?: string) {}

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.host}/api/v1${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Origin': this.host
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      })

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        try {
          const errorData = await response.json() as any
          if (errorData && typeof errorData.message === 'string') {
            errorMessage = errorData.message
          }
        } catch {
          // Ignore JSON parsing errors
        }
        throw new Error(errorMessage)
      }

      return await response.json() as T
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error(String(error))
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body)
  }
}

export function createApi(config: Config): GfApi {
  return new GfApi(config.host, config.apiKey)
}