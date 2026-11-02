import Box from '@mui/material/Box'
import { Fragment, type ReactNode } from 'react'
import type { IdentityRef } from '../../../ado/identity'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import type { CardChangeDetail } from '../hooks/useAdoHistoryHighlights'
import { AdoAvatar } from './AdoAvatar'
import {
  getClosedPullRequestLabel,
  getLastChangeText,
  getQuietChecksSummary,
  TERTIARY_TEXT_COLOR,
  type DevelopmentCardModel,
} from './developmentCardDisplay'

type DetailRow = { key: string; term: string; value: ReactNode }

function Person({ identity }: { identity: IdentityRef }) {
  const name = identity.displayName ?? identity.uniqueName ?? 'Unknown'
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
      <AdoAvatar alt="" src={identity.imageUrl} sx={{ width: 16, height: 16, fontSize: 9, flex: '0 0 auto' }}>
        {name.trim().charAt(0).toUpperCase()}
      </AdoAvatar>
      <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</Box>
    </Box>
  )
}

/** Facts the compact card leaves out: full state, sprint, owner, last change, and each PR's title and checks. */
export function DevelopmentCardDetails({
  item,
  model,
  changeDetail,
}: {
  item: WorkItemSummary
  model: DevelopmentCardModel
  changeDetail?: CardChangeDetail
}) {
  const rows: DetailRow[] = []
  if (!model.pullRequestOnly && item.state) {
    rows.push({ key: 'state', term: 'State', value: item.state })
  }

  if (!model.pullRequestOnly && item.sprintName) {
    rows.push({ key: 'sprint', term: 'Sprint', value: model.showRollover ? `${item.sprintName} (rolled over)` : item.sprintName })
  }

  if (item.assignedTo) {
    rows.push({ key: 'owner', term: model.pullRequestOnly ? 'Author' : 'Assigned to', value: <Person identity={item.assignedTo} /> })
  }

  const lastChange = getLastChangeText(changeDetail)
  if (lastChange) {
    rows.push({ key: 'change', term: 'Last change', value: lastChange })
  }

  if (model.pullRequestOnly) {
    const pullRequest = model.pullRequestOnly
    rows.push({
      key: 'checks',
      term: 'Checks',
      value: getClosedPullRequestLabel(pullRequest) || getQuietChecksSummary(pullRequest.checks).label,
    })
  } else {
    for (const pullRequest of model.linkedPullRequests) {
      const closedLabel = getClosedPullRequestLabel(pullRequest)
      rows.push({
        key: `pr-${pullRequest.id}`,
        term: `PR ${pullRequest.id}`,
        value: (
          <>
            <Box component="span" sx={{ display: 'block', color: 'text.primary' }}>{pullRequest.title}</Box>
            <Box component="span" sx={{ display: 'block', color: TERTIARY_TEXT_COLOR }}>
              {[pullRequest.repositoryName, closedLabel || getQuietChecksSummary(pullRequest.checks).label].filter(Boolean).join(' · ')}
            </Box>
          </>
        ),
      })
    }
  }

  if (rows.length === 0) {
    return null
  }

  return (
    <Box
      component="dl"
      data-card-details=""
      sx={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        columnGap: 2.5,
        rowGap: 0.75,
        m: 0,
        mt: 1.25,
        pt: 1.25,
        borderTop: '1px solid',
        borderColor: 'divider',
        fontSize: 11,
        lineHeight: 1.35,
        color: 'text.secondary',
        '& dt': { color: TERTIARY_TEXT_COLOR, whiteSpace: 'nowrap' },
        '& dd': { m: 0, minWidth: 0, overflowWrap: 'anywhere' },
      }}
    >
      {rows.map((row) => (
        <Fragment key={row.key}>
          <dt>{row.term}</dt>
          <dd>{row.value}</dd>
        </Fragment>
      ))}
    </Box>
  )
}
