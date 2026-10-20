import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import * as ts from 'typescript'

const defaultRules = [
  { id: 'default-blocked', tag: 'blocked', action: 'Blocked' },
  { id: 'default-pr', tag: 'pr', action: 'Review' },
]
const source = readFileSync(new URL('../src/features/standup/utils/boardFilters.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
})
const exports: Record<string, Function> = {}

runInNewContext(outputText, {
  exports,
  require: (name: string) => {
    assert.equal(name, '../../../ado/workItemStatus')
    return {
      DEFAULT_TAG_RULES: defaultRules,
      resolveStatusFromStateAndTags() {},
      shouldHideByTagRules() {},
    }
  },
})

test('an explicitly stored empty tag-rule list remains empty', () => {
  assert.equal(exports.parseStoredTagRules('[]').length, 0)
})

test('default tag rules are used when no rules have been stored', () => {
  const parsedRules = exports.parseStoredTagRules(null)
  assert.equal(parsedRules.length, defaultRules.length)
  assert.deepEqual(Array.from(parsedRules, (rule) => ({ ...rule })), defaultRules)
})
