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
  host?: 'dev.azure.com' | 'vssps.dev.azure.com'
}

export interface AdoRequestClient {
  request<T>(options: AdoRequestOptions): Promise<T>
}

export const ADO_AUTH_ERROR_MESSAGE =
  'Azure DevOps rejected the personal access token. It is likely expired, revoked, or missing the required scopes. Open Settings to enter a new PAT.'

export class AdoAuthError extends Error {
  constructor() {
    super(ADO_AUTH_ERROR_MESSAGE)
    this.name = 'AdoAuthError'
  }
}

const MAX_ERROR_BODY_LENGTH = 500

function summarizeErrorBody(body: string, contentType: string): string {
  if (!body.trim()) {
    return 'no error details returned'
  }

  if (contentType.includes('application/json')) {
    try {
      const parsed: unknown = JSON.parse(body)
      const message = (parsed as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) {
        return message
      }
    } catch {
      // fall through to the truncated raw body
    }
  } else if (contentType.includes('text/html')) {
    return 'the server returned an HTML page instead of an API response'
  }

  return body.length > MAX_ERROR_BODY_LENGTH ? `${body.slice(0, MAX_ERROR_BODY_LENGTH)}…` : body
}

export class AdoHttpClient implements AdoRequestClient {
  private readonly pat: string
  private readonly defaultApiVersion: string

  constructor(pat: string, defaultApiVersion = '7.1') {
    this.pat = pat
    this.defaultApiVersion = defaultApiVersion
  }

  async request<T>(options: AdoRequestOptions): Promise<T> {
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

    const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''

    if (response.status === 401 || response.status === 403 || response.status === 203) {
      throw new AdoAuthError()
    }

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(
        `Azure DevOps query failed (${response.status} ${response.statusText}): ${summarizeErrorBody(errorBody, contentType)}`,
      )
    }

    // ADO answers unauthenticated requests with a sign-in page instead of an API error.
    if (!contentType.includes('application/json')) {
      throw new AdoAuthError()
    }

    return (await response.json()) as T
  }
}
