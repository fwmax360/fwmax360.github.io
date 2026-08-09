import type { Counted, Post } from './posts'

export type EditorialTagGroupId = 'platform' | 'technique' | 'tool' | 'artifact' | 'topic'

export interface EditorialTagGroup {
  id: EditorialTagGroupId
  label: string
  code: string
  description: string
  tags: Counted[]
}

const GROUPS: Omit<EditorialTagGroup, 'tags'>[] = [
  {
    id: 'platform',
    label: 'Platform',
    code: 'PLT',
    description: '操作系统、运行时、架构与应用承载环境。',
  },
  {
    id: 'technique',
    label: 'Technique',
    code: 'TCH',
    description: '分析、调试、抓包、Hook 与还原方法。',
  },
  {
    id: 'tool',
    label: 'Tool',
    code: 'TLS',
    description: '复现实验和定位问题时使用的工具链。',
  },
  {
    id: 'artifact',
    label: 'Artifact',
    code: 'ART',
    description: '文件格式、二进制结构、字节码与系统对象。',
  },
  {
    id: 'topic',
    label: 'Topic',
    code: 'TPC',
    description: '算法、协议、赛事与跨域研究主题。',
  },
]

const PLATFORM = new Set([
  'Android Framework',
  'Linux',
  'Windows',
  'dalvik',
  'VpnService',
  'aarch64',
  'arm64',
  'javascript',
])

const TECHNIQUE = new Set([
  '抓包',
  '加密',
  '逆向基础',
  'Hook',
  '动态调试',
  '反调试',
  '逆向',
  '透明代理',
  'Inline Hook',
  'MITM',
  '汇编',
  '解包',
  '美化',
  'root',
])

const TOOL = new Set([
  'Frida',
  'Reqable',
  'Godot',
  'iptables',
  'Charles',
  'redsocks',
  'Python',
  'Launcher',
  'netfilter',
])

const ARTIFACT = new Set([
  'ELF',
  'PE',
  'PEB',
  'TEB',
  'IAT',
  'FD',
  'pyc',
  'so',
  'dex',
  'smali',
  'jni',
  '可执行文件',
])

export function editorialTagGroup(name: string): EditorialTagGroupId {
  if (PLATFORM.has(name)) return 'platform'
  if (TECHNIQUE.has(name)) return 'technique'
  if (TOOL.has(name)) return 'tool'
  if (ARTIFACT.has(name)) return 'artifact'
  return 'topic'
}

/** 每个标签只进入一个受控分组；未知标签稳定落入 Topic，确保不丢词。 */
export function groupEditorialTags(tags: Counted[]): EditorialTagGroup[] {
  const buckets = new Map<EditorialTagGroupId, Counted[]>(GROUPS.map((group) => [group.id, []]))
  for (const tag of tags) buckets.get(editorialTagGroup(tag.name))!.push(tag)
  return GROUPS.map((group) => ({ ...group, tags: buckets.get(group.id) ?? [] }))
}

/** 当前 taxonomy 内与目标共同出现的标签，按覆盖文章数排序。 */
export function getCoTags(posts: Post[], exclude?: string, limit = 10): Counted[] {
  const counts = new Map<string, number>()
  for (const post of posts) {
    for (const tag of new Set(post.data.tags)) {
      if (tag === exclude) continue
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'))
    .slice(0, limit)
}
