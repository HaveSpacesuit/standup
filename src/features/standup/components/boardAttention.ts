import svgAdd from '@stratakit/icons/add.svg'
import svgClock from '@stratakit/icons/clock.svg'
import svgError from '@stratakit/icons/error.svg'
import svgGitMerge from '@stratakit/icons/git-merge.svg'
import svgHistory from '@stratakit/icons/history.svg'
import svgLock from '@stratakit/icons/lock.svg'
import svgUndo from '@stratakit/icons/undo.svg'
import svgUser from '@stratakit/icons/user.svg'
import svgUsers from '@stratakit/icons/users.svg'
import type { IdentityRef } from '../../../ado/identity'
import type { WorkItemPullRequestSummary, WorkItemSummary } from '../../../ado/queryEngine'
import type { CardChangeDetail } from '../hooks/useAdoHistoryHighlights'
import { hasMovedBack, type SprintJourney } from '../utils/sprintJourney'
import { STATUS_COLUMNS, type StatusColumn } from '../utils/statusColumnStyles'
import {
  getCardNextStep,
  getPullRequestProgress,
  isPullRequestClosed,
} from './developmentCardDisplay'
import type { WorkItemCardHighlightState } from './workItemCardDisplay'

export const IDLE_ATTENTION_DAYS = 3

export type AttentionFacetKey = 'blocked' | 'failing' | 'approval' | 'idle' | 'back' | 'qa' | 'added' | 'ready' | 'changed'
export type AttentionTone = 'critical' | 'attention' | 'info' | 'positive'

export type AttentionFacet = {
  key: AttentionFacetKey
  label: string
  tone: AttentionTone
  iconHref: string
  description: string
}

/** Ordered as the Needs attention bar lists them. */
const ATTENTION_FACETS: readonly AttentionFacet[] = [
  { key: 'blocked', label: 'Blocked', tone: 'critical', iconHref: svgLock, description: 'Cards in the Blocked column.' },
  {
    key: 'failing',
    label: 'Failing checks',
    tone: 'critical',
    iconHref: svgError,
    description: 'An open pull request has a failing required check.',
  },
  {
    key: 'approval',
    label: 'Needs approval',
    tone: 'attention',
    iconHref: svgUsers,
    description: 'An open pull request has an unsatisfied reviewer policy and is not waiting on its author.',
  },
  {
    key: 'idle',
    label: `Idle ${IDLE_ATTENTION_DAYS}+ days`,
    tone: 'attention',
    iconHref: svgClock,
    description: `Blocked, Active, or Review cards unchanged for ${IDLE_ATTENTION_DAYS} or more days.`,
  },
  {
    key: 'back',
    label: 'Moved back',
    tone: 'attention',
    iconHref: svgUndo,
    description: 'Cards that moved back to an earlier column during the sprint, such as Review to Active.',
  },
  {
    key: 'qa',
    label: 'With QA',
    tone: 'info',
    iconHref: svgUser,
    description: 'Review cards now assigned to someone other than their developer.',
  },
  {
    key: 'added',
    label: 'Added mid-sprint',
    tone: 'info',
    iconHref: svgAdd,
    description: 'Cards added to the sprint after it started.',
  },
  {
    key: 'ready',
    label: 'Ready to complete',
    tone: 'positive',
    iconHref: svgGitMerge,
    description: 'An open pull request has passing checks and enough approvals.',
  },
  { key: 'changed', label: 'Recently changed', tone: 'info', iconHref: svgHistory, description: 'Cards with a recent tracked change.' },
]

const FACETS_BY_KEY = Object.fromEntries(ATTENTION_FACETS.map((facet) => [facet.key, facet])) as Record<AttentionFacetKey, AttentionFacet>

/** Facets that need sprint journeys, so only the Sprint view offers them. */
const SPRINT_ONLY_FACETS: ReadonlySet<AttentionFacetKey> = new Set(['back', 'added'])

export const PEOPLE_ATTENTION_FACETS: readonly AttentionFacet[] = ATTENTION_FACETS.filter((facet) => !SPRINT_ONLY_FACETS.has(facet.key))
export const SPRINT_ATTENTION_FACETS: readonly AttentionFacet[] = ATTENTION_FACETS

/** Lane flags, most urgent first; Recently changed is news rather than a problem, and Added mid-sprint has its own lane, so lanes leave them out. */
export const LANE_FLAG_ORDER: readonly AttentionFacetKey[] = ['blocked', 'failing', 'idle', 'back', 'approval', 'qa', 'ready']

export function formatLaneFlag(key: AttentionFacetKey, count: number): string {
  switch (key) {
    case 'blocked':
      return `${count} blocked`
    case 'failing':
      return `${count} failing check${count === 1 ? '' : 's'}`
    case 'idle':
      return `${count} idle ${IDLE_ATTENTION_DAYS}d+`
    case 'back':
      return `${count} moved back`
    case 'approval':
      return `${count} need${count === 1 ? 's' : ''} approval`
    case 'qa':
      return `${count} with QA`
    case 'added':
      return `${count} added mid-sprint`
    case 'ready':
      return `${count} ready to complete`
    case 'changed':
      return `${count} recently changed`
  }
}

export type LaneFlag = { facet: AttentionFacet; count: number }

/** Lane flags with at least one card, most urgent first. */
export function getLaneFlags(
  items: readonly { id: number }[],
  signalsByItemId: ReadonlyMap<number, ReadonlySet<AttentionFacetKey>>,
): LaneFlag[] {
  return LANE_FLAG_ORDER
    .map((key) => ({
      facet: FACETS_BY_KEY[key],
      count: items.filter((item) => signalsByItemId.get(item.id)?.has(key)).length,
    }))
    .filter((flag) => flag.count > 0)
}

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
  /** The card's sprint journey, when the board tracks one. */
  journey?: SprintJourney
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

  return pullRequest.reviewPolicy !== undefined && pullRequest.reviewPolicy.state !== 'passing'
}

/** The Needs attention facets a card matches, using the same rules the card itself uses to draw its signals. */
export function getCardAttentionSignals({
  item,
  highlightState = 'none',
  changeDetail,
  rowMember = null,
  journey,
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

  if (journey && hasMovedBack(journey)) {
    signals.add('back')
  }

  if (getCardNextStep(item, rowMember)?.owner?.kind === 'person') {
    signals.add('qa')
  }

  if (journey && journey.addedAt !== null) {
    signals.add('added')
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
  return { blocked: 0, failing: 0, approval: 0, idle: 0, back: 0, qa: 0, added: 0, ready: 0, changed: 0 }
}

export type BoardAttentionOptions = {
  /** The developer each card is pinned to, for boards whose rows are not people. */
  rowMemberForItem?: (item: WorkItemSummary) => IdentityRef | undefined
  journeysByItemId?: Record<number, SprintJourney>
}

/** Signals for every card on the given rows; a card's row matters because handoffs are judged against it. */
export function getBoardAttention(
  rows: readonly AttentionBoardRow[],
  cardsByCell: Record<string, readonly WorkItemSummary[]>,
  highlightsByItemId: Record<number, WorkItemCardHighlightState>,
  changeDetailsByItemId: Record<number, CardChangeDetail> | undefined,
  { rowMemberForItem, journeysByItemId }: BoardAttentionOptions = {},
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
          rowMember: rowMemberForItem ? rowMemberForItem(item) : row.memberIdentity,
          journey: journeysByItemId?.[item.id],
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
