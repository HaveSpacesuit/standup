import { Box } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgGitBranch from '@stratakit/icons/git-branch.svg'
import type { WorkItemPullRequestSummary } from '../../../ado/queryEngine'
import { DevelopmentCardStep } from './DevelopmentCardStep'
import {
  formatShortAge,
  getPullRequestNextStep,
  isPullRequestClosed,
  TERTIARY_TEXT_COLOR,
} from './developmentCardDisplay'

type DevelopmentPullRequestRowProps = {
  pullRequest: WorkItemPullRequestSummary
  /** PR-only cards already show the PR id and title as the card title. */
  showHeading?: boolean
}

const ellipsisSx = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function DevelopmentPullRequestRow({ pullRequest, showHeading = true }: DevelopmentPullRequestRowProps) {
  const closed = isPullRequestClosed(pullRequest)
  const step = getPullRequestNextStep(pullRequest)
  const age = closed ? '' : formatShortAge(pullRequest.recentActivityAt)
  const closedLabel = closed && pullRequest.status ? capitalize(pullRequest.status.trim().toLowerCase()) : ''
  const ageNode = age ? (
    <Box component="span" title="Time since the PR was ready for review" sx={{ flex: '0 0 auto', fontSize: 10, fontWeight: 400, color: 'text.secondary', whiteSpace: 'nowrap', opacity: 0.85 }}>
      {age}
    </Box>
  ) : null
  // PR-only cards have no heading row, so the age rides along on the step line.
  const ageOnStep = !showHeading && Boolean(step)
  const showHead = showHeading || Boolean(closedLabel) || (Boolean(ageNode) && !ageOnStep)

  if (!showHead && !step) {
    return null
  }

  return (
    <Box sx={{ minWidth: 0, '& > [data-card-step]:first-of-type': { mt: 0 } }}>
      {showHead ? (
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

          {closedLabel ? (
            <Box component="span" sx={{ flex: '0 0 auto', fontSize: 10, color: TERTIARY_TEXT_COLOR, whiteSpace: 'nowrap' }}>
              {closedLabel}
            </Box>
          ) : null}

          {ageOnStep ? null : ageNode}
        </Box>
      ) : null}

      {step ? <DevelopmentCardStep step={step} trailing={ageOnStep ? ageNode : undefined} /> : null}
    </Box>
  )
}
