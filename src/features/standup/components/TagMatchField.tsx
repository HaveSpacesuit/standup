import { useEffect, useRef, useState, type RefObject } from 'react'
import { TextField, type TextFieldProps } from '@mui/material'

/** How long typing must pause before a typed tag match applies. */
export const TAG_MATCH_COMMIT_DELAY_MS = 400

type TagMatchFieldProps = {
  value: string
  onCommit: (tag: string) => void
  placeholder: string
  sx?: TextFieldProps['sx']
}

function applyPending(pending: RefObject<string | null>, commit: RefObject<(tag: string) => void>) {
  const tag = pending.current
  if (tag === null) {
    return
  }

  pending.current = null
  commit.current(tag)
}

/**
 * Edits a tag rule's match. Every rule change re-filters the whole board, so a typed match applies once typing pauses,
 * on Enter, on leaving the field, or when the dialog closes, not on each keystroke. The field is the only editor of its
 * rule's match, so it keeps its own text.
 */
export function TagMatchField({ value, onCommit, placeholder, sx }: TagMatchFieldProps) {
  const [draft, setDraft] = useState(value)
  const pending = useRef<string | null>(null)
  const commit = useRef(onCommit)

  useEffect(() => {
    commit.current = onCommit
  }, [onCommit])

  useEffect(() => {
    if (pending.current === null) {
      return
    }

    const timer = setTimeout(() => applyPending(pending, commit), TAG_MATCH_COMMIT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft])

  useEffect(() => () => applyPending(pending, commit), [])

  return (
    <TextField
      size="small"
      placeholder={placeholder}
      value={draft}
      onChange={(event) => {
        pending.current = event.target.value
        setDraft(event.target.value)
      }}
      onBlur={() => applyPending(pending, commit)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          applyPending(pending, commit)
        }
      }}
      sx={sx}
    />
  )
}
