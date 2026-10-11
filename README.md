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
status: published        # published / sample / draft；省略时为 published
draft: false             # 兼容旧字段，true 优先于 status，只在 dev 可见
pinned: 0                # 大于 0 会置顶，数字越大越靠前
---

正文从这里开始。
```

只有 `title`、`description`、`pubDate`、`category` 是必填的，缺了构建会直接报错。

## 发布状态与预览

- `published`：进入文章列表、分类、系列、图谱、RSS、搜索和站点地图。
- `sample`：保留直接阅读链接，供专题演示；不进入上述正式内容流，并设置 `noindex`。
- `draft`：只在开发环境生成。旧文章的 `draft: true` 保持有效，优先于 `status`。

芯片示例保留在 `/posts/silicon-trust-boundary/`；替换成正式文章时将其 `status` 设为 `published`。站点地图从构建后的 `robots` 元信息读取排除规则，避免另维护一份示例 URL 清单。

## 质量验证

```bash
npm run check
npm run test:publication
npm run build
python3 scripts/check-internal-links.py
# 另一个终端运行生产预览：npm run preview -- --host 127.0.0.1 --port 4322
npm run test:quality
npm run test:archive-state
npm run test:archive
npm run test:series
npm run test:map
npm run test:reader
npm run test:note-hover
npm run test:taxonomy
npm run test:about
npm run test:style-boundaries
npm run test:fonts
npm run test:chip-quality
npm run test:chip-startup
npm run test:navigation-glow
npm run test:silicon
npm run test:chip-preview
```

常规本地浏览器脚本使用已安装的 Chrome；CI 使用 Playwright Chromium，并运行 WebKit/Firefox 核心页面检查。`PREVIEW_URL` 可以指定其他预览地址。通过自动化不代表已完成真实设备或线上性能验收。

`test:quality` 同时保护首页八档宽度的专题说明、12px 入口文字与44px操作区域，以及搜索输入焦点、标识对比度、移动按钮尺寸和空态/失败态语义。搜索提示独立于 `listbox`，只有真实结果进入选项列表。首页布局集中在 `home.css`，专题卡片内部按容器宽度连续缩放。

本地验证、截图和备份保存在 `artifacts/`，不提交到 GitHub；Cursor 配置与环境文件同样排除。全新克隆可运行测试生成新证据，但文档里的历史本机记录不会随源码自动下载。历史测试数与截图结论仍以记录时点为准。

## 研究索引

首页以研究展台组织内容；归档页使用开放式时间目录和桌面随选笔记预览，系列与图谱提供专题路径和关联入口。对应样式由 `home.css`、`archive.css`、`series-open.css`、`map-open.css` 管理，不依赖旧框架式标题组件。

归档的 `category`、`series`、`density` 查询参数支持复制链接、刷新和从文章返回恢复。筛选使用 `replaceState` 更新当前索引，保留路由器的历史元数据，不为每次筛选增加一次返回操作。无效筛选归一化为默认值，其他查询参数与锚点保留。禁用 JavaScript 时显示全部正式笔记并隐藏筛选控件；移动端直接阅读摘要，桌面支持悬停或键盘聚焦标题来切换预览。

`test:archive-state` 验证 URL 状态模型；`test:archive` 验证发布内容、八档宽度、计数、键盘预览、空结果、重置、刷新、文章前进后退及阅读位置恢复。这两项也已接入部署工作流；远端 CI 执行证据仍需在提交后验证。

## 芯片启动与画质

芯片页先展示本地封面，再动态导入完整 Three.js / GSAP 场景。省流量、2G、极低内存或双核设备默认静态预览，用户可点击开启交互；未知能力值不会被当作低配置。

画质策略定义在 `src/lib/chip-quality.ts`：桌面完整后处理，移动端平衡档，低内存/主动开启的轻量档使用更低 DPR 和帧率上限。三档保留相同结构、镜头、注释和选择能力。初始化在多个任务间让出主线程，并预编译场景材质；静态封面直到真实帧就绪才隐藏。

`test:chip-quality` 验证策略；`test:chip-startup` 验证省流量不下载3D、主动开启、慢模块传输和封面布局。无头浏览器结果不代表手机 GPU 性能，真实设备画质与帧时间仍需单独验收。

## 字体加载

`design-tokens.css` 定义字体角色；英文 UI 使用 Geist，代码使用 JetBrains Mono，中文优先系统字体。完整 Noto Sans SC 兜底由 `CjkFonts.astro` 非阻塞加载，文章和关于页另启用 Noto Serif SC；禁用 JavaScript 时由 `noscript` 恢复常规样式加载。字形覆盖没有裁剪，拆分减少的是关键路径，而不是承诺总下载量下降。

修改字体策略后运行 `npm run test:fonts`，验证冷启动、客户端切页、中文实际字形文件和禁用 JavaScript 的路径。上述界面与正文字体包含在生产构建中，不依赖运行时远程字体服务。

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

遇到语法定义修改后渲染仍沿用旧结果时，可先强制刷新内容；不要把删除整个构建当成每次改文档的必需步骤：

```bash
npm run content:refresh
npm run build
```

是否需要额外清理取决于缓存状态；构建后用 `npm run test:build-current` 核对源码与产物。

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
  components/            导航、页脚、搜索、目录、代码交互、芯片专题
  pages/                 路由
  styles/design-tokens.css  单一配色、字体、尺寸令牌
  styles/global.css      基础排版与共享组件
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

## 跨浏览器与 3D 回退

```bash
npx playwright install webkit firefox
npm run test:cross-browser
npm run test:chip-cross-browser
```

`test:cross-browser` 覆盖主要入口与阅读页的布局、导航、搜索、筛选、无 JS 阅读和减弱动态。`test:chip-cross-browser` 需要可用的 WebGL2 后端，验证 Chromium/WebKit/Firefox 的三档实际渲染、分层选择、播放暂停、连续上下文丢失/重试与首次绘制期间的启动中断。

上下文丢失后释放旧渲染器与场景资源，回到静态海报并提供原地重试；重试会恢复控制器的默认状态，旧启动任务不会覆盖回退状态。重复恢复的渲染器 geometry/texture 计数仅是局部资源证据，不代表 GPU 内存、手机功耗或帧时间。GPU 测试目前为本地运行，未将未知 Linux GPU 后端当成已验证环境；核心跨引擎测试已加入 CI，远程执行仍待验证。

`npm run test:chip-antialias` 比较固定镜头的 off/on/off 截图与奇数视口缩放，确认低 DPR 档的 FXAA 真正作用于画面、未提高分辨率。轻量/平衡档仅增加一个全屏绘制，完整档保留 4× MSAA；缩窗后 composer 与 renderer 使用同一实际缓冲尺寸。记录的 composer.render 耗时是 CPU/驱动调用耗时，不能用作 GPU 帧率或手机功耗结论。

### 封面与列表视觉回归

`npm run test:cover-editorial` 按当前内容检查封面（原23张为历史覆盖）无装饰性假数据，并在 Chrome、WebKit、Firefox 的390/1440px视口验证标题字体、字重、归档封面选择和横向溢出。需先构建并运行本地预览。截图与结果在 `artifacts/cover-editorial/`；这不是物理设备或用户视觉验收。

`npm run test:cover-title` 验证混排、标点、长词、完整文本与超容量提示；`npm run test:cover-layout` 在三个浏览器引擎中测量当前文章SVG和4个长标题夹具的实际字形边界，避免侵入示意图区。

`npm run test:archive-preview-loading` 在三个浏览器中延迟图片请求、乱序释放和模拟404，验证占位比例、旧图隐藏、阅读链接及后续选择/客户端返回恢复。结果在 `artifacts/archive-preview-loading/`。部署工作流新增此检查、纯标题与封面基础回归；真实远程执行仍需CI结果确认。

### 芯片启动剖析

`npm run profile:chip-boot` 默认生成 `artifacts/chip-boot-profile/current.json`，5次独立上下文、本地390×1000/DPR3、4×CPU模拟。分段为累计墙钟时间；长任务阻塞不是Lighthouse TBT或现场INP，驱动缓存可能保留。`npm run test:chip-boot-compat` 强制禁用scheduler API验证timer回退，并比较固定镜头；GPU后端未在远程CI验证，此测试保持本地专项运行。历史before文件不由默认命令覆盖。

`npm run test:chip-early-loss` 在三引擎的renderer/environment/geometry初始化阶段实际触发WebGL上下文丢失，检查首帧前回退、立即重试、单canvas与层选择。结果在 `artifacts/chip-early-loss/`。本地GPU专项，不代表真实设备或远程Linux GPU。

`npm run test:utility-open` 覆盖RSS/404的三引擎四视口布局、RSS XML条目一致性、复制成功/拒绝、客户端返回单次监听、404搜索及焦点恢复、noJS可用性。复制权限以夹具模拟；部署环境的HTTP404状态须另验。证据在 `artifacts/utility-open/`。

`npm run test:native-nav` 验证三引擎在320/390/720px下关闭JavaScript或以CSP拦截全部脚本时的原生手机菜单，以及正常增强菜单/Esc焦点/桌面导航。证据在 `artifacts/native-nav/`。原生details为默认入口，增强脚本绑定完成后替换为现有菜单。

`npm run test:home-static-entry` 验证首页在正常增强、禁用脚本与CSP拦截脚本三种状态下的桌面/手机入口：静态布局材质一致，未就绪时使用全部文章链接，就绪后每次展开至多4篇。未来文章数由RSS读取，不固定22。

### 本地整站验收

`npm run test:release` 对现有最新生产构建的全部文件与本地预览逐一做SHA-256一致性校验后，顺序执行核心检查；`npm run test:release -- --include-gpu` 额外执行本地GPU专项。它不重新启动预览、不自动重建、不提交或部署。每项日志、退出码、耗时、开始/结束快照（应用源码、公开资源、验证脚本、工作流及生产构建）保存在 `artifacts/release-check/`。页面转场 `test:navigation-glow` 已纳入核心门禁；GPU专项包含重复挂载/卸载 `test:chip-lifecycle`。逐项完成度见 `docs/release-readiness.json`：本地全绿不等于真机、线上或用户审美验收。

旧首页组件清理（HomeFeatured/HomeEditorial/MissionDebrief）的备份在 `artifacts/legacy-component-cleanup/legacy-components.zip`，已验证内容字节一致。需要恢复时在仓库根目录运行 `python3 -m zipfile -e artifacts/legacy-component-cleanup/legacy-components.zip .`。本次重建的442个输出文件与清理前完全相同；这不是bundle减重或性能改善。

`npm run test:silicon-mobile-reading` 检查芯片专题三引擎的320/390/720px、100/200%根字体和减少动态，共24组：关键文字尺寸、说明/控制区分离、44px控件与可滚动到达性。属于可选GPU门禁；CSS字体模拟不等同真实手机系统字体设置。截图及证据在 `artifacts/silicon-mobile-reading/`。

`npm run test:silicon-static-reading` 在三引擎下检查芯片静态入口，共39组：无JS专用文流、CSP脚本拦截、省流量入口、100/200%文字、键盘跳过、被实际挂起并失败的模块请求与原生阅读链接。已加入核心本地门禁和CI定义；远程CI未执行。模块下载失败后的缓存重试恢复不在此项完成声明内。

`npm run test:chip-runtime-retry` 验证三引擎9组恢复路径：模块请求失败后明确刷新页面，渲染器构造失败/实际上下文丢失原地重试。刷新保留URL，省流量模式不强制下载模型。加入可选GPU门禁；原静态检查的模块恢复范围由此独立补充。

`npm run test:note-polish` 检查三引擎的列表字体、常规字重、悬停标记和归档预览同色响应；截图在 `artifacts/note-polish/`。字形风格仍需用户视觉验收。已加入核心本地门禁和 CI 定义，远程运行另验。

`npm run test:chip-reading-anchor` 在三引擎、100/200% 根字体、两种阅读偏移下，挂起并中断真实模型模块请求，检查专题切换到静态预览后阅读位置、焦点与锚点保持。12 组本地测试的位移小于 0.2px；证据在 `artifacts/chip-reading-anchor/current.json`，不等同真机网络验收。已加入核心门禁和 CI 定义。

`npm run test:note-preview-placement` 检查三引擎在901/1440px宽、240/360/1000px高与100/200%根字体组合下的实际指针和键盘预览，共48组。浮动封面避开当前文章文区与导航，预留旋转尺寸；空间不足时仅隐藏装饰预览。已加入核心门禁和CI定义；本地证据在 `artifacts/note-preview-placement/current.json`，远程CI与真机体验另验。

旧 `site-editorial.css` 与 Base 条件加载分支已退役。备份位于 `artifacts/companion-style-cleanup/source-before.zip`，内容在移除前逐字节核验；如需恢复，先确认 Base 没有后续修改，再在仓库根目录解压该备份。构建仅删除一个未链接的20523字节CSS，其余443个文件完全相同。这是维护性清理，不是运行时传输或帧率收益。`test:style-boundaries` 同时扫描全部构建HTML/CSS，防止旧页面模式和覆盖重新进入输出。

当前首屏交付测量在 `artifacts/lcp-current/README.md` 与 `summary.json`：同一冻结构建、同一临时服务的 identity/gzip 对照加现有预览，共18次Lighthouse 12.8.2测量。压缩后的模拟LCP中位：首页1952ms、长文2552ms；CLS约0.000787，非严格零。工具装在临时目录，未改应用依赖或视觉；测量服务已停止，原预览保持。部署压缩与缓存仍需实际核验，不据本地未压缩结果削减画质，也不以模拟分数声明线上p75达标。

实际部署交付只读检查在 `artifacts/deployment-readonly/verification.json`：已观察到HTML/CSS/JS的gzip与600秒缓存，因此不额外添加压缩配置。线上首页/归档/正文指纹仍不同于当前冻结构建，新 `/silicon/` 返回404；公开10月4日CI成功仅属历史版本，尚非当前代码的远程验收。检查未推送、部署或更改服务。发布后的具体验收步骤见该目录README。

`npm run test:article-font-budget` 检查当前文章路由；原23个路由、三引擎69组属于历史结果，按现有内容动态枚举可见字体与资源预算，默认不依赖历史artifact。`COMPARE_BASELINE=1` 额外核对已有before快照的字体、全文与代表性首屏PNG。普通文章不再自动下载未使用的宋体CSS，中文无衬线兜底及 `Base` 的 `editorialFont` 显式能力保留；字体测试独立验证可选宋体资源与字形。相同gzip夹具下长文模拟LCP中位约2552→2252ms，传输减少35781字节；这是本地顺序实验，不是线上p75。证据在 `artifacts/article-font-budget/revision.json`，临时测量服务已停止，未发布。46项全量审计为此应用修改前的历史快照；新门禁已加入核心runner和CI定义，远程执行另验。

### 构建与源码的一致性

`npm run build` 仍依次检查封面、构建 Astro、生成 Pagefind 索引，但现在在构建前后对 `src/`、`public/`、`scripts/`、工作流及 Astro/TypeScript/package 配置做完整内容快照，并将成功记录写到本地 `artifacts/build-inputs/current.json`，不发布进 `dist/`。构建中输入变化或任一步失败时，没有可用成功记录。

`npm run test:build-current` 检查当前输入与完整产物清单是否对应记录；新增、删除、内容改动都算变化，不依赖文件修改时间。`test:release` 在验收开始和结束检查该记录及其稳定性；CI 定义也已加入检查。没有记录的旧构建先执行 `npm run build`。`npm run test:build-inputs` 的13个临时夹具涵盖删除/新增、回拨时间戳、配置漂移、产物漂移、记录损坏和构建失败，不修改真实站点。

记录只证明本地字节一致性，不是签名证明，也不替代 `npm ci` 的依赖安装、远程发布、真机或人工审美验收。诊断产物 `artifacts/` 从应用 TypeScript 检查中排除，以免实验辅助脚本影响应用门禁。此次重建的443个输出文件与修改前逐字节一致，本地预览也全部匹配；专项证据见 `artifacts/build-provenance/verification.json`，未重跑全部历史46项审计。

最近一次全量本地审计已完成48项，包含新增字体预算与构建输入检查；报告保持该冻结版本的来源记录。其后按视觉反馈加入首页白到灰渐变：最新笔记面、主要入口按钮与主标题银灰过渡；15组桌面/移动模拟、减少动态及强制颜色验证通过，并通过质量和样式边界检查。原有文字、尺寸与布局不变，正文最小对比度保持4.5以上。专项记录 `artifacts/home-silver-gradient/revision.json`；48项全量审计不冒充这次CSS修改后的全量复测。
