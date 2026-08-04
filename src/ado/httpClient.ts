export type QueryValue = string | number | boolean | undefined

export type QueryParams = Record<string, QueryValue>

export type QueryMethod = 'GET' | 'POST'

export type AdoRequestOptions = {
  method?: QueryMethod
  orgName: string
  path: string
  params?: QueryParams
  body?: unknown
  signal?: AbortSignal
}

export interface AdoRequestClient {
  request<T>(options: AdoRequestOptions): Promise<T>
}

export class AdoHttpClient implements AdoRequestClient {
  private readonly pat: string
  private readonly defaultApiVersion: string

  constructor(pat: string, defaultApiVersion = '7.1') {
    this.pat = pat
    this.defaultApiVersion = defaultApiVersion
  }

  async request<T>(options: AdoRequestOptions): Promise<T> {
    const url = new URL(`https://dev.azure.com/${encodeURIComponent(options.orgName)}${options.path}`)
    const params = options.params ?? {}

    if (!params['api-version']) {
      params['api-version'] = this.defaultApiVersion
    }

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }

    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Basic ${btoa(`:${this.pat}`)}`,
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `Azure DevOps query failed (${response.status} ${response.statusText}): ${errorBody || 'no error details returned'}`,
      )
    }

    return (await response.json()) as T
  }
}
