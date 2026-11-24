import { Box } from '@mui/material'

export function AttentionTags({ tags }: { tags: readonly string[] }) {
  if (!tags.length) return null
  return (
    <Box component="span" role="group" aria-label="Attention tags" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center', minWidth: 0, mt: 0.5 }}>
      <Box component="span" sx={{ color: 'text.secondary', fontSize: 11 }}>Attention</Box>
      {tags.map((tag) => (
        <Box component="span" key={tag} sx={{
          px: 1, py: 0.25, border: '1px solid var(--stratakit-color-border-attention-muted)',
          borderRadius: 'var(--stratakit-radius-sm)', color: 'var(--stratakit-color-text-attention-base)',
          fontSize: 11, fontWeight: 600, overflowWrap: 'anywhere', minWidth: 0,
        }}>{tag}</Box>
      ))}
    </Box>
  )
}
