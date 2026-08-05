import { Badge, Card, Typography } from '@mui/material'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import type { WorkItemSummary } from '../../../ado/queryEngine'
import { getWorkItemIconUrlWithThemeColor } from '../utils/workItemIconColor'

type WorkItemCardProps = {
  item: WorkItemSummary
}

export function WorkItemCard({ item }: WorkItemCardProps) {
  const theme = useTheme()

  return (
    <Card
      elevation={2}
      sx={{
        p: 1,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
        overflow: 'visible',
        transition: 'box-shadow 120ms ease, border-color 120ms ease',
        '&:hover': {
          boxShadow: 4,
          borderColor: 'grey.300',
        },
        minWidth: 150,
        maxWidth: 220,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 0.75,
        }}
      >
        <Box
          component="a"
          href={item.workItemUrl}
          target="_blank"
          rel="noreferrer noopener"
          sx={{
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
                color: 'text.secondary',
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

        {typeof item.effort === 'number' ? (
          <Badge
            badgeContent={item.effort}
            color="primary"
            max={999}
            showZero
            overlap="rectangular"
            anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            sx={{
              flexShrink: 0,
              mt: 0.25,
              mr: 0.25,
              '& .MuiBadge-badge': {
                right: -8,
                top: -4,
              },
            }}
          >
            <Box sx={{ width: 10, height: 10 }} />
          </Badge>
        ) : null}
      </Box>
    </Card>
  )
}
