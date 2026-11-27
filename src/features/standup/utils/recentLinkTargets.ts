import type { TeamProfile } from '../../../appSettings'
import type { WorkItemLinkTarget } from '../../../ado/workItemLinksApi'

const RECENT_LINK_TARGETS_STORAGE_KEY_PREFIX = 'standup:recent-link-targets'

/** The most recent link targets kept for a project; the oldest are forgotten first. */
export const MAX_RECENT_LINK_TARGETS = 8

export function recentLinkTargetsStorageKey(team: Pick<TeamProfile, 'orgName' | 'projectName'>): string {
  return `${RECENT_LINK_TARGETS_STORAGE_KEY_PREFIX}:${team.orgName.trim().toLowerCase()}/${team.projectName.trim().toLowerCase()}`
}

const optionalText = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

function parseTarget(value: unknown): WorkItemLinkTarget[] {
  if (!value || typeof value !== 'object') return []
  const entry = value as Record<string, unknown>
  const id = entry.id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return []
  const title = optionalText(entry.title)
  const workItemType = optionalText(entry.workItemType)
  return [{ id, ...(title ? { title } : {}), ...(workItemType ? { workItemType } : {}) }]
}

/** The items most recently linked to in the project, newest first. */
export function loadRecentLinkTargets(team: Pick<TeamProfile, 'orgName' | 'projectName'>): WorkItemLinkTarget[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(recentLinkTargetsStorageKey(team)) ?? '[]')
    return Array.isArray(parsed) ? parsed.flatMap(parseTarget).slice(0, MAX_RECENT_LINK_TARGETS) : []
  } catch {
    return []
  }
}

/**
 * Puts the items first among the project's recent link targets. Only what identifies them is kept: their state changes,
 * so the picker shows it only for items it reads fresh.
 */
export function rememberLinkTargets(team: Pick<TeamProfile, 'orgName' | 'projectName'>, targets: readonly WorkItemLinkTarget[]): void {
  if (!targets.length) return
  try {
    const ids = new Set(targets.map((target) => target.id))
    const next = [
      ...targets.flatMap(({ id, title, workItemType }) => parseTarget({ id, title, workItemType })),
      ...loadRecentLinkTargets(team).filter((target) => !ids.has(target.id)),
    ].slice(0, MAX_RECENT_LINK_TARGETS)
    localStorage.setItem(recentLinkTargetsStorageKey(team), JSON.stringify(next))
  } catch {
    // Recent picks are a convenience; without storage the picker still searches.
  }
}
