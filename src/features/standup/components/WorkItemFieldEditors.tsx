import { useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Autocomplete, Box, Button, ListSubheader, MenuItem, MenuList, TextField, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import type { IdentityRef } from '../../../ado/identity'
import { resolveMatchingTagRules } from '../../../ado/workItemStatus'
import {
  normalizeTags, sameFieldValue, WORK_ITEM_TITLE_MAX_LENGTH, type EditableWorkItemField, type WorkItemFieldChanges,
} from '../../../ado/workItemUpdateApi'
import type { WorkItemEditOptions } from '../hooks/useWorkItemEditor'
import { formatEffort } from '../utils/sprintEffortTotals'
import {
  getIterationGroups, getPeopleChoices, getStateGroups, IMPACT_CHOICES, SEVERITY_CHOICES, type EditableWorkItem,
} from '../utils/workItemEditing'
import { AdoAvatar } from './AdoAvatar'

export type FieldEditorProps = {
  item: EditableWorkItem
  options: WorkItemEditOptions
  onSave: (changes: WorkItemFieldChanges) => void
  onCancel: () => void
}

type Choice = { key: string; label: ReactNode; detail?: ReactNode; selected: boolean; changes: WorkItemFieldChanges }
type ChoiceGroup = { key: string; label?: string; choices: Choice[] }

const listSx: SxProps<Theme> = { maxHeight: 340, overflowY: 'auto', py: 0.5 }
const choiceLabelSx: SxProps<Theme> = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const choiceDetailSx: SxProps<Theme> = { ml: 2, color: 'text.secondary', fontSize: 12, whiteSpace: 'nowrap' }
const subheaderSx: SxProps<Theme> = { lineHeight: '28px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }
const formSx: SxProps<Theme> = { p: 1.5, display: 'grid', gap: 1.25 }
const actionsSx: SxProps<Theme> = { display: 'flex', justifyContent: 'flex-end', gap: 1 }
const noteSx: SxProps<Theme> = {
  mx: 1.5, mt: 1, px: 1, py: 0.75, borderRadius: '4px', fontSize: 12,
  bgcolor: 'var(--stratakit-color-bg-attention-muted)', color: 'text.primary',
}

const sameText = (left: string | undefined, right: string | undefined) =>
  (left ?? '').trim().toLowerCase() === (right ?? '').trim().toLowerCase()

/** Options that save as soon as one is picked; the arrows and type-ahead move through them. */
function ChoiceList({ label, groups, onSave, autoFocusItem = true, listRef }: {
  label: string
  groups: ChoiceGroup[]
  onSave: (changes: WorkItemFieldChanges) => void
  autoFocusItem?: boolean
  listRef?: RefObject<HTMLUListElement | null>
}) {
  return (
    <MenuList ref={listRef} autoFocusItem={autoFocusItem} aria-label={label} sx={listSx}>
      {groups.flatMap((group) => [
        group.label ? <ListSubheader key={`group:${group.key}`} sx={subheaderSx}>{group.label}</ListSubheader> : null,
        ...group.choices.map((choice) => (
          <MenuItem
            key={`${group.key}:${choice.key}`}
            role="menuitemradio"
            aria-checked={choice.selected}
            selected={choice.selected}
            onClick={() => onSave(choice.changes)}
          >
            <Box component="span" sx={choiceLabelSx}>{choice.label}</Box>
            {choice.detail ? <Box component="span" sx={choiceDetailSx}>{choice.detail}</Box> : null}
          </MenuItem>
        )),
      ])}
    </MenuList>
  )
}

function StateEditor({ item, options, onSave }: FieldEditorProps) {
  const groups = getStateGroups(options.statesFor(item), item.state)
  // A tag rule decides the card's column before its state does, so changing the state alone will not move the card.
  const holdingRule = resolveMatchingTagRules(item.tags ?? [], options.tagRules).find((rule) => rule.action !== 'unlisted')
  return (
    <>
      {holdingRule ? (
        <Box sx={noteSx}>
          Tagged “{holdingRule.tag}”, so the card shows in {holdingRule.action} whatever its state. Edit its tags to move it.
        </Box>
      ) : null}
      <ChoiceList
        label="State"
        onSave={onSave}
        groups={groups.map((group) => ({
          key: group.category,
          label: group.label,
          choices: group.states.map((state) => ({ key: state, label: state, selected: sameText(state, item.state), changes: { state } })),
        }))}
      />
    </>
  )
}

function SprintEditor({ item, options, onSave }: FieldEditorProps) {
  const groups = getIterationGroups(options.iterations, options.backlogPath, item.iterationPath)
  if (!groups.length) {
    return <Typography variant="body-sm" color="text.secondary" sx={{ p: 1.5 }}>This team has no sprints to choose from.</Typography>
  }
  return (
    <ChoiceList
      label="Sprint"
      onSave={onSave}
      groups={groups.map((group) => ({
        key: group.key,
        label: group.label,
        choices: group.choices.map((choice) => ({
          key: choice.path,
          label: choice.name,
          detail: choice.detail,
          selected: sameText(choice.path, item.iterationPath),
          changes: { iterationPath: choice.path },
        })),
      }))}
    />
  )
}

function SeverityEditor({ item, onSave }: FieldEditorProps) {
  const values = item.severity && !SEVERITY_CHOICES.some((choice) => sameText(choice, item.severity))
    ? [item.severity, ...SEVERITY_CHOICES]
    : SEVERITY_CHOICES
  return (
    <ChoiceList
      label="Severity"
      onSave={onSave}
      groups={[{
        key: 'severity',
        choices: values.map((severity) => ({ key: severity, label: severity, selected: sameText(severity, item.severity), changes: { severity } })),
      }]}
    />
  )
}

function ImpactEditor({ item, onSave }: FieldEditorProps) {
  return (
    <ChoiceList
      label="Impact"
      onSave={onSave}
      groups={[{
        key: 'impact',
        choices: IMPACT_CHOICES.map(({ value, description }) => ({
          key: String(value),
          label: `Impact ${value}`,
          detail: description,
          selected: item.priority === value,
          changes: { priority: value },
        })),
      }]}
    />
  )
}

const personSx: SxProps<Theme> = { display: 'inline-flex', alignItems: 'center', gap: 1, minWidth: 0 }
const avatarSx: SxProps<Theme> = { width: 20, height: 20, fontSize: 10, flex: '0 0 auto' }

function PersonChoice({ person }: { person: IdentityRef }) {
  const name = person.displayName ?? person.uniqueName ?? ''
  return (
    <Box component="span" sx={personSx}>
      <AdoAvatar alt="" aria-hidden="true" src={person.imageUrl} sx={avatarSx}>{name.trim().charAt(0).toUpperCase()}</AdoAvatar>
      <Box component="span" sx={choiceLabelSx}>{name}</Box>
    </Box>
  )
}

function AssigneeEditor({ item, options, onSave }: FieldEditorProps) {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLUListElement>(null)
  const people = useMemo(() => getPeopleChoices(options.members, item.assignedTo), [options.members, item.assignedTo])
  const search = query.trim().toLowerCase()
  const matches = search
    ? people.filter((person) => `${person.displayName ?? ''} ${person.uniqueName ?? ''}`.toLowerCase().includes(search))
    : people
  const choices: Choice[] = [
    ...(search ? [] : [{ key: '__unassigned__', label: 'Unassigned', selected: !item.assignedTo, changes: { assignedTo: null } }]),
    ...matches.map((person) => ({
      key: person.uniqueName ?? person.displayName ?? '',
      label: <PersonChoice person={person} />,
      selected: sameFieldValue('assignedTo', person, item.assignedTo),
      changes: { assignedTo: person },
    })),
  ]
  return (
    <>
      <Box sx={{ px: 1.5, pt: 1.25, pb: 0.5 }}>
        <TextField
          size="small"
          fullWidth
          autoFocus
          placeholder="Search team members"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              listRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus()
            } else if (event.key === 'Enter' && search && matches.length > 0) {
              event.preventDefault()
              onSave({ assignedTo: matches[0] })
            }
          }}
          slotProps={{ htmlInput: { 'aria-label': 'Search team members' } }}
        />
      </Box>
      {choices.length ? (
        <ChoiceList label="Assign to" groups={[{ key: 'people', choices }]} onSave={onSave} autoFocusItem={false} listRef={listRef} />
      ) : (
        <Typography variant="body-sm" color="text.secondary" sx={{ px: 1.5, py: 1 }}>No team member matches.</Typography>
      )}
    </>
  )
}

function EffortEditor({ item, options, onSave }: FieldEditorProps) {
  const [draft, setDraft] = useState(item.effort === undefined ? '' : String(item.effort))
  const value = draft.trim() === '' ? null : Number(draft)
  const valid = value === null || (Number.isFinite(value) && value >= 0)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (valid) onSave({ effort: value })
  }
  return (
    <Box component="form" onSubmit={submit} sx={formSx}>
      <Box role="group" aria-label="Suggested effort" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {options.effortSuggestions.map((suggestion) => (
          <Button
            key={suggestion}
            size="small"
            variant={item.effort === suggestion ? 'contained' : 'outlined'}
            aria-pressed={item.effort === suggestion}
            onClick={() => onSave({ effort: suggestion })}
          >
            {formatEffort(suggestion)}
          </Button>
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          size="small"
          label="Effort"
          type="number"
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          error={!valid}
          helperText={valid ? undefined : 'Enter a number of 0 or more.'}
          slotProps={{ htmlInput: { min: 0, step: 'any', inputMode: 'decimal' } }}
          sx={{ flex: 1 }}
        />
        <Button type="submit" variant="contained" size="small" disabled={!valid} sx={{ mt: 0.25 }}>Save</Button>
      </Box>
      {item.effort !== undefined ? (
        <Button size="small" variant="text" onClick={() => onSave({ effort: null })} sx={{ justifySelf: 'start' }}>Clear effort</Button>
      ) : null}
    </Box>
  )
}

function TagsEditor({ item, options, onSave, onCancel }: FieldEditorProps) {
  const [tags, setTags] = useState<string[]>(() => normalizeTags(item.tags ?? []))
  const [input, setInput] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave({ tags: normalizeTags(input.trim() ? [...tags, input] : tags) })
  }
  return (
    <Box component="form" onSubmit={submit} sx={formSx}>
      <Autocomplete
        multiple
        freeSolo
        filterSelectedOptions
        options={options.knownTags}
        value={tags}
        inputValue={input}
        onInputChange={(_event, next) => setInput(next)}
        onChange={(_event, next) => setTags(normalizeTags(next.map(String)))}
        renderInput={(params) => <TextField {...params} autoFocus label="Tags" placeholder={tags.length ? undefined : 'Add a tag'} />}
      />
      <Typography variant="caption-sm" color="text.secondary">
        Enter adds a tag. Tags someone else adds meanwhile are kept.
      </Typography>
      <Box sx={actionsSx}>
        <Button size="small" onClick={onCancel}>Cancel</Button>
        <Button size="small" variant="contained" type="submit">Save tags</Button>
      </Box>
    </Box>
  )
}

function TitleEditor({ item, onSave, onCancel }: FieldEditorProps) {
  const [title, setTitle] = useState(item.title)
  const trimmed = title.trim()
  const valid = trimmed.length > 0 && trimmed.length <= WORK_ITEM_TITLE_MAX_LENGTH
  const save = () => {
    if (valid) onSave({ title: trimmed })
  }
  return (
    <Box component="form" onSubmit={(event: FormEvent) => { event.preventDefault(); save() }} sx={formSx}>
      <TextField
        label="Title"
        multiline
        minRows={2}
        maxRows={6}
        autoFocus
        value={title}
        // Titles are one line; Enter saves.
        onChange={(event) => setTitle(event.target.value.replace(/[\r\n]+/g, ' '))}
        onFocus={(event) => event.target.select()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            save()
          }
        }}
        error={!valid}
        helperText={trimmed ? `${trimmed.length} / ${WORK_ITEM_TITLE_MAX_LENGTH}` : 'A work item needs a title.'}
        slotProps={{ htmlInput: { maxLength: WORK_ITEM_TITLE_MAX_LENGTH } }}
      />
      <Box sx={actionsSx}>
        <Button size="small" onClick={onCancel}>Cancel</Button>
        <Button size="small" variant="contained" type="submit" disabled={!valid}>Rename</Button>
      </Box>
    </Box>
  )
}

const EDITORS: Record<EditableWorkItemField, (props: FieldEditorProps) => ReactNode> = {
  state: StateEditor,
  assignedTo: AssigneeEditor,
  iterationPath: SprintEditor,
  effort: EffortEditor,
  severity: SeverityEditor,
  priority: ImpactEditor,
  tags: TagsEditor,
  title: TitleEditor,
}

/** The editor for one field: a list that saves on pick for choices, or a small form for typed values. */
export function WorkItemFieldEditor({ field, ...props }: FieldEditorProps & { field: EditableWorkItemField }) {
  const Editor = EDITORS[field]
  return <Editor {...props} />
}

/** Fields whose editor is wider, for typing. */
export const WIDE_FIELD_EDITORS: ReadonlySet<EditableWorkItemField> = new Set(['title', 'tags'])
