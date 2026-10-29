import './stratakitNodeGlobals.ts'
import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  ssr: { noExternal: [/^@stratakit\//] },
})
after(() => server.close())

const { Root } = await server.ssrLoadModule('@stratakit/mui')
const { fetchQualityAssuranceRawData } = await server.ssrLoadModule('/src/ado/workItemsApi.ts')
const { bucketQualityAssuranceItems, resolveQualityAssuranceProjectConfig } =
  await server.ssrLoadModule('/src/features/standup/utils/qualityAssuranceBuckets.ts')
const { QualityAssuranceList } = await server.ssrLoadModule('/src/features/standup/components/QualityAssuranceList.tsx')

const team = {
  id: 'team',
  orgName: 'example-org',
  projectName: 'example-project',
  areaPath: 'Project',
}
const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString()
const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

test('failed work-item history remains visible as unclassified while successful history is bucketed', async () => {
  let historyAvailable = false
  const client = {
    async request({ method, path }: { method?: string; path: string }) {
      if (path.endsWith('/_apis/wit/wiql')) {
        return { workItems: [{ id: 1 }, { id: 2 }] }
      }
      if (path === '/_apis/wit/workitemicons' || path === '/_apis/wit/workitems') {
        return { value: [] }
      }
      if (path === '/_apis/wit/workitemsbatch') {
        return {
          value: [1, 2].map((id) => ({
            id,
            fields: {
              'System.Title': `Work item ${id}`,
              'System.CreatedDate': oldDate,
              'System.ChangedDate': oldDate,
              'System.State': 'Done',
            },
          })),
        }
      }
      if (path.includes('/_apis/wit/workItems/1/updates')) {
        if (!historyAvailable) {
          throw new Error('503 Service Unavailable')
        }
        return {
          value: [{
            revisedDate: recentDate,
            fields: { 'System.State': { oldValue: 'Active', newValue: 'Available for Testing' } },
          }],
        }
      }
      if (path.includes('/_apis/wit/workItems/2/updates')) {
        return {
          value: [{
            revisedDate: recentDate,
            fields: { 'System.State': { oldValue: 'Active', newValue: 'Available for Testing' } },
          }],
        }
      }
      throw new Error(`Unexpected ${method ?? 'GET'} ${path}`)
    },
    async requestPage() {
      throw new Error('requestPage should not be used')
    },
  }

  const rawData = await fetchQualityAssuranceRawData(client, team)
  const buckets = bucketQualityAssuranceItems(
    rawData.candidates,
    rawData.updatesByItemId,
    resolveQualityAssuranceProjectConfig(team),
    rawData.failedUpdateItemIds,
  )

  assert.deepEqual(rawData.candidates.map((item: { id: number }) => item.id), [1, 2])
  assert.deepEqual(rawData.failedUpdateItemIds, [1])
  assert.deepEqual(buckets.find((bucket: { id: string }) => bucket.id === 'history-unavailable')?.items.map((item: { id: number }) => item.id), [1])
  assert.deepEqual(buckets.find((bucket: { id: string }) => bucket.id === 'done')?.items.map((item: { id: number }) => item.id), [2])

  historyAvailable = true
  const recoveredData = await fetchQualityAssuranceRawData(client, team)
  const recoveredBuckets = bucketQualityAssuranceItems(
    recoveredData.candidates,
    recoveredData.updatesByItemId,
    resolveQualityAssuranceProjectConfig(team),
    recoveredData.failedUpdateItemIds,
  )

  assert.deepEqual(recoveredData.failedUpdateItemIds, [])
  assert.deepEqual(recoveredBuckets.find((bucket: { id: string }) => bucket.id === 'history-unavailable'), undefined)
  assert.deepEqual(recoveredBuckets.find((bucket: { id: string }) => bucket.id === 'done')?.items.map((item: { id: number }) => item.id), [1, 2])
})

test('QA history warning is accessible and does not hide the unavailable card', () => {
  const html = renderToStaticMarkup(createElement(
    Root,
    null,
    createElement(QualityAssuranceList, {
      isLoading: false,
      error: null,
      historyWarning: 'Unable to load history for 1 work item. QA membership may be incomplete.',
      buckets: [{
        id: 'history-unavailable',
        title: 'History unavailable',
        items: [{ id: 1, title: 'Keep this card visible', state: 'Done', status: 'Done' }],
      }],
      colorScheme: 'light',
    }),
  ))

  assert.match(html, /role="alert"/)
  assert.match(html, /Unable to load history for 1 work item/)
  assert.match(html, /History unavailable/)
  assert.match(html, /Keep this card visible/)
})

test('QA history warning remains visible when no cards match the filters', () => {
  const html = renderToStaticMarkup(createElement(
    Root,
    null,
    createElement(QualityAssuranceList, {
      isLoading: false,
      error: null,
      historyWarning: 'Unable to load history for 1 work item. QA membership may be incomplete.',
      buckets: [],
      colorScheme: 'light',
    }),
  ))

  assert.match(html, /role="alert"/)
  assert.match(html, /Unable to load history for 1 work item/)
  assert.match(html, /No QA items/)
})
