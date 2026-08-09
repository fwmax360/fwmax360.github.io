import rss from '@astrojs/rss'
import type { APIRoute } from 'astro'
import { SITE } from '../consts'
import { getPostsByDateDesc, postUrl } from '../lib/posts'

export const GET: APIRoute = async () => {
  const posts = await getPostsByDateDesc()
  const site = SITE.url.replace(/\/$/, '')

  return rss({
    title: `${SITE.title} — ${SITE.subtitle}`,
    description: `${SITE.description}（如果你在读原始 XML：说明你也挺闲的。）`,
    site,
    // 浏览器打开时走 XSL 可读视图；订阅器忽略 stylesheet，只吃 XML
    stylesheet: '/rss.xsl',
    trailingSlash: false,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: new URL(postUrl(post), `${site}/`).href,
      categories: [post.data.category, ...post.data.tags],
    })),
    customData: [
      `<language>${SITE.lang}</language>`,
      `<generator>sleep4r-blog · TracerPid:0 · not a real CMS</generator>`,
      `<copyright>CC BY-NC-SA 4.0 · 接单？骗你的，根本接不到。</copyright>`,
      `<docs>${site}/about/</docs>`,
      `<ttl>42</ttl>`,
    ].join(''),
  })
}
