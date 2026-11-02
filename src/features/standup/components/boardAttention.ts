import type { IdentityRef } from '../../../ado/identity'
import type { WorkItemPullRequestSummary, WorkItemSummary } from '../../../ado/queryEngine'
import type { CardChangeDetail } from '../hooks/useAdoHistoryHighlights'
import { STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
import {
  getCardNextStep,
  getPullRequestProgress,
  isPullRequestClosed,
  REQUIRED_APPROVALS,
} from './developmentCardDisplay'
import type { WorkItemCardHighlightState } from './WorkItemCard'

export const IDLE_ATTENTION_DAYS = 3

export type AttentionFacetKey = 'blocked' | 'failing' | 'approval' | 'idle' | 'qa' | 'ready' | 'changed'
export type AttentionTone = 'critical' | 'attention' | 'info' | 'positive'

export type AttentionFacet = {
  key: AttentionFacetKey
  label: string
  tone: AttentionTone
  description: string
}

/** Ordered from most to least urgent; the bar and lane summaries both use this order. */
export const ATTENTION_FACETS: readonly AttentionFacet[] = [
  { key: 'blocked', label: 'Blocked', tone: 'critical', description: 'Cards in the Blocked column.' },
  { key: 'failing', label: 'Failing checks', tone: 'critical', description: 'An open pull request has a failing required check.' },
  {
    key: 'approval',
    label: 'Needs approval',
    tone: 'attention',
    description: `An open pull request has fewer than ${REQUIRED_APPROVALS} approvals and is not waiting on its author.`,
  },
  {
    key: 'idle',
    label: `Idle ${IDLE_ATTENTION_DAYS}+ days`,
    tone: 'attention',
    description: `Blocked, Active, or Review cards unchanged for ${IDLE_ATTENTION_DAYS} or more days.`,
  },
  { key: 'qa', label: 'With QA', tone: 'info', description: 'Review cards now assigned to someone other than their developer.' },
  { key: 'ready', label: 'Ready to complete', tone: 'positive', description: 'An open pull request has passing checks and enough approvals.' },
  { key: 'changed', label: 'Recently changed', tone: 'info', description: 'Cards with a recent tracked change.' },
]

export const ATTENTION_TONE_COLORS: Record<AttentionTone, string> = {
  critical: 'var(--stratakit-color-bg-critical-base)',
  attention: 'var(--stratakit-color-bg-attention-base)',
  info: 'var(--stratakit-color-bg-info-base)',
  positive: 'var(--stratakit-color-bg-positive-base)',
}

const IDLE_COLUMNS: ReadonlySet<StatusColumn> = new Set(['Blocked', 'Active', 'Review'])

export type CardAttentionInput = {
  item: WorkItemSummary
  highlightState?: WorkItemCardHighlightState
  changeDetail?: CardChangeDetail
  /** The developer whose row the card is pinned to. */
  rowMember?: IdentityRef | null
}

function getOpenPullRequests(item: WorkItemSummary): WorkItemPullRequestSummary[] {
  const pullRequests = item.kind === 'pull-request'
    ? (item.pullRequest ? [item.pullRequest] : [])
    : (item.activePullRequests ?? [])
  return pullRequests.filter((pullRequest) => !isPullRequestClosed(pullRequest))
}

function hasFailingRequiredCheck(pullRequest: WorkItemPullRequestSummary): boolean {
  return pullRequest.checks?.checks.some((check) => !check.optional && check.state === 'failing') ?? false
}

function needsApproval(pullRequest: WorkItemPullRequestSummary): boolean {
  if (pullRequest.reviewState === 'rejected' || pullRequest.reviewState === 'waiting-for-author') {
    return false
  }

  return (pullRequest.approvalCount ?? 0) < REQUIRED_APPROVALS
}

/** The Needs attention facets a card matches, using the same rules the card itself uses to draw its signals. */
export function getCardAttentionSignals({
  item,
  highlightState = 'none',
  changeDetail,
  rowMember = null,
}: CardAttentionInput): Set<AttentionFacetKey> {
  const signals = new Set<AttentionFacetKey>()
  const openPullRequests = getOpenPullRequests(item)

  if (item.status === 'Blocked') {
    signals.add('blocked')
  }

  if (openPullRequests.some(hasFailingRequiredCheck)) {
    signals.add('failing')
  }

  if (openPullRequests.some(needsApproval)) {
    signals.add('approval')
  }

  if (changeDetail && IDLE_COLUMNS.has(item.status) && changeDetail.idleDays >= IDLE_ATTENTION_DAYS) {
    signals.add('idle')
  }

  if (getCardNextStep(item, rowMember)?.owner?.kind === 'person') {
    signals.add('qa')
  }

  if (openPullRequests.some((pullRequest) => getPullRequestProgress(pullRequest).ready)) {
    signals.add('ready')
  }

  if (highlightState === 'new') {
    signals.add('changed')
  }

  return signals
}

export type AttentionBoardRow = {
  key: string
  memberIdentity?: IdentityRef
}

export type BoardAttention = {
  signalsByItemId: Map<number, ReadonlySet<AttentionFacetKey>>
  facetCounts: Record<AttentionFacetKey, number>
  totalCards: number
}

function createEmptyFacetCounts(): Record<AttentionFacetKey, number> {
  return { blocked: 0, failing: 0, approval: 0, idle: 0, qa: 0, ready: 0, changed: 0 }
}

/** Signals for every card on the given rows; a card's row matters because handoffs are judged against it. */
export function getBoardAttention(
  rows: readonly AttentionBoardRow[],
  cardsByCell: Record<string, readonly WorkItemSummary[]>,
  highlightsByItemId: Record<number, WorkItemCardHighlightState>,
  changeDetailsByItemId: Record<number, CardChangeDetail> | undefined,
): BoardAttention {
  const signalsByItemId = new Map<number, ReadonlySet<AttentionFacetKey>>()
  const facetCounts = createEmptyFacetCounts()

  for (const row of rows) {
    for (const status of STATUS_COLUMNS) {
      for (const item of cardsByCell[`${row.key}:${status}`] ?? []) {
        const signals = getCardAttentionSignals({
          item,
          highlightState: highlightsByItemId[item.id],
          changeDetail: changeDetailsByItemId?.[item.id],
          rowMember: row.memberIdentity,
        })
        signalsByItemId.set(item.id, signals)
        for (const signal of signals) {
          facetCounts[signal] += 1
        }
      }
    }
  }

  return { signalsByItemId, facetCounts, totalCards: signalsByItemId.size }
}

/** Ids of the cards matching a facet, or null while no facet is selected. */
export function getHighlightedItemIds(attention: BoardAttention, facet: AttentionFacetKey | null): ReadonlySet<number> | null {
  if (!facet) {
    return null
  }

  const ids = new Set<number>()
  for (const [id, signals] of attention.signalsByItemId) {
    if (signals.has(facet)) {
      ids.add(id)
    }
  }

  return ids
}

/** Matching cards first, keeping each group's existing order. */
export function partitionHighlighted<T extends { id: number }>(items: readonly T[], highlighted: ReadonlySet<number> | null): { items: readonly T[]; matchCount: number } {
  if (!highlighted) {
    return { items, matchCount: 0 }
  }

  const matches = items.filter((item) => highlighted.has(item.id))
  if (matches.length === 0 || matches.length === items.length) {
    return { items, matchCount: matches.length }
  }

  return { items: [...matches, ...items.filter((item) => !highlighted.has(item.id))], matchCount: matches.length }
}
