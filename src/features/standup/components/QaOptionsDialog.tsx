import { useEffect, useMemo, useState } from 'react'
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
  FormControlLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import type { QaOptions, QaSprintFilter, QaStateGroupOverrides, QaTagGroups } from '../utils/qaOptions'
import { createTagFilterRule, DEFAULT_QA_TAG_GROUPS } from '../utils/qaOptions'
import type { ProjectWorkItemState, TeamIterationOption } from '../../../ado/queryEngine'

type QaOptionsDialogProps = {
  open: boolean
  options: QaOptions
  onClose: () => void
  onChange: (next: QaOptions) => void
  projectWorkItemStates: ProjectWorkItemState[]
  projectWorkItemTypes: string[]
  projectWorkItemStatesLoading: boolean
  teamIterations: TeamIterationOption[]
  teamIterationsLoading: boolean
}

type StateGroupKey = keyof QaStateGroupOverrides

const STATE_GROUP_SECTIONS: Array<{ key: StateGroupKey; label: string; description: string }> = [
  { key: 'testing', label: 'Ready for QA', description: 'Items in these states will appear in the Ready for QA column.' },
  { key: 'done', label: 'Recently completed', description: 'Items that entered these states after being in Ready for QA will appear in the Recently completed column.' },
  { key: 'development', label: 'Needs follow-up', description: 'Items that returned to these states after being in Ready for QA will appear in the Needs follow-up column.' },
  { key: 'new', label: 'Newly added', description: 'Items in these states that were created recently will always appear in the Newly added column.' },
]

type RelativeSprintKey = 'current' | 'next' | 'nextNext'

/** Resolves the sprint name for a relative offset from the current iteration, for label display. */
function resolveRelativeSprintName(iterations: TeamIterationOption[], offset: number): string | null {
  let currentIndex = iterations.findIndex((iteration) => iteration.timeFrame === 'current')
  if (currentIndex === -1) {
    currentIndex = iterations.findIndex((iteration) => iteration.timeFrame === 'future')
  }
  if (currentIndex === -1) {
    return null
  }
  return iterations[currentIndex + offset]?.name ?? null
}

function removeGeneralFilter(options: QaOptions, id: string): QaOptions {
  return { ...options, generalFilters: options.generalFilters.filter((r) => r.id !== id) }
}

function getStateGroups(options: QaOptions): QaStateGroupOverrides {
  return options.stateGroups ?? { testing: [], done: [], development: [], new: [] }
}

/** Effective tag groups for editing — falls back to the built-in defaults (Triage → Newly added). */
function getTagGroups(options: QaOptions): QaTagGroups {
  return options.tagGroups ?? DEFAULT_QA_TAG_GROUPS
}

export function QaOptionsDialog({
  open,
  options,
  onClose,
  onChange,
  projectWorkItemStates,
  projectWorkItemTypes,
  projectWorkItemStatesLoading,
  teamIterations,
  teamIterationsLoading,
}: QaOptionsDialogProps) {
  // Edit against a local draft so expensive query-affecting changes (the work item type
  // allow-list and sprint filter) are only committed — and the data reload only triggered —
  // when the dialog closes.
  const [draft, setDraft] = useState<QaOptions>(options)
  const [newTagInput, setNewTagInput] = useState('')
  const [newIterationPathInput, setNewIterationPathInput] = useState('')
  const [tagGroupInputs, setTagGroupInputs] = useState<Record<StateGroupKey, string>>({
    testing: '', done: '', development: '', new: '',
  })
  const [activeTab, setActiveTab] = useState(0)

  useEffect(() => {
    if (open) {
      setDraft(options)
      setNewTagInput('')
      setNewIterationPathInput('')
      setTagGroupInputs({ testing: '', done: '', development: '', new: '' })
      setActiveTab(0)
    }
    // Only re-sync the draft when the dialog is (re)opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const { generalFilters: tagFilters, includeWorkItemTypes, sprintFilter } = draft
  const stateGroups = getStateGroups(draft)
  const tagGroups = getTagGroups(draft)
  const registeredIterationPathSet = useMemo(
    () => new Set(teamIterations.map((iteration) => iteration.path)),
    [teamIterations],
  )
  const registeredIterationPaths = useMemo(
    () => sprintFilter.iterationPaths.filter((path) => registeredIterationPathSet.has(path)),
    [registeredIterationPathSet, sprintFilter.iterationPaths],
  )
  const customIterationPaths = useMemo(
    () => sprintFilter.iterationPaths.filter((path) => !registeredIterationPathSet.has(path)),
    [registeredIterationPathSet, sprintFilter.iterationPaths],
  )

  const relativeSprintLabels = useMemo(() => ({
    current: resolveRelativeSprintName(teamIterations, 0),
    next: resolveRelativeSprintName(teamIterations, 1),
    nextNext: resolveRelativeSprintName(teamIterations, 2),
  }), [teamIterations])

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
        (rule) => rule.tagMatch.trim().toLowerCase() === value.toLowerCase(),
      )
      if (alreadyExists) {
        return current
      }
      return { ...current, generalFilters: [...current.generalFilters, createTagFilterRule(value)] }
    })
    setNewTagInput('')
  }

  const handleAddTagToGroup = (key: StateGroupKey) => {
    const value = tagGroupInputs[key].trim()
    if (!value) {
      return
    }
    setDraft((current) => {
      // Materialize the effective tag groups (capturing the default Triage) before editing, so
      // that later removals stick instead of reverting to the built-in default.
      const groups = getTagGroups(current)
      if (groups[key].some((tag) => tag.toLowerCase() === value.toLowerCase())) {
        return current
      }
      const nextGroups: QaTagGroups = { ...groups, [key]: [...groups[key], value] }
      return { ...current, tagGroups: nextGroups }
    })
    setTagGroupInputs((current) => ({ ...current, [key]: '' }))
  }

  const handleRemoveTagFromGroup = (key: StateGroupKey, tag: string) => {
    setDraft((current) => {
      const groups = getTagGroups(current)
      const nextGroups: QaTagGroups = { ...groups, [key]: groups[key].filter((t) => t !== tag) }
      return { ...current, tagGroups: nextGroups }
    })
  }

  const handleToggleRelativeSprint = (key: RelativeSprintKey, checked: boolean) => {
    setDraft((current) => ({
      ...current,
      sprintFilter: { ...current.sprintFilter, [key]: checked } as QaSprintFilter,
    }))
  }

  const handleSprintPathsChange = (paths: string[]) => {
    setDraft((current) => {
      const preservedCustomPaths = current.sprintFilter.iterationPaths.filter(
        (path) => !registeredIterationPathSet.has(path),
      )

      return {
        ...current,
        sprintFilter: { ...current.sprintFilter, iterationPaths: [...preservedCustomPaths, ...paths] },
      }
    })
  }

  const handleAddIterationPath = () => {
    const value = newIterationPathInput.trim()
    if (!value) {
      return
    }

    setDraft((current) => {
      const alreadyExists = current.sprintFilter.iterationPaths.some(
        (path) => path.trim().toLowerCase() === value.toLowerCase(),
      )
      if (alreadyExists) {
        return current
      }

      return {
        ...current,
        sprintFilter: {
          ...current.sprintFilter,
          iterationPaths: [...current.sprintFilter.iterationPaths, value],
        },
      }
    })
    setNewIterationPathInput('')
  }

  const handleRemoveIterationPath = (pathToRemove: string) => {
    setDraft((current) => ({
      ...current,
      sprintFilter: {
        ...current.sprintFilter,
        iterationPaths: current.sprintFilter.iterationPaths.filter((path) => path !== pathToRemove),
      },
    }))
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
      <DialogTitle>QA Options</DialogTitle>

      <DialogContent sx={{ display: 'flex', gap: 2, pt: 1, minHeight: 420 }}>
        <Tabs
          orientation="vertical"
          value={activeTab}
          onChange={(_event, value: number) => setActiveTab(value)}
          sx={{
            borderRight: 1,
            borderColor: 'divider',
            minWidth: 172,
            flexShrink: 0,
            '& .MuiTabs-flexContainer': {
              alignItems: 'stretch',
            },
            '& .MuiTab-root': {
              alignItems: 'flex-start',
              justifyContent: 'flex-start',
              textAlign: 'left',
              textTransform: 'none',
              minHeight: 44,
              px: 1.5,
            },
          }}
        >
          <Tab label="Work item types" />
          <Tab label="Sprints" />
          <Tab label="Tag filters" />
          <Tab label="Column classification" />
        </Tabs>

        <Box sx={{ flex: 1, minWidth: 0, maxHeight: 480, overflowY: 'auto', pr: 0.5 }}>

        {activeTab === 0 && (
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

        )}

        {activeTab === 1 && (
        <Box>
          <Typography variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
            Sprints
          </Typography>
          <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.5 }}>
            Limit items to the selected sprints. When nothing is selected, all sprints are shown.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={sprintFilter.current}
                  onChange={(event) => handleToggleRelativeSprint('current', event.target.checked)}
                />
              }
              label={relativeSprintLabels.current ? `Current sprint (${relativeSprintLabels.current})` : 'Current sprint'}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={sprintFilter.next}
                  onChange={(event) => handleToggleRelativeSprint('next', event.target.checked)}
                />
              }
              label={relativeSprintLabels.next ? `Current sprint + 1 (${relativeSprintLabels.next})` : 'Current sprint + 1'}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={sprintFilter.nextNext}
                  onChange={(event) => handleToggleRelativeSprint('nextNext', event.target.checked)}
                />
              }
              label={relativeSprintLabels.nextNext ? `Current sprint + 2 (${relativeSprintLabels.nextNext})` : 'Current sprint + 2'}
            />
          </Box>

          <Box sx={{ mt: 1.5 }}>
            <Typography variant="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>
              Additional sprints
            </Typography>
            <Typography variant="body-sm" color="text.secondary" sx={{ mb: 0.75 }}>
              Include specific registered sprints, such as a general backlog.
            </Typography>

            {teamIterationsLoading ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} />
                <Typography variant="body-sm" color="text.secondary">Loading sprints…</Typography>
              </Box>
            ) : teamIterations.length === 0 ? (
              <Typography variant="body-sm" color="text.secondary">
                No sprints found for this team.
              </Typography>
            ) : (
              <Select
                multiple
                size="small"
                fullWidth
                displayEmpty
                value={registeredIterationPaths}
                input={<OutlinedInput />}
                onChange={(event) => {
                  const nextValue = typeof event.target.value === 'string'
                    ? event.target.value.split(',')
                    : event.target.value
                  handleSprintPathsChange(nextValue)
                }}
                renderValue={(values) => {
                  if (values.length === 0) {
                    return <span style={{ opacity: 0.5 }}>None selected</span>
                  }
                  const nameByPath = new Map(teamIterations.map((it) => [it.path, it.name]))
                  return values.map((path) => nameByPath.get(path) ?? path).join(', ')
                }}
                MenuProps={{ slotProps: { paper: { style: { maxHeight: 300 } } } }}
              >
                {teamIterations.map((iteration) => (
                  <MenuItem key={iteration.path} value={iteration.path} dense>
                    <Checkbox checked={registeredIterationPaths.includes(iteration.path)} />
                    <ListItemText
                      primary={iteration.name}
                      secondary={iteration.timeFrame === 'current' ? 'Current' : undefined}
                    />
                  </MenuItem>
                ))}
              </Select>
            )}
          </Box>

          <Box sx={{ mt: 2 }}>
            <Typography variant="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>
              Manual iteration paths
            </Typography>
            <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1 }}>
              Include items from iteration paths that are not part of this team&apos;s registered sprint list.
            </Typography>

            {customIterationPaths.length > 0 ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.25 }}>
                {customIterationPaths.map((path) => (
                  <Chip
                    key={path}
                    label={path}
                    size="small"
                    variant="outlined"
                    onDelete={() => handleRemoveIterationPath(path)}
                  />
                ))}
              </Box>
            ) : (
              <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.25 }}>
                No manual iteration paths configured.
              </Typography>
            )}

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Add iteration path (for example: Project\\General Backlog)"
                value={newIterationPathInput}
                onChange={(event) => setNewIterationPathInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleAddIterationPath()
                  }
                }}
              />
              <Button size="small" variant="outlined" onClick={handleAddIterationPath} disabled={!newIterationPathInput.trim()}>
                Add
              </Button>
            </Box>
          </Box>
        </Box>

        )}

        {activeTab === 2 && (
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

        )}

        {activeTab === 3 && (
        <Box>
          <Typography variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
            Column classification
          </Typography>
          <Typography variant="body-sm" color="text.secondary" sx={{ mb: 2 }}>
            Map work item states and tags to each column. A matching tag takes precedence and routes the item directly to that column. Columns are evaluated top to bottom. When a state list is left empty, built-in defaults for this project are used.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {STATE_GROUP_SECTIONS.map(({ key, label, description }) => {
              const selectedStates = stateGroups[key]
              const groupTags = tagGroups[key]
              return (
                <Box key={key}>
                  <Typography variant="body-sm" sx={{ fontWeight: 600, mb: 0.25 }}>
                    {label}
                  </Typography>
                  <Typography variant="body-sm" color="text.secondary" sx={{ mb: 0.75 }}>
                    {description}
                  </Typography>

                  {/* States */}
                  {projectWorkItemStatesLoading ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <CircularProgress size={16} />
                      <Typography variant="body-sm" color="text.secondary">Loading states…</Typography>
                    </Box>
                  ) : projectWorkItemStates.length === 0 ? (
                    <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1 }}>
                      No states found for this project.
                    </Typography>
                  ) : (
                    <Select
                      multiple
                      size="small"
                      fullWidth
                      displayEmpty
                      value={selectedStates}
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
                          ? <span style={{ opacity: 0.5 }}>States: using defaults…</span>
                          : `States: ${values.join(', ')}`
                      }
                      MenuProps={{ slotProps: { paper: { style: { maxHeight: 300 } } } }}
                    >
                      {projectWorkItemStates.map((state) => (
                        <MenuItem key={state.name} value={state.name} dense>
                          <Checkbox checked={selectedStates.includes(state.name)} />
                          <ListItemText primary={state.name} />
                        </MenuItem>
                      ))}
                    </Select>
                  )}

                  {/* Tags */}
                  {groupTags.length > 0 ? (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1, mb: 1 }}>
                      {groupTags.map((tag) => (
                        <Chip
                          key={tag}
                          label={tag}
                          size="small"
                          variant="outlined"
                          onDelete={() => handleRemoveTagFromGroup(key, tag)}
                        />
                      ))}
                    </Box>
                  ) : null}

                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1 }}>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="Add tag…"
                      value={tagGroupInputs[key]}
                      onChange={(event) => setTagGroupInputs((current) => ({ ...current, [key]: event.target.value }))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          handleAddTagToGroup(key)
                        }
                      }}
                    />
                    <Button size="small" variant="outlined" onClick={() => handleAddTagToGroup(key)} disabled={!tagGroupInputs[key].trim()}>
                      Add
                    </Button>
                  </Box>
                </Box>
              )
            })}
          </Box>
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
