import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
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

type HiddenTagsDialogProps = {
  open: boolean
  tagRules: TagRule[]
  onClose: () => void
  onChange: (nextRules: TagRule[]) => void
  cardHighlightOptions: CardHighlightOptions
  onCardHighlightOptionsChange: (next: CardHighlightOptions) => void
  title?: string
  description?: string
  actionOptions?: TagRuleAction[]
}

const DEFAULT_TAG_RULE_ACTION_OPTIONS: TagRuleAction[] = ['Blocked', 'New', 'Active', 'Review', 'Done', 'unlisted']

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
  title = 'Assignments options',
  description = 'Configure case-insensitive partial tag matches. Rules are applied from top to bottom, and can place an item in a specific column or hide it as unlisted.',
  actionOptions = DEFAULT_TAG_RULE_ACTION_OPTIONS,
}: HiddenTagsDialogProps) {
  const orderedRules = useMemo(() => tagRules, [tagRules])
  const [activeTab, setActiveTab] = useState<'tag-rules' | 'freshness'>('tag-rules')
  const updateCardHighlightOptions = (changes: Partial<CardHighlightOptions>) => {
    onCardHighlightOptionsChange(normalizeCardHighlightOptions({ ...cardHighlightOptions, ...changes }))
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
            <Tab label="Tag rules" value="tag-rules" />
            <Tab label="Freshness" value="freshness" />
          </Tabs>

          <Box sx={{ flex: 1, minWidth: 0 }}>
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
