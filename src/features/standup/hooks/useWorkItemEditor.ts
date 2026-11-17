import { useCallback, useMemo, useRef, useState } from 'react'
import type { AdoQueryEngine } from '../../../ado/queryEngine'
import type { TeamIterationOption, TeamMember } from '../../../ado/types'
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
  getRestoreChanges,
  getStatesForItem,
  isEditableWorkItem,
  type EditableWorkItem,
} from '../utils/workItemEditing'
import { toErrorMessage } from './queryErrors'

export type WorkItemEditToast = {
  /** Changes with every toast, so a new message replaces the last one. */
  key: number
  tone: 'success' | 'error' | 'info'
  message: string
  undo?: () => void
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
  /** Reads the item fresh from Azure DevOps, updating it in every view without reloading the page. */
  reload: (item: EditableWorkItem) => Promise<void>
  toast: WorkItemEditToast | null
  dismissToast: () => void
  /** Shows a passing note, such as why a card can't be dropped where it was released. */
  notify: (message: string) => void
}

type EditorScope = { engine: AdoQueryEngine | null; orgName: string; projectName: string }

const itemKey = (item: EditableWorkItem) => `${item.workItemUrl?.toLowerCase() ?? ''}#${item.id}`

function pickFields(fields: WorkItemFields, names: readonly EditableWorkItemField[]): Partial<WorkItemFields> {
  return Object.fromEntries(names.map((name) => [name, fields[name]])) as Partial<WorkItemFields>
}

function pickChanges(changes: WorkItemFieldChanges, names: readonly EditableWorkItemField[]): WorkItemFieldChanges {
  return Object.fromEntries(names.map((name) => [name, changes[name]])) as WorkItemFieldChanges
}

export function useWorkItemEditor({
  engine, team, statesByType, projectStates, iterations, members, knownTags, effortSuggestions, tagRules,
}: {
  engine: AdoQueryEngine | null
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'iterationPath'>
  statesByType: Record<string, ProjectWorkItemState[]>
  projectStates: ProjectWorkItemState[]
  iterations: TeamIterationOption[]
  members: TeamMember[]
  knownTags: string[]
  effortSuggestions: number[]
  tagRules: TagRule[]
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

  const canReload = useCallback((item: EditableWorkItem) => Boolean(engine) && isEditableWorkItem(item), [engine])
  const canEdit = useCallback((item: EditableWorkItem) => canReload(item) && !lockedReason, [canReload, lockedReason])

  const write = useCallback(async (item: EditableWorkItem, changes: WorkItemFieldChanges, undoable: boolean): Promise<boolean> => {
    if (!engine || !canEdit(item)) return false
    const key = itemKey(item)
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

  const reload = useCallback(async (item: EditableWorkItem): Promise<void> => {
    if (!engine || !canReload(item)) return
    const key = itemKey(item)
    if (busyKeys.current.has(key)) return
    const before = getWorkItemFields(item)
    setBusy(key, true)
    try {
      const patch = await engine.reloadWorkItem(team, item.id)
      if (activeScope.current !== scope) return
      const changed = EDITABLE_WORK_ITEM_FIELDS.filter((field) => !sameFieldValue(field, before[field], patch.fields[field] as never))
      showToast({
        tone: 'info',
        message: changed.length
          ? `#${item.id} reloaded: ${changed.map((field) => WORK_ITEM_FIELD_LABELS[field]).join(', ')} changed.`
          : `#${item.id} is up to date.`,
      })
    } catch (error) {
      if (activeScope.current !== scope) return
      showToast({ tone: 'error', message: `#${item.id} could not be reloaded. ${toErrorMessage(error, '')}`.trim() })
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
  // Every card reads the editor from context, so it changes only when something its methods use does.
  return useMemo<WorkItemEditor>(() => ({
    options,
    lockedReason,
    canEdit,
    canReload,
    isBusy: (item) => busy.has(itemKey(item)),
    save: (item, changes) => write(item, changes, true),
    reload,
    toast,
    dismissToast: () => setState((previous) => ({ ...previous, toast: null })),
    notify: (message) => showToast({ tone: 'info', message }),
  }), [options, lockedReason, canEdit, canReload, busy, write, reload, toast, showToast])
}
