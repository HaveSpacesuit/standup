import { Box, Link, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgWindowPopout from '@stratakit/icons/window-popout.svg'
import {
  formatBacklogValue,
  formatCreatedDate,
  formatIterationPath,
  type RankedBacklogBug,
} from '../utils/backlogValue'

type BacklogTableProps = {
  bugs: RankedBacklogBug[]
}

const COLUMNS: ReadonlyArray<{ label: string; align?: 'right' }> = [
  { label: 'ID' },
  { label: 'Title' },
  { label: 'Created Date' },
  { label: 'Assigned To' },
  { label: 'State' },
  { label: 'Iteration Path' },
  { label: 'Severity' },
  { label: 'Impact', align: 'right' },
  { label: 'Effort', align: 'right' },
  { label: 'Value', align: 'right' },
]

// MUI's sx reads a bare 1 as 100%, so the 1px sizes must be strings.
const visuallyHiddenSx: SxProps<Theme> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
}

const noWrapSx: SxProps<Theme> = { whiteSpace: 'nowrap' }

// The scroller sits at a fractional offset (the app's 0.8px hairlines), and Chromium can snap a stuck header 1-2px
// below the scroller's clip edge, exposing the row scrolled behind it. Sticking 1px above the edge keeps the header
// flush with the clip. Larger offsets are worse: the clip's own rounding then decides where the header is visible.
const headCellSx: SxProps<Theme> = { bgcolor: 'background.paper', whiteSpace: 'nowrap', top: '-1px' }

function NotSet() {
  return (
    <>
      <span aria-hidden="true">&mdash;</span>
      <Box component="span" sx={visuallyHiddenSx}>Not set</Box>
    </>
  )
}

function orNotSet(value: string | number | undefined) {
  return value === undefined || value === '' ? <NotSet /> : value
}

export function BacklogTable({ bugs }: BacklogTableProps) {
  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
      }}
    >
      {/* Relative so the absolutely positioned visually hidden text is contained by this scroller, not the page. */}
      <TableContainer sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Table size="small" stickyHeader aria-label="Open bugs ranked by value">
          <TableHead>
            <TableRow>
              {COLUMNS.map((column) => (
                <TableCell key={column.label} align={column.align} sx={headCellSx}>
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {bugs.map((bug) => {
              const assignee = bug.assignedTo?.displayName || bug.assignedTo?.uniqueName
              const createdDate = formatCreatedDate(bug.createdAt)

              return (
                <TableRow key={bug.id} hover={false}>
                  <TableCell sx={noWrapSx}>{bug.id}</TableCell>
                  <TableCell sx={{ minWidth: 280 }}>
                    <Link href={bug.workItemUrl} target="_blank" rel="noreferrer noopener">
                      {bug.title}
                      <Box component="span" sx={{ display: 'inline-flex', verticalAlign: 'text-bottom', ml: 0.5 }}>
                        <Icon href={svgWindowPopout} alt="" />
                      </Box>
                      <Box component="span" sx={visuallyHiddenSx}> (opens in a new tab)</Box>
                    </Link>
                  </TableCell>
                  <TableCell sx={noWrapSx}>
                    {bug.createdAt && createdDate ? <time dateTime={bug.createdAt}>{createdDate}</time> : <NotSet />}
                  </TableCell>
                  <TableCell>{assignee}</TableCell>
                  <TableCell sx={noWrapSx}>{orNotSet(bug.state)}</TableCell>
                  <TableCell sx={noWrapSx}>{orNotSet(formatIterationPath(bug.iterationPath))}</TableCell>
                  <TableCell sx={noWrapSx}>{orNotSet(bug.severity)}</TableCell>
                  <TableCell align="right">{orNotSet(bug.priority)}</TableCell>
                  <TableCell align="right">{orNotSet(bug.effort)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>{formatBacklogValue(bug.value)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
