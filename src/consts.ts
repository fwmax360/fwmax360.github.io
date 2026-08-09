export const SITE = {
  url: 'https://fwmax360.github.io',
  title: 'sleep4r',
  /** 出现在浏览器标签和 RSS 里的副标题 */
  subtitle: 'Android Reverse Engineering & Binary Security',
  description: '安卓逆向、二进制安全与系统底层的笔记本。',
  author: 'Sleep3r',
  lang: 'zh-CN',
  /** 终端 hero 里显示的身份行 */
  handle: 'sleep4r',
  host: 'blog',
  postsPerPage: 10,
} as const

export const NAV = [
  { label: 'home', href: '/' },
  { label: 'posts', href: '/archive' },
  { label: 'series', href: '/series' },
  { label: 'map', href: '/map' },
  { label: 'tags', href: '/tags' },
  { label: 'about', href: '/about' },
] as const

export const SOCIAL = [
  { label: 'GitHub', href: 'https://github.com/fwmax360', icon: 'github' },
  /** 给人看的订阅页；原始 feed 在 /rss.xml */
  { label: 'RSS', href: '/rss/', icon: 'rss' },
] as const

/**
 * giscus 评论。要启用：在 github.com/apps/giscus 安装应用并开启仓库 Discussions，
 * 然后到 giscus.app 生成下面这几个 ID 填进来，并把 enabled 改成 true。
 */
export const COMMENTS = {
  enabled: false,
  repo: 'fwmax360/fwmax360.github.io',
  repoId: '',
  category: 'Announcements',
  categoryId: '',
} as const
