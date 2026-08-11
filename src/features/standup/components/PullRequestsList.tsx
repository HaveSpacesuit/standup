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

function formatCheckName(item: { name: string, expired: boolean }): string {
  return item.expired ? `${item.name} (expired)` : item.name
}

function formatCheckList(names: string[]): string {
  return names.join(', ')
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
                const checksFooter = (
                  <Box sx={{ display: 'grid', gap: 0.35, minWidth: 0 }}>
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
                )

                return (
                  <Box key={pullRequest.id} sx={{ display: 'grid', gap: 0.5 }}>
                    <Typography variant="body-sm" color="text.secondary">
                      {getAuthorLabel(pullRequest)} • Opened {formatOpenedDate(pullRequest.recentActivityAt)} ({formatAge(pullRequest.recentActivityAt)})
                    </Typography>
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
