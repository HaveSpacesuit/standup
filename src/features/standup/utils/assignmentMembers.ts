import type { IdentityRef } from '../../../ado/identity'
import type { TeamMember } from '../../../ado/queryEngine'

export type AssignmentMemberRow = {
  key: string
  label: string
  avatarDescriptor?: string
  avatarUrl?: string
  /** The team member the row tracks, so cards can tell when work has moved to someone else. */
  memberIdentity: IdentityRef
  isUnassigned: false
}

export function getAssignmentMemberRows(
  members: TeamMember[],
  selectedMemberLabel = '',
): AssignmentMemberRow[] {
  const getFirstName = (displayName: string) => displayName.trim().split(/\s+/)[0] ?? ''
  const visibleMembers = selectedMemberLabel
    ? members.filter(
        (member) => member.displayName.trim().toLowerCase() === selectedMemberLabel.trim().toLowerCase(),
      )
    : members

  return [...visibleMembers]
    .sort((a, b) => {
      const firstNameCompare = getFirstName(a.displayName).localeCompare(getFirstName(b.displayName))
      if (firstNameCompare !== 0) {
        return firstNameCompare
      }

      return a.displayName.localeCompare(b.displayName)
    })
    .map((member) => ({
      key: member.displayName.toLowerCase(),
      label: member.displayName,
      avatarDescriptor: member.descriptor,
      avatarUrl: member.imageUrl,
      memberIdentity: { displayName: member.displayName, uniqueName: member.uniqueName, imageUrl: member.imageUrl },
      isUnassigned: false,
    }))
}

export function getAssignmentMemberFilterOptions(members: TeamMember[]): string[] {
  return [...new Set(members.map((member) => member.displayName))]
    .sort((left, right) => left.localeCompare(right))
}
