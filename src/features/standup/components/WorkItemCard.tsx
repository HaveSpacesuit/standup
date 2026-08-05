import { Badge, Card, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { getWorkItemIconUrlWithThemeColor } from '../utils/workItemIconColor'

type WorkItemCardProps = {
  item: WorkItemSummary
}

type StatusPaletteKey = 'error' | 'info' | 'primary' | 'warning' | 'success'

function getStatusPaletteKey(status: WorkItemSummary['status']): StatusPaletteKey {
  switch (status) {
    case 'Blocked':
      return 'error'
    case 'New':
      return 'info'
    case 'Active':
      return 'primary'
    case 'Review':
      return 'warning'
    case 'Done':
      return 'success'
  }
}

function getStatusTintOpacity(status: WorkItemSummary['status'], mode: 'light' | 'dark'): number {
  if (mode === 'dark') {
    switch (status) {
      case 'Blocked':
        return 0.16
      case 'New':
        return 0.14
      case 'Active':
        return 0.18
      case 'Review':
        return 0.16
      case 'Done':
        return 0.12
    }
  }

  switch (status) {
    case 'Blocked':
      return 0.07
    case 'New':
      return 0.05
    case 'Active':
      return 0.08
    case 'Review':
      return 0.07
    case 'Done':
      return 0.05
  }
}

export function WorkItemCard({ item }: WorkItemCardProps) {
  const theme = useTheme()
  const statusPaletteKey = getStatusPaletteKey(item.status)
  const statusColor = theme.palette[statusPaletteKey].main
  const tintOpacity = getStatusTintOpacity(item.status, theme.palette.mode)

  return (
    <Card
      elevation={2}
      sx={{
        position: 'relative',
        p: 1,
        border: '1px solid',
        borderColor: statusColor,
        borderRadius: 1,
        bgcolor: 'background.paper',
        overflow: 'visible',
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          backgroundColor: statusColor,
          opacity: tintOpacity,
          pointerEvents: 'none',
        },
        '&:hover': {
          boxShadow: 4,
          borderColor: statusColor,
        },
        width: '100%',
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
        }}
      >
        {typeof item.effort === 'number' ? (
          <Box
            component="span"
            sx={{
              float: 'right',
              ml: 0.75,
              mt: 0.125,
              lineHeight: 0,
            }}
          >
            <Badge
              badgeContent={item.effort}
              color={statusPaletteKey}
              max={999}
              inline
              size="small"
              showZero
            >
              <Box sx={{ width: 0, height: 0 }} />
            </Badge>
          </Box>
        ) : null}

        <Box
          component="a"
          href={item.workItemUrl}
          target="_blank"
          rel="noreferrer noopener"
          sx={{
            display: 'block',
            minWidth: 0,
            color: 'text.primary',
            textDecoration: 'none',
            '&:hover': {
              textDecoration: 'underline',
            },
          }}
        >
          <Typography
            variant="body-sm"
            sx={{
              lineHeight: 1.25,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 3,
              overflow: 'hidden',
              wordBreak: 'break-word',
            }}
          >
            {item.workItemIconUrl ? (
              <Box
                component="img"
                src={getWorkItemIconUrlWithThemeColor(
                  item.workItemIconUrl,
                  item.workItemType,
                  theme.palette,
                )}
                alt=""
                sx={{
                  width: 14,
                  height: 14,
                  display: 'inline-block',
                  verticalAlign: 'text-bottom',
                  mr: 0.5,
                }}
              />
            ) : null}
            <Box
              component="span"
              sx={{
                fontWeight: 700,
                color: statusColor,
                mr: 0.5,
              }}
            >
              {item.id}
            </Box>
            <Box component="span" sx={{ fontWeight: 400 }}>
              {item.title}
            </Box>
          </Typography>
        </Box>

        {item.sprintName ? (
          <Typography
            variant="body-sm"
            sx={{
              mt: 0.35,
              clear: 'both',
              fontSize: 11,
              lineHeight: 1.2,
              color: 'text.secondary',
              opacity: 0.85,
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 1,
              overflow: 'hidden',
            }}
          >
            Sprint {item.sprintName}
          </Typography>
        ) : null}
      </Box>
    </Card>
  )
}
