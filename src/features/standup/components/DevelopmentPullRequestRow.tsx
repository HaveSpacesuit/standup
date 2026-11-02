import { Box, Tooltip } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgGitBranch from '@stratakit/icons/git-branch.svg'
import svgUsers from '@stratakit/icons/users.svg'
import type { WorkItemPullRequestSummary } from '../../../ado/queryEngine'
import {
  formatShortAge,
  getApprovalSummary,
  getQuietChecksSummary,
  getToneColor,
  TERTIARY_TEXT_COLOR,
} from './developmentCardDisplay'

type DevelopmentPullRequestRowProps = {
  pullRequest: WorkItemPullRequestSummary
  /** PR-only cards already show the PR id and title as the card title. */
  showHeading?: boolean
}

const ellipsisSx = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const

export function DevelopmentPullRequestRow({ pullRequest, showHeading = true }: DevelopmentPullRequestRowProps) {
  const checks = getQuietChecksSummary(pullRequest.checks)
  const approvals = getApprovalSummary(pullRequest)
  const age = pullRequest.status === 'completed' ? '' : formatShortAge(pullRequest.recentActivityAt)

  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, fontSize: 11, lineHeight: 1.3, color: 'text.secondary' }}>
        {showHeading ? (
          <Box
            component="a"
            href={pullRequest.url}
            target="_blank"
            rel="noreferrer noopener"
            title={`PR ${pullRequest.id}: ${pullRequest.title}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              flex: '1 1 auto',
              minWidth: 0,
              color: 'inherit',
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            <Box component="span" sx={{ display: 'inline-flex', flex: '0 0 auto', color: TERTIARY_TEXT_COLOR }}>
              <Icon href={svgGitBranch} />
            </Box>
            <Box component="span" sx={{ flex: '0 0 auto', color: TERTIARY_TEXT_COLOR, fontVariantNumeric: 'tabular-nums' }}>
              {pullRequest.id}
            </Box>
            <Box component="span" sx={ellipsisSx}>
              {pullRequest.title}
            </Box>
          </Box>
        ) : (
          <Box sx={{ flex: '1 1 auto' }} />
        )}

        <Tooltip title={checks.label} arrow>
          <Box
            component="span"
            role="img"
            aria-label={checks.label}
            sx={{ display: 'inline-flex', flex: '0 0 auto', color: getToneColor(checks.tone) }}
          >
            <Icon href={checks.iconHref} />
          </Box>
        </Tooltip>

        <Tooltip title={approvals.label} arrow>
          <Box
            component="span"
            role="img"
            aria-label={approvals.label}
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
        </Tooltip>

        {age ? (
          <Box component="span" title="Time since the PR was ready for review" sx={{ flex: '0 0 auto', fontSize: 10, whiteSpace: 'nowrap', opacity: 0.85 }}>
            {age}
          </Box>
        ) : null}
      </Box>

      {checks.detail ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, minWidth: 0, fontSize: 11, lineHeight: 1.25, color: getToneColor(checks.tone) }}>
          <Box component="span" sx={{ display: 'inline-flex', flex: '0 0 auto' }}>
            <Icon href={checks.iconHref} />
          </Box>
          <Box component="span" title={checks.label} sx={ellipsisSx}>
            {checks.detail}
          </Box>
        </Box>
      ) : null}
    </Box>
  )
}
