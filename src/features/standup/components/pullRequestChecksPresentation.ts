import svgValidate from '@stratakit/icons/validate.svg'
import svgStopwatch from '@stratakit/icons/stopwatch.svg'
import svgError from '@stratakit/icons/error.svg'
import type { WorkItemPullRequestSummary } from '../../../ado/queryEngine'

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

export function getChecksPresentation(checks: WorkItemPullRequestSummary['checks']): PullRequestChecksPresentation {
  if (!checks || checks.state === 'unavailable') {
    return {
      iconHref: svgError,
      color: 'warning.main',
      text: checks?.unavailableReason === 'access-denied'
        ? 'Checks unavailable — access denied; verify policy permissions'
        : 'Checks unavailable — try refreshing',
      optionalItems: [],
    }
  }

  if (checks.state === 'none' || checks.checks.length === 0) {
    return {
      iconHref: svgValidate,
      color: 'text.secondary',
      text: 'No applicable checks',
      optionalItems: [],
    }
  }

  const requiredChecks = checks.checks.filter((check) => !check.optional)
  const optionalChecks = checks.checks.filter((check) => check.optional)
  const skippedChecks = checks.checks.filter((check) => check.state === 'skipped').map(formatCheckName)
  const skippedItems = skippedChecks.length > 0
    ? [{
        iconHref: svgValidate,
        color: 'text.secondary',
        text: `Not applicable: ${formatCheckList(skippedChecks)}`,
      }]
    : []

  if (skippedChecks.length === checks.checks.length) {
    return {
      ...skippedItems[0],
      optionalItems: [],
    }
  }

  const requiredFailing = requiredChecks.filter((check) => check.state === 'failing').map(formatCheckName)
  if (requiredFailing.length > 0) {
    return {
      iconHref: svgError,
      color: 'error.main',
      text: `Required checks failing: ${formatCheckList(requiredFailing)}`,
      optionalItems: skippedItems,
    }
  }

  const requiredPending = requiredChecks.filter((check) => check.state === 'pending').map(formatCheckName)
  if (requiredPending.length > 0) {
    return {
      iconHref: svgStopwatch,
      color: 'warning.main',
      text: `Required checks pending: ${formatCheckList(requiredPending)}`,
      optionalItems: skippedItems,
    }
  }

  const optionalFailing = optionalChecks.filter((check) => check.state === 'failing').map(formatCheckName)
  const optionalPending = optionalChecks.filter((check) => check.state === 'pending').map(formatCheckName)

  return {
    iconHref: svgValidate,
    color: 'success.main',
    text: undefined,
    optionalItems: [
      ...skippedItems,
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
