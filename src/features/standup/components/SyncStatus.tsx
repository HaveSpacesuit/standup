import { Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { AppTooltip as Tooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { formatSyncedLabel } from '../utils/syncStatus'

const SYNC_LABEL_TICK_MS = 30_000

/** "Synced 5m ago" beside Refresh; it re-renders on a timer so the age stays current. */
export function SyncStatus({ syncedAt, isLoading }: { syncedAt: number | null, isLoading: boolean }) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (syncedAt === null) {
      return undefined
    }

    const timer = window.setInterval(() => setNow(Date.now()), SYNC_LABEL_TICK_MS)
    return () => window.clearInterval(timer)
  }, [syncedAt])

  const renderLabel = (text: string) => (
    <Typography
      variant="caption-md"
      sx={{
        color: TERTIARY_TEXT_COLOR,
        whiteSpace: 'nowrap',
        '@container (max-width: 960px)': {
          display: 'none',
        },
      }}
    >
      {text}
    </Typography>
  )

  if (isLoading) {
    return renderLabel('Syncing…')
  }

  if (syncedAt === null) {
    return null
  }

  const syncedTime = new Date(syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return (
    <Tooltip title={`Last synced with Azure DevOps at ${syncedTime}`} describeChild>
      {renderLabel(formatSyncedLabel(syncedAt, now))}
    </Tooltip>
  )
}
