# 芯片探索路径实施计划 / 2026-10-12

## Brief 与参考锁定
目标：芯片全景 → 光标探索结构 → 滚动推进内部 → 一次短促数字切景 → 专题横向展柜 → 安静阅读。延续灰色金属、真实光照、克制排版与已有文章，不把博客变成无休止的特效演示。

已在线研究 [Scrolltide](https://www.scrolltide.co/components)、[Navbar Design](https://navbar.design/)、[CTA Gallery](https://www.cta.gallery/)、[Refero Styles](https://styles.refero.design/)、[Supahero](https://supahero.io/)、[3dicons](https://3dicons.co/)、[Glass](https://glass.samasante.com/)。参考交互构成而非复制商业模板或代码；Hireline 尚未确定具体站点，不作为证据。

工具准备：通过官方技能安装器下载 [Refero 设计技能](https://github.com/referodesign/refero_skill)，安装于 `/Users/ytz/.codex/skills/refero-design`。本机 Python 证书问题通过 certifi 证书链修复，未禁用 TLS 校验。使用其本地设计流程，无付费 MCP 接入。复用已安装 GSAP ScrollTrigger、Three.js interaction/performance 技能；项目已有 GSAP 3.15.0、Three.js 0.186.1、Playwright 1.64.0，无新增运行时依赖。

**参考锁**：主视觉是现有芯片模型及灰色编辑风格；Scrolltide 仅提供镜头推进、热点和横向展示的运动语言。拒绝彩色霓虹、全页玻璃层、滚动劫持、长期闪烁和全文动画。

## 分段设计与决策账本
|段落|实现|决策理由|
|---|---|---|
|全景|保留首页轻量静态入口，进入 `/silicon/` 后沿用真实模型|首页不下载 Three.js，不破坏已有首屏预算|
|光标结构|桌面细指针小幅镜头环绕；HTML 热点按钮选择层并局部抬升；原生下拉仍可用|不是纯 hover 信息，键盘/触屏获得相同结构说明|
|内部推进|复用可逆 ScrollTrigger 时间线，包装拆解到电路近景|同一场景连续推进，保留章节跳转与自主滚动|
|数字切景|近景到执行上下文的阈值跨越时一次约 180ms 的低亮度扫描/偏移|提示语义转场，不复制画布、不改变文章、不随反复滚动闪烁|
|横向展柜|真实文章链接、CSS 原生横滚与 snap，前后按钮和方向键|纵向滚动不被抢夺；无 JS 仍能滑动，触屏直接操作|
|安静阅读|普通文章路由与现有阅读器不变|视觉展示与阅读职责分离|

模型仍为概念示意，normal/secure world 是执行上下文，不声称物理芯片被切成两块。完整体验主要位于 `/silicon/`，不是在每篇文章附加 3D 场景。实验 `/chip-preview/` 保持原有确定性构图。

## 结构、生命周期与降级
- `ChipExperience.astro` 添加语义热点、单次转场层、专题横向展柜。
- `chip-preview.ts` 在生产路由启用轻微环绕、所选层抬升；统一既有渲染循环、dirty 机制、可见性和销毁生命周期，不另起循环。
- 独立轻量展柜脚本不依赖 3D 模块加载成功；按钮、键盘、resize 后边界同步；不拦截全页 wheel。
- reduced-motion：无镜头环绕/抬升/切景，展柜即时移动；节流/低性能/无 WebGL/模块失败沿用静态阅读，保持 hash、焦点与滚动锚点。
- 关闭页/导航释放监听、Observer、GPU 与 GSAP；鼠标离场镜头回中；文章进入后无视觉动效。
- 不增加纹理、网络模型或后处理 pass；环绕幅度约 ±0.28 场景单位；只在实际运动时提交帧，离屏暂停。

## 待办与验收
见同目录 `chip-journey-todos.json`，逐项更新证据。
1. 工具与参考准备（完成）。
2. 设计计划、参考锁和待办（完成）。
3. 交互实现与静态/移动降级。
4. 新增真实浏览器验收：热点键盘选择、所选层抬升、镜头回中、阈值一次性、横滚按钮/键盘、减少动态、无脚本。
5. Astro 检查、构建、原有完整发布门禁及跨浏览器/GPU 专项；保留所有既有断言，不以本地通过代替 Linux CI。
6. 桌面/移动截图复核，记录实际范围与限制；提交本地修改并提供准确 push 命令。

## 发布与回滚
用户负责 push；不自动上传或重跑 Actions。部署核验不属于本地测试的证明。修改独立提交；若需要回滚，对该提交执行 git revert，保留先前 4b7cc7b 导航死锁修复。文章源文件不改动。

## 实施记录
- 原生横向滚动的 snap 起始点被容器 6px 内边距移动，已增加对应 scroll-padding，边界按钮状态恢复正确；新增测试覆盖起始、末尾与 Home/End。
- 桌面热点菜单从注释区移到顶栏下方的独立横排，避免层标签重叠；移动端使用既有原生层选择器，不叠放新的热点菜单。
- 实际模型 raycast hover 同步轮廓与热点菜单；选中层使用 180ms 小幅抬升，移动端没有光标环绕。镜头离场回中；离屏与隐藏页不提交帧。
- 单次转场只响应连续滚动跨越 .76 阈值（跳章节不闪烁）；180ms 后清除，重复跨越不重播，reduced-motion 完全隐藏。
- 本地三引擎展柜、无脚本与减弱动态验收通过；桌面 Chromium WebGL 和模拟移动触屏验收通过。截图位置见待办文件。检查发现菜单重叠后重新修复、构建并复核。
- 尚待完整发布门禁及本地提交。所有浏览器结果只证明记录中的本机范围。
- 补充 GPU 三引擎回归发现 Firefox 章节标识仍可能保持初始化的 `-1`：帧计数增加不代表 seek 后的新帧已经提交，章节 HTML 状态却直到渲染才同步。诊断确认三种质量档位初始均为 `-1`、seek 后等待新帧才变为 `1`。修复为初始化 ScrollTrigger 的当前章节，并在 setProgress 时立即同步语义章节标识；渲染仍使用相同时间线，原测试断言完整保留。修复后重新构建并重跑验收，不沿用前一快照的发布结果。

## V2 参考锁：全视口产品镜头（用户纠正后）
用户明确否定“标题＋模型区域”作为全景。首屏应为精致芯片占主导的全视口构图；下拉先缓慢观察、再加速拆解推进。前一版不提交，待办重新进入实现/验收。

再次研究 [Apple AirPods Pro 产品页](https://www.apple.com/airpods-pro/) 的首屏产品主导与贴边文案；实际浏览首屏和下拉构图，部分产品视频在当前浏览器未播放，不把静态截图当动画速度证据。[Apple MacBook Pro](https://www.apple.com/macbook-pro/) 作为硬件/芯片产品叙事参考。[GSAP 官方 ScrollTrigger 文档](https://gsap.com/docs/v3/Plugins/ScrollTrigger/) 明确滚动距离与时间线比例、scrub 平滑跟随；实现速度变化靠镜头段落 easing，不劫持用户滚动。

V2：生产视口 canvas 铺满 stage；镜头从近距离全包装开始，文案移到左下边缘小字号；热点退到第二段，首屏先看芯片。包装拆解用 power2.in 从慢到快，随后连续推入电路，最终转入执行上下文。实验 preview 不变。移动端保留 200% 字号阅读与控制触达，不把可访问性换成满屏特效。

V2 实际验收补充：
- 原生滚轮等距推进至 .20/.25/.30/.35，拆解量分别为 .00237/.037037/.151704/.39437；实测后段增量明显大于前段，非仅 debug seek 的静态截图。
- 生产首屏取消叠放的阶段文案，保留一个边缘标题；浏览器 650px 宽实看发现移动样式强制 opacity=1 引起双标题，已修正该可见性，保留选中结构的说明。
- 移动执行上下文标签上移到叙事上方，通过 24 个三引擎、320/390/720px、100%/200% 字号与 reduced-motion 用例；桌面初始包装缩放从 1.25 收敛到 1.08，仍保持全视口近景。
- 新增 GPU 验收包含原生滚轮速度曲线、首屏单标题、层选择抬升、实际 raycast hover、光标离场回中、单次转场、离屏停帧与模拟触屏选择。CPU 三引擎与 GPU 三引擎/三质量档位均单独复核。

## 最终本地交付
V2 最终源码重新 check/build 后，CI=1 完整发布门禁 41 项全部通过，509 个预览资源与构建字节一致，验证前后源码和构建摘要一致。最终 GPU 交互专项及移动阅读 24 fixtures 通过；另有三引擎三质量档位、六次生命周期专项通过。证据为 `artifacts/release-check/verification.json`、`artifacts/chip-journey/gpu-verification.json`、`artifacts/chip-journey/native-scroll.json` 和 `artifacts/silicon-mobile-reading/verification.json`。实际 Codex 浏览器刷新并核验首屏单标题，截图 `artifacts/chip-journey/in-app-final.png`。记录限于本机浏览器，不是 Linux CI 或线上部署证明。

实现、计划、待办与新增测试将一起提交本地 main；用户执行 `git push origin main` 后才进入远端发布。未自动 push，未改动文章、已有发布 workflow 或账户设置。

## V3 产品氛围与 UI 反馈 / 2026-10-12
用户认可 V2 全屏构图，要求结合实际补充动态背景、毛玻璃及 UI 交互。采用直接构建路径，锁定现有金属灰芯片与小字号边缘文案；参考 Scrolltide Components 的 Light Cove 光场层次、Liquid Glass Button 的控件反馈，Glass 示例仅作为局部玻璃材质方向（没有读取或复制其商业实现）。Refero bundled motion 用于反馈/层级原则。玻璃只归属顶栏、播放控制和结构菜单，不覆盖芯片或文章；色彩仅冷灰/低饱和灰紫，原有薄荷色保留选中含义。

实现：CSS 合成层低频光晕（18/23 秒）及反射光带（24 秒），不新增 canvas/WebGL pass；IntersectionObserver、页面隐藏、减弱动态自动暂停，明确 Pause/Resume atmosphere 按钮支持键盘。毛玻璃有实体背景降级，触屏降低模糊范围。章节选中胶囊、热点抬边/选中、链接颜色反馈、展柜结构图轻抬升、按钮按压，均保留原生导航/滑动与可读文字。无脚本默认不播放氛围。文章内容与阅读页不变。验证增加暂停/恢复、离屏暂停、减弱动态静止断言，保留前一版全部测试。

V3 视觉复核：实际 Codex 650px 宽浏览器观察到玻璃控制透出芯片层次、背景仅柔和光场。发现首次 390px 触屏暂停按钮与下方控制框接近，已移至上方边缘，并在离屏时隐藏；增加位置断言。首次 reduced-motion 动画名断言揭示 CSS specificity 未覆盖 i 元素，修正选择器后重跑，未删除断言。实看 Pause/Resume 状态与 animationPlayState 一致。最终截图 `artifacts/chip-journey/product-polish-in-app.png`，桌面/触屏截图复用最终 GPU 验收目录。

V3 发布检查记录：完整门禁首次在既有 test:archive 返回导航后的条目计数断言遇到 0≠14；未改动归档源代码或放宽断言。相同 CI=1 单独复查通过（包括返回/前进、筛选恢复），继续重新跑完整不可变快照门禁。该记录不被误归因于毛玻璃或氛围模块，也不声明已找到偶发根因。

V3 最终交付：CI=1 完整门禁重新运行 41 项通过，509 个预览文件与构建一致，验证前后 source/build hash 相同；Astro check 0 错误/警告，GPU 氛围暂停恢复/原交互专项和移动阅读 24 fixtures 通过。没有为通过检查削弱断言。仅本地验证，不代表新提交的 Linux Actions 或线上部署。独立本地提交，用户负责 push。

## V4 · Real multidirectional studio lighting

- Reuse the two existing DirectionalLights: key sweeps on a 24-second orbit, rim sweeps oppositely on a 32-second orbit, with restrained vertical movement. Preserve the environment, materials, grey palette and existing exposure.
- Accumulate only active visible time; the atmosphere toggle freezes real light positions as well as CSS ambience. Resume continues from the frozen phase. Reduced motion uses the original stationary rig. The `/chip-preview/` fixture stays static.
- Reuse the renderer's animation loop, with idle illumination capped at 20 fps desktop / 12 fps narrow viewport (and existing quality limits). No extra render pass, shadow maps, texture or RAF loop.
- GPU browser assertions verify both light positions change, pause freezes the clock and positions, resume does not skip paused time, and idle frame count stays bounded. Existing native scroll, raycast, layer lift, touch UI and offscreen idle assertions remain intact.
- Screenshots: `artifacts/chip-journey/lighting-sweep-a.png`, `lighting-sweep-b.png`, and `lighting-in-app.png`. Validation here is local, not Linux CI or a production deployment.
- V4 verification: Astro check reports 0 errors/warnings/hints; rebuilt distribution; GPU journey passes the new lighting assertions and existing interactions; CI-mode local full release passes all 41 commands and verifies 509 preview files. This is not Linux CI evidence.
- Mobile reading regression: all 24 local fixtures passed. Source/build hashes stayed unchanged throughout the full release verification.
