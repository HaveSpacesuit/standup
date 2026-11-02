import { Box } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgGitBranch from '@stratakit/icons/git-branch.svg'
import svgUsers from '@stratakit/icons/users.svg'
import type { WorkItemPullRequestSummary } from '../../../ado/queryEngine'
import { DevelopmentCardStep } from './DevelopmentCardStep'
import { PullRequestProgressStrip } from './PullRequestProgressStrip'
import {
  getApprovalSummary,
  getPullRequestNextStep,
  getToneColor,
  isPullRequestClosed,
  TERTIARY_TEXT_COLOR,
} from './developmentCardDisplay'

type DevelopmentPullRequestRowProps = {
  pullRequest: WorkItemPullRequestSummary
  /** PR-only cards already show the PR id and title as the card title. */
  showHeading?: boolean
  /** Names the repository when a work item has PRs in more than one place. */
  showRepository?: boolean
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function DevelopmentPullRequestRow({ pullRequest, showHeading = true, showRepository = false }: DevelopmentPullRequestRowProps) {
  const closed = isPullRequestClosed(pullRequest)
  const step = getPullRequestNextStep(pullRequest)
  const approvals = getApprovalSummary(pullRequest)
  const closedLabel = closed && pullRequest.status ? capitalize(pullRequest.status.trim().toLowerCase()) : ''
  const repository = showRepository ? pullRequest.repositoryName : undefined

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box
        title={showHeading ? `PR ${pullRequest.id}: ${pullRequest.title}` : undefined}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, fontSize: 11, lineHeight: 1.3, color: 'text.secondary' }}
      >
        {showHeading ? (
          <Box
            component="a"
            href={pullRequest.url}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={`PR ${pullRequest.id}: ${pullRequest.title}`}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              flex: '0 0 auto',
              color: TERTIARY_TEXT_COLOR,
              textDecoration: 'none',
              fontVariantNumeric: 'tabular-nums',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            <Icon href={svgGitBranch} />
            {pullRequest.id}
          </Box>
        ) : null}

        {repository ? (
          <Box component="span" title={`Repository: ${repository}`} sx={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, color: TERTIARY_TEXT_COLOR }}>
            {repository}
          </Box>
        ) : null}

        {closedLabel ? (
          <Box component="span" sx={{ flex: '0 0 auto', fontSize: 10, color: TERTIARY_TEXT_COLOR, whiteSpace: 'nowrap' }}>
            {closedLabel}
          </Box>
        ) : (
          <>
            <PullRequestProgressStrip pullRequest={pullRequest} />
            <Box
              component="span"
              aria-hidden="true"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.25,
                flex: '0 0 auto',
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: approvals.tone === 'neutral' ? 400 : 600,
                color: approvals.tone === 'neutral' ? TERTIARY_TEXT_COLOR : getToneColor(approvals.tone),
              }}
            >
              {approvals.showUsersIcon ? <Icon href={svgUsers} /> : null}
              {approvals.text}
            </Box>
          </>
        )}
      </Box>

      {step ? <DevelopmentCardStep step={step} /> : null}
    </Box>
  )
}
