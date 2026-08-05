import type { AdoRequestClient } from './httpClient'

type WorkItemIcon = {
  id?: string
  url?: string
}

type WorkItemIconsResponse =
  | {
      count?: number
      value?: WorkItemIcon[]
    }
  | WorkItemIcon[]

const iconMapCache = new Map<string, Promise<Record<string, string>>>()

function normalizeIconsResponse(response: WorkItemIconsResponse): WorkItemIcon[] {
  if (Array.isArray(response)) {
    return response
  }

  return response.value ?? []
}

export async function fetchWorkItemIconMap(
  client: AdoRequestClient,
  orgName: string,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const cacheKey = orgName.toLowerCase()

  const cached = iconMapCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const fetchPromise = client
    .request<WorkItemIconsResponse>({
      orgName,
      path: '/_apis/wit/workitemicons',
      params: {
        'api-version': '7.1',
      },
      signal,
    })
    .then((response) => {
      const icons = normalizeIconsResponse(response)
      return icons.reduce<Record<string, string>>((acc, icon) => {
        if (icon.id && icon.url) {
          acc[icon.id] = icon.url
        }
        return acc
      }, {})
    })
    .catch((error) => {
      iconMapCache.delete(cacheKey)
      throw error
    })

  iconMapCache.set(cacheKey, fetchPromise)
  return fetchPromise
}
