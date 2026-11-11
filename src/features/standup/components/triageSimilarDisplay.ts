import { UNASSIGNED_LABEL } from '../utils/backlogFilter'
import type { BacklogSprintResolver } from '../utils/backlogSprint'
import { formatAssignee } from '../utils/backlogValue'
import { formatTriageCreated, formatTriageWhen } from '../utils/triageInbox'
import type { TriageMatch } from '../utils/triageSimilar'

/**
 * What tells a match apart at a glance: when a closed bug was closed ("Done Jan 14"), where an open bug is planned and who
 * has it ("This sprint · Ana Diaz"), or when another queued item was filed ("filed yesterday").
 */
export function describeTriageMatch(match: TriageMatch, resolveSprint: BacklogSprintResolver, now = new Date()): string {
  const { candidate } = match
  if (candidate.kind === 'closed') {
    const closed = candidate.closedAt ? formatTriageCreated(candidate.closedAt, now) : ''
    return [candidate.state || 'Closed', closed].filter(Boolean).join(' ')
  }
  if (candidate.kind === 'open') {
    return [resolveSprint(candidate.iterationPath).label, formatAssignee(candidate.assignedTo) || UNASSIGNED_LABEL].join(' · ')
  }
  const filed = candidate.createdAt ? formatTriageWhen(candidate.createdAt, now) : ''
  return filed ? `filed ${filed}` : ''
}
