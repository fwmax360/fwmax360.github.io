import assert from 'node:assert/strict'

// Read independent public entry points instead of freezing yesterday's article count.
export async function publishedStats(page, origin) {
  const responses = await Promise.all(['/rss.xml', '/archive/', '/tags/'].map(path => page.request.get(origin + path)))
  responses.forEach(response => assert(response.ok(), `Publication fixture HTTP ${response.status()}`))
  const [rss, archive, tags] = await Promise.all(responses.map(response => response.text()))
  const stats = await page.evaluate(({rss, archive, tags}) => {
    const parser = new DOMParser(), feed = parser.parseFromString(rss, 'text/xml')
    if (feed.querySelector('parsererror')) throw new Error('Invalid RSS XML')
    const routes = [...feed.querySelectorAll('item > link')].map(el => new URL(el.textContent).pathname)
    const archiveDoc = parser.parseFromString(archive, 'text/html')
    const categoryCounts = {};
    for (const item of archiveDoc.querySelectorAll('[data-archive-item]')) categoryCounts[item.dataset.category] = (categoryCounts[item.dataset.category] || 0) + 1;
    const countOptions = selector => [...archiveDoc.querySelectorAll(selector)].filter(el => el.value).length
    return {routes, categoryCounts, categories:countOptions('#archive-category option'), series:countOptions('#archive-series option'),
      tags:parser.parseFromString(tags, 'text/html').querySelectorAll('[data-tag-item]').length}
  }, {rss, archive, tags})
  assert(stats.routes.length > 0 && stats.categories > 0 && stats.series > 0 && stats.tags > 0)
  assert.equal(new Set(stats.routes).size, stats.routes.length, 'RSS routes must be unique')
  assert(stats.routes.every(route => route.startsWith('/posts/') && !route.includes('silicon-trust-boundary')))
  return stats
}
