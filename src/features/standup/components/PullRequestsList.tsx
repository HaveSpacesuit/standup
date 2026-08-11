import { Box, Card, CardContent, Typography } from '@mui/material'
import { Icon } from '@stratakit/mui'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { getPullRequestSections } from '../hooks/pullRequestSections'
import { PullRequestsLoadingState } from './PullRequestsLoadingState'
import { getChecksPresentation } from './pullRequestChecksPresentation'
import { WorkItemCard } from './WorkItemCard'

type PullRequestsListProps = {
  isLoading: boolean
  pullRequests: WorkItemSummary[]
  fullApprovalThreshold: number
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
  if (elapsedHours === 0) {
    return 'Just now'
  }

  if (elapsedHours < 24) {
    return `${elapsedHours}h old`
  }

  const elapsedDays = Math.floor(elapsedHours / 24)
  if (elapsedDays < 14) {
    return `${elapsedDays}d old`
  }

  return `${Math.floor(elapsedDays / 7)}w old`
}

export function PullRequestsList({ isLoading, pullRequests, fullApprovalThreshold }: PullRequestsListProps) {
  if (isLoading) {
    return <PullRequestsLoadingState />
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

  const sections = getPullRequestSections(pullRequests, fullApprovalThreshold)

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
                      <Box
                        key={`${pullRequest.id}:${optionalItem.text}`}
                        sx={{
                          minWidth: 0,
                          pl: 2.4,
                        }}
                      >
                        <Typography
                          variant="body-sm"
                          color={optionalItem.color}
                          sx={{
                            fontSize: 11,
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
