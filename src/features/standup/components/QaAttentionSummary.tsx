import { Alert, Box, Button, Chip, Typography } from '@mui/material'
import type { AttentionItemsState } from '../hooks/useAttentionItems'
import { matchingAttentionTags } from '../utils/attentionTags'

export function QaAttentionSummary({ attention, tags, representedIds, onReview, onManage, onRetry }: {
  attention: AttentionItemsState
  tags: readonly string[]
  representedIds: ReadonlySet<number> | null
  onReview: (tag: string | null) => void
  onManage: () => void
  onRetry: () => void
}) {
  if (!tags.length) return (
    <Box sx={{ px: 2, py: 1, display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <Typography variant="body-sm" color="text.secondary">Attention tracking is off for this team.</Typography>
      <Button size="small" onClick={onManage}>Choose attention tags</Button>
    </Box>
  )
  if (attention.error) return (
    <Alert severity="warning" role="alert" action={<Button onClick={onRetry}>Retry</Button>}>
      Attention unavailable. Counts are unknown, not zero. {attention.error}
    </Alert>
  )
  const ready = !attention.loading && attention.syncedAt !== null
  const missing = representedIds && ready ? attention.items.filter((item) => !representedIds.has(item.id)).length : null
  return (
    <Box component="section" aria-label="Attention tags overview" aria-busy={attention.loading} sx={{
      px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0,
      borderInlineStart: '3px solid var(--stratakit-color-border-attention-base)',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="body-sm" sx={{ fontWeight: 700 }}>Attention tags</Typography>
        {tags.slice(0, 4).map((tag) => (
          <Chip key={tag} size="small" variant="outlined"
            label={`${tag} ${ready ? attention.items.filter((item) => matchingAttentionTags(item, [tag]).length).length : '—'}`}
            onClick={() => onReview(tag)} />
        ))}
        {tags.length > 4 ? <Typography variant="body-sm">+{tags.length - 4} tags</Typography> : null}
        <Button size="small" onClick={() => onReview(null)} sx={{ ml: 'auto' }}>
          {ready ? `Review ${attention.items.length} open items` : 'Review attention items'}
        </Button>
        <Button size="small" onClick={onManage}>Manage tags</Button>
      </Box>
      <Typography variant="body-sm" color="text.secondary" role="status">
        {ready
          ? missing === null ? 'QA board coverage is unavailable.' : `${missing} not shown on the current QA board.`
          : 'Checking open tagged items...'}
        {' '}Checks all iterations and open types in this team's area. Tag counts can overlap.
      </Typography>
    </Box>
  )
}
