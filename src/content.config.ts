import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'
import { glob } from 'astro/loaders'

const posts = defineCollection({
  loader: glob({ base: './src/content/posts', pattern: '**/*.{md,mdx}' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    /** 单个分类，用于顶层知识体系归类 */
    category: z.string(),
    tags: z.array(z.string()).default([]),
    /** 所属系列，同系列文章会互相串联 */
    series: z.string().optional(),
    /** 系列内的顺序 */
    order: z.number().optional(),
    /** Samples retain a direct preview route, but stay out of public discovery. */
    status: z.enum(['published', 'sample', 'draft']).default('published'),
    draft: z.boolean().default(false),
    /** 置顶权重，数字越大越靠前 */
    pinned: z.number().default(0),
  }),
})

export const collections = { posts }
