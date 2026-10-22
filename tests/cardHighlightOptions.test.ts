import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_CARD_HIGHLIGHT_OPTIONS,
  parseStoredCardHighlightOptions,
  qaCardHighlightOptionsStorageKey,
  serializeCardHighlightOptions,
} from '../src/features/standup/utils/cardHighlightOptions.ts'

test('QA freshness options use separate storage keys for each team', () => {
  const storage = new Map<string, string>()
  const webOptions = { freshDays: 1, staleDays: 2 }
  const explorerOptions = { freshDays: 5, staleDays: 8 }

  storage.set(qaCardHighlightOptionsStorageKey('projectwise-web'), serializeCardHighlightOptions(webOptions))
  storage.set(qaCardHighlightOptionsStorageKey('projectwise-explorer'), serializeCardHighlightOptions(explorerOptions))

  assert.notEqual(
    qaCardHighlightOptionsStorageKey('projectwise-web'),
    qaCardHighlightOptionsStorageKey('projectwise-explorer'),
  )
  assert.deepEqual(
    parseStoredCardHighlightOptions(storage.get(qaCardHighlightOptionsStorageKey('projectwise-web')) ?? null),
    webOptions,
  )
  assert.deepEqual(
    parseStoredCardHighlightOptions(storage.get(qaCardHighlightOptionsStorageKey('projectwise-explorer')) ?? null),
    explorerOptions,
  )
  assert.deepEqual(
    parseStoredCardHighlightOptions(storage.get(qaCardHighlightOptionsStorageKey('unconfigured-team')) ?? null),
    DEFAULT_CARD_HIGHLIGHT_OPTIONS,
  )
})
