import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_TEST_PASS_RATE_FILTER,
  filterTestPointsByPassRate,
  loadTestPassRateFilter,
  saveTestPassRateFilter,
  validateTestPassRateFilter,
} from '../src/features/standup/utils/testPipelines.ts'

const points = [0, 19, 20, 20.5, 100].map((passed) => ({ passed, total: 100 }))

test('disabled filter preserves all points, including 0%', () => {
  assert.equal(filterTestPointsByPassRate(points, DEFAULT_TEST_PASS_RATE_FILTER), points)
})

test('enabled filter excludes the threshold inclusively without rounding', () => {
  for (const threshold of [0, 20, 20.5, 100]) {
    assert.deepEqual(
      filterTestPointsByPassRate(points, { enabled: true, threshold }).map((point) => point.passed),
      points.filter((point) => point.passed > threshold).map((point) => point.passed),
    )
  }
  assert.deepEqual(filterTestPointsByPassRate([{ passed: 1, total: 5 }], { enabled: true, threshold: 20 }), [])
})

test('filter does not modify source data and disabling restores excluded points', () => {
  const original = structuredClone(points)
  filterTestPointsByPassRate(points, { enabled: true, threshold: 100 })
  assert.deepEqual(points, original)
  assert.deepEqual(filterTestPointsByPassRate(points, { enabled: false, threshold: 100 }), original)
})

test('invalid thresholds are rejected even when disabled', () => {
  for (const threshold of [-1, 100.1, NaN, Infinity]) {
    assert.throws(() => validateTestPassRateFilter({ enabled: false, threshold }), /between 0 and 100/)
  }
})

test('storage defaults, round trips, and invalid saved settings', () => {
  const storage = new Map<string, string>()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  })
  try {
    assert.deepEqual(loadTestPassRateFilter(), { enabled: false, threshold: 0 })
    const filter = { enabled: true, threshold: 20.5 }
    saveTestPassRateFilter(filter)
    assert.deepEqual(loadTestPassRateFilter(), filter)
    saveTestPassRateFilter({ ...filter, enabled: false })
    assert.deepEqual(loadTestPassRateFilter(), { ...filter, enabled: false })
    for (const invalid of ['null', '{}', '{"enabled":true,"threshold":101}', '{"enabled":true,"threshold":"20"}', 'not json']) {
      storage.set('standup:test-pass-rate-filter', invalid)
      assert.throws(() => loadTestPassRateFilter())
    }
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
})
