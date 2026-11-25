import { useId } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton } from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgWindowPopout from '@stratakit/icons/window-popout.svg'
import type { WorkItemSummary } from '../../../ado/types'
import { useWorkItemPreview, type WorkItemPreviewSource } from '../hooks/useWorkItemPreview'
import { WorkItemTypeIcon } from './WorkItemCardParts'
import { WorkItemPreviewDetails } from './WorkItemPreviewPanel'

export function QuickAssignPreviewDialog({ item, source, workItemUrl, onClose }: {
  item: WorkItemSummary
  source: WorkItemPreviewSource
  workItemUrl: string
  onClose: () => void
}) {
  const headingId = useId()
  const load = useWorkItemPreview(source, item.id)

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby={headingId}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', pr: 2 }}>
        <DialogTitle id={headingId} render={<h2 />} sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          <Box component="span" sx={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'text.secondary', mb: 1 }}>
            <WorkItemTypeIcon item={item} /> {item.workItemType} {item.id}
          </Box>
          {item.title}
        </DialogTitle>
        <IconButton autoFocus nativeButton label="Close preview" onClick={onClose} sx={{ mt: 2 }}>
          <Icon href={svgDismiss} />
        </IconButton>
      </Box>
      <DialogContent sx={{ overscrollBehavior: 'contain' }}>
        <WorkItemPreviewDetails
          item={{ workItemType: item.workItemType ?? '', workItemUrl }}
          load={load}
          images={source.images}
        />
      </DialogContent>
      <DialogActions>
        <Button href={workItemUrl} target="_blank" rel="noopener noreferrer" startIcon={<Icon href={svgWindowPopout} />}>
          Open in Azure DevOps
        </Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
