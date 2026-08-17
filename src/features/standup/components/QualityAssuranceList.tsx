import { Box, Button, Card, CardContent, Typography } from '@mui/material'
import { useState } from 'react'
import { useTheme } from '@mui/material/styles'
import { QualityAssuranceLoadingState } from './QualityAssuranceLoadingState'
import { WorkItemCard } from './WorkItemCard'
import type { QualityAssuranceBucket } from '../utils/qualityAssuranceBuckets'
import {
  getQaBucketAccentColor,
  getQaColumnBackground,
  getQaColumnBorderColor,
  getQaHeaderBackground,
} from '../utils/qualityAssuranceColumnStyles'

const COLLAPSED_ITEM_LIMIT = 8

type QualityAssuranceListProps = {
  isLoading: boolean
  error: string | null
  buckets: QualityAssuranceBucket[]
  colorScheme: 'light' | 'dark'
}

export function QualityAssuranceList({ isLoading, error, buckets, colorScheme }: QualityAssuranceListProps) {
  const theme = useTheme()
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({})

  if (isLoading) {
    return <QualityAssuranceLoadingState colorScheme={colorScheme} />
  }

  if (error) {
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
              Unable to load QA activity
            </Typography>
            <Typography variant="body-sm" color="text.secondary">
              {error}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    )
  }

  const totalItems = buckets.reduce((count, bucket) => count + bucket.items.length, 0)

  if (totalItems === 0) {
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
              No QA items
            </Typography>
            <Typography variant="body-sm" color="text.secondary">
              No recently discovered items matched the QA buckets for this team.
            </Typography>
          </CardContent>
        </Card>
      </Box>
    )
  }

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
      <Box
        sx={{
          maxWidth: 1600,
          mx: 'auto',
          display: 'grid',
          gap: 1.5,
          alignContent: 'start',
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, minmax(0, 1fr))',
            xl: 'repeat(4, minmax(0, 1fr))',
          },
        }}
      >
        {buckets.map((bucket) => {
          const accentColor = getQaBucketAccentColor(bucket.id, theme.palette)
          const isExpanded = expandedColumns[bucket.id] === true
          const visibleItems = isExpanded ? bucket.items : bucket.items.slice(0, COLLAPSED_ITEM_LIMIT)
          const hiddenCount = Math.max(bucket.items.length - visibleItems.length, 0)

          return (
            <Card
              key={bucket.id}
              sx={{
                minWidth: 0,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid',
                borderColor: getQaColumnBorderColor(accentColor, colorScheme),
              }}
            >
              <CardContent
                sx={{
                  p: 1.5,
                  pb: 1.25,
                  flex: '0 0 auto',
                  borderBottom: '1px solid',
                  borderColor: getQaColumnBorderColor(accentColor, colorScheme),
                  bgcolor: getQaHeaderBackground(accentColor, colorScheme),
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box
                    sx={{
                      width: 4,
                      alignSelf: 'stretch',
                      minHeight: 18,
                      borderRadius: 999,
                      bgcolor: accentColor,
                      flex: '0 0 auto',
                    }}
                  />
                  <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, flex: 1, minWidth: 0 }}>
                    <Typography variant="body-md" sx={{ fontWeight: 700 }}>
                      {bucket.title}
                    </Typography>
                    <Typography variant="body-sm" sx={{ fontWeight: 700, color: accentColor, flex: '0 0 auto' }}>
                      {bucket.items.length}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>

              <Box
                sx={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  p: 1.25,
                  display: 'grid',
                  gap: 1,
                  alignContent: 'start',
                  bgcolor: getQaColumnBackground(accentColor, colorScheme),
                }}
              >
                {visibleItems.map((item) => (
                  <Box key={item.id}>
                    <WorkItemCard item={item} />
                  </Box>
                ))}

                {hiddenCount > 0 ? (
                  <Button
                    size="small"
                    variant="text"
                    sx={{ justifySelf: 'start', px: 0.5, minWidth: 0 }}
                    onClick={() => setExpandedColumns((current) => ({ ...current, [bucket.id]: true }))}
                  >
                    Show {hiddenCount} more
                  </Button>
                ) : null}

                {isExpanded && bucket.items.length > COLLAPSED_ITEM_LIMIT ? (
                  <Button
                    size="small"
                    variant="text"
                    sx={{ justifySelf: 'start', px: 0.5, minWidth: 0 }}
                    onClick={() => setExpandedColumns((current) => ({ ...current, [bucket.id]: false }))}
                  >
                    Show less
                  </Button>
                ) : null}
              </Box>
            </Card>
          )
        })}
      </Box>
    </Box>
  )
}
