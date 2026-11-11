import { useEffect, useState } from 'react'
import type { TeamProfile } from '../../../appSettings'
import type { AdoQueryEngine } from '../../../ado/queryEngine'
import type { WorkItemPreview } from '../../../ado/types'
import { resolveAdoAttachmentRequest } from '../../../ado/workItemPreviewApi'
import { toErrorMessage } from './queryErrors'

/** Images in a previewed item's text. Only attachments in the team's organization load, with the team's token. */
export type WorkItemPreviewImages = {
  canLoad: (src: string) => boolean
  load: (src: string) => Promise<Blob> | null
}

/** Where the preview panel reads a work item's details from: the selected team's organization and project. */
export type WorkItemPreviewSource = {
  /** Changes with the team and on refresh, so the panel reloads. */
  key: string
  load: (id: number) => Promise<WorkItemPreview>
  /** A preview already loaded from this source, shown at once when moving back to an item. */
  peek: (id: number) => WorkItemPreview | undefined
  images: WorkItemPreviewImages
}

const PEEK_LIMIT = 60

export function createWorkItemPreviewSource(
  engine: Pick<AdoQueryEngine, 'getWorkItemPreview' | 'getWorkItemAttachment'>,
  team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName'>,
  key: string,
): WorkItemPreviewSource {
  const loaded = new Map<number, WorkItemPreview>()
  return {
    key,
    load: (id) => engine.getWorkItemPreview(team, id).then((preview) => {
      loaded.delete(id)
      loaded.set(id, preview)
      if (loaded.size > PEEK_LIMIT) loaded.delete(loaded.keys().next().value as number)
      return preview
    }),
    peek: (id) => loaded.get(id),
    images: {
      canLoad: (src) => resolveAdoAttachmentRequest(src, team.orgName) !== null,
      load: (src) => engine.getWorkItemAttachment(src, team.orgName),
    },
  }
}

type PreviewState = { requestKey: string; preview?: WorkItemPreview; error?: string }

/**
 * Loads the selected item's preview, then quietly loads the next one so moving down the list is instant. A failed load
 * can be retried; a successful one is kept until the page refreshes.
 */
export function useWorkItemPreview(source: WorkItemPreviewSource | null | undefined, id: number | null, nextId?: number) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<PreviewState | null>(null)
  const requestKey = source && id !== null ? `${source.key}:${id}:${attempt}` : ''

  useEffect(() => {
    if (!source || id === null) return undefined
    let active = true
    source.load(id).then(
      (preview) => {
        if (active) setState({ requestKey, preview })
      },
      (cause: unknown) => {
        if (active) setState({ requestKey, error: toErrorMessage(cause, 'The work item could not be loaded.') })
      },
    )
    return () => {
      active = false
    }
  }, [source, id, requestKey])

  const current = state?.requestKey === requestKey ? state : undefined
  const preview = current?.preview ?? (source && id !== null && !current?.error ? source.peek(id) : undefined)

  useEffect(() => {
    if (preview && source && nextId !== undefined) source.load(nextId).catch(() => undefined)
  }, [preview, source, nextId])

  return {
    preview,
    error: current?.error,
    loading: Boolean(requestKey) && !preview && !current?.error,
    retry: () => setAttempt((value) => value + 1),
  }
}
