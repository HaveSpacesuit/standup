import { Box, Card, CardContent, CircularProgress, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgValidate from '@stratakit/icons/validate.svg'
import svgStopwatch from '@stratakit/icons/stopwatch.svg'
import svgError from '@stratakit/icons/error.svg'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { WorkItemCard } from './WorkItemCard'

type PullRequestsListProps = {
  isLoading: boolean
  pullRequests: WorkItemSummary[]
}

type PullRequestSection = {
  key: string
  title: string
  items: WorkItemSummary[]
}

function formatOpenedDate(value: string | undefined): string {
  if (!value) {
    return 'Unknown date'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed)
}

function formatAge(value: string | undefined): string {
  if (!value) {
    return 'unknown age'
  }

  const openedAt = Date.parse(value)
  if (Number.isNaN(openedAt)) {
    return 'unknown age'
  }

  const elapsedMs = Math.max(Date.now() - openedAt, 0)
  const elapsedHours = Math.floor(elapsedMs / (1000 * 60 * 60))

  if (elapsedHours < 24) {
    return `${elapsedHours}h old`
  }

  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 14) {
    return `${elapsedDays}d old`
  }

  const elapsedWeeks = Math.floor(elapsedDays / 7)
  return `${elapsedWeeks}w old`
}

function getAuthorLabel(item: WorkItemSummary): string {
  return item.assignedTo?.displayName?.trim()
    || item.assignedTo?.uniqueName?.trim()
    || 'Unknown author'
}

function getChecksPresentation(item: WorkItemSummary): {
  iconHref: string
  color: string
  text: string
} {
  const checks = item.pullRequest?.checks
  const expiredCount = checks?.checks.filter((check) => check.expired).length ?? 0
  const expiredSuffix = expiredCount > 0 ? `, ${expiredCount} expired` : ''

  if (!checks || checks.state === 'pending') {
    const pendingText = checks
      ? `Checks pending (${checks.passing} passing, ${checks.pending} pending${checks.total > 0 ? ` of ${checks.total}` : ''}${expiredSuffix})`
      : 'Checks pending'

    return {
      iconHref: svgStopwatch,
      color: 'warning.main',
      text: pendingText,
    }
  }

  if (checks.state === 'failing') {
    const detail = checks.failingNames.length > 0
      ? `: ${checks.failingNames.slice(0, 2).join(', ')}${checks.failingNames.length > 2 ? '…' : ''}`
      : ''

    return {
      iconHref: svgError,
      color: 'error.main',
      text: `Checks failing (${checks.failing} failing${detail}${expiredSuffix})`,
    }
  }

  return {
    iconHref: svgValidate,
    color: 'success.main',
    text: `Checks passing (${checks.passing}/${checks.total}${expiredSuffix})`,
  }
}

function getCheckStatePresentation(state: 'passing' | 'pending' | 'failing'): {
  iconHref: string
  color: string
  label: string
} {
  if (state === 'failing') {
    return {
      iconHref: svgError,
      color: 'error.main',
      label: 'Failing',
    }
  }

  if (state === 'pending') {
    return {
      iconHref: svgStopwatch,
      color: 'warning.main',
      label: 'Pending',
    }
  }

  return {
    iconHref: svgValidate,
    color: 'success.main',
    label: 'Passing',
  }
}

function createSections(pullRequests: WorkItemSummary[]): PullRequestSection[] {
  const approved = pullRequests.filter((item) => item.pullRequest?.reviewState === 'fully-approved')
  const partiallyApproved = pullRequests.filter((item) => item.pullRequest?.reviewState === 'partially-approved')
  const waitingForAuthor = pullRequests.filter((item) => item.pullRequest?.reviewState === 'waiting-for-author')
  const rejected = pullRequests.filter((item) => item.pullRequest?.reviewState === 'rejected')
  const other = pullRequests.filter((item) => !item.pullRequest?.reviewState)

  return [
    { key: 'approved', title: 'Approved', items: approved },
    { key: 'partially-approved', title: 'Partially approved', items: partiallyApproved },
    { key: 'waiting-for-author', title: 'Waiting for author', items: waitingForAuthor },
    { key: 'rejected', title: 'Rejected', items: rejected },
    { key: 'open', title: 'Open', items: other },
  ].filter((section) => section.items.length > 0)
}

export function PullRequestsList({ isLoading, pullRequests }: PullRequestsListProps) {
  if (isLoading) {
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
            Loading pull requests...
          </Typography>
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

  const sections = createSections(pullRequests)

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
      <Box sx={{ maxWidth: 960, display: 'grid', gap: 2, alignContent: 'start' }}>
        {sections.map((section) => (
          <Box key={section.key}>
            <Typography variant="body-md" sx={{ fontWeight: 700, mb: 0.75 }}>
              {section.title} ({section.items.length})
            </Typography>

            <Box sx={{ display: 'grid', gap: 1 }}>
              {section.items.map((pullRequest) => {
                const checks = getChecksPresentation(pullRequest)

                return (
                  <Box key={pullRequest.id} sx={{ display: 'grid', gap: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: checks.color }}>
                      <Icon href={checks.iconHref} size="regular" />
                      <Typography variant="body-sm" color="inherit" sx={{ fontWeight: 700 }}>
                        {checks.text}
                      </Typography>
                    </Box>
                    <Typography variant="body-sm" color="text.secondary">
                      {getAuthorLabel(pullRequest)} • Opened {formatOpenedDate(pullRequest.recentActivityAt)} ({formatAge(pullRequest.recentActivityAt)})
                    </Typography>
                      {(pullRequest.pullRequest?.checks?.checks?.length ?? 0) > 0 ? (
                        <Box sx={{ display: 'grid', gap: 0.3, pl: 0.25 }}>
                          {pullRequest.pullRequest?.checks?.checks.map((check) => {
                            const checkPresentation = getCheckStatePresentation(check.state)
                            const checkLabel = check.expired
                              ? `${checkPresentation.label} (expired)`
                              : checkPresentation.label

                            return (
                              <Box key={`${pullRequest.id}:${check.name}:${check.source}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3, color: checkPresentation.color, minWidth: 90 }}>
                                  <Icon href={checkPresentation.iconHref} size="regular" />
                                  <Typography variant="body-sm" color="inherit" sx={{ fontSize: 11, fontWeight: 700 }}>
                                    {checkLabel}
                                  </Typography>
                                </Box>
                                <Typography variant="body-sm" sx={{ fontSize: 11 }}>
                                  {check.name}
                                  {check.optional ? ' (optional)' : ''}
                                </Typography>
                              </Box>
                            )
                          })}
                        </Box>
                      ) : null}
                    <WorkItemCard item={pullRequest} />
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
