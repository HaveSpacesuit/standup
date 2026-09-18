import { Avatar, type AvatarProps } from '@mui/material'
import { useEffect, useState } from 'react'
import { loadStoredPat } from '../../../adoAuth'

type AvatarCacheEntry = {
  pat: string
  request: Promise<string>
}

const avatarDataUrlCache = new Map<string, AvatarCacheEntry>()

type AdoAvatarIdentity = {
  descriptor: string
  orgName: string
}

type AdoAvatarResponse = {
  value?: string
}

type AdoAvatarProps = AvatarProps & {
  descriptor?: string
}

function parseAdoAvatarIdentity(value: string, descriptorOverride?: string): AdoAvatarIdentity | null {
  try {
    const url = new URL(value)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    const avatarsSegmentIndex = pathSegments.findIndex((segment) => segment.toLowerCase() === 'memberavatars')
    const descriptor = descriptorOverride ?? (avatarsSegmentIndex >= 0 ? pathSegments[avatarsSegmentIndex + 1] : undefined)
    const orgName = url.hostname === 'dev.azure.com' || url.hostname === 'vssps.dev.azure.com'
      ? pathSegments[0]
      : undefined

    return url.protocol === 'https:' && descriptor && orgName
      ? { descriptor, orgName }
      : null
  } catch {
    return null
  }
}

function loadAvatarDataUrl(imageUrl: string, identity: AdoAvatarIdentity, pat: string): Promise<string> {
  const cached = avatarDataUrlCache.get(imageUrl)
  if (cached?.pat === pat) {
    return cached.request
  }

  const graphUrl = new URL(
    `https://vssps.dev.azure.com/${encodeURIComponent(identity.orgName)}/_apis/graph/Subjects/${encodeURIComponent(identity.descriptor)}/avatars`,
  )
  graphUrl.searchParams.set('size', 'medium')
  graphUrl.searchParams.set('api-version', '7.1')

  const request = fetch(graphUrl, {
    headers: {
      Authorization: `Basic ${btoa(`:${pat}`)}`,
      Accept: 'application/json',
    },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Azure DevOps avatar request failed (${response.status} ${response.statusText}).`)
      }
      return response.json() as Promise<AdoAvatarResponse>
    })
    .then((avatar) => {
      if (!avatar.value) {
        throw new Error('Azure DevOps returned an empty avatar image.')
      }
      return `data:image/png;base64,${avatar.value}`
    })
    .catch((error: unknown) => {
      if (avatarDataUrlCache.get(imageUrl)?.request === request) {
        avatarDataUrlCache.delete(imageUrl)
      }
      throw error
    })

  avatarDataUrlCache.set(imageUrl, { pat, request })
  return request
}

export function AdoAvatar({ descriptor, src, ...props }: AdoAvatarProps) {
  const [authenticatedSrc, setAuthenticatedSrc] = useState<string>()
  const pat = loadStoredPat()?.pat

  useEffect(() => {
    let active = true
    setAuthenticatedSrc(undefined)
    const identity = src ? parseAdoAvatarIdentity(src, descriptor) : null

    if (!src || !identity) {
      setAuthenticatedSrc(src)
      return () => {
        active = false
      }
    }

    if (!pat) {
      return () => {
        active = false
      }
    }

    void loadAvatarDataUrl(src, identity, pat)
      .then((dataUrl) => {
        if (active) {
          setAuthenticatedSrc(dataUrl)
        }
      })
      .catch(() => {
        // Keep the Avatar fallback when ADO has no image or rejects the request.
      })

    return () => {
      active = false
    }
  }, [descriptor, pat, src])

  return <Avatar src={authenticatedSrc} {...props} />
}
