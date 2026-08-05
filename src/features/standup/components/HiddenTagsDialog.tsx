import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
} from '@mui/material'

type HiddenTagsDialogProps = {
  open: boolean
  hiddenTags: string[]
  onClose: () => void
  onChange: (nextTags: string[]) => void
}

function normalizeTag(tag: string): string {
  return tag.trim()
}

function normalizeTagKey(tag: string): string {
  return normalizeTag(tag).toLowerCase()
}

function addTag(tags: string[], newTag: string): string[] {
  const normalized = normalizeTag(newTag)
  if (!normalized) {
    return tags
  }

  const newTagKey = normalizeTagKey(normalized)
  const hasTag = tags.some((tag) => normalizeTagKey(tag) === newTagKey)
  if (hasTag) {
    return tags
  }

  return [...tags, normalized]
}

function removeTag(tags: string[], tagToRemove: string): string[] {
  const removeKey = normalizeTagKey(tagToRemove)
  return tags.filter((tag) => normalizeTagKey(tag) !== removeKey)
}

export function HiddenTagsDialog({ open, hiddenTags, onClose, onChange }: HiddenTagsDialogProps) {
  const [newTag, setNewTag] = useState('')

  const sortedHiddenTags = useMemo(
    () => [...hiddenTags].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' })),
    [hiddenTags],
  )

  const handleAddTag = () => {
    const nextTags = addTag(hiddenTags, newTag)
    onChange(nextTags)
    setNewTag('')
  }

  const handleRemoveTag = (tag: string) => {
    onChange(removeTag(hiddenTags, tag))
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Hidden Tags Filter</DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.25 }}>
          Add one or more tags to hide matching work items from the board. Tag matching is case-insensitive.
        </Typography>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            label="Tag to hide"
            size="small"
            fullWidth
            value={newTag}
            onChange={(event) => setNewTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleAddTag()
              }
            }}
          />
          <Button
            size="small"
            variant="outlined"
            onClick={handleAddTag}
            disabled={normalizeTag(newTag).length === 0}
          >
            Add
          </Button>
        </Box>

        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body-sm" sx={{ mb: 0.75, fontWeight: 700 }}>
            Hidden tags
          </Typography>

          {sortedHiddenTags.length > 0 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {sortedHiddenTags.map((tag) => (
                <Chip key={tag} label={tag} size="small" onDelete={() => handleRemoveTag(tag)} />
              ))}
            </Box>
          ) : (
            <Typography variant="body-sm" color="text.secondary">
              No hidden tags configured.
            </Typography>
          )}
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
