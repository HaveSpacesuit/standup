import { useMemo, useState } from 'react'
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
  IconButton,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgArrowUp from '@stratakit/icons/arrow-up.svg'
import svgArrowDown from '@stratakit/icons/arrow-down.svg'
import type { TagRule, TagRuleAction } from '../../../ado/workItemStatus'
import { createTagRule } from '../utils/boardFilters'
import type { CardHighlightOptions } from '../utils/cardHighlightOptions'
import { normalizeCardHighlightOptions } from '../utils/cardHighlightOptions'
import type { TeamIterationOption } from '../../../ado/queryEngine'
import type { AssignmentSprintFilter } from '../utils/assignmentOptions'

type HiddenTagsDialogProps = {
  open: boolean
  tagRules: TagRule[]
  onClose: () => void
  onChange: (nextRules: TagRule[]) => void
  cardHighlightOptions: CardHighlightOptions
  onCardHighlightOptionsChange: (next: CardHighlightOptions) => void
  projectWorkItemTypes?: string[]
  projectWorkItemTypesLoading?: boolean
  includeWorkItemTypes?: string[]
  onIncludeWorkItemTypesChange?: (next: string[]) => void
  sprintFilter?: AssignmentSprintFilter
  onSprintFilterChange?: (next: AssignmentSprintFilter) => void
  teamIterations?: TeamIterationOption[]
  teamIterationsLoading?: boolean
  title?: string
  description?: string
  actionOptions?: TagRuleAction[]
}

const DEFAULT_TAG_RULE_ACTION_OPTIONS: TagRuleAction[] = ['Blocked', 'New', 'Active', 'Review', 'Done', 'unlisted']

type RelativeSprintKey = 'current' | 'next' | 'nextNext'

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

function moveRule(tagRules: TagRule[], index: number, direction: -1 | 1): TagRule[] {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= tagRules.length) {
    return tagRules
  }

  const nextRules = [...tagRules]
  const [rule] = nextRules.splice(index, 1)
  nextRules.splice(targetIndex, 0, rule)
  return nextRules
}

export function HiddenTagsDialog({
  open,
  tagRules,
  onClose,
  onChange,
  cardHighlightOptions,
  onCardHighlightOptionsChange,
  projectWorkItemTypes = [],
  projectWorkItemTypesLoading = false,
  includeWorkItemTypes = [],
  onIncludeWorkItemTypesChange,
  sprintFilter = { current: true, next: true, nextNext: false, iterationPaths: [] },
  onSprintFilterChange,
  teamIterations = [],
  teamIterationsLoading = false,
  title = 'Assignments options',
  description = 'Configure case-insensitive partial tag matches. Rules are applied from top to bottom, and can place an item in a specific column or hide it as unlisted.',
  actionOptions = DEFAULT_TAG_RULE_ACTION_OPTIONS,
}: HiddenTagsDialogProps) {
  const orderedRules = useMemo(() => tagRules, [tagRules])
  const [activeTab, setActiveTab] = useState<'work-item-types' | 'sprints' | 'tag-rules' | 'freshness'>('work-item-types')
  const [newIterationPathInput, setNewIterationPathInput] = useState('')
  const relativeSprintLabels = useMemo(() => ({
    current: resolveRelativeSprintName(teamIterations, 0),
    next: resolveRelativeSprintName(teamIterations, 1),
    nextNext: resolveRelativeSprintName(teamIterations, 2),
  }), [teamIterations])
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
  const updateCardHighlightOptions = (changes: Partial<CardHighlightOptions>) => {
    onCardHighlightOptionsChange(normalizeCardHighlightOptions({ ...cardHighlightOptions, ...changes }))
  }
  const handleToggleRelativeSprint = (key: RelativeSprintKey, checked: boolean) => {
    onSprintFilterChange?.({ ...sprintFilter, [key]: checked } as AssignmentSprintFilter)
  }
  const handleSprintPathsChange = (paths: string[]) => {
    const preservedCustomPaths = sprintFilter.iterationPaths.filter(
      (path) => !registeredIterationPathSet.has(path),
    )
    onSprintFilterChange?.({
      ...sprintFilter,
      iterationPaths: [...preservedCustomPaths, ...paths],
    })
  }
  const handleAddIterationPath = () => {
    const value = newIterationPathInput.trim()
    if (!value) {
      return
    }

    const alreadyExists = sprintFilter.iterationPaths.some(
      (path) => path.trim().toLowerCase() === value.toLowerCase(),
    )
    if (alreadyExists) {
      return
    }

    onSprintFilterChange?.({
      ...sprintFilter,
      iterationPaths: [...sprintFilter.iterationPaths, value],
    })
    setNewIterationPathInput('')
  }
  const handleRemoveIterationPath = (pathToRemove: string) => {
    onSprintFilterChange?.({
      ...sprintFilter,
      iterationPaths: sprintFilter.iterationPaths.filter((path) => path !== pathToRemove),
    })
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>

      <DialogContent sx={{ pt: 1, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
          <Tabs
            orientation="vertical"
            value={activeTab}
            onChange={(_, value) => setActiveTab(value)}
            sx={{
              borderRight: 1,
              borderColor: 'divider',
              minWidth: 160,
              '& .MuiTab-root': { alignItems: 'flex-start', textAlign: 'left', justifyContent: 'flex-start' },
            }}
          >
            <Tab label="Work item types" value="work-item-types" />
            <Tab label="Sprints" value="sprints" />
            <Tab label="Tag rules" value="tag-rules" />
            <Tab label="Freshness" value="freshness" />
          </Tabs>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            {activeTab === 'work-item-types' ? (
              <>
                <Typography variant="body-md" sx={{ fontWeight: 700, mb: 0.5 }}>
                  Work item types
                </Typography>
                <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.5 }}>
                  Select which work item types to query. When left empty, all types are queried.
                </Typography>

                {projectWorkItemTypesLoading ? (
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
                      onIncludeWorkItemTypesChange?.(nextValue)
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
              </>
            ) : null}

            {activeTab === 'sprints' ? (
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
            ) : null}

            {activeTab === 'tag-rules' ? (
              <>
                <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.25 }}>
                  {description}
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {orderedRules.length > 0 ? (
                    orderedRules.map((rule, index) => (
                      <Box key={rule.id} sx={{ display: 'grid', gridTemplateColumns: '1fr 140px auto auto auto', gap: 1, alignItems: 'center' }}>
                        <TextField
                          size="small"
                          placeholder="Tag match"
                          value={rule.tag}
                          onChange={(event) => {
                            const nextRules = [...tagRules]
                            nextRules[index] = { ...rule, tag: event.target.value }
                            onChange(nextRules)
                          }}
                        />

                        <Select
                          size="small"
                          value={rule.action}
                          onChange={(event) => {
                            const nextRules = [...tagRules]
                            nextRules[index] = { ...rule, action: event.target.value as TagRuleAction }
                            onChange(nextRules)
                          }}
                        >
                          {actionOptions.map((action) => (
                            <MenuItem key={action} value={action}>
                              {action === 'unlisted' ? 'Unlisted' : action}
                            </MenuItem>
                          ))}
                        </Select>

                        <IconButton
                          size="small"
                          aria-label="Move tag rule up"
                          onClick={() => onChange(moveRule(tagRules, index, -1))}
                          disabled={index === 0}
                        >
                          <Icon href={svgArrowUp} />
                        </IconButton>

                        <IconButton
                          size="small"
                          aria-label="Move tag rule down"
                          onClick={() => onChange(moveRule(tagRules, index, 1))}
                          disabled={index === tagRules.length - 1}
                        >
                          <Icon href={svgArrowDown} />
                        </IconButton>

                        <IconButton
                          size="small"
                          aria-label="Remove tag rule"
                          onClick={() => onChange(tagRules.filter((candidate) => candidate.id !== rule.id))}
                        >
                          <Icon href={svgDismiss} />
                        </IconButton>
                      </Box>
                    ))
                  ) : (
                    <Typography variant="body-sm" color="text.secondary">
                      No tag rules configured.
                    </Typography>
                  )}

                  <Box sx={{ pt: 0.5 }}>
                    <Button size="small" variant="outlined" onClick={() => onChange([...tagRules, createTagRule()])}>
                      Add rule
                    </Button>
                  </Box>
                </Box>
              </>
            ) : null}

            {activeTab === 'freshness' ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Typography variant="body-md" sx={{ fontWeight: 700 }}>
                  Card freshness
                </Typography>
                <Typography variant="body-sm" color="text.secondary">
                  Change the threshold at which cards are styled as fresh or stale on the assignments board.
                </Typography>

                <TextField
                  size="small"
                  type="number"
                  label="Fresh threshold (days)"
                  value={cardHighlightOptions.freshDays}
                  slotProps={{ htmlInput: { min: 1, max: 365, step: 1 } }}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    updateCardHighlightOptions({ freshDays: Number.isFinite(value) ? value : 1 })
                  }}
                  sx={{ maxWidth: 220 }}
                />

                <TextField
                  size="small"
                  type="number"
                  label="Stale threshold (days)"
                  value={cardHighlightOptions.staleDays}
                  slotProps={{ htmlInput: { min: 1, max: 365, step: 1 } }}
                  onChange={(event) => {
                    const value = Number(event.target.value)
                    updateCardHighlightOptions({ staleDays: Number.isFinite(value) ? value : 7 })
                  }}
                  sx={{ maxWidth: 220 }}
                />
              </Box>
            ) : null}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
