import svgValidate from '@stratakit/icons/validate.svg'
import svgStopwatch from '@stratakit/icons/stopwatch.svg'
import svgError from '@stratakit/icons/error.svg'
import type { WorkItemSummary } from '../../../ado/queryEngine'

export type PullRequestChecksPresentation = {
  iconHref: string
  color: string
  text?: string
  optionalItems: Array<{
    iconHref: string
    color: string
    text: string
  }>
}

function formatCheckName(item: { name: string, expired: boolean }): string {
  return item.expired ? `${item.name} (expired)` : item.name
}

function formatCheckList(names: string[]): string {
  return names.join(', ')
}

export function getChecksPresentation(item: WorkItemSummary): PullRequestChecksPresentation {
  const checks = item.pullRequest?.checks
  if (!checks || checks.checks.length === 0) {
    return {
      iconHref: svgStopwatch,
      color: 'warning.main',
      text: 'Checks pending',
      optionalItems: [],
    }
  }

  const requiredChecks = checks.checks.filter((check) => !check.optional)
  const optionalChecks = checks.checks.filter((check) => check.optional)

  const requiredFailing = requiredChecks.filter((check) => check.state === 'failing').map(formatCheckName)
  if (requiredFailing.length > 0) {
    return {
      iconHref: svgError,
      color: 'error.main',
      text: formatCheckList(requiredFailing),
      optionalItems: [],
    }
  }

  const requiredPending = requiredChecks.filter((check) => check.state === 'pending').map(formatCheckName)
  if (requiredPending.length > 0) {
    return {
      iconHref: svgStopwatch,
      color: 'warning.main',
      text: formatCheckList(requiredPending),
      optionalItems: [],
    }
  }

  const optionalFailing = optionalChecks.filter((check) => check.state === 'failing').map(formatCheckName)
  const optionalPending = optionalChecks.filter((check) => check.state === 'pending').map(formatCheckName)

  return {
    iconHref: svgValidate,
    color: 'success.main',
    text: undefined,
    optionalItems: [
      ...(optionalFailing.length > 0
        ? [{
            iconHref: svgError,
            color: 'error.main',
            text: `Optional checks failing: ${formatCheckList(optionalFailing)}`,
          }]
        : []),
      ...(optionalPending.length > 0
        ? [{
            iconHref: svgStopwatch,
            color: 'warning.main',
            text: `Optional checks pending: ${formatCheckList(optionalPending)}`,
          }]
        : []),
    ],
  }
}
