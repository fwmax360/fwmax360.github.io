# 全站文档排查 · 2026-10-11

本轮覆盖原有 38 份内容：31 篇文章（30 篇正式、1 篇 sample）、README、3 份 Markdown 项目记录和3份 JSON 方案/验收记录。修改21篇文章、README和4份项目记录，另新增本报告。首页、灰色渐变、动画、组件与依赖没有在本轮修改；未提交或部署。

这是一轮内容与风险排查，不是“所有技术主张已验收”。全量覆盖的是文件清单、结构、引用入口和页面回归；人工核对重点落在算法、可执行片段、版本条件与证据边界。数千行风控长文、题解中的全部偏移和历史验收记录里的每一项结果，没有被本轮逐项重新复现。

## 先处理会误导执行的错误

### 算法往返成功，仍可能不是 DES

旧 C 示例在 `133457799BBCDFF1` 密钥和 `0123456789ABCDEF` 明文下，输出 `065FAFA8245B7504`，但仍能解密回来。原因包括子密钥半部长度错误及缺少第八张 S 盒；往返测试没有抓住它。

现按历史 [FIPS 46-3](https://csrc.nist.gov/files/pubs/fips/46-3/final/docs/fips46-3.pdf) 修正28位半部轮转、PC-2与S8，输出变为 `85E813540F0AB405`。100组固定种子随机块与本机 PyCryptodome 对照通过；这只是单块算法验证，不是新协议的安全选型建议。Python例子也不再用去尾零猜明文长度。

### 网络例子把方向和信任条件混在一起

- VPN 原稿把出站 IP 包写回 TUN，并称这样才能连通。已改为出站读取、入站注入的正确方向，撤下伪转发循环，明确接口片段缺少协议栈/网关与生命周期处理。[Android VPN 指南](https://developer.android.com/develop/connectivity/vpn) 是机制依据。
- 本机生成包的 OUTPUT 路径不经过 FORWARD；打开 IP 转发也不会改变包的来源。DNAT 与 TPROXY 分开说明。
- 透明代理清理不再清空整条 OUTPUT 链，改用自建链及对应跳转；恢复整个备份会影响其他规则，已加限制。UID解析增加检查，清数据不再被描述为必然改变UID。只做了 shell 语法检查，没有执行 adb、iptables 或抓包。
- Android CA默认信任取决于应用 target SDK 与配置，不只是系统版本或App品牌。系统证书路径也不是跨版本通用常量。[官方信任配置](https://developer.android.com/privacy-and-security/security-config) 放在相应判断旁。
- TLS 1.2的详细消息示意不再混称TLS 1.3；根CA自签与代理签发叶证书分开。固定延迟/DNS启发式和没有样本依据的产品归属已撤下。[RFC 8446](https://www.rfc-editor.org/rfc/rfc8446) 支撑版本区别。

### “完整代码”其实缺了关键条件

- Python文章撤下不支持的提取命令、按非零尾部猜GCM、吞掉解压异常及按字节删除指令的脚本。改为版本分支、16字节头部与只读查看例子；依据包括 [PEP 552](https://peps.python.org/pep-0552/) 和 [PyInstaller变更记录](https://pyinstaller.org/en/stable/CHANGES.html)。
- PE文章撤下无边界检查且可能截断64位ImageBase的C映射器，替换为PE32/PE32+只读结构检查；明确不是完整Windows Loader。依据是 [Microsoft PE格式](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format)。
- Inline Hook三份手写跳板存在指令截断、搬移未重定位、执行权限和跳转地址计算错误；其中一份覆盖17字节却只恢复12字节。完整安装代码已撤下，保留错误分析与 [Microsoft Detours官方入口](https://github.com/microsoft/Detours/wiki/Using-Detours)，未冒充Windows实测。
- Frida更新到17+ API，旧Module静态方法撤下；动态模块观察替代dlopen返回后安装的通用模板。libart私有符号与std::string布局仍标明构建依赖。[Frida 17发布说明](https://frida.re/news/2025/05/17/frida-17-0-0-released/) 支撑API变更。
- Simple VM末尾输出从32次索引改为实际数组长度；Smali条件分支改用两个寄存器，不把立即数当寄存器操作数。二者没有附带原样本或汇编后的执行证据。

## 每篇的覆盖与剩余条件

“保留”表示本轮没有发现需要新增修改的明确问题，不表示已证明没有问题。芯片专题复用此前来源核对，并在本轮检查版本范围、示意身份及交叉引用。

| 文件名 | 本轮处理 | 尚需注意 |
| --- | --- | --- |
| abl-android-handoff | 保留Android发布架构、镜像版本与ramdisk拼接边界 | 特定设备ABL实现需要固件与启动记录 |
| aes | PKCS#7块长范围、轮次结构与AEAD/填充区别 | S盒等局部片段不是完整AES实现 |
| android-vpn-capture | 包方向、路由范围、生命周期、CA条件 | Kotlin是片段；未在设备构建/运行 |
| arm64-calling-convention | 收窄非叶子序言的概括 | 汇编为机制片段；ABI与具体编译输出另查 |
| avb-slots-rollback | 保留successful与防回滚推进、Virtual A/B区别 | 厂商集成与实际槽位状态需另验 |
| behavioral-neural-risk | 去掉披露程度排名、交易完成暗示；区分厂商材料与独立证据；修正gyro单位 | 长文仍需去重；论文每项指标、专利范围和商业算子未逐项复核 |
| chip-memory-isolation | 检查CPU/DMA地址、设备映射、缓存与生命周期边界，保留 | 平台接线、SMMU域与资源规则未实测 |
| chip-package-interconnect | 检查概念模型与真实封装的区别，保留 | 没有产品剖面或版图证据 |
| des | 修正C实现和子密钥讲解；标准向量与100组对照 | 历史算法，单块示例无模式/认证封装 |
| elf-format | e_entry非main、PT_INTERP入口、load bias、PF/PROT区别 | 非完整Loader；架构启动ABI另查 |
| file-descriptor | FD/OFD关系、标准流约定、短写/EINTR示例 | 非阻塞I/O与持久化策略未展开 |
| frida-hook-patterns | 17+ API、模块观察、符号空值与ABI范围 | Node仅验证语法，不验证注入与符号存在 |
| hook | 撤下错误跳板；说明IAT和编译器范围 | IAT例子未在Windows复测、错误处理仍需完善 |
| iptables-transparent-proxy | 包路径、owner范围、TPROXY与信任条件 | IPv4示例不是所有Android网络策略 |
| js-beautify-unpack | 未交付脚本不再假装可运行；词法启发式降为受限方法 | 无完整变换流水线；格式化不证明语义等价 |
| launcher-trace | 去掉普遍不检测Launcher的结论；指出attach竞态 | 缺KISS提交号、私有依赖与真机复测 |
| mitm-proxy-capture | TLS版本、CA、叶证书、启发式与归属证据 | Hook片段需实际系统/网络栈验证；Java属性不覆盖所有Native路径 |
| pe-memory-map | 地址/对齐解释、64位ImageBase及边界查看例子 | 合成头部测试不等于Windows加载验收 |
| peb-teb-antidebug | TLS callback、API BOOL/输出参数、ptrace失败语义 | 私有结构与内部调用链依赖系统版本 |
| python-reverse | 撤下错误流程，补只读头部例子与工具版本边界 | 真实加密归档、反编译和控制流修复需样本 |
| rc4 | 复核旧算法边界与单次调用限制，保留 | 原C接口不能直接当连续分块流接口 |
| secure-monitor-smc | 复核请求开始/暂停/恢复/完成与并发关联，保留 | 示意不是trace，TF-A/OP-TEE不等同所有厂商实现 |
| silicon-trust-boundary | 核对sample身份、概念模型与入口，保留 | 不进入正式索引，不当产品实测 |
| simple-vm | 修正输出越界与7/8表项推断 | 无原题文件；swap及穷举前提未重新复现 |
| smali-cheatsheet | 修正if-lt操作数与move-result条件 | 未用smali工具汇编，静态语法核对不代替DEX运行 |
| tee-call-security | 核对GP/OP-TEE边界、调用与共享内存限定，保留 | 具体厂商TEE和真实TA行为需样本 |
| tee-ta-storage | 保留RPMB/REE存储及RKP/BCC边界与此前官方来源修订 | Android12引入不代表每台设备都统一切换；证书轮换不等于重新证明启动状态；厂商回信没有被扩写为通用结论 |
| tgs-2026-final | 保留题解，补原记录适用范围 | 缺APK/trace/完整工具；偏移与执行描述未复测 |
| tgs-2026-prelim | 保留题解，补构建/引擎版本边界 | 同上；不能用Godot最新版源码替代原构建 |
| transparent-proxy-capture | 自建链清理、UID、信任、恢复范围 | 进程停止仍用名字匹配，多实例要记录PID；只验证脚本语法 |
| xbl-boot-chain | 复核XBL/XBL_SEC与XBL-SC代际、读取/认证/交接区别，保留 | 无指定手机镜像与启动trace，不宣称通用固定顺序 |

## 项目记录也不能冒充当前状态

- README：去掉把23篇/23张封面写成当前内容的表述，保留历史测量的时点；缓存刷新不再要求每次删除整个构建。
- homepage-chip：原Blender方案已标为历史方案，被现有Three.js/GSAP替代；没有安装额外工具。
- 两份2026-10-10的内容修订记录保留原日期、范围和计数，不改写历史。
- 三份JSON方案/验收记录解析通过，297处明确的本地历史artifact路径均存在（未逐项验内容），追加本轮范围提示。旧篇数、测试数和快照仍对应各自时点，不能合并成此次新构建的完整验收。

第三方依赖文档、dist生成页面与artifacts历史实验材料不作为本轮可编辑文章正文。没有遍历或发布keybox目录中的密钥、私有邮件或原始载荷。

## 本地证据与回滚

完整记录在 `/Users/ytz/blog/artifacts/document-audit-2026-10-11/`：

- `before/`：本轮开始前对应文件的副本；不是Git基线，因此保留了用户此前的工作内容。
- `inventory.json`、`coverage.json`：清单与修改范围。
- `examples.json`、`verify-examples.py`：DES对照、pyc和PE边界夹具、Frida/代理脚本语法检查。
- `astro-check.log`、`build.log`、`current.log`、`links.log`、`reader.log`、`pages.json`：构建、链接与阅读页面证据。
- `urls-before.json` 与 `urls.json`：修订前后外部引用的HTTP访问结果。HTTP成功不证明内容支持论断，403/网关/证书/超时也不自动判为链接永久失效；网页锚点、登录内容与全部语义没有在这里逐项验收。

回滚时从 `before/` 复制需要恢复的单个文件，再构建和验证。不要用reset覆盖原有未提交工作，也不要用一份旧备份覆盖此后新增的修改。

最终验证结果补记在下一节；本报告不会将页面测试写成真实技术实验。另观察到当前构建清单包含 `dist/.DS_Store`，发布前应清理这类文件系统元数据；本轮没有修改公开资源或将此项冒充已修复。

## 最终验证

- Astro检查：128个文件，0错误、0警告。
- 最终构建：278项输入、509个输出；源码/产物记录匹配，509个本地预览文件逐字节一致。
- 内部链接：140个HTML、15个CSS、9327条引用，未发现坏链接。
- 阅读功能：30篇正式文章通过目录、系列、代码、复制、进度与无JS回归。
- 页面布局：31个文章路由含sample，在Chromium/WebKit/Firefox、320/390/1440宽度下共279组通过；另各引擎检查代表文章无JS可读。中间一次WebKit缓存304被测试误判，日志保留；改用每轮独立查询参数后的最终重跑通过。
- 示例：DES标准向量与100组库对照；DES/FD经ASan、UBSan编译运行无报告；pyc头部3正3负，PE结构2正5负；2份代理脚本和7个Frida片段语法检查通过。未执行Hook、抓包或设备注入。
- 外部文章引用：111个URL，90个返回200，21个访问受限、网关/证书异常或非200响应需进一步确认；未遇到404/410。修订前4个返回404的引用已不在修订后的集合。HTTP结果不代表全部引用语义已经核验。

这些结果限定于本机与当前构建。剩余的样本、真机、Windows、商业实现和历史测量复核仍按前文逐篇列出的条件处理。
