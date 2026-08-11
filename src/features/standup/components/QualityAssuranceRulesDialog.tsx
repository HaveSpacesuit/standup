import { useMemo } from 'react'
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
  TextField,
  Typography,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgArrowUp from '@stratakit/icons/arrow-up.svg'
import svgArrowDown from '@stratakit/icons/arrow-down.svg'
import type {
  QualityAssuranceRule,
  QualityAssuranceRuleAction,
  QualityAssuranceRuleCriterionKind,
} from '../utils/qualityAssuranceRules'
import { createQualityAssuranceRule } from '../utils/qualityAssuranceRules'

type QualityAssuranceRulesDialogProps = {
  open: boolean
  rules: QualityAssuranceRule[]
  onClose: () => void
  onChange: (nextRules: QualityAssuranceRule[]) => void
  title?: string
  description?: string
  actionOptions?: QualityAssuranceRuleAction[]
  workItemTypeOptions: string[]
}

const DEFAULT_ACTION_OPTIONS: QualityAssuranceRuleAction[] = ['New', 'unlisted']
const RULE_KIND_OPTIONS: Array<{ value: QualityAssuranceRuleCriterionKind; label: string }> = [
  { value: 'sprint', label: 'Sprint' },
  { value: 'tag', label: 'Tag' },
  { value: 'workItemType', label: 'Work item type' },
]

function moveRule(rules: QualityAssuranceRule[], index: number, direction: -1 | 1): QualityAssuranceRule[] {
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= rules.length) {
    return rules
  }

  const nextRules = [...rules]
  const [rule] = nextRules.splice(index, 1)
  nextRules.splice(targetIndex, 0, rule)
  return nextRules
}

function normalizeRuleValue(value: string): string {
  return value.trim()
}

export function QualityAssuranceRulesDialog({
  open,
  rules,
  onClose,
  onChange,
  title = 'QA Rules',
  description = 'Configure case-insensitive partial matches for tags and sprint names, or exact matches for work item types. Rules are applied from top to bottom.',
  actionOptions = DEFAULT_ACTION_OPTIONS,
  workItemTypeOptions,
}: QualityAssuranceRulesDialogProps) {
  const orderedRules = useMemo(() => rules, [rules])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{title}</DialogTitle>

      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body-sm" color="text.secondary" sx={{ mb: 1.25 }}>
          {description}
        </Typography>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {orderedRules.length > 0 ? (
            orderedRules.map((rule, index) => {
              const handleKindChange = (nextKind: QualityAssuranceRuleCriterionKind) => {
                const nextRules = [...rules]
                nextRules[index] = {
                  ...rule,
                  kind: nextKind,
                  value:
                    nextKind === 'workItemType' && workItemTypeOptions.length > 0
                      ? workItemTypeOptions[0]
                      : '',
                }
                onChange(nextRules)
              }

              const handleValueChange = (value: string) => {
                const nextRules = [...rules]
                nextRules[index] = { ...rule, value }
                onChange(nextRules)
              }

              return (
                <Box
                  key={rule.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '160px minmax(0, 1fr) 140px auto auto auto',
                    gap: 1,
                    alignItems: 'center',
                  }}
                >
                  <Select
                    size="small"
                    value={rule.kind}
                    onChange={(event) => handleKindChange(event.target.value as QualityAssuranceRuleCriterionKind)}
                  >
                    {RULE_KIND_OPTIONS.map((kindOption) => (
                      <MenuItem key={kindOption.value} value={kindOption.value}>
                        {kindOption.label}
                      </MenuItem>
                    ))}
                  </Select>

                  {rule.kind === 'workItemType' ? (
                    <Select
                      size="small"
                      displayEmpty
                      value={normalizeRuleValue(rule.value)}
                      onChange={(event) => handleValueChange(event.target.value)}
                    >
                      <MenuItem value="" disabled>
                        Select work item type
                      </MenuItem>
                      {workItemTypeOptions.map((option) => (
                        <MenuItem key={option} value={option}>
                          {option}
                        </MenuItem>
                      ))}
                    </Select>
                  ) : (
                    <TextField
                      size="small"
                      placeholder={rule.kind === 'sprint' ? 'Sprint match' : 'Tag match'}
                      value={rule.value}
                      onChange={(event) => handleValueChange(event.target.value)}
                    />
                  )}

                  <Select
                    size="small"
                    value={rule.action}
                    onChange={(event) => {
                      const nextRules = [...rules]
                      nextRules[index] = {
                        ...rule,
                        action: event.target.value as QualityAssuranceRuleAction,
                      }
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
                    aria-label="Move QA rule up"
                    onClick={() => onChange(moveRule(rules, index, -1))}
                    disabled={index === 0}
                  >
                    <Icon href={svgArrowUp} />
                  </IconButton>

                  <IconButton
                    size="small"
                    aria-label="Move QA rule down"
                    onClick={() => onChange(moveRule(rules, index, 1))}
                    disabled={index === rules.length - 1}
                  >
                    <Icon href={svgArrowDown} />
                  </IconButton>

                  <IconButton
                    size="small"
                    aria-label="Remove QA rule"
                    onClick={() => onChange(rules.filter((candidate) => candidate.id !== rule.id))}
                  >
                    <Icon href={svgDismiss} />
                  </IconButton>
                </Box>
              )
            })
          ) : (
            <Typography variant="body-sm" color="text.secondary">
              No QA rules configured.
            </Typography>
          )}

          <Box sx={{ pt: 0.5 }}>
            <Button size="small" variant="outlined" onClick={() => onChange([...rules, createQualityAssuranceRule()])}>
              Add rule
            </Button>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
