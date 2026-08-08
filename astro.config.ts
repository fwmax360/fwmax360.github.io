// @ts-check
import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { unified } from '@astrojs/markdown-remark'
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'

import { SITE } from './src/consts'
import { transformerCodeBlock } from './src/lib/shiki'
import { rehypeTableWrap } from './src/lib/rehype-table-wrap'
import { smali } from './src/lib/langs/smali'
import { armasm } from './src/lib/langs/armasm'

export default defineConfig({
  site: SITE.url,
  trailingSlash: 'ignore',
  integrations: [mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    processor: unified({
      remarkPlugins: [remarkMath],
      rehypePlugins: [
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            behavior: 'append',
            properties: { class: 'heading-anchor', ariaHidden: 'true', tabIndex: -1 },
            // 留空元素、符号交给 CSS ::after 画，否则 Astro 提取的标题文本会多出一个 #
            content: [],
          },
        ],
        rehypeKatex,
        rehypeTableWrap,
      ],
    }),
    shikiConfig: {
      theme: 'github-dark-default',
      wrap: false,
      langs: [smali, armasm],
      transformers: [transformerCodeBlock()],
    },
  },
})
