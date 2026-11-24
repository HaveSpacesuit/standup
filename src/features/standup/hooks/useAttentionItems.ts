import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine, WorkItemSummary } from '../../../ado/queryEngine'
import type { TeamProfile } from '../../../appSettings'
import { DEFAULT_ATTENTION_TAGS } from '../utils/attentionTags'
import { toErrorMessage } from './queryErrors'
import { useWorkItemPatches } from './useWorkItemPatches'
import { workItemUrlFor } from '../../../ado/workItemPatch'

export type AttentionItemsState = {
  items: WorkItemSummary[]
  loading: boolean
  error: string | null
  syncedAt: number | null
}

const EMPTY_ITEMS: WorkItemSummary[] = []

export function useAttentionItems({ engine, team, tags = DEFAULT_ATTENTION_TAGS, enabled, reloadNonce }: {
  engine: AdoQueryEngine | null
  team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath'>
  tags?: readonly string[]
  enabled: boolean
  reloadNonce: number
}): AttentionItemsState {
  const [revision, setRevision] = useState(0)
  const tagsKey = JSON.stringify(tags)
  const configuredTags = useMemo(() => JSON.parse(tagsKey) as string[], [tagsKey])
  const key = JSON.stringify([team.id, team.orgName, team.projectName, team.areaPath, tagsKey, reloadNonce, revision])
  const [snapshot, setSnapshot] = useState<{ key: string; engine: AdoQueryEngine; items: WorkItemSummary[] | null; error: string | null; syncedAt: number | null } | null>(null)
  const canLoad = enabled && Boolean(engine && team.id && configuredTags.length)

  useWorkItemPatches(engine, (patch) => {
    if (!patch.preview && patch.workItemUrl.toLowerCase() === workItemUrlFor(team, patch.id).toLowerCase()) {
      setRevision((current) => current + 1)
    }
  })
  useEffect(() => {
    if (!canLoad || !engine) return
    let active = true
    setSnapshot({ key, engine, items: null, error: null, syncedAt: null })
    engine.getAttentionItems(team, configuredTags).then(
      ({ items, syncedAt }) => {
        if (active) setSnapshot({ key, engine, items, error: null, syncedAt })
      },
      (error: unknown) => {
        if (active) setSnapshot({ key, engine, items: null, error: toErrorMessage(error, 'Unable to check attention tags. Refresh to retry.'), syncedAt: null })
      },
    )
    return () => { active = false }
  }, [engine, canLoad, key, configuredTags, team])

  const current = canLoad && snapshot?.key === key && snapshot.engine === engine ? snapshot : null
  return {
    items: current?.items ?? EMPTY_ITEMS,
    loading: canLoad && (!current || (current.items === null && current.error === null)),
    error: current?.error ?? null,
    syncedAt: current?.syncedAt ?? null,
  }
}
