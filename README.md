# fwmax360.github.io

安卓逆向 / 二进制安全方向的技术博客。Astro 静态站点，源码在 `main`，推送后由 GitHub Actions 自动构建并发布到 GitHub Pages。

## 本地开发

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # 构建到 dist/ 并生成 Pagefind 搜索索引
npm run preview  # 预览构建产物
```

写文章只需要 `npm run dev`。但要测试**站内搜索**必须先 `npm run build`，因为搜索索引是构建后扫描 `dist/` 生成的，dev 模式下不存在。

## 写一篇新文章

在 `src/content/posts/` 下新建 `.md` 或 `.mdx`，文件名就是 URL（`src/content/posts/foo.md` → `/posts/foo/`）。

```markdown
---
title: '标题'
description: '一句话说清这篇讲什么，会显示在列表和搜索结果里'
pubDate: 2026-08-09
category: 'Android'      # 单选，构成顶层分类
tags: ['Frida', 'Hook']  # 多选，技术名词统一大小写
series: '逆向基础'        # 可选，同系列文章会互相串联
order: 1                 # 可选，系列内顺序
draft: false             # true 时只在 dev 可见，不会发布
pinned: 0                # 大于 0 会置顶，数字越大越靠前
---

正文从这里开始。
```

只有 `title`、`description`、`pubDate`、`category` 是必填的，缺了构建会直接报错。

## 代码块

代码块除了语言标识，还支持三种额外标注，都写在语言后面：

````markdown
```c title="loader.c" {12,18-20}
```
````

| 标注 | 作用 |
| --- | --- |
| `title="xxx"` | 在标题栏显示文件名 |
| `{12,18-20}` | 高亮指定行，支持单行和范围 |
| `nolines` | 关掉行号 |
| `nocollapse` | 关掉超过 34 行时的自动折叠 |

Shiki 内置的 242 种语言之外，这个站额外注册了两个：

- **`smali`** — Dalvik 字节码，识别 opcode、`vN`/`pN` 寄存器、类型描述符、`.method` 等指令，定义在 `src/lib/langs/smali.ts`
- **`armasm`**（别名 `arm` / `arm64` / `aarch64`）— ARM32/AArch64 汇编，覆盖 IDA、objdump 输出和手写 `.S`，定义在 `src/lib/langs/armasm.ts`

改了语法定义之后，必须清缓存才会生效：

```bash
rm -rf node_modules/.astro .astro dist && npm run build
```

Astro 会缓存 markdown 的渲染结果，只改 Shiki 配置不会触发重新渲染。

## 目录结构

```
src/
  consts.ts              站点标题、导航、社交链接、评论开关
  content.config.ts      文章 frontmatter 的 schema
  content/posts/         文章正文
  lib/
    posts.ts             文章查询：排序、标签、系列、相关文章
    shiki.ts             代码块的标题栏 / 行号 / 行高亮 / 折叠
    langs/               自定义语法高亮
    rehype-table-wrap.ts 表格横向滚动容器
  layouts/               Base（全站外壳）、Taxonomy（标签与分类页）
  components/            导航、页脚、搜索、目录、代码交互、终端 hero
  pages/                 路由
  styles/global.css      设计令牌与正文排版
public/
  og.png                 社交分享图，由 scripts/gen-og.mjs 生成
scripts/gen-og.mjs       改了站点定位就重跑一次
```

## 开启评论

评论用 giscus，基于 GitHub Discussions，不需要服务器：

1. 到仓库 Settings 里打开 Discussions
2. 安装 [giscus app](https://github.com/apps/giscus)
3. 在 [giscus.app](https://giscus.app) 填仓库名，拿到 `repoId` 和 `categoryId`
4. 填进 `src/consts.ts` 的 `COMMENTS`，把 `enabled` 改成 `true`

## 部署

`.github/workflows/deploy.yml` 监听 `main` 分支的推送。首次使用需要在仓库
**Settings → Pages → Build and deployment → Source** 里选择 **GitHub Actions**，
否则 Pages 仍然会去读分支上的静态文件。
