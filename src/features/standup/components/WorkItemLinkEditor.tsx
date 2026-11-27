import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Autocomplete, Box, Button, IconButton, ListSubheader, MenuItem, TextField, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import {
  CHILD_LINK,
  COMMON_LINK_TYPES,
  isSingleTargetLink,
  PARENT_LINK,
  sameLinkType,
  type WorkItemCurrentLink,
  type WorkItemLinkChange,
  type WorkItemLinkTarget,
  type WorkItemLinkType,
} from '../../../ado/workItemLinksApi'
import type { WorkItemLinkSaveOptions, WorkItemLinkSource, WorkItemLinkSuggestions } from '../hooks/useWorkItemEditor'
import { toErrorMessage } from '../hooks/queryErrors'
import type { EditableWorkItem } from '../utils/workItemEditing'
import { formatLinkTarget, getLinkTypeName } from '../utils/workItemLinkEditing'

export type WorkItemLinkEditorProps = {
  item: EditableWorkItem
  source: WorkItemLinkSource
  /** The link type to start with, such as Parent from Triage's + Parent button. */
  presetRel?: string
  onSave: (change: WorkItemLinkChange, options: WorkItemLinkSaveOptions) => void
  onCancel: () => void
}

type TargetOption = { target: WorkItemLinkTarget; group: string }

const SEARCH_DELAY_MS = 300
const MAX_LISTED_LINKS = 6

const formSx: SxProps<Theme> = { p: 1.5, display: 'grid', gap: 1.25 }
const actionsSx: SxProps<Theme> = { display: 'flex', justifyContent: 'flex-end', gap: 1 }
const subheaderSx: SxProps<Theme> = { lineHeight: '28px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }
const noteSx: SxProps<Theme> = {
  px: 1, py: 0.75, borderRadius: '4px', fontSize: 12,
  bgcolor: 'var(--stratakit-color-bg-attention-muted)', color: 'text.primary',
}
const optionSx: SxProps<Theme> = { display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0, width: '100%' }
const ellipsisSx: SxProps<Theme> = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const detailSx: SxProps<Theme> = { color: 'text.secondary', fontSize: 12, whiteSpace: 'nowrap' }
const linkRowSx: SxProps<Theme> = { display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, fontSize: 12 }

const describeTarget = (target: WorkItemLinkTarget) => [target.workItemType, target.state].filter(Boolean).join(' · ')

/** The parent the view already shows for the item, such as a Triage item's, before its links are read. */
function knownParent(item: EditableWorkItem): boolean {
  return Boolean((item as { parent?: unknown }).parent)
}

/** Loads a value once when the editor opens; undefined while loading, null when it couldn't be read. */
function useLoaded<T>(load: (() => Promise<T>) | null): { value: T | null | undefined; error: string | null } {
  const [state, setState] = useState<{ load: typeof load; value: T | null | undefined; error: string | null }>({ load, value: undefined, error: null })
  if (state.load !== load) setState({ load, value: undefined, error: null })
  useEffect(() => {
    if (!load) return
    let current = true
    load().then(
      (value) => {
        if (current) setState((previous) => (previous.load === load ? { ...previous, value } : previous))
      },
      (error: unknown) => {
        if (current) setState((previous) => (previous.load === load ? { ...previous, value: null, error: toErrorMessage(error, 'Couldn’t load.') } : previous))
      },
    )
    return () => {
      current = false
    }
  }, [load])
  return state.load === load ? state : { value: undefined, error: null }
}

/** Searches as the query is typed, after a short pause; null while there's nothing to search for. */
function useTargetSearch(source: WorkItemLinkSource, item: EditableWorkItem, query: string) {
  const [state, setState] = useState<{ query: string; results: WorkItemLinkTarget[] | null; error: string | null }>({ query: '', results: null, error: null })
  const trimmed = query.trim()
  useEffect(() => {
    if (!trimmed) return
    let current = true
    const timer = setTimeout(() => {
      source.search(item, trimmed).then(
        (results) => {
          if (current) setState({ query: trimmed, results, error: null })
        },
        (error: unknown) => {
          if (current) setState({ query: trimmed, results: [], error: toErrorMessage(error, 'The search failed. Try again.') })
        },
      )
    }, SEARCH_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [source, item, trimmed])
  if (!trimmed) return { searching: false, results: null, error: null }
  if (state.query !== trimmed) return { searching: true, results: null, error: null }
  return { searching: false, results: state.results, error: state.error }
}

/** Suggestion groups with each item listed once, under its first group, leaving out the item itself. */
function toOptions(groups: readonly (WorkItemLinkSuggestions | null | undefined)[], itemId: number): TargetOption[] {
  const seen = new Set<number>([itemId])
  return groups.flatMap((group) => (group?.items ?? []).flatMap((target) => {
    if (seen.has(target.id)) return []
    seen.add(target.id)
    return [{ target, group: group!.label }]
  }))
}

/**
 * Adds a link from the item to another work item: how they relate, which item, found by ID, address or title or among
 * suggestions, and an optional comment. Shows the item's links, which can be removed, and what the new link replaces.
 */
export function WorkItemLinkEditor({ item, source, presetRel, onSave, onCancel }: WorkItemLinkEditorProps) {
  const [rel, setRel] = useState(() => presetRel ?? (knownParent(item) ? 'System.LinkTypes.Related' : PARENT_LINK))
  const [relChosen, setRelChosen] = useState(Boolean(presetRel))
  const [target, setTarget] = useState<WorkItemLinkTarget | null>(null)
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [comment, setComment] = useState('')
  const [recent] = useState(() => source.getRecent())

  const loadTypes = useMemo(() => () => source.getLinkTypes(), [source])
  const loadLinks = useMemo(() => () => source.getLinks(item), [source, item])
  const isParent = sameLinkType(rel, PARENT_LINK)
  const loadCandidates = useMemo(() => (isParent ? () => source.getParentCandidates(item) : null), [source, item, isParent])
  const otherTypes = useLoaded(loadTypes)
  const links = useLoaded<WorkItemCurrentLink[]>(loadLinks)
  const candidates = useLoaded(loadCandidates)
  const search = useTargetSearch(source, item, query)

  const types: WorkItemLinkType[] = useMemo(() => [...COMMON_LINK_TYPES, ...(otherTypes.value ?? [])], [otherTypes.value])
  const currentLinks = links.value ?? []
  const existingParent = currentLinks.find((link) => sameLinkType(link.rel, PARENT_LINK))
  // Starts on Parent unless the item already has one, once its links are read.
  if (!relChosen && !target && existingParent && isParent) {
    setRelChosen(true)
    setRel('System.LinkTypes.Related')
  }

  const options = useMemo<TargetOption[]>(() => {
    let listed: TargetOption[]
    if (search.results) listed = toOptions([{ label: 'Matches', items: search.results }], item.id)
    else if (query.trim()) listed = []
    else {
      const recentGroup = { label: 'Recent', items: recent }
      listed = isParent
        ? toOptions([source.parentSuggestions, recentGroup, candidates.value], item.id)
        : toOptions([recentGroup], item.id)
    }
    // The picked item stays an option while the list changes, such as when the link type does.
    return target && !listed.some((option) => option.target.id === target.id) ? [{ target, group: 'Chosen' }, ...listed] : listed
  }, [search.results, query, recent, isParent, source.parentSuggestions, candidates.value, item.id, target])

  const typeName = getLinkTypeName(rel, types)
  const sameTarget = target ? currentLinks.find((link) => link.targetId === target.id && sameLinkType(link.rel, rel)) : undefined
  const replaced = target && isSingleTargetLink(rel) ? currentLinks.find((link) => sameLinkType(link.rel, rel) && link.targetId !== target.id) : undefined
  const loop = Boolean(target && isParent && target.parentId === item.id)
  const otherParent = target && sameLinkType(rel, CHILD_LINK) && target.parentId !== undefined && target.parentId !== item.id ? target.parentId : undefined
  const blocked = !target || Boolean(sameTarget) || loop || otherParent !== undefined

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (blocked || !target) return
    const trimmed = comment.trim()
    onSave({ add: [{ rel, targetId: target.id, ...(trimmed ? { comment: trimmed } : {}) }] }, { targets: [target], types: otherTypes.value ?? [] })
  }
  const remove = (link: WorkItemCurrentLink) => {
    onSave({ remove: [{ rel: link.rel, targetId: link.targetId }] }, { targets: link.target ? [link.target] : [], types: otherTypes.value ?? [] })
  }

  const noOptionsText = search.searching
    ? 'Searching…'
    : search.error ?? (query.trim() ? 'No work items match.' : 'Type an ID, a link, or words from the title.')

  return (
    <Box component="form" onSubmit={submit} sx={formSx}>
      <TextField
        select
        size="small"
        label="Link type"
        value={rel}
        onChange={(event) => {
          setRel(event.target.value)
          setRelChosen(true)
        }}
        slotProps={{ select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 360 } } } } } }}
      >
        {COMMON_LINK_TYPES.map((type) => <MenuItem key={type.rel} value={type.rel}>{type.name}</MenuItem>)}
        <ListSubheader sx={subheaderSx}>Other link types</ListSubheader>
        {otherTypes.value === undefined ? <MenuItem disabled value="">Loading…</MenuItem> : null}
        {otherTypes.value === null ? <MenuItem disabled value="">Couldn’t load the other link types.</MenuItem> : null}
        {(otherTypes.value ?? []).map((type) => <MenuItem key={type.rel} value={type.rel}>{type.name}</MenuItem>)}
      </TextField>
      <Autocomplete<TargetOption>
        autoHighlight
        options={options}
        value={target ? { target, group: '' } : null}
        inputValue={input}
        groupBy={(option) => option.group}
        filterOptions={(all) => all}
        loading={search.searching || (isParent && !query.trim() && candidates.value === undefined && loadCandidates !== null)}
        loadingText={search.searching ? 'Searching…' : 'Loading suggestions…'}
        noOptionsText={noOptionsText}
        getOptionLabel={(option) => formatLinkTarget(option.target)}
        isOptionEqualToValue={(option, value) => option.target.id === value.target.id}
        onInputChange={(_event, next, reason) => {
          setInput(next)
          if (reason === 'clear') setQuery('')
          if (reason === 'input') {
            setQuery(next)
            setTarget(null)
          }
        }}
        onChange={(_event, next) => {
          setTarget(next?.target ?? null)
          if (!next) setQuery('')
        }}
        renderGroup={(params) => (
          <li key={params.key}>
            <ListSubheader component="div" sx={subheaderSx}>{params.group}</ListSubheader>
            <Box component="ul" sx={{ p: 0 }}>{params.children}</Box>
          </li>
        )}
        renderOption={({ key, ...props }, option) => (
          <li key={`${key}:${option.target.id}`} {...props}>
            <Box component="span" sx={optionSx}>
              <Box component="span" sx={ellipsisSx}>{formatLinkTarget(option.target)}</Box>
              {describeTarget(option.target) ? <Box component="span" sx={detailSx}>{describeTarget(option.target)}</Box> : null}
            </Box>
          </li>
        )}
        renderInput={(params) => (
          <TextField
            {...params}
            autoFocus
            label="Work item"
            placeholder="ID, link or title words"
          />
        )}
      />
      {sameTarget ? <Box role="status" sx={noteSx}>{formatLinkTarget({ id: sameTarget.targetId, title: sameTarget.target?.title ?? target?.title })} is already linked as {typeName}.</Box> : null}
      {replaced ? (
        <Box role="status" sx={noteSx}>
          Replaces {typeName.toLowerCase()} {formatLinkTarget({ id: replaced.targetId, title: replaced.target?.title })}.
        </Box>
      ) : null}
      {loop && target ? <Box role="status" sx={noteSx}>#{target.id} is a child of this item, so it can’t be its parent.</Box> : null}
      {otherParent !== undefined && target ? (
        <Box role="status" sx={noteSx}>
          #{target.id} already has parent #{otherParent}. An item can have only one parent; change it from #{target.id} instead.
        </Box>
      ) : null}
      <TextField
        size="small"
        label="Comment (optional)"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      {links.error ? (
        <Typography variant="caption-sm" color="text.secondary">Couldn’t read the item’s links. {links.error}</Typography>
      ) : currentLinks.length ? (
        <Box component="section" aria-label="Linked now" sx={{ display: 'grid', gap: 0.5 }}>
          <Typography variant="caption-sm" color="text.secondary" sx={{ fontWeight: 600 }}>Linked now</Typography>
          {currentLinks.slice(0, MAX_LISTED_LINKS).map((link) => {
            const label = `${getLinkTypeName(link.rel, types)} ${formatLinkTarget({ id: link.targetId, title: link.target?.title })}`
            return (
              <Box key={`${link.rel}:${link.targetId}`} sx={linkRowSx}>
                <Box component="span" sx={ellipsisSx}>{label}</Box>
                <IconButton size="small" label={`Remove ${label}`} onClick={() => remove(link)}>
                  <Icon href={svgDismiss} />
                </IconButton>
              </Box>
            )
          })}
          {currentLinks.length > MAX_LISTED_LINKS ? (
            <Typography variant="caption-sm" color="text.secondary">and {currentLinks.length - MAX_LISTED_LINKS} more</Typography>
          ) : null}
        </Box>
      ) : null}
      <Box sx={actionsSx}>
        <Button size="small" onClick={onCancel}>Cancel</Button>
        <Button size="small" variant="contained" type="submit" disabled={blocked}>
          {replaced ? (isParent ? 'Change parent' : 'Replace link') : 'Add link'}
        </Button>
      </Box>
    </Box>
  )
}
