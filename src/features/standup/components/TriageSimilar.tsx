import { Fragment } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Typography } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgDismiss from '@stratakit/icons/dismiss.svg'
import svgDuplicate from '@stratakit/icons/duplicate.svg'
import svgHistory from '@stratakit/icons/history.svg'
import type { TriageItem } from '../../../ado/types'
import { UNASSIGNED_LABEL } from '../utils/backlogFilter'
import type { BacklogSprintResolver } from '../utils/backlogSprint'
import { formatAssignee } from '../utils/backlogValue'
import { UNKNOWN_CREATOR_LABEL } from '../utils/triageDisplay'
import { formatTriageCreated, formatTriageMoment } from '../utils/triageInbox'
import {
  getSharedTitleWords, splitTitleByStems, toTriageMatchCandidate, TRIAGE_MATCH_LEADS, type TriageMatch, type TriageMatchCandidate,
} from '../utils/triageSimilar'
import { AppTooltip } from './AppTooltip'
import { TipLines } from './TipLines'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'
import { TriageTypeIcon } from './TriageFields'
import { ImpactBars, NotSet, PersonLabel, SeverityChip, SprintLabel, StateLabel } from './WorkItemFields'

// The words two titles share, tinted like a text highlighter and bold. Mixed from the accent so it reads on the strip's
// tint too; the weight keeps the words apart in the dark theme, where the tint is close to the muted strip.
const markSx = {
  bgcolor: 'color-mix(in srgb, var(--stratakit-color-bg-accent-base) 35%, transparent)',
  color: 'text.primary',
  fontWeight: 600,
  borderRadius: '2px',
  px: '1px',
}

function HighlightedTitle({ text, stems }: { text: string; stems: readonly string[] }) {
  return splitTitleByStems(text, stems).map((part, index) => (
    <Fragment key={index}>{part.shared ? <mark>{part.text}</mark> : part.text}</Fragment>
  ))
}

const iconStyle = { width: 14, height: 14, flexShrink: 0 }

// A tinted line under the item: accent for a possible duplicate, attention for a possible regression, which matters more.
const stripSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.75,
  minWidth: 0,
  py: '3px',
  pl: 1,
  pr: 0.5,
  borderRadius: 1,
  fontSize: 12,
  lineHeight: 1.4,
  color: 'text.secondary',
  bgcolor: 'var(--stratakit-color-bg-accent-muted)',
  overflowWrap: 'normal',
  '&.regression': { bgcolor: 'var(--stratakit-color-bg-attention-muted)' },
  '&.compact': { display: 'inline-flex', maxWidth: '100%' },
  '& .lead': { whiteSpace: 'nowrap' },
  '& .lead b': { color: 'text.primary', fontWeight: 650, fontVariantNumeric: 'tabular-nums' },
  '& .match-title': { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  '& .detail': { color: TERTIARY_TEXT_COLOR, whiteSpace: 'nowrap' },
  '& .compare': { ml: 'auto', flex: 'none', px: 0.5, font: 'inherit', fontWeight: 600 },
  '& mark': markSx,
}

type StripProps = {
  itemId: number
  match: TriageMatch
  /** From describeTriageMatch. */
  detail: string
  /** The Table's one-line form: the lead alone, with the title and detail in its tooltip. */
  compact?: boolean
  onCompare: (itemId: number) => void
}

/** The item's closest match: "Possible regression of 2160021", its title with the shared words marked, and Compare. */
export function TriageMatchStrip({ itemId, match, detail, compact = false, onCompare }: StripProps) {
  const { candidate } = match
  const regression = candidate.kind === 'closed'
  const lead = <span className="lead">{TRIAGE_MATCH_LEADS[candidate.kind]} <b>{candidate.id}</b></span>
  return (
    <Box className={[regression ? 'regression' : '', compact ? 'compact' : ''].filter(Boolean).join(' ') || undefined} sx={stripSx} data-triage-match={candidate.kind}>
      <Icon
        href={regression ? svgHistory : svgDuplicate} alt=""
        style={{ ...iconStyle, color: regression ? 'var(--stratakit-color-icon-attention-base)' : 'var(--stratakit-color-icon-accent-base)' }}
      />
      {compact ? (
        <AppTooltip title={<TipLines lines={[`${candidate.id}: ${candidate.title}`, detail].filter(Boolean)} />} describeChild>
          {lead}
        </AppTooltip>
      ) : (
        <>
          {lead}
          <span className="match-title"><HighlightedTitle text={candidate.title} stems={match.stems} /></span>
          {detail ? <span className="detail">· {detail}</span> : null}
        </>
      )}
      <Link component="button" type="button" className="compare" onClick={() => onCompare(itemId)}>
        Compare<Box component="span" sx={visuallyHiddenSx}> {itemId} with {candidate.id}</Box>
      </Link>
    </Box>
  )
}

const SIDE_LABELS: Record<TriageMatchCandidate['kind'], string> = {
  queue: 'Also in triage',
  open: 'Open bug',
  closed: 'Closed · possible regression',
}

const compareSx: SxProps<Theme> = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
  gap: 2,
  '& > section': {
    display: 'grid',
    alignContent: 'start',
    gap: 1,
    p: 1.5,
    border: '1px solid var(--stratakit-color-border-neutral-muted)',
    borderRadius: 1,
  },
  '& .side-top': { display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 12, color: TERTIARY_TEXT_COLOR },
  '& .side-top b': { color: 'text.secondary', fontWeight: 650, fontVariantNumeric: 'tabular-nums' },
  '& h3': { m: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.45, overflowWrap: 'anywhere' },
  '& dl': { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', gap: '6px 16px', m: 0, fontSize: 12 },
  '& dt': { color: TERTIARY_TEXT_COLOR },
  '& dd': { m: 0, minWidth: 0 },
  '& mark': markSx,
}

function CompareSide({ candidate, label, stems, resolveSprint, now }: {
  candidate: TriageMatchCandidate
  label: string
  stems: readonly string[]
  resolveSprint: BacklogSprintResolver
  now: Date
}) {
  const headingId = `triage-compare-${candidate.id}`
  const creator = formatAssignee(candidate.createdBy)
  return (
    <section aria-labelledby={headingId}>
      <div className="side-top"><TriageTypeIcon item={candidate} /><b>{candidate.id}</b>{label}</div>
      <h3 id={headingId}>
        <Link href={candidate.workItemUrl} target="_blank" rel="noopener noreferrer" color="inherit">
          <HighlightedTitle text={candidate.title} stems={stems} />
          <Box component="span" sx={visuallyHiddenSx}> (opens in a new tab)</Box>
        </Link>
      </h3>
      <dl>
        <dt>State</dt><dd>{candidate.state ? <StateLabel state={candidate.state} /> : <NotSet />}</dd>
        <dt>Sprint</dt><dd><SprintLabel sprint={resolveSprint(candidate.iterationPath)} iterationPath={candidate.iterationPath} /></dd>
        <dt>Assigned to</dt><dd><PersonLabel person={candidate.assignedTo} emptyLabel={UNASSIGNED_LABEL} /></dd>
        <dt>Created</dt>
        <dd>
          {candidate.createdAt ? (
            <AppTooltip title={formatTriageMoment(candidate.createdAt)} describeChild>
              <span>{formatTriageCreated(candidate.createdAt, now)}{candidate.kind === 'queue' || creator ? ` by ${creator || UNKNOWN_CREATOR_LABEL}` : ''}</span>
            </AppTooltip>
          ) : <NotSet />}
        </dd>
        {candidate.kind === 'closed' ? (
          <>
            <dt>Closed</dt>
            <dd>
              {candidate.closedAt ? (
                <AppTooltip title={formatTriageMoment(candidate.closedAt)} describeChild>
                  <span>{formatTriageCreated(candidate.closedAt, now)}</span>
                </AppTooltip>
              ) : <NotSet />}
            </dd>
          </>
        ) : null}
        <dt>Severity</dt>
        <dd>{candidate.severity === undefined ? <NotSet /> : <SeverityChip severity={candidate.severity} unsetTip="Severity is not set." />}</dd>
        <dt>Impact</dt>
        <dd>
          {candidate.priority === undefined
            ? <NotSet />
            : <ImpactBars priority={candidate.priority} detail="The Priority field" missingTip="Impact (the Priority field) is not set." />}
        </dd>
        <dt>Effort</dt><dd>{candidate.effort ?? <NotSet />}</dd>
      </dl>
    </section>
  )
}

function describeNextStep(item: TriageItem, candidate: TriageMatchCandidate): string {
  if (candidate.kind === 'closed') return 'If this is a regression, link the two as Related and mention the original fix.'
  if (candidate.kind === 'queue') return 'If they are the same bug, keep one and close the other as a duplicate in Azure DevOps.'
  return `If it is the same bug, close ${item.id} as a duplicate of ${candidate.id} in Azure DevOps.`
}

type CompareDialogProps = {
  item: TriageItem
  match: TriageMatch
  resolveSprint: BacklogSprintResolver
  /** Remembers the pair so the item shows its next closest match instead. */
  onNotDuplicate: () => void
  onClose: () => void
  now?: Date
}

/** The item and its closest match side by side, with the words their titles share marked in both. */
export function TriageCompareDialog({ item, match, resolveSprint, onNotDuplicate, onClose, now = new Date() }: CompareDialogProps) {
  const { candidate } = match
  const words = getSharedTitleWords(item.title, match.stems)
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" aria-labelledby="triage-compare-title">
      <DialogTitle id="triage-compare-title">Compare {item.id} and {candidate.id}</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
        <Typography variant="body-sm" color="text.secondary" component="p" sx={{ m: 0, '& mark': markSx }}>
          Shared words: {words.map((word, index) => <Fragment key={word}>{index ? ' ' : ''}<mark>{word}</mark></Fragment>)}
        </Typography>
        <Box sx={compareSx}>
          <CompareSide candidate={toTriageMatchCandidate(item)} label="In triage" stems={match.stems} resolveSprint={resolveSprint} now={now} />
          <CompareSide candidate={candidate} label={SIDE_LABELS[candidate.kind]} stems={match.stems} resolveSprint={resolveSprint} now={now} />
        </Box>
        <Typography variant="body-sm" color="text.secondary" component="p" sx={{ m: 0 }}>{describeNextStep(item, candidate)}</Typography>
      </DialogContent>
      <DialogActions>
        <AppTooltip title="Stop suggesting these two as alike. Remembered in this browser." describeChild>
          <Button onClick={onNotDuplicate} startIcon={<Icon href={svgDismiss} alt="" />}>Not a duplicate</Button>
        </AppTooltip>
        <Button variant="contained" onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}
