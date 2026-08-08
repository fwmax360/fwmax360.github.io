import rss from '@astrojs/rss'
import type { APIRoute } from 'astro'
import { SITE } from '../consts'
import { getPostsByDate, postUrl } from '../lib/posts'

export const GET: APIRoute = async (context) => {
  const posts = await getPostsByDate()
  const site = String(context.site ?? SITE.url).replace(/\/$/, '')

  return rss({
    title: `${SITE.title} — ${SITE.subtitle}`,
    description: `${SITE.description}（如果你在读原始 XML：说明你也挺闲的。）`,
    site,
    // 浏览器打开时走 XSL 可读视图；订阅器忽略 stylesheet，只吃 XML
    stylesheet: '/rss.xsl',
    trailingSlash: false,
    items: [
      ...posts.map((post) => ({
        title: post.data.title,
        description: post.data.description,
        pubDate: post.data.pubDate,
        link: postUrl(post),
        categories: [post.data.category, ...post.data.tags],
      })),
      // 只有翻到 feed 末尾的人才会撞见
      {
        title: '[easter egg] You reached the end of the feed',
        description:
          '恭喜，你读完了（或者订阅器把这条塞到了最后）。TracerPid 仍是 0。sleep4r / Sleep3r 只是用户名被占了才换数字。接单？骗你的，根本接不到。去 /about 点终端玩一会儿，然后去睡觉——我是说真的。',
        pubDate: new Date('1970-01-01T00:00:00.000Z'),
        link: '/about/',
        categories: ['meta', 'easter-egg', 'TracerPid:0'],
      },
    ],
    customData: [
      `<language>${SITE.lang}</language>`,
      `<generator>sleep4r-blog · TracerPid:0 · not a real CMS</generator>`,
      `<copyright>CC BY-NC-SA 4.0 · 接单？骗你的，根本接不到。</copyright>`,
      `<managingEditor>noreply@sleep4r.invalid (${SITE.author} — usually asleep)</managingEditor>`,
      `<webMaster>rss-reader@sleep4r.invalid (curl -s ${site}/rss.xml | grep -i easter)</webMaster>`,
      `<docs>${site}/about/</docs>`,
      `<ttl>42</ttl>`,
    ].join(''),
  })
}
