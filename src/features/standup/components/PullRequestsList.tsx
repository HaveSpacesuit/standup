import { Box, Card, CardContent, CircularProgress, Skeleton, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgValidate from '@stratakit/icons/validate.svg'
import svgStopwatch from '@stratakit/icons/stopwatch.svg'
import svgError from '@stratakit/icons/error.svg'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { WorkItemCard } from './WorkItemCard'

type PullRequestsListProps = {
  isLoading: boolean
  pullRequests: WorkItemSummary[]
  fullApprovalThreshold: number
}

type PullRequestSection = {
  key: string
  title: string
  items: WorkItemSummary[]
}

type MergeReadiness = 'blocked' | 'waiting-on-checks' | 'waiting-on-reviewers' | 'ready-to-merge'

function formatCheckName(item: { name: string, expired: boolean }): string {
  return item.expired ? `${item.name} (expired)` : item.name
}

function formatAge(value: string | undefined): string {
  if (!value) {
    return ''
  }

  const openedAt = Date.parse(value)
  if (Number.isNaN(openedAt)) {
    return ''
  }

  const elapsedHours = Math.floor(Math.max(Date.now() - openedAt, 0) / (1000 * 60 * 60))
  if (elapsedHours < 24) {
    return `${elapsedHours}h old`
  }

  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 14) {
    return `${elapsedDays}d old`
  }

  return `${Math.floor(elapsedDays / 7)}w old`
}

function formatCheckList(names: string[]): string {
  return names.join(', ')
}

function getRequiredChecksState(item: WorkItemSummary): 'passing' | 'pending' | 'failing' {
  const checks = item.pullRequest?.checks?.checks ?? []
  const requiredChecks = checks.filter((check) => !check.optional)

  if (requiredChecks.some((check) => check.state === 'failing')) {
    return 'failing'
  }

  if (requiredChecks.some((check) => check.state === 'pending')) {
    return 'pending'
  }

  return 'passing'
}

function getMergeReadiness(item: WorkItemSummary, fullApprovalThreshold: number): MergeReadiness {
  const reviewState = item.pullRequest?.reviewState
  const approvalCount = item.pullRequest?.approvalCount ?? 0
  const requiredChecksState = getRequiredChecksState(item)

  if (
    requiredChecksState === 'failing'
    || reviewState === 'rejected'
    || reviewState === 'waiting-for-author'
  ) {
    return 'blocked'
  }

  if (requiredChecksState === 'pending') {
    return 'waiting-on-checks'
  }

  if (approvalCount < fullApprovalThreshold) {
    return 'waiting-on-reviewers'
  }

  return 'ready-to-merge'
}

function getChecksPresentation(item: WorkItemSummary): {
  iconHref: string
  color: string
  text?: string
  optionalItems: Array<{
    iconHref: string
    color: string
    text: string
  }>
} {
  const checks = item.pullRequest?.checks
  if (!checks || checks.checks.length === 0) {
    return {
      iconHref: svgStopwatch,
      color: 'warning.main',
      text: 'Checks pending',
      optionalItems: [],
    }
  }

  const requiredChecks = checks.checks.filter((check) => !check.optional)
  const optionalChecks = checks.checks.filter((check) => check.optional)

  const requiredFailing = requiredChecks.filter((check) => check.state === 'failing').map(formatCheckName)
  if (requiredFailing.length > 0) {
    return {
      iconHref: svgError,
      color: 'error.main',
      text: formatCheckList(requiredFailing),
      optionalItems: [],
    }
  }

  const requiredPending = requiredChecks.filter((check) => check.state === 'pending').map(formatCheckName)
  if (requiredPending.length > 0) {
    return {
      iconHref: svgStopwatch,
      color: 'warning.main',
      text: formatCheckList(requiredPending),
      optionalItems: [],
    }
  }

  const optionalFailing = optionalChecks.filter((check) => check.state === 'failing').map(formatCheckName)
  const optionalPending = optionalChecks.filter((check) => check.state === 'pending').map(formatCheckName)

  return {
    iconHref: svgValidate,
    color: 'success.main',
    text: undefined,
    optionalItems: [
      ...(optionalFailing.length > 0
        ? [{
            iconHref: svgError,
            color: 'error.main',
            text: `Optional failing: ${formatCheckList(optionalFailing)}`,
          }]
        : []),
      ...(optionalPending.length > 0
        ? [{
            iconHref: svgStopwatch,
            color: 'warning.main',
            text: `Optional pending: ${formatCheckList(optionalPending)}`,
          }]
        : []),
    ],
  }
}

function createSections(pullRequests: WorkItemSummary[], fullApprovalThreshold: number): PullRequestSection[] {
  const readyToMerge = pullRequests.filter((item) => getMergeReadiness(item, fullApprovalThreshold) === 'ready-to-merge')
  const waitingOnChecks = pullRequests.filter((item) => getMergeReadiness(item, fullApprovalThreshold) === 'waiting-on-checks')
  const waitingOnReviewers = pullRequests.filter((item) => getMergeReadiness(item, fullApprovalThreshold) === 'waiting-on-reviewers')
  const blocked = pullRequests.filter((item) => getMergeReadiness(item, fullApprovalThreshold) === 'blocked')

  return [
    { key: 'ready-to-merge', title: 'Ready to merge', items: readyToMerge },
    { key: 'waiting-on-checks', title: 'Waiting on checks', items: waitingOnChecks },
    { key: 'waiting-on-reviewers', title: 'Waiting on reviewers', items: waitingOnReviewers },
    { key: 'blocked', title: 'Blocked', items: blocked },
  ].filter((section) => section.items.length > 0)
}

export function PullRequestsList({ isLoading, pullRequests, fullApprovalThreshold }: PullRequestsListProps) {
  if (isLoading) {
    return (
      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.default',
        }}
      >
        <Box
          sx={{
            px: 2,
            py: 1.25,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <CircularProgress size={18} />
          <Box>
            <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
              Loading pull requests...
            </Typography>
            <Typography variant="body-sm" color="text.secondary">
              Fetching active PRs, reviews, and policy checks.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
          <Box sx={{ maxWidth: 640, mx: 'auto', display: 'grid', gap: 3, alignContent: 'start' }}>
            {['Ready to merge', 'Waiting on checks', 'Waiting on reviewers', 'Blocked'].map((title, sectionIndex) => (
              <Box key={`loading-section-${title}`}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                  <Typography variant="body-md" sx={{ fontWeight: 700 }}>
                    {title}
                  </Typography>
                  <Skeleton variant="rounded" width={18} height={16} />
                </Box>

                <Box sx={{ display: 'grid', gap: 1 }}>
                  {Array.from({ length: 1 }).map((_, rowIndex) => (
                    <Card key={`loading-card-${sectionIndex}-${rowIndex}`} sx={{ borderRadius: 2 }}>
                      <CardContent sx={{ p: 1.5 }}>
                        <Box sx={{ display: 'grid', gap: 0.9 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                            <Skeleton variant="text" width="66%" height={22} />
                            <Skeleton variant="rounded" width={54} height={18} />
                          </Box>
                          <Skeleton variant="text" width="92%" height={16} />
                          <Skeleton variant="text" width="40%" height={16} />
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
                            <Skeleton variant="circular" width={16} height={16} />
                            <Skeleton variant="text" width={120} height={16} />
                          </Box>
                        </Box>
                      </CardContent>
                      <Box
                        sx={{
                          px: 1.5,
                          py: 0.9,
                          borderTop: '1px solid',
                          borderColor: 'divider',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Skeleton variant="text" width="55%" height={14} />
                        <Skeleton variant="text" width={52} height={14} />
                      </Box>
                    </Card>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    )
  }

  if (pullRequests.length === 0) {
    return (
      <Box
        component="main"
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: 3,
          bgcolor: 'background.paper',
        }}
      >
        <Card sx={{ width: '100%', maxWidth: 560 }}>
          <CardContent sx={{ p: 3 }}>
            <Typography variant="headline-sm" render={<h1 />} sx={{ fontWeight: 700, mb: 1 }}>
              No open pull requests
            </Typography>
            <Typography variant="body-sm" color="text.secondary">
              No active, non-draft pull requests are currently open for members of this team.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    )
  }

  const sections = createSections(pullRequests, fullApprovalThreshold)

  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        p: 2,
        bgcolor: 'background.default',
      }}
    >
      <Box sx={{ maxWidth: 640, mx: 'auto', display: 'grid', gap: 3, alignContent: 'start' }}>
        {sections.map((section) => (
          <Box key={section.key}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
                <Typography variant="body-md" sx={{ fontWeight: 700 }}>
                  {section.title}
                </Typography>
                <Typography variant="body-sm" color="text.secondary" sx={{ fontWeight: 700, flex: '0 0 auto' }}>
                  {section.items.length}
                </Typography>
              </Box>

            <Box sx={{ display: 'grid', gap: 1 }}>
              {section.items.map((pullRequest) => {
                const checks = getChecksPresentation(pullRequest)
                const age = formatAge(pullRequest.recentActivityAt)
                const checksFooter = (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'grid', gap: 0.35, minWidth: 0, flex: '1 1 auto' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: checks.color, minWidth: 0 }}>
                      <Icon href={checks.iconHref} size="regular" />
                      {checks.text ? (
                        <Typography
                          variant="body-sm"
                          color="inherit"
                          sx={{
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1.2,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {checks.text}
                        </Typography>
                      ) : (
                        <Typography
                          variant="body-sm"
                          color="inherit"
                          sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1.2 }}
                        >
                          Required checks passing
                        </Typography>
                      )}
                    </Box>
                    {checks.optionalItems.map((optionalItem) => (
                      <Box key={`${pullRequest.id}:${optionalItem.text}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: optionalItem.color, minWidth: 0, pl: 2.5 }}>
                        <Icon href={optionalItem.iconHref} size="regular" />
                        <Typography
                          variant="body-sm"
                          color="inherit"
                          sx={{
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1.2,
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {optionalItem.text}
                        </Typography>
                      </Box>
                    ))}
                    </Box>
                    {age ? (
                      <Typography
                        variant="body-sm"
                        sx={{
                          flex: '0 0 auto',
                          fontSize: 10,
                          lineHeight: 1.1,
                          color: 'text.secondary',
                          opacity: 0.85,
                          whiteSpace: 'nowrap',
                          alignSelf: 'center',
                        }}
                      >
                        {age}
                      </Typography>
                    ) : null}
                  </Box>
                )

                return (
                  <Box key={pullRequest.id}>
                    <WorkItemCard item={pullRequest} footer={checksFooter} />
                  </Box>
                )
              })}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
