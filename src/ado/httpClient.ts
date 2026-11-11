import { getPatSessionSignal } from '../adoAuth'

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
  host?: 'dev.azure.com' | 'vssps.dev.azure.com' | 'vsrm.dev.azure.com' | 'vstmr.dev.azure.com'
}

export interface AdoRequestClient {
  request<T>(options: AdoRequestOptions): Promise<T>
  requestPage<T>(options: AdoRequestOptions): Promise<{ data: T; continuationToken: string | null }>
}

export const ADO_AUTH_ERROR_MESSAGE =
  'Azure DevOps rejected the personal access token. It is likely expired, revoked, or missing the required scopes. Open Settings to enter a new PAT.'

export class AdoAuthError extends Error {
  readonly status?: number
  readonly host?: AdoRequestOptions['host']

  constructor(status?: number, host?: AdoRequestOptions['host']) {
    super(ADO_AUTH_ERROR_MESSAGE)
    this.name = 'AdoAuthError'
    this.status = status
    this.host = host
  }
}

export class AdoHttpClient implements AdoRequestClient {
  private readonly pat: string
  private readonly defaultApiVersion: string
  private readonly patSessionSignal = getPatSessionSignal()

  constructor(pat: string, defaultApiVersion = '7.1') {
    this.pat = pat
    this.defaultApiVersion = defaultApiVersion
  }

  async request<T>(options: AdoRequestOptions): Promise<T> {
    return (await this.requestPage<T>(options)).data
  }

  async requestPage<T>(options: AdoRequestOptions): Promise<{ data: T; continuationToken: string | null }> {
    const signal = this.createSignal(options.signal)
    const { url, host } = this.buildUrl(options)

    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: this.authorization(),
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal,
    })

    signal.throwIfAborted()
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

    if (response.status === 401 || response.status === 403 || response.status === 203) {
      throw new AdoAuthError(response.status, host)
    }

    if (!response.ok) {
      throw new Error(`Azure DevOps query failed (HTTP ${response.status}). Try refreshing.`)
    }

    // ADO answers unauthenticated requests with a sign-in page instead of an API error.
    if (!contentType.includes('application/json')) {
      throw new AdoAuthError()
    }

    const data = (await response.json()) as T
    signal.throwIfAborted()

    return {
      data,
      continuationToken: response.headers.get('x-ms-continuationtoken'),
    }
  }

  /**
   * Downloads a file, such as a screenshot pasted into a work item, for the page to show from memory. The path is always
   * under the organization on `dev.azure.com`, so the token never goes anywhere else.
   */
  async requestBlob(options: Omit<AdoRequestOptions, 'method' | 'body'> & { maxBytes: number }): Promise<Blob> {
    const signal = this.createSignal(options.signal)
    const { url, host } = this.buildUrl(options)
    const response = await fetch(url, { method: 'GET', headers: { Authorization: this.authorization(), Accept: '*/*' }, signal })

    signal.throwIfAborted()
    if (response.status === 401 || response.status === 403 || response.status === 203) {
      throw new AdoAuthError(response.status, host)
    }
    if (!response.ok) {
      throw new Error(`Azure DevOps attachment request failed (HTTP ${response.status}).`)
    }
    if ((response.headers.get('content-type') ?? '').toLowerCase().includes('text/html')) {
      throw new AdoAuthError()
    }
    if (Number(response.headers.get('content-length')) > options.maxBytes) {
      void response.body?.cancel().catch(() => undefined)
      throw new Error('The attachment is too large to show here.')
    }

    const blob = await response.blob()
    signal.throwIfAborted()
    if (blob.size > options.maxBytes) throw new Error('The attachment is too large to show here.')
    return blob
  }

  private createSignal(signal: AbortSignal | undefined): AbortSignal {
    const combined = signal ? AbortSignal.any([this.patSessionSignal, signal]) : this.patSessionSignal
    combined.throwIfAborted()
    return combined
  }

  private authorization(): string {
    return `Basic ${btoa(`:${this.pat}`)}`
  }

  private buildUrl(options: Pick<AdoRequestOptions, 'host' | 'orgName' | 'path' | 'params'>): { url: URL; host: NonNullable<AdoRequestOptions['host']> } {
    const host = options.host ?? 'dev.azure.com'
    const url = new URL(`https://${host}/${encodeURIComponent(options.orgName)}${options.path}`)
    const params = options.params ?? {}

    if (!params['api-version']) {
      params['api-version'] = this.defaultApiVersion
    }

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value))
      }
    }
    return { url, host }
  }
}
