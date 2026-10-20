import type { TeamMember } from '../../../ado/queryEngine'

export type AssignmentMemberRow = {
  key: string
  label: string
  avatarDescriptor?: string
  avatarUrl?: string
  isUnassigned: false
}

export function getAssignmentMemberRows(members: TeamMember[]): AssignmentMemberRow[] {
  const getFirstName = (displayName: string) => displayName.trim().split(/\s+/)[0] ?? ''

  return [...members]
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
      isUnassigned: false,
    }))
}

export function getAssignmentMemberFilterOptions(members: TeamMember[]): string[] {
  return [...new Set(members.map((member) => member.displayName))]
    .sort((left, right) => left.localeCompare(right))
}
