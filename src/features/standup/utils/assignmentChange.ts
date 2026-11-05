import { parseAssignedTo, toIdentityKeys } from '../../../ado/identity'

export function getAssignmentChangeReason(previous: unknown, next: unknown): 'Assigned' | 'Reassigned' | 'Unassigned' {
  if (toIdentityKeys(parseAssignedTo(next)).length === 0) return 'Unassigned'
  return toIdentityKeys(parseAssignedTo(previous)).length === 0 ? 'Assigned' : 'Reassigned'
}
