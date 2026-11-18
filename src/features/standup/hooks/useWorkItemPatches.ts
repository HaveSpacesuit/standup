import { useEffect, useRef } from 'react'
import type { AdoQueryEngine } from '../../../ado/queryEngine'
import type { PullRequestPatch, WorkItemPatch } from '../../../ado/workItemPatch'

/** Calls onPatch with each work item the engine saves or reloads, so the view can update the item in place. */
export function useWorkItemPatches(
  adoQueryEngine: Pick<AdoQueryEngine, 'subscribeWorkItemPatches'> | null | undefined,
  onPatch: (patch: WorkItemPatch) => void,
): void {
  const onPatchRef = useRef(onPatch)
  useEffect(() => {
    onPatchRef.current = onPatch
  })

  useEffect(() => {
    // Partial engines (as in tests) may not publish patches.
    if (typeof adoQueryEngine?.subscribeWorkItemPatches !== 'function') return
    return adoQueryEngine.subscribeWorkItemPatches((patch) => onPatchRef.current(patch))
  }, [adoQueryEngine])
}

/** Calls onPatch with each pull request card the engine reloads, so the view can update or drop the card in place. */
export function usePullRequestPatches(
  adoQueryEngine: Pick<AdoQueryEngine, 'subscribePullRequestPatches'> | null | undefined,
  onPatch: (patch: PullRequestPatch) => void,
): void {
  const onPatchRef = useRef(onPatch)
  useEffect(() => {
    onPatchRef.current = onPatch
  })

  useEffect(() => {
    if (typeof adoQueryEngine?.subscribePullRequestPatches !== 'function') return
    return adoQueryEngine.subscribePullRequestPatches((patch) => onPatchRef.current(patch))
  }, [adoQueryEngine])
}
