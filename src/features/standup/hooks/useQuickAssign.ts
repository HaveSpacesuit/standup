import { useMemo, useRef, useState } from 'react'
import type { IdentityRef } from '../../../ado/identity'
import type { AdoQueryEngine, TeamIterationOption, WorkItemSummary } from '../../../ado/queryEngine'
import { isAssignmentAccessError } from '../../../ado/workItemAssignmentApi'
import type { TeamProfile } from '../../../appSettings'
import type { TagRule } from '../../../ado/workItemStatus'
import { workItemUrlFor } from '../../../ado/workItemPatch'
import { getQuickAssignGroups, isQuickAssignable } from '../utils/quickAssign'
import { toErrorMessage } from './queryErrors'
import type { WorkItemPreviewSource } from './useWorkItemPreview'

export type QuickAssignController = {
  attentionTags?: readonly string[]
  previewSource?: WorkItemPreviewSource | null
  getWorkItemUrl: (id: number) => string
  groups: ReturnType<typeof getQuickAssignGroups>
  developer: IdentityRef | null
  busy: boolean
  error: string | null
  /** The last assignment; the picker closes on success, so the developer's cell announces it. */
  success: { developer: IdentityRef; message: string } | null
  open: (developer: IdentityRef) => void
  close: () => void
  assign: (id: number) => Promise<void>
}

export function useQuickAssign({
  engine, team, items, iterations, tagRules, scopeKey, onAssigned, onRefresh, attentionTags, previewSource,
}: {
  engine: AdoQueryEngine | null
  team: TeamProfile
  items: WorkItemSummary[]
  iterations: TeamIterationOption[]
  tagRules: TagRule[]
  scopeKey: string
  onAssigned: (item: WorkItemSummary) => void
  onRefresh: () => void
  attentionTags?: readonly string[]
  previewSource?: WorkItemPreviewSource | null
}): QuickAssignController {
  const scope = useMemo(() => ({ engine, team, scopeKey, tagRules }), [engine, team, scopeKey, tagRules])
  const activeScope = useRef(scope)
  activeScope.current = scope
  const pending = useRef(false)
  const [state, setState] = useState({
    scope, developer: null as IdentityRef | null, busy: false, error: null as string | null,
    success: null as QuickAssignController['success'],
  })
  if (state.scope !== scope) setState({ scope, developer: null, busy: false, error: null, success: null })
  const current = state.scope === scope ? state : { developer: null, busy: false, error: null, success: null }
  const groups = useMemo(() => getQuickAssignGroups(items, iterations, tagRules), [items, iterations, tagRules])
  return {
    ...current,
    attentionTags,
    previewSource,
    getWorkItemUrl: (id) => workItemUrlFor(team, id),
    groups,
    open: (developer) => {
      if (!pending.current) setState({ scope, developer, busy: false, error: null, success: null })
    },
    close: () => {
      if (!pending.current) setState({ scope, developer: null, busy: false, error: null, success: null })
    },
    assign: async (id) => {
      if (pending.current) return
      const item = items.find((candidate) => candidate.id === id)
      const developer = current.developer
      if (!engine || !developer || !item || !isQuickAssignable(item, tagRules)) {
        setState((previous) => ({ ...previous, error: 'This item is no longer available. Refresh and choose again.', success: null }))
        return
      }
      pending.current = true
      setState((previous) => ({ ...previous, busy: true, error: null, success: null }))
      try {
        const updated = await engine.assignWorkItem(team, item, developer, tagRules)
        if (activeScope.current !== scope) return
        onAssigned(updated)
        const message = `#${id} assigned to ${developer.displayName ?? developer.uniqueName}.`
        setState((previous) => ({ ...previous, developer: null, busy: false, success: { developer, message } }))
      } catch (error) {
        if (activeScope.current !== scope) return
        setState((previous) => ({ ...previous, error: toErrorMessage(error, 'Assignment could not be confirmed. Refresh before trying again.') }))
        if (!isAssignmentAccessError(error)) onRefresh()
      } finally {
        pending.current = false
        if (activeScope.current === scope) setState((previous) => ({ ...previous, busy: false }))
      }
    },
  }
}
