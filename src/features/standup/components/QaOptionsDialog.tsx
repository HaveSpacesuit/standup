import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import type { QaOptions, QaStateGroupOverrides, QaTagFilterRule } from '../utils/qaOptions'
import { createTagFilterRule } from '../utils/qaOptions'
import type { ProjectWorkItemState } from '../../../ado/queryEngine'

type QaOptionsDialogProps = {
  open: boolean
  options: QaOptions
  onClose: () => void
  onChange: (next: QaOptions) => void
  projectWorkItemStates: ProjectWorkItemState[]
  projectWorkItemTypes: string[]
  projectWorkItemStatesLoading: boolean
}

type StateGroupKey = keyof QaStateGroupOverrides

const STATE_GROUP_SECTIONS: Array<{ key: StateGroupKey; label: string; description: string }> = [
  { key: 'testing', label: 'Ready for QA', description: 'Items in these states will appear in the Ready for QA column.' },
  { key: 'done', label: 'Recently completed', description: 'Items that entered these states after being in Ready for QA will appear in the Recently completed column.' },
  { key: 'development', label: 'Needs follow-up', description: 'Items that returned to these states after being in Ready for QA will appear in the Needs follow-up column.' },
  { key: 'new', label: 'Newly added', description: 'Items in these states that were created recently will always appear in the Newly added column.' },
]

function removeGeneralFilter(options: QaOptions, id: string): QaOptions {
  return { ...options, generalFilters: options.generalFilters.filter((r) => r.id !== id) }
}

function getStateGroups(options: QaOptions): QaStateGroupOverrides {
  return options.stateGroups ?? { testing: [], done: [], development: [], new: [] }
}

export function QaOptionsDialog({
  open,
  options,
  onClose,
  onChange,
  projectWorkItemStates,
  projectWorkItemTypes,
  projectWorkItemStatesLoading,
}: QaOptionsDialogProps) {
  // Edit against a local draft so expensive query-affecting changes (the work item type
  // allow-list) are only committed — and the data reload only triggered — when the dialog closes.
  const [draft, setDraft] = useState<QaOptions>(options)
  const [newTagInput, setNewTagInput] = useState('')

  useEffect(() => {
    if (open) {
      setDraft(options)
      setNewTagInput('')
    }
    // Only re-sync the draft when the dialog is (re)opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const { generalFilters, includeWorkItemTypes } = draft
  const stateGroups = getStateGroups(draft)
  const tagFilters = generalFilters.filter((r): r is QaTagFilterRule => r.type === 'tag')

  const handleClose = () => {
    onChange(draft)
    onClose()
  }

  const handleAddTag = () => {
    const value = newTagInput.trim()
    if (!value) {
      return
    }
    setDraft((current) => {
      const alreadyExists = current.generalFilters.some(
        (r) => r.type === 'tag' && r.tagMatch.trim().toLowerCase() === value.toLowerCase(),
      )
      if (alreadyExists) {
        return current
      }
      return { ...current, generalFilters: [...current.generalFilters, createTagFilterRule(value)] }
    })
    setNewTagInput('')
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>QA Options</DialogTitle>

      <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>

        {/* ── Work item types to display (opt-in allow-list) ── */}
        <Box>
          <Typography variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
            Work item types
          </Typography>
          <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.5 }}>
            Select which work item types to display. When left empty, all types are shown.
          </Typography>

          {projectWorkItemStatesLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body-sm" color="text.secondary">Loading types…</Typography>
            </Box>
          ) : projectWorkItemTypes.length === 0 ? (
            <Typography variant="body-sm" color="text.secondary">
              No work item types found for this project.
            </Typography>
          ) : (
            <Select
              multiple
              size="small"
              fullWidth
              displayEmpty
              value={includeWorkItemTypes}
              input={<OutlinedInput />}
              onChange={(event) => {
                const nextValue = typeof event.target.value === 'string'
                  ? event.target.value.split(',')
                  : event.target.value
                setDraft((current) => ({ ...current, includeWorkItemTypes: nextValue }))
              }}
              renderValue={(values) =>
                values.length === 0
                  ? <span style={{ opacity: 0.5 }}>All types</span>
                  : values.join(', ')
              }
              MenuProps={{ slotProps: { paper: { style: { maxHeight: 300 } } } }}
            >
              {projectWorkItemTypes.map((type) => (
                <MenuItem key={type} value={type} dense>
                  <Checkbox checked={includeWorkItemTypes.includes(type)} />
                  <ListItemText primary={type} />
                </MenuItem>
              ))}
            </Select>
          )}
        </Box>

        <Divider />

        {/* ── Tag filters (chip container + add input) ── */}
        <Box>
          <Typography variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
            Tag filters
          </Typography>
          <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.5 }}>
            Items with a tag matching any of these entries will be hidden from all columns.
          </Typography>

          {tagFilters.length > 0 ? (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
              {tagFilters.map((rule) => (
                <Chip
                  key={rule.id}
                  label={rule.tagMatch}
                  size="small"
                  variant="outlined"
                  onDelete={() => setDraft((current) => removeGeneralFilter(current, rule.id))}
                />
              ))}
            </Box>
          ) : (
            <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.5 }}>
              No tag filters configured. All items will be shown.
            </Typography>
          )}

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Add tag filter (case-insensitive partial match)"
              value={newTagInput}
              onChange={(event) => setNewTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  handleAddTag()
                }
              }}
            />
            <Button size="small" variant="outlined" onClick={handleAddTag} disabled={!newTagInput.trim()}>
              Add
            </Button>
          </Box>
        </Box>

        <Divider />

        {/* ── Column state classification ── */}
        <Box>
          <Typography variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
            Column classification
          </Typography>
          <Typography variant="body-sm" color="text.secondary" sx={{ mb: 2 }}>
            Select which work item states map to each column. When left empty, built-in defaults for this project are used.
          </Typography>

          {projectWorkItemStatesLoading ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body-sm" color="text.secondary">Loading states…</Typography>
            </Box>
          ) : projectWorkItemStates.length === 0 ? (
            <Typography variant="body-sm" color="text.secondary">
              No states found for this project.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {STATE_GROUP_SECTIONS.map(({ key, label, description }) => {
                const selected = stateGroups[key]
                return (
                  <Box key={key}>
                    <Typography variant="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>
                      {label}
                    </Typography>
                    <Typography variant="body-sm" color="text.secondary" sx={{ mb: 0.75 }}>
                      {description}
                    </Typography>
                    <Select
                      multiple
                      size="small"
                      fullWidth
                      displayEmpty
                      value={selected}
                      input={<OutlinedInput />}
                      onChange={(event) => {
                        const nextValue = typeof event.target.value === 'string'
                          ? event.target.value.split(',')
                          : event.target.value
                        const nextGroups: QaStateGroupOverrides = { ...stateGroups, [key]: nextValue }
                        const allEmpty = Object.values(nextGroups).every((arr) => arr.length === 0)
                        setDraft((current) => ({ ...current, stateGroups: allEmpty ? null : nextGroups }))
                      }}
                      renderValue={(values) =>
                        values.length === 0
                          ? <span style={{ opacity: 0.5 }}>Using defaults…</span>
                          : values.join(', ')
                      }
                      MenuProps={{ slotProps: { paper: { style: { maxHeight: 300 } } } }}
                    >
                      {projectWorkItemStates.map((state) => (
                        <MenuItem key={state.name} value={state.name} dense>
                          <Checkbox checked={selected.includes(state.name)} />
                          <ListItemText primary={state.name} />
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>
                )
              })}
            </Box>
          )}
        </Box>

      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
