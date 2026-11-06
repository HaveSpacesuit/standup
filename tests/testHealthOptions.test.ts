import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_TEST_HEALTH_OPTIONS,
  loadTestHealthOptions,
  loadTestPipelines,
  saveTestHealthOptions,
  saveTestPipelines,
  testPipelineSource,
  validateTestHealthOptions,
} from '../src/features/standup/utils/testPipelines.ts'

function withStorage(run: (storage: Map<string, string>) => void) {
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
    run(storage)
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else Reflect.deleteProperty(globalThis, 'localStorage')
  }
}

const pipeline = {
  id: 'web', orgName: 'org', projectName: 'Example', kind: 'build' as const, definitionId: 7, name: 'ProjectWise Web (PWW)', stageName: 'E2E',
}

test('health options flag no recent runs after 2 working days and fewer tests below 80% by default', () => {
  assert.deepEqual(DEFAULT_TEST_HEALTH_OPTIONS, { staleDays: 2, fewerPercent: 80 })
})

test('health options reject stale days outside 1–30 or fractional, and fewer percentages outside (0, 100]', () => {
  for (const staleDays of [0, 31, 1.5, NaN]) {
    assert.throws(() => validateTestHealthOptions({ staleDays, fewerPercent: 80 }), /working days from 1 to 30/)
  }
  for (const fewerPercent of [0, -5, 100.1, NaN, Infinity]) {
    assert.throws(() => validateTestHealthOptions({ staleDays: 2, fewerPercent }), /more than 0% and at most 100%/)
  }
  validateTestHealthOptions({ staleDays: 30, fewerPercent: 100 })
  validateTestHealthOptions({ staleDays: 1, fewerPercent: 0.5 })
})

test('health options default, round trip, and reject invalid saved settings', () => {
  withStorage((storage) => {
    assert.deepEqual(loadTestHealthOptions(), DEFAULT_TEST_HEALTH_OPTIONS)
    saveTestHealthOptions({ staleDays: 5, fewerPercent: 65 })
    assert.deepEqual(loadTestHealthOptions(), { staleDays: 5, fewerPercent: 65 })
    assert.throws(() => saveTestHealthOptions({ staleDays: 0, fewerPercent: 65 }))
    for (const invalid of ['null', '{}', '{"staleDays":"2","fewerPercent":80}', '{"staleDays":2,"fewerPercent":0}', 'not json']) {
      storage.set('standup:test-health-options', invalid)
      assert.throws(() => loadTestHealthOptions())
    }
  })
})

test('pipelines keep an optional short name of up to 24 characters', () => {
  withStorage((storage) => {
    saveTestPipelines([{ ...pipeline, shortName: 'Web' }, { ...pipeline, id: 'other' }])
    assert.deepEqual(loadTestPipelines().map((entry) => entry.shortName), ['Web', undefined])
    for (const shortName of [42, 'x'.repeat(25)]) {
      storage.set('standup:test-pipelines', JSON.stringify([{ ...pipeline, shortName }]))
      assert.throws(() => loadTestPipelines())
    }
  })
})

test('a pipeline source leaves out the short name, so renaming it does not refetch results', () => {
  assert.deepEqual(testPipelineSource({ ...pipeline, shortName: 'Web' }), { ...pipeline, stageDefinitionId: undefined })
  assert.equal(JSON.stringify(testPipelineSource({ ...pipeline, shortName: 'Web' })), JSON.stringify(testPipelineSource(pipeline)))
})
