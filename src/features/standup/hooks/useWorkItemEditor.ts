import { useCallback, useMemo, useRef, useState } from 'react'
import type { AdoQueryEngine, PullRequestPatch } from '../../../ado/queryEngine'
import type { TeamIterationOption, TeamMember } from '../../../ado/types'
import type { WorkItemCurrentLink, WorkItemLinkChange, WorkItemLinkTarget, WorkItemLinkType } from '../../../ado/workItemLinksApi'
import { getWorkItemFields, patchWorkItem } from '../../../ado/workItemPatch'
import type { TagRule } from '../../../ado/workItemStatus'
import type { ProjectWorkItemState } from '../../../ado/workItemTypesApi'
import {
  applyFieldChanges,
  changedFields,
  EDITABLE_WORK_ITEM_FIELDS,
  isWorkItemWriteAccessError,
  sameFieldValue,
  WORK_ITEM_FIELD_LABELS,
  WorkItemConflictError,
  type EditableWorkItemField,
  type WorkItemFieldChanges,
  type WorkItemFields,
} from '../../../ado/workItemUpdateApi'
import type { TeamProfile } from '../../../appSettings'
import {
  describeSavedChange,
  getItemKey,
  getItemLabel,
  getPullRequestChanges,
  getRestoreChanges,
  getStatesForItem,
  hasItemActions,
  havePullRequestsChanged,
  isEditableWorkItem,
  isPullRequestCard,
  type EditableWorkItem,
} from '../utils/workItemEditing'
import { loadRecentLinkTargets, rememberLinkTargets } from '../utils/recentLinkTargets'
import { describeLinkChange, getDuplicateCloseState } from '../utils/workItemLinkEditing'
import { toErrorMessage } from './queryErrors'

export type WorkItemEditToast = {
  /** Changes with every toast, so a new message replaces the last one. */
  key: number
  tone: 'success' | 'error' | 'warning' | 'info'
  message: string
  undo?: () => void
  /** A follow-up the change suggests, such as closing an item just marked a duplicate. */
  action?: { label: string; run: () => void }
}

/** Items the link editor suggests together, such as the open Features under the team's area path. */
export type WorkItemLinkSuggestions = { label: string; items: WorkItemLinkTarget[] }

/** What the link editor reads to show an item's links and find items to link it to. */
export type WorkItemLinkSource = {
  getLinks: (item: EditableWorkItem) => Promise<WorkItemCurrentLink[]>
  /** The organization's link types beyond the common ones. */
  getLinkTypes: () => Promise<WorkItemLinkType[]>
  /** The item an ID or address names, or items with the typed words in their titles; never the item itself. */
  search: (item: EditableWorkItem, query: string) => Promise<WorkItemLinkTarget[]>
  /** Open items one backlog level above the item's type under the team's area path, or null when there's no such level. */
  getParentCandidates: (item: EditableWorkItem) => Promise<WorkItemLinkSuggestions | null>
  /** The items most recently linked to in the project. */
  getRecent: () => WorkItemLinkTarget[]
  /** Parents the team's items already have, such as those in the Triage queue. */
  parentSuggestions: WorkItemLinkSuggestions | null
}

export type WorkItemLinkSaveOptions = {
  /** The linked items as the editor showed them, for the confirmation and the recent picks. */
  targets?: readonly WorkItemLinkTarget[]
  /** The link types beyond the common ones, to name them in the confirmation. */
  types?: readonly WorkItemLinkType[]
}

/** The choices the field editors offer. */
export type WorkItemEditOptions = {
  statesFor: (item: EditableWorkItem) => ProjectWorkItemState[]
  iterations: TeamIterationOption[]
  /** The team's backlog iteration, for items that are not planned in a sprint. */
  backlogPath: string
  members: TeamMember[]
  /** Tags already used on the team's items, to suggest while typing. */
  knownTags: string[]
  effortSuggestions: number[]
  tagRules: TagRule[]
}

export type WorkItemEditor = {
  options: WorkItemEditOptions
  /** Why editing is off for this PAT, such as a missing write scope; reloading still works. */
  lockedReason: string | null
  canEdit: (item: EditableWorkItem) => boolean
  canReload: (item: EditableWorkItem) => boolean
  /** True while the item saves or reloads; it takes one change at a time. */
  isBusy: (item: EditableWorkItem) => boolean
  /** Saves the changes and shows them at once, undoing them on screen when the save fails. Resolves whether it saved. */
  save: (item: EditableWorkItem, changes: WorkItemFieldChanges) => Promise<boolean>
  /**
   * Adds and removes the item's links to other work items, confirming with Undo; adding a parent replaces the one it had.
   * Resolves whether it saved.
   */
  saveLinks: (item: EditableWorkItem, change: WorkItemLinkChange, options?: WorkItemLinkSaveOptions) => Promise<boolean>
  /** Where the link editor finds items to link to; null without a connection to Azure DevOps. */
  links: WorkItemLinkSource | null
  /**
   * Reads the item fresh from Azure DevOps, updating it in every view without reloading the page: a work item with the
   * pull requests its card shows, or a pull request card's pull request.
   */
  reload: (item: EditableWorkItem) => Promise<void>
  toast: WorkItemEditToast | null
  dismissToast: () => void
  /** Shows a passing note, such as a warning about why a card can't be dropped where it was released. */
  notify: (message: string, tone?: WorkItemEditToast['tone']) => void
}

/** What cards and rows use to edit their item. Their methods keep their identity while the options and toast change. */
export type WorkItemEditorActions = Pick<WorkItemEditor, 'lockedReason' | 'canEdit' | 'canReload' | 'isBusy' | 'save' | 'saveLinks' | 'reload' | 'notify'>

type EditorScope = { engine: AdoQueryEngine | null; orgName: string; projectName: string }

/** What a toast says once a pull request card is read again. */
function describePullRequestReload(item: EditableWorkItem, patch: PullRequestPatch): string {
  const label = getItemLabel(item)
  if (!patch.card?.pullRequest) {
    if (patch.status === 'draft') return `${label} is a draft again, so it left the board.`
    if (patch.status === 'abandoned') return `${label} was abandoned, so it left the board.`
    return `${label} left the board.`
  }
  const changed = item.pullRequest ? getPullRequestChanges(item.pullRequest, patch.card.pullRequest) : []
  return changed.length ? `${label} reloaded: ${changed.join(', ')} changed.` : `${label} is up to date.`
}

function pickFields(fields: WorkItemFields, names: readonly EditableWorkItemField[]): Partial<WorkItemFields> {
  return Object.fromEntries(names.map((name) => [name, fields[name]])) as Partial<WorkItemFields>
}

function pickChanges(changes: WorkItemFieldChanges, names: readonly EditableWorkItemField[]): WorkItemFieldChanges {
  return Object.fromEntries(names.map((name) => [name, changes[name]])) as WorkItemFieldChanges
}

export function useWorkItemEditor({
  engine, team, statesByType, projectStates, iterations, members, knownTags, effortSuggestions, tagRules, parentSuggestions,
}: {
  engine: AdoQueryEngine | null
  /** With its ID and area path, the link editor also suggests open items one backlog level up in the team's area. */
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'iterationPath'> & Partial<Pick<TeamProfile, 'id' | 'areaPath'>>
  statesByType: Record<string, ProjectWorkItemState[]>
  projectStates: ProjectWorkItemState[]
  iterations: TeamIterationOption[]
  members: TeamMember[]
  knownTags: string[]
  effortSuggestions: number[]
  tagRules: TagRule[]
  parentSuggestions?: WorkItemLinkSuggestions | null
}): WorkItemEditor {
  const { orgName, projectName } = team
  const scope = useMemo<EditorScope>(() => ({ engine, orgName, projectName }), [engine, orgName, projectName])
  const activeScope = useRef(scope)
  activeScope.current = scope
  const busyKeys = useRef(new Set<string>())
  const toastKey = useRef(0)
  const [state, setState] = useState({
    scope,
    busy: new Set<string>() as ReadonlySet<string>,
    toast: null as WorkItemEditToast | null,
  })
  const [locked, setLocked] = useState<{ engine: AdoQueryEngine; reason: string } | null>(null)
  if (state.scope !== scope) {
    busyKeys.current = new Set()
    setState({ scope, busy: new Set(), toast: null })
  }
  const current = state.scope === scope ? state : { busy: new Set<string>() as ReadonlySet<string>, toast: null }
  const lockedReason = engine && locked?.engine === engine ? locked.reason : null

  const showToast = useCallback((toast: Omit<WorkItemEditToast, 'key'>) => {
    toastKey.current += 1
    const next = { ...toast, key: toastKey.current }
    setState((previous) => (previous.scope === activeScope.current ? { ...previous, toast: next } : previous))
  }, [])

  const setBusy = useCallback((key: string, busy: boolean) => {
    if (busy) busyKeys.current.add(key)
    else busyKeys.current.delete(key)
    setState((previous) => {
      if (previous.scope !== scope) return previous
      const next = new Set(previous.busy)
      if (busy) next.add(key)
      else next.delete(key)
      return { ...previous, busy: next }
    })
  }, [scope])

  const canReload = useCallback((item: EditableWorkItem) => Boolean(engine) && hasItemActions(item), [engine])
  // Pull request cards have no fields to edit.
  const canEdit = useCallback((item: EditableWorkItem) => Boolean(engine) && isEditableWorkItem(item) && !lockedReason, [engine, lockedReason])

  const write = useCallback(async (item: EditableWorkItem, changes: WorkItemFieldChanges, undoable: boolean): Promise<boolean> => {
    if (!engine || !canEdit(item)) return false
    const key = getItemKey(item)
    if (busyKeys.current.has(key)) return false
    const before = getWorkItemFields(item)
    const fields = changedFields(before, changes)
    if (!fields.length) return true
    const update = pickChanges(changes, fields)
    setBusy(key, true)
    // Shows the change in every view while it saves.
    engine.previewWorkItemFields(team, item.id, applyFieldChanges(before, update))
    try {
      const patch = await engine.updateWorkItem(team, item.id, update, pickFields(before, fields))
      if (activeScope.current !== scope) return true
      const saved = patchWorkItem(item, patch)
      showToast({
        tone: 'success',
        message: undoable ? describeSavedChange(item.id, fields, patch.fields) : `#${item.id}: change undone.`,
        undo: undoable ? () => void write(saved, getRestoreChanges(before, fields), false) : undefined,
      })
      return true
    } catch (error) {
      if (activeScope.current !== scope) return false
      // On a conflict the engine already shows the item as Azure DevOps has it.
      if (!(error instanceof WorkItemConflictError)) {
        engine.previewWorkItemFields(team, item.id, before)
        if (isWorkItemWriteAccessError(error)) {
          setLocked({ engine, reason: toErrorMessage(error, 'Your PAT cannot edit work items.') })
        } else {
          // The save may have failed partway; show whatever Azure DevOps has now.
          void engine.reloadWorkItem(team, item.id).catch(() => undefined)
        }
      }
      showToast({ tone: 'error', message: toErrorMessage(error, `#${item.id} could not be saved. Reload it and try again.`) })
      return false
    } finally {
      setBusy(key, false)
    }
  }, [engine, team, scope, canEdit, setBusy, showToast])

  const writeLinks = useCallback(async (
    item: EditableWorkItem,
    change: WorkItemLinkChange,
    linkOptions: WorkItemLinkSaveOptions,
    undoable: boolean,
  ): Promise<boolean> => {
    if (!engine || !canEdit(item)) return false
    const key = getItemKey(item)
    if (busyKeys.current.has(key)) return false
    const titles = Object.fromEntries((linkOptions.targets ?? []).flatMap((target) => (target.title ? [[target.id, target.title]] : [])))
    setBusy(key, true)
    try {
      const { patch, added, removed } = await engine.updateWorkItemLinks(team, item.id, change, { titles })
      if (activeScope.current !== scope) return true
      if (undoable) rememberLinkTargets(team, (linkOptions.targets ?? []).filter((target) => added.some((link) => link.targetId === target.id)))
      if (!patch) {
        showToast({ tone: 'info', message: change.add?.length ? `#${item.id} already has that link.` : `#${item.id} no longer has that link.` })
        return true
      }
      const saved = patchWorkItem(item, patch)
      const closeState = undoable ? getDuplicateCloseState(added, getStatesForItem(item, statesByType, projectStates), saved.state) : undefined
      showToast({
        tone: 'success',
        message: undoable ? describeLinkChange(item.id, added, removed, { types: linkOptions.types, titles }) : `#${item.id}: link change undone.`,
        undo: undoable ? () => void writeLinks(saved, { add: removed, remove: added }, linkOptions, false) : undefined,
        action: closeState ? { label: `Move to ${closeState}`, run: () => void write(saved, { state: closeState }, true) } : undefined,
      })
      return true
    } catch (error) {
      if (activeScope.current !== scope) return false
      if (isWorkItemWriteAccessError(error)) {
        setLocked({ engine, reason: toErrorMessage(error, 'Your PAT cannot edit work items.') })
      } else {
        // The save may have failed partway; show whatever Azure DevOps has now.
        void engine.reloadWorkItem(team, item.id).catch(() => undefined)
      }
      showToast({ tone: 'error', message: toErrorMessage(error, `#${item.id}’s links could not be saved. Reload it and try again.`) })
      return false
    } finally {
      setBusy(key, false)
    }
  }, [engine, team, scope, canEdit, setBusy, showToast, write, statesByType, projectStates])

  const reload = useCallback(async (item: EditableWorkItem): Promise<void> => {
    if (!engine || !canReload(item)) return
    const key = getItemKey(item)
    if (busyKeys.current.has(key)) return
    const label = getItemLabel(item)
    const before = getWorkItemFields(item)
    setBusy(key, true)
    try {
      if (isPullRequestCard(item)) {
        const patch = await engine.reloadPullRequest(team, item.pullRequest)
        if (activeScope.current !== scope) return
        showToast({ tone: 'info', message: describePullRequestReload(item, patch) })
        return
      }
      // Only views that show an item's pull requests, such as board cards, read them again.
      const withPullRequests = 'activePullRequests' in item
      const patch = await engine.reloadWorkItem(team, item.id, { pullRequests: withPullRequests })
      if (activeScope.current !== scope) return
      const changed = EDITABLE_WORK_ITEM_FIELDS
        .filter((field) => !sameFieldValue(field, before[field], patch.fields[field] as never))
        .map((field) => WORK_ITEM_FIELD_LABELS[field])
      if (patch.pullRequests && havePullRequestsChanged(item.activePullRequests, patch.pullRequests.active)) changed.push('Pull requests')
      const summary = changed.length ? `${label} reloaded: ${changed.join(', ')} changed` : `${label} is up to date`
      showToast(patch.pullRequestsUnavailable
        ? { tone: 'warning', message: `${summary}, but its pull requests couldn’t be read. They show as they were.` }
        : { tone: 'info', message: `${summary}.` })
    } catch (error) {
      if (activeScope.current !== scope) return
      showToast({ tone: 'error', message: `${label} could not be reloaded. ${toErrorMessage(error, '')}`.trim() })
    } finally {
      setBusy(key, false)
    }
  }, [engine, team, scope, canReload, setBusy, showToast])

  const options = useMemo<WorkItemEditOptions>(() => ({
    statesFor: (item) => getStatesForItem(item, statesByType, projectStates),
    iterations,
    backlogPath: team.iterationPath,
    members,
    knownTags,
    effortSuggestions,
    tagRules,
  }), [statesByType, projectStates, iterations, team.iterationPath, members, knownTags, effortSuggestions, tagRules])

  const { busy, toast } = current
  const isBusy = useCallback((item: EditableWorkItem) => busy.has(getItemKey(item)), [busy])
  const save = useCallback((item: EditableWorkItem, changes: WorkItemFieldChanges) => write(item, changes, true), [write])
  const saveLinks = useCallback(
    (item: EditableWorkItem, change: WorkItemLinkChange, linkOptions: WorkItemLinkSaveOptions = {}) => writeLinks(item, change, linkOptions, true),
    [writeLinks],
  )
  const { id: teamId, areaPath } = team
  const links = useMemo<WorkItemLinkSource | null>(() => {
    if (!engine) return null
    const project = { orgName, projectName }
    return {
      getLinks: (item) => engine.getWorkItemLinks(project, item.id),
      getLinkTypes: () => engine.getWorkItemLinkTypes(project),
      search: (item, query) => engine.searchWorkItems(project, query, { excludeId: item.id }),
      getParentCandidates: async (item) => (teamId && areaPath !== undefined
        ? engine.getParentCandidates({ id: teamId, orgName, projectName, areaPath }, item.workItemType)
        : null),
      getRecent: () => loadRecentLinkTargets(project),
      parentSuggestions: parentSuggestions?.items.length ? parentSuggestions : null,
    }
  }, [engine, orgName, projectName, teamId, areaPath, parentSuggestions])
  const dismissToast = useCallback(() => setState((previous) => ({ ...previous, toast: null })), [])
  const notify = useCallback((message: string, tone: WorkItemEditToast['tone'] = 'info') => showToast({ tone, message }), [showToast])
  return useMemo<WorkItemEditor>(() => ({
    options,
    lockedReason,
    canEdit,
    canReload,
    isBusy,
    save,
    saveLinks,
    links,
    reload,
    toast,
    dismissToast,
    notify,
  }), [options, lockedReason, canEdit, canReload, isBusy, save, saveLinks, links, reload, toast, dismissToast, notify])
}
