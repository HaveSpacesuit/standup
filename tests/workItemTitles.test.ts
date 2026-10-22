import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
})
after(() => server.close())
const { fetchWorkItemsForCurrentAndNextIteration, fetchQualityAssuranceRawData } =
  await server.ssrLoadModule('/src/ado/workItemsApi.ts')

const team = { id: 'team', orgName: 'example-org', projectName: 'example-project', areaPath: '', iterationPath: '' }
const titles = ['Valid title', { unexpected: 'object' }, ['array title'], 123, true, null, undefined, '']
const client = {
  async request({ path }: { path: string }) {
    if (path.endsWith('/_apis/wit/wiql')) {
      return { workItems: titles.map((_, index) => ({ id: index + 1 })) }
    }
    if (path === '/_apis/wit/workitemsbatch') {
      return {
        value: titles.map((title, index) => ({
          id: index + 1,
          fields: { 'System.Title': title, 'System.State': 'Active' },
        })),
      }
    }
    if (path === '/_apis/wit/workitemicons' || path === '/_apis/wit/workitems' || path.endsWith('/updates')) {
      return { value: [] }
    }
    throw new Error(`Unexpected request: ${path}`)
  },
}

for (const view of ['Development', 'QA']) {
  test(`${view} normalizes non-string titles without dropping work items or changing valid strings`, async () => {
    const items = view === 'Development'
      ? await fetchWorkItemsForCurrentAndNextIteration(client, team)
      : (await fetchQualityAssuranceRawData(client, team)).candidates

    assert.deepEqual(items.map((item: { title: string }) => item.title), [
      'Valid title', 'Work Item 2', 'Work Item 3', 'Work Item 4',
      'Work Item 5', 'Work Item 6', 'Work Item 7', '',
    ])
    assert.deepEqual(items.map((item: { id: number }) => item.id), titles.map((_, index) => index + 1))
    const html = renderToStaticMarkup(createElement('div', null,
      ...items.map((item: { id: number; title: string; workItemUrl: string }) =>
        createElement('a', { key: item.id, href: item.workItemUrl }, item.title)),
    ))
    assert.match(html, /Work Item 2/)
    assert.match(html, /_workitems\/edit\/2/)
    assert.equal((html.match(/<a /g) ?? []).length, titles.length)
  })
}
