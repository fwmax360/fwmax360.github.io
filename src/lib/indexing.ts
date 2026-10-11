import type { AstroIntegration } from 'astro'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Read final page metadata before the sitemap integration's build:done hook.
 * This avoids maintaining a second hard-coded list of sample/draft URLs. */
export function indexingPolicy(): { integration: AstroIntegration; include: (url: string) => boolean } {
  const excluded = new Set<string>()
  const normalize = (url: string) => new URL(url).pathname.replace(/\/$/, '') || '/'
  return {
    include: (url) => !excluded.has(normalize(url)),
    integration: {
      name: 'blog-indexing-policy',
      hooks: {
        'astro:build:generated': async ({ dir }) => {
          excluded.clear()
          const root = fileURLToPath(dir)
          for (const file of await readdir(root, { recursive: true })) {
            if (!file.endsWith('.html')) continue
            const html = await readFile(join(root, file), 'utf8')
            const meta = html.match(/<meta\b[^>]*>/g) ?? []
            if (!meta.some((tag) => /name=["']robots["']/.test(tag) && /content=["'][^"']*\bnoindex\b/.test(tag))) continue
            const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/)?.[1]
            if (canonical) excluded.add(normalize(canonical))
          }
        },
      },
    },
  }
}
