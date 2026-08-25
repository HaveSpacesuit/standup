/** Parses a "YYYY-MM-DD" date-only string (or any other date string) as a local Date at midnight. */
export function parseDateOnly(value?: string): Date | null {
  if (!value) {
    return null
  }

  const datePart = value.slice(0, 10)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart)
  if (!match) {
    const fallback = new Date(value)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

/** Formats a local Date as a "YYYY-MM-DD" date-only key. */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })

/** Formats a "YYYY-MM-DD" date key as a short display label, e.g. "Aug 26". */
export function formatDateLabel(dateKey: string): string {
  const date = parseDateOnly(dateKey)
  return date ? DATE_LABEL_FORMATTER.format(date) : dateKey
}
