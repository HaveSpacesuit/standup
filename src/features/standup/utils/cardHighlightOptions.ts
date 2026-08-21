export type CardHighlightOptions = {
  freshDays: number
  staleDays: number
}

export const DEFAULT_CARD_HIGHLIGHT_OPTIONS: CardHighlightOptions = {
  freshDays: 1,
  staleDays: 7,
}

export const QA_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY = 'standup:qa-card-highlight-options'
export const ASSIGNMENTS_CARD_HIGHLIGHT_OPTIONS_STORAGE_KEY = 'standup:assignments-card-highlight-options'

function normalizeWholeNumber(value: number | undefined | null, fallback: number): number {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return fallback
  }

  const rounded = Number.isInteger(value) ? value : Math.round(value)
  return Math.min(365, Math.max(1, rounded))
}

export function normalizeCardHighlightOptions(value: Partial<CardHighlightOptions> | null | undefined): CardHighlightOptions {
  const fallback = DEFAULT_CARD_HIGHLIGHT_OPTIONS
  const freshDays = normalizeWholeNumber(value?.freshDays, fallback.freshDays)
  const staleDays = normalizeWholeNumber(value?.staleDays, fallback.staleDays)

  const boundedFreshDays = Math.min(freshDays, 364)
  const boundedStaleDays = Math.max(Math.min(staleDays, 365), boundedFreshDays + 1)

  return {
    freshDays: boundedFreshDays,
    staleDays: boundedStaleDays,
  }
}

export function parseStoredCardHighlightOptions(value: string | null): CardHighlightOptions {
  if (!value) {
    return { ...DEFAULT_CARD_HIGHLIGHT_OPTIONS }
  }

  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_CARD_HIGHLIGHT_OPTIONS }
    }

    return normalizeCardHighlightOptions(parsed as Partial<CardHighlightOptions>)
  } catch {
    return { ...DEFAULT_CARD_HIGHLIGHT_OPTIONS }
  }
}

export function serializeCardHighlightOptions(value: CardHighlightOptions): string {
  return JSON.stringify(normalizeCardHighlightOptions(value))
}
