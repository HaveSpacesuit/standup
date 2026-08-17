import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import type { QaFilterRule, QaFilterRuleType, QaOptions, QaStateGroupOverrides } from '../utils/qaOptions'
import { createQaFilterRule } from '../utils/qaOptions'
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

const RULE_TYPE_OPTIONS: Array<{ value: QaFilterRuleType; label: string }> = [
  { value: 'work-item-type', label: 'Work item type' },
  { value: 'tag', label: 'Tag' },
]

type StateGroupKey = keyof QaStateGroupOverrides

const STATE_GROUP_SECTIONS: Array<{ key: StateGroupKey; label: string; description: string }> = [
  { key: 'testing', label: 'Ready for QA', description: 'Items in these states will appear in the Ready for QA column.' },
  { key: 'done', label: 'Recently completed', description: 'Items that entered these states after being in Ready for QA will appear in the Recently completed column.' },
  { key: 'development', label: 'Needs follow-up', description: 'Items that returned to these states after being in Ready for QA will appear in the Needs follow-up column.' },
  { key: 'new', label: 'Newly added', description: 'Items in these states that were created recently will always appear in the Newly added column.' },
]

function updateGeneralFilter(options: QaOptions, index: number, next: QaFilterRule): QaOptions {
  const filters = [...options.generalFilters]
  filters[index] = next
  return { ...options, generalFilters: filters }
}

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
  const { generalFilters } = options
  const stateGroups = getStateGroups(options)

  const handleAddRule = () => {
    onChange({
      ...options,
      generalFilters: [...generalFilters, createQaFilterRule('tag')],
    })
  }

  const handleRuleTypeChange = (index: number, nextType: QaFilterRuleType) => {
    onChange(updateGeneralFilter(options, index, createQaFilterRule(nextType)))
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>QA Options</DialogTitle>

      <DialogContent sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>

        {/* ── General filters ── */}
        <Box>
          <Typography variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
            General filters
          </Typography>
          <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.5 }}>
            Items matching any of these rules will be hidden from all columns.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {generalFilters.length > 0 ? (
              generalFilters.map((rule, index) => (
                <Box
                  key={rule.id}
                  sx={{ display: 'grid', gridTemplateColumns: '140px 1fr auto', gap: 1, alignItems: 'center' }}
                >
                  {/* Rule type selector */}
                  <Select
                    size="small"
                    value={rule.type}
                    onChange={(event) => handleRuleTypeChange(index, event.target.value as QaFilterRuleType)}
                  >
                    {RULE_TYPE_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>

                  {/* Rule value input */}
                  {rule.type === 'work-item-type' ? (
                    <Select
                      size="small"
                      displayEmpty
                      value={rule.workItemType}
                      onChange={(event) =>
                        onChange(updateGeneralFilter(options, index, { ...rule, workItemType: event.target.value }))
                      }
                      renderValue={(value) => value || <span style={{ opacity: 0.5 }}>Select type…</span>}
                    >
                      {projectWorkItemTypes.map((type) => (
                        <MenuItem key={type} value={type}>
                          {type}
                        </MenuItem>
                      ))}
                    </Select>
                  ) : (
                    <TextField
                      size="small"
                      placeholder="Tag partial match (case-insensitive)"
                      value={rule.tagMatch}
                      onChange={(event) =>
                        onChange(updateGeneralFilter(options, index, { ...rule, tagMatch: event.target.value }))
                      }
                    />
                  )}

                  {/* Remove */}
                  <IconButton
                    size="small"
                    aria-label="Remove filter rule"
                    onClick={() => onChange(removeGeneralFilter(options, rule.id))}
                  >
                    <Icon href={svgDismiss} />
                  </IconButton>
                </Box>
              ))
            ) : (
              <Typography variant="body-sm" color="text.secondary">
                No general filters configured. All items will be shown.
              </Typography>
            )}

            <Box sx={{ pt: 0.5 }}>
              <Button size="small" variant="outlined" onClick={handleAddRule}>
                Add rule
              </Button>
            </Box>
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
                        onChange({ ...options, stateGroups: allEmpty ? null : nextGroups })
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
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
