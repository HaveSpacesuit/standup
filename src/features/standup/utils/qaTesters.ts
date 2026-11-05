import { parseAssignedTo, toIdentityKeys, type IdentityRef } from '../../../ado/identity'
import type { TeamMember, WorkItemUpdate } from '../../../ado/types'

export type QaTesterStateGroups = {
  testing: readonly string[]
  development: readonly string[]
  done: readonly string[]
}

export type ResolvedQaTesters = {
  testers: TeamMember[]
  /** No testers are chosen in QA options, so these were inferred from QA activity. */
  inferred: boolean
}

type ResolveQaTestersArgs = {
  /** Display names chosen in QA options; when empty, testers are inferred. */
  configuredNames: readonly string[]
  teamMembers: readonly TeamMember[]
  updatesByItemId: Readonly<Record<number, readonly WorkItemUpdate[]>>
  stateGroups: QaTesterStateGroups
}

type QaActivity = {
  /** Testing work picked up, or someone else's handoff verified or sent back. */
  qaActions: number
  /** Work moved into testing. */
  handoffs: number
}

function normalizeState(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : ''
}

function toStateSet(states: readonly string[]): ReadonlySet<string> {
  return new Set(states.map(normalizeState).filter(Boolean))
}

function isSameIdentity(left: IdentityRef | undefined, right: IdentityRef | undefined): boolean {
  if (!left || !right) {
    return false
  }

  const keys = new Set(toIdentityKeys(left))
  return toIdentityKeys(right).some((key) => keys.has(key))
}

/**
 * Tallies each team member's QA activity across work item histories. Picking up testing work,
 * and verifying or sending back someone else's handoff, count as QA; moving work into testing
 * counts as a developer handoff.
 */
export function getQaActivityByMember(
  teamMembers: readonly TeamMember[],
  updatesByItemId: Readonly<Record<number, readonly WorkItemUpdate[]>>,
  stateGroups: QaTesterStateGroups,
): Map<TeamMember, QaActivity> {
  const testing = toStateSet(stateGroups.testing)
  const development = toStateSet(stateGroups.development)
  const done = toStateSet(stateGroups.done)
  const membersByKey = new Map<string, TeamMember>()
  for (const member of teamMembers) {
    for (const key of toIdentityKeys(member)) {
      membersByKey.set(key, member)
    }
  }

  const activity = new Map<TeamMember, QaActivity>()
  const findMember = (identity: IdentityRef | undefined) => toIdentityKeys(identity)
    .map((key) => membersByKey.get(key))
    .find((member): member is TeamMember => member !== undefined)
  const credit = (identity: IdentityRef | undefined, kind: keyof QaActivity) => {
    const member = findMember(identity)
    if (!member) {
      return
    }

    const entry = activity.get(member) ?? { qaActions: 0, handoffs: 0 }
    entry[kind] += 1
    activity.set(member, entry)
  }

  for (const updates of Object.values(updatesByItemId)) {
    let state = ''
    let assignee: IdentityRef | undefined
    // Whoever sent the item to testing; automation hands work off for its assignee.
    let developer: IdentityRef | undefined

    for (const update of updates) {
      const fields = update.fields ?? {}
      const stateField = fields['System.State']
      const assignedField = fields['System.AssignedTo']
      const previousState = stateField ? normalizeState(stateField.oldValue) || state : state
      const nextState = stateField ? normalizeState(stateField.newValue) || previousState : state
      const previousAssignee = assignedField ? parseAssignedTo(assignedField.oldValue) : assignee
      const nextAssignee = assignedField ? parseAssignedTo(assignedField.newValue) : assignee
      const actor = update.revisedBy

      if (testing.has(nextState) && !testing.has(previousState)) {
        credit(actor, 'handoffs')
        developer = findMember(actor) ? actor : previousAssignee
      }

      if (testing.has(previousState) && (development.has(nextState) || done.has(nextState))) {
        if (actor && !isSameIdentity(actor, developer ?? previousAssignee)) {
          credit(actor, 'qaActions')
        }
      }

      if (assignedField && nextAssignee && testing.has(nextState) && !isSameIdentity(nextAssignee, developer)) {
        credit(nextAssignee, 'qaActions')
      }

      state = nextState
      assignee = nextAssignee
    }
  }

  return activity
}

/**
 * The team's QA testers: the members chosen in QA options or, when none are chosen, the members
 * whose recent history shows more QA work than handoffs to QA.
 */
export function resolveQaTesters({ configuredNames, teamMembers, updatesByItemId, stateGroups }: ResolveQaTestersArgs): ResolvedQaTesters {
  const selectedNames = new Set(configuredNames.map((name) => name.trim().toLowerCase()).filter(Boolean))
  if (selectedNames.size > 0) {
    return {
      testers: teamMembers.filter((member) => selectedNames.has(member.displayName.trim().toLowerCase())),
      inferred: false,
    }
  }

  const activity = getQaActivityByMember(teamMembers, updatesByItemId, stateGroups)
  return {
    testers: teamMembers.filter((member) => {
      const entry = activity.get(member)
      return entry !== undefined && entry.qaActions > entry.handoffs
    }),
    inferred: true,
  }
}
