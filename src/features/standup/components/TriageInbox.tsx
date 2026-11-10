import { Box, Link } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgChat from '@stratakit/icons/chat.svg'
import svgClock from '@stratakit/icons/clock.svg'
import svgHourglass from '@stratakit/icons/hourglass.svg'
import svgInbox from '@stratakit/icons/inbox.svg'
import svgLink from '@stratakit/icons/link.svg'
import svgStatusSuccess from '@stratakit/icons/status-success.svg'
import type { TriageItem } from '../../../ado/types'
import type { BacklogSprintResolver } from '../utils/backlogSprint'
import { formatAssignee } from '../utils/backlogValue'
import { formatTriageParent, getTriageTitleTags, UNKNOWN_CREATOR_LABEL } from '../utils/triageDisplay'
import {
  formatTriageCreated, formatTriageMoment, formatTriageVisit, formatTriageWhen, getTriageEntry, getTriageItemAge,
  getTriageWaiting, groupTriageInbox, summarizeTriageInbox, type TriageInboxGroupKey,
} from '../utils/triageInbox'
import type { TriageReadinessChecks } from '../utils/triageOptions'
import { describeTriageClearing, getTriageChecksFor, getTriageReadiness, hasTriageChecks } from '../utils/triageRules'
import { AppTooltip } from './AppTooltip'
import { TipLines } from './TipLines'
import { TERTIARY_TEXT_COLOR } from './developmentCardDisplay'
import { TriageChecklist, TriageEffort, TriageImpact, TriageReasons, TriageSeverity, TriageTypeIcon } from './TriageFields'
import { PersonLabel, SprintLabel, StateLabel } from './WorkItemFields'
import { WorkItemTitle } from './WorkItemTitle'
import { METER_TRACK_COLOR, workItemTitleCellSx } from './workItemTableDisplay'

const ATTENTION_TEXT = 'var(--stratakit-color-text-attention-base)'
const smallIconStyle = { width: 14, height: 14, flexShrink: 0 }
const TAG_LIST_FORMAT = new Intl.ListFormat('en', { type: 'disjunction' })

// The scroller is the container the cards measure, so they fold the fields under the title when the page is narrow
// rather than when the window is.
const scrollerSx: SxProps<Theme> = {
  position: 'relative',
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  scrollbarGutter: 'stable',
  containerType: 'inline-size',
}
const columnSx: SxProps<Theme> = { display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 1280, p: 2 }

const summarySx: SxProps<Theme> = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '6px 18px',
  m: 0,
  p: 0,
  listStyle: 'none',
  fontSize: 12.5,
  color: 'text.secondary',
  '& > li': { display: 'inline-flex', alignItems: 'center', gap: 0.75 },
  '& b': { color: 'text.primary', fontVariantNumeric: 'tabular-nums' },
  '& > li.attention, & > li.attention b': { color: ATTENTION_TEXT },
}

const headingSx: SxProps<Theme> = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: 1,
  m: 0,
  fontSize: 13,
  fontWeight: 650,
  color: 'text.primary',
  '& .count': {
    px: 0.875,
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    color: 'text.secondary',
    bgcolor: METER_TRACK_COLOR,
  },
  '& .subtitle': { fontSize: 11.5, fontWeight: 500, color: TERTIARY_TEXT_COLOR },
}

// Each card is a grid of the type icon, the title with what happened and what is missing, then the fields. Styled from
// the list so each card costs no sx of its own.
const cardListSx: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  m: 0,
  mt: 1,
  p: 0,
  listStyle: 'none',
  '& > li': {
    display: 'grid',
    gridTemplateColumns: '16px minmax(0, 1fr) auto',
    alignItems: 'start',
    gap: '6px 14px',
    px: 1.75,
    py: 1.25,
    bgcolor: 'background.paper',
    border: '1px solid var(--stratakit-color-border-neutral-muted)',
    borderRadius: 1,
    boxShadow: 'inset 3px 0 0 var(--triage-edge, transparent), var(--stratakit-shadow-surface-xs)',
  },
  '& > li.ready': { '--triage-edge': 'var(--stratakit-color-border-positive-base)' },
  '& .card-main': { minWidth: 0, display: 'grid', gap: 0.75 },
  '& .card-title': { ...workItemTitleCellSx, fontSize: 13.5, lineHeight: 1.4 },
  '& .card-meta': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '4px 8px',
    fontSize: 12,
    color: 'text.secondary',
  },
  '& .card-meta .separator': { color: TERTIARY_TEXT_COLOR },
  '& .card-meta .with-icon': { display: 'inline-flex', alignItems: 'center', gap: 0.625 },
  '& .card-meta .stale': { color: ATTENTION_TEXT, fontWeight: 600 },
  '& .card-meta .parent-id': { fontWeight: 650, fontVariantNumeric: 'tabular-nums', mr: 0.5 },
  '& .card-fields': {
    display: 'grid',
    gridTemplateColumns: '104px 40px 72px 128px',
    alignItems: 'center',
    gap: 1.25,
    pt: '1px',
    fontSize: 12,
  },
  '& .card-fields .effort-label': { color: TERTIARY_TEXT_COLOR, mr: 0.5 },
  '@container (max-width: 880px)': {
    '& > li': { gridTemplateColumns: '16px minmax(0, 1fr)' },
    '& .card-fields': { gridColumn: 2, display: 'flex', flexWrap: 'wrap', gap: '6px 16px' },
  },
}

const GROUP_TITLES: Record<TriageInboxGroupKey, string> = {
  new: 'New since your last visit',
  todo: 'Still to triage',
  waiting: 'Waiting on others',
}

function Separator() {
  return <span className="separator" aria-hidden="true">·</span>
}

function When({ at, now }: { at: string; now: Date }) {
  return (
    <AppTooltip title={formatTriageMoment(at)} describeChild>
      <time dateTime={at}>{formatTriageWhen(at, now)}</time>
    </AppTooltip>
  )
}

const personName = (person: TriageItem['createdBy']) => formatAssignee(person) || UNKNOWN_CREATOR_LABEL

/** "Filed 1h ago by Ana", or "Tagged “Triage” yesterday by Ben · created Apr 28" when the item arrived later. */
function EntryText({ item, now }: { item: TriageItem; now: Date }) {
  const entry = getTriageEntry(item)
  if (!entry) return null
  const by = personName(entry.by)
  if (entry.kind === 'filed') return <span>Filed <When at={entry.at} now={now} /> by {by}</span>
  const what = entry.kind === 'tagged' ? `Tagged “${entry.tag}”` : `Moved to ${item.state}`
  return (
    <>
      <span>{what} <When at={entry.at} now={now} /> by {by}</span>
      {item.createdAt ? (
        <>
          <Separator />
          <AppTooltip title={`Created ${formatTriageMoment(item.createdAt)} by ${personName(item.createdBy)}`} describeChild>
            <span>created {formatTriageCreated(item.createdAt, now)}</span>
          </AppTooltip>
        </>
      ) : null}
    </>
  )
}

function WaitingText({ item, waitingTags, now }: { item: TriageItem; waitingTags: readonly string[]; now: Date }) {
  const waiting = getTriageWaiting(item, waitingTags)
  if (!waiting) return null
  const tags = waiting.tags.map((tag) => `“${tag}”`).join(', ')
  const sinceTip = waiting.since
    ? `${tags} added ${formatTriageMoment(waiting.since.at)}${waiting.since.by ? ` by ${personName(waiting.since.by)}` : ''}`
    : `Tagged ${tags}`
  const reply = waiting.reply
  return (
    <>
      <Separator />
      <AppTooltip title={sinceTip} describeChild>
        <span className="with-icon">
          <Icon href={svgHourglass} alt="" style={smallIconStyle} />
          {waiting.tags.join(', ')}{waiting.since ? <> since {formatTriageWhen(waiting.since.at, now)}</> : null}
        </span>
      </AppTooltip>
      {reply ? (
        <>
          <Separator />
          <AppTooltip title={reply.text ? <TipLines lines={[reply.text]} /> : formatTriageMoment(reply.at)} describeChild>
            <span className="with-icon">
              <Icon href={svgChat} alt="" style={smallIconStyle} />
              <b>{personName(reply.by)}</b> replied {formatTriageWhen(reply.at, now)}
            </span>
          </AppTooltip>
        </>
      ) : null}
    </>
  )
}

function StaleText({ item, ageFlagDays, waitingTags, now }: { item: TriageItem; ageFlagDays: number; waitingTags: readonly string[]; now: Date }) {
  const age = getTriageItemAge(item, ageFlagDays, waitingTags, now)
  const entry = getTriageEntry(item)
  if (!age?.flagged || !entry) return null
  const tip = `In triage since ${formatTriageMoment(entry.at)}. It turns amber after ${ageFlagDays} working ${ageFlagDays === 1 ? 'day' : 'days'}.`
  return (
    <>
      <Separator />
      <AppTooltip title={tip} describeChild>
        <span className="with-icon stale">
          <Icon href={svgClock} alt="" style={{ ...smallIconStyle, color: 'var(--stratakit-color-icon-attention-base)' }} />
          {age.workingDays} working {age.workingDays === 1 ? 'day' : 'days'} in triage
        </span>
      </AppTooltip>
    </>
  )
}

// Only what differs from a fresh item: a state other than the type's first, someone assigned, or a parent.
const showsState = (item: TriageItem) => item.inInitialState === undefined ? item.state !== 'New' : !item.inInitialState

type CardProps = {
  item: TriageItem
  resolveSprint: BacklogSprintResolver
  ageFlagDays: number
  readinessChecks: TriageReadinessChecks
  excludedIterationPaths: readonly string[]
  waitingTags: readonly string[]
  now: Date
}

function TriageInboxCard({ item, resolveSprint, ageFlagDays, readinessChecks, excludedIterationPaths, waitingTags, now }: CardProps) {
  const checks = getTriageChecksFor(item, readinessChecks)
  const clearing = describeTriageClearing(item, excludedIterationPaths)
  const ready = hasTriageChecks(readinessChecks) && getTriageReadiness(item, readinessChecks).ready
  // The waiting tags are named in the meta line, like the Triage tags in the Why chips.
  const waiting = new Set(waitingTags.map((tag) => tag.toLowerCase()))
  const tags = getTriageTitleTags(item).filter((tag) => !waiting.has(tag.toLowerCase()))
  const sprint = resolveSprint(item.iterationPath)

  return (
    <li className={ready ? 'ready' : undefined} data-triage-card={item.id}>
      <TriageTypeIcon item={item} />
      <div className="card-main">
        <div className="card-title"><WorkItemTitle item={{ ...item, tags }} /></div>
        <div className="card-meta">
          <EntryText item={item} now={now} />
          <TriageReasons item={item} clearing={clearing} />
          {showsState(item) ? <><Separator /><StateLabel state={item.state} /></> : null}
          {item.assignedTo ? (
            <><Separator /><span className="with-icon">Assigned to <PersonLabel person={item.assignedTo} emptyLabel="" /></span></>
          ) : null}
          {item.parent ? (
            <>
              <Separator />
              <AppTooltip title="Parent" describeChild>
                <span className="with-icon">
                  <Icon href={svgLink} alt="" style={smallIconStyle} />
                  <Link href={item.parent.workItemUrl} target="_blank" rel="noopener noreferrer">{formatTriageParent(item.parent)}</Link>
                </span>
              </AppTooltip>
            </>
          ) : null}
          <WaitingText item={item} waitingTags={waitingTags} now={now} />
          <StaleText item={item} ageFlagDays={ageFlagDays} waitingTags={waitingTags} now={now} />
        </div>
        <TriageChecklist item={item} checks={readinessChecks} clearing={clearing} />
      </div>
      <div className="card-fields">
        <span><TriageSeverity item={item} checks={checks} /></span>
        <span><TriageImpact item={item} checks={checks} /></span>
        <span><span className="effort-label">Effort</span><TriageEffort item={item} checks={checks} /></span>
        <span>{sprint.kind === 'backlog' ? null : <SprintLabel sprint={sprint} iterationPath={item.iterationPath} />}</span>
      </div>
    </li>
  )
}

type TriageInboxProps = Omit<CardProps, 'item' | 'now'> & {
  items: TriageItem[]
  /** When the team's Triage page was last open on an earlier day; null on the first visit, so nothing counts as new. */
  lastVisit: number | null
  now?: Date
}

/**
 * The queue as a to-do list: what arrived since the last visit, what is still to triage, then what is waiting on someone
 * else, each longest in triage first.
 */
export function TriageInbox({ items, lastVisit, now = new Date(), ...cardProps }: TriageInboxProps) {
  const { ageFlagDays, readinessChecks, waitingTags } = cardProps
  const groups = groupTriageInbox(items, waitingTags, lastVisit)
  const summary = summarizeTriageInbox(groups, readinessChecks, ageFlagDays, waitingTags, now)
  const hasNew = groups.some((group) => group.key === 'new')
  const subtitles: Record<TriageInboxGroupKey, string> = {
    new: lastVisit === null ? '' : `since ${formatTriageVisit(lastVisit, now)}`,
    todo: 'longest in triage first',
    waiting: waitingTags.length ? `tagged ${TAG_LIST_FORMAT.format(waitingTags.map((tag) => `“${tag}”`))}` : '',
  }

  return (
    <Box component="main" sx={scrollerSx}>
      <Box sx={columnSx}>
        <Box component="ul" role="list" aria-label="Triage summary" sx={summarySx}>
          <li><b>{summary.total}</b> in triage</li>
          {lastVisit === null ? null : (
            <li><Icon href={svgInbox} alt="" style={smallIconStyle} /><b>{summary.newCount}</b> new since {formatTriageVisit(lastVisit, now)}</li>
          )}
          {summary.ready === undefined ? null : (
            <li>
              <Icon href={svgStatusSuccess} alt="" style={{ ...smallIconStyle, color: 'var(--stratakit-color-icon-positive-base)' }} />
              <b>{summary.ready}</b> ready to clear
            </li>
          )}
          {summary.waiting ? <li><Icon href={svgHourglass} alt="" style={smallIconStyle} /><b>{summary.waiting}</b> waiting on others</li> : null}
          {summary.stale ? (
            <li className="attention">
              <Icon href={svgClock} alt="" style={{ ...smallIconStyle, color: 'var(--stratakit-color-icon-attention-base)' }} />
              <b>{summary.stale}</b> in triage {ageFlagDays}+ working {ageFlagDays === 1 ? 'day' : 'days'}
            </li>
          ) : null}
        </Box>
        {groups.map((group) => {
          const title = group.key === 'todo' && !hasNew ? 'To triage' : GROUP_TITLES[group.key]
          const headingId = `triage-inbox-${group.key}`
          return (
            <section key={group.key} aria-labelledby={headingId}>
              <Box component="h2" id={headingId} sx={headingSx}>
                {title}
                <span className="count">{group.items.length}</span>
                {subtitles[group.key] ? <span className="subtitle">{subtitles[group.key]}</span> : null}
              </Box>
              <Box component="ul" role="list" aria-label={title} sx={cardListSx}>
                {group.items.map((item) => <TriageInboxCard key={item.id} item={item} now={now} {...cardProps} />)}
              </Box>
            </section>
          )
        })}
      </Box>
    </Box>
  )
}
