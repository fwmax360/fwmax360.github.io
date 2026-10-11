---
title: '腾讯游戏安全 2026 决赛：多 Part Flag、隐藏 Glue 与反调试状态机'
description: '在初赛 Godot + GDC 思路上扩展：Part0–Part3 分属脚本 / Process / 引擎隐藏回调；并梳理 libsec2026 的 fork/ptrace/procfs 杀进程状态机与补丁思路。'
pubDate: 2026-03-12
updatedDate: 2026-10-11
category: 'Android'
tags: ['腾讯游戏安全', 'Godot', '反调试', 'Frida', 'CTF']
series: '腾讯游戏安全2026'
order: 2
---

本文保留原题解中的地址、脚本片段和执行描述。当前仓库没有配套 APK、原始 trace 与完整工具集，本轮没有重新复现这些题目；偏移、哈希及 Godot 行为只对应原记录，迁移到其他构建需先核对样本哈希、架构与引擎版本。


决赛包名换成 `com.tencent.ACE.gamesec2026.final`，骨架仍是 Godot + `libsec2026.so`。[初赛](/posts/tgs-2026-prelim/) 里验证过的 GDC dump 流程可以复用，但 flag 被拆成多段，且 Part3 不再走公开的 `Process` 绑定。Java 层跟初赛一样：先起引擎，再进扩展。

## 先排除 libc++_shared

`libc++_shared.so` 的 MD5 与初赛一致（`1621ea1fc3043d63f478b432df04d819`），可以直接忽略。时间应花在 `libgodot_android.so` 的脚本加载链和 `libsec2026.so` 的扩展 / 反调试上。

## 资源两层壳：先 AES，再 GDSC

APK 里直接打开的 `trigger2.gdc` / `.scn` **不是** 一上来就是 `GDSC`。和引擎 `FileAccessEncrypted` 一致：磁盘文件先过一层 AES，解开后才是标准 binary token / 场景资源。

```text
assets 里的 .gdc / .scn
  → FileAccessEncrypted（AES-256-CFB + 文件头 IV）
  → 明文：GDSC…（脚本）或 RSRC…（场景）
  → GDScriptTokenizerBuffer / 场景解析
      →（可选）zstd
      → 标识符 / 常量 / token
```

所以 `godot-re-tools` 直接喂 assets 里的文件会失败，主因是 **外层加密**，不是「格式完全私有」。两条恢复路线可以互证：

1. 从 `libgodot_android.so` 抠 32 字节 key，离线 AES 解密，再交给 GDRE
2. 运行时 hook 加载链，在引擎已经解密之后 dump（本文后面的 Frida 路线）

### 外层：key 在 so，IV 在文件头

Godot 导出模板会内嵌 `script_encryption_key[32]`。决赛样本里可在 `libgodot_android.so` 的 `.data` 用熵扫描 / `FileAccessEncrypted::open_and_parse` 的 xref 钉到 32 字节常量（常见落点如 `byte_400EF18` / `0x4002f18` 一带）。硬证据是：

- `open_encrypted()` 要求 **key 长度必须是 32**
- 上层把同一处 32 字节常量 `memcpy` 进 key 缓冲再打开加密文件

**key ≠ IV：**

| | 是什么 | 在哪 |
|--|--------|------|
| **key** | AES-256 密钥，全局一份 | `libgodot_android.so` 的 `.data`（导出时写入） |
| **IV** | 每文件 16 字节初始向量 | 加密文件头里，不进 so |

加密文件布局（决赛 / 初赛 assets 一致）：

```text
[0..16)   MD5(明文)
[16..24)  uint64 LE 明文长度
[24..40)  IV（16 bytes）
[40..)    AES-256-CFB128 密文
```

解密后校验 `MD5(明文) == 文件头 MD5`。决赛是 **标准 CFB-128**；初赛同布局，但 CFB 解密分支被魔改过（position-XOR 变体），初赛脚本直接套决赛会解不开。赛后公开 WP 里决赛 key 一例：

```text
ce4df8753b59a5a39ade58ac07ef947a3da39f2af75e3284d51217c04d49a061
```

解密成功后 `.gdc` 以 `GDSC` 开头，`.scn` 常见 `RSRC`。决赛大约 10 个 `.gdc` + 若干 `.scn`。key 只负责把加密资源解开；**不会**一步变成 `.gd` 源码。

### 内层：GDSC + 可选 zstd（官方 binary token）

AES 解开之后，才是 Godot 4 的 [`GDScriptTokenizerBuffer`](https://github.com/godotengine/godot/blob/master/modules/gdscript/gdscript_tokenizer_buffer.cpp)（PR [#87634](https://github.com/godotengine/godot/pull/87634)）：

```text
47 44 53 43  65 00 00 00  a0 1f 00 00  28 b5 2f fd ...
│  GDSC  │  ver=101   │  raw_len     │  zstd magic …
```

```c
char     magic[4];              // "GDSC"
uint32_t tokenizer_version;     // TOKENIZER_VERSION，当前常见 101 (0x65)
uint32_t decompressed_size;     // 0 = 未压缩；非 0 = 后续为 zstd，值为解压长度
uint8_t  payload[];             // contents 或 zstd 流
```

解压后的 contents：

```text
identifier_count | constant_count | token_line_count | token_count
→ 标识符表（UTF-32 每字节 ^ 0xB6，等价 word ^ 0xB6B6B6B6）
→ 常量表（Variant）
→ token 行号 / 列号
→ token 流
```

官方路径：

```text
AES 解密后的 buffer
  → GDScriptTokenizerBuffer::set_code_buffer
      →（可选）Compression::decompress(..., MODE_ZSTD)
  → GDScriptParser::parse_binary
```

决赛还可能在 token 类型 ID 上做重排，导致「AES 解开了、GDRE 仍读歪」——那是内层兼容问题，和外层 key/IV 无关。

### 比赛时的加载链标注（无符号 so 上的假名）

下面函数名是 **本题对 stripped `libgodot_android.so` 的逆向标注**，不是公开 API；偏移会随引擎 commit 漂移。

```text
# 比赛逆向命名
get_type_for_ext
  → load_cached_or_parse
  → load_path_internal
  → read_gdc_bytes
  → load_from_gdc_buffer
  → parse_gdc_blob              ≈ 喂给 tokenizer / 解包头
  → compression_decompress_core ≈ Compression::decompress(MODE_ZSTD)
```

| 偏移 | 比赛时标注 | 更接近的官方角色 |
|------|------------|------------------|
| `0x13DC904` / `0x13DCB7C` | 扩展注册相关 | 脚本扩展 / 类型注册 |
| `0x1481BAC` | 缓存命中或回落加载 | 资源缓存加载 |
| `0x1481774` | 资源加载 | path → 脚本加载 |
| `0x147E914` | 是否 gdc 分支 | 文本 `.gd` vs 二进制 `.gdc` |
| `0x147EDA8` | 读入内存 | 读文件到 buffer |
| `0x1443C2C` | 上层解析入口 | 靠近 `parse_binary` |
| `0x147D2A8` | 解包（0 直取 / 非 0 zstd） | `set_code_buffer` 头解析 |
| `0x3770ECC` | 解压分发 | `Compression::decompress` |

不抠 key 时，可在引擎已过 AES 之后 hook 解压点 dump：

```bash
frida -U -f com.tencent.ACE.gamesec2026.final -l hook_gdc_decode_chain.js
```

产物在 App `files` 下：`*_src.bin` / `*_dst.bin` / `*_meta.txt`。离线：

```bash
python3 recover_gdc_runtime.py --scan-dir pull --out-dir pull/recovered_gdc
```

同一脚本常被加载两次，dump 组数大约是唯一 blob 的两倍。

## 五个脚本分别干什么

恢复后的映射：

| 资源 | 对应恢复名 | 角色 |
| --- | --- | --- |
| `token.gdc` | `token.pdc` | 生成 8 字符小写 hex，写到 `Token:` Label |
| `trigger1.gdc` | `trigger.pdc` | Part0 样例，直接写 `flag{sec2026_PART0_example}` |
| `trigger2.gdc` | `script.pdc` | Part1：纯脚本 `_h2b` / 多轮 helper / `_b2h` |
| `trigger3.gdc` | `script_2.pdc` | Part2：`token` 当 ASCII → `GameExtension.Process` |
| `trigger4.gdc` | `script_3.pdc` | Part3 壳：脚本里几乎看不到出分逻辑 |

### token / Part0

`token.gdc`：`extends Label`，`RandomNumberGenerator` 从 `"0123456789abcdef"` 取 8 字符，写成 `"Token: " + token`。

`trigger1.gdc`：`Area3D`，`_on_body_entered` 里直接写 `flag{sec2026_PART0_example}`，不做算法。`_process()` 里的 `_gx.Tick()` 会进 native（`+0x9AD68`），但是控制/时序路径，不是出分。

### Part1：纯脚本 Feistel

碰撞回调（反编译里常见 `_w7`）读 Token，走 `_fe()` 一类 8 轮 Feistel；密钥材料拼起来是 `"Sec2026_Godot"`。流程：

```text
Label.text.substr(7)
  → _h2b（token hex → 4 bytes）
  → 拆成前 2 字节 + 后 2 字节
  → 8 轮 _rf/_xb（Feistel）
  → _b2h
  → flag{sec2026_PART1_<8hex>}
```

识别时可看：`dst_len≈8096`，标识符有 `_h2b` / `_b2h` / `_xb` / `_rf` / `PackedByteArray`。主算法不进 `libsec2026`；`_process` 里的 `Tick()` 只是伴随调用。

Trigger 多在房顶，实机要主动把车 / 碰撞体传过去。Frida 挂 Godot 在部分机型会花屏，可用 NDK 小程序 `ptrace` / patch `Node3D::set_global_position` 做传送。

### Part2：公开 Process → 魔改 AES

碰撞回调里稳定还原为：

```gdscript
var _raw := str(_lt.text).substr(7)
var _buf := _raw.to_utf8_buffer()   # 注意：ASCII，不是 hex decode
var _rv := _gx.Process(_buf)
_lb.text = "flag{sec2026_PART2_" + _rv + "}"
```

例如 token `a2c21aa8` 进 native 的是 ASCII 字节 `61 32 63 32 31 61 61 38`，不是 `_h2b` 解出来的 hex。

Native：`+0x97704`（`Process`）→ `+0xA936C`（变换入口）→ key schedule / cipher。骨架是 AES-128 家族，但 S-box、ShiftRows、Rcon、轮数等被改过，属于白盒化的魔改 AES，产出 **32** 位小写 hex。`Tick()`（`+0x9AD68`）不是主变换。

### Part3：隐藏 glue → TEA/VM 入口

`trigger4.gdc` 几乎只有 `GameExtension` + `Tick`，没有 `Process` / `_h2b`，GDScript 侧也不 `emit` 碰撞信号。真正出分：

| 角色 | 约地址 |
|------|--------|
| 引擎侧拼 / emit Part3 | `libgodot` `0x25F6718` 一带 |
| native 核心 | `libsec2026+0xA9A7C` |

`+0xA9A7C` 静态几乎 0 xref，经 GDExtension 虚表间接进；内部是多层 OLLVM + VM，核心接近 TEA 变体（delta / magic 常量可从 trace 反推），输出 `"%08x%08x"` 共 **16** hex：`flag{sec2026_PART3_<16hex>}`。

## extension_init 注册了什么

`extension_init`（约 `0xA4074`）会构造初始化对象、注册 initialize / terminate（最小级别 2），并拉起：

```text
Godot 加载 libsec2026.so
  → extension_init @ 0xA4074
      → 初始化不同 level 的注册
      → 注册 Tick   @ 0x97B6C
      → 注册 Process @ 0x97E38
      → 启动反调试线程 @ 0x99094
```

白盒/扁平化区还有总调度入口 `VMEntry`（约 `+0xA6BEC`）：存寄存器、塞魔数、`CMP+CSEL` 算状态号、从跳转表取块再 `BR`。

可以把 Part 对应关系记成：

```text
Part0 → 纯脚本样例 flag
Part1 → 纯 GDScript Feistel（Sec2026_Godot）→ 8 hex
Part2 → Process @ +0x97704 → 0xA936C 魔改 AES → 32 hex
Part3 → godot glue → +0xA9A7C TEA/VM → 16 hex
Tick  → +0x9AD68 控制 / 反调试陪跑
```

对难下手的 so，建议拆两堆分别画图，别混着读：

- **业务堆**：`0x97704`、`0xA9A7C`、轮函数、常量表、hex formatter
- **反调试堆**：`0x99094`、`0x9C654`、`0x9CDC4`、`0x9B7D8`、`/proc/self/*`、ptrace/fork/wait/clock

VM/白盒优先追数据流：state 在哪、每轮改哪些字节、常量表从哪来、最后怎么转字符串。

## 反调试：不是单个 if，是状态机

决赛 `libsec2026` 的反调试是多线程、共享状态、带 teardown 的网络。`Tick()`（`+0x9AD68`）看起来像业务，实际是反调试扎堆处——脚本每帧调用，和后台检测线程做**心跳互锁**，不是 Part3 算法入口。

构造器 `0x99094` 一加载就 `pthread_create` 三条 worker：

| 线程 | 约地址 | 主要干什么 |
|------|--------|------------|
| fork / ptrace 自附加 | `0x9C654` | 子进程 attach 父进程，占 `TracerPid` |
| 延迟扫描中枢 | `0x9CDC4` | sleep 后再扫 maps / fd / task 等 |
| 时序 + 完整性 | `0x9B7D8` | clock 采样、`exit` 页保护、maps CRC 相关 |

敏感 syscall（`ptrace` / `mprotect` / `openat` / `prctl` 等）多走 **raw svc**，不经 libc，给 LD_PRELOAD / 常规 libc hook 添麻烦。

### 检测面（整理后约 9 项）

**1. fork + ptrace 自 tracer（`0x9C654`）**

- 子进程 `ptrace` attach 父进程；`ps -A` 会看到两个同包名进程（fork 后未 exec）
- 用 GETREGSET / SETREGSET 拉改寄存器；状态机分发，下一状态常 `(candidate ^ 0x82) + 0x34`
- `waitpid` 某类结果 → `exit(0)`；ptrace-like 失败 → `exit(1)`
- 因此早期动态分析宜 `frida -f` spawn：`-n` attach 时 `init_array` 已跑完，tracer 已占坑

**2. `/proc/self/task` 线程名**

- 扫 `status`，搜 `gum-js-loop`（Frida）、`gmain`（GLib）
- 命中后常见 `exit_group(0)`；有的路径把黑名单串当指针解引用直接 SIGSEGV

**3. `/proc/self/fd` → `linjector`**

- `opendir` / `readdir` / `lstat` / `readlinkat`
- Frida-server 注入时 fd 可能链到 `.../linjector-helper-...`

**4. `/proc/self/maps` + 模块名**

- 扫 maps 行找 Frida / 注入痕迹
- 另有 `dl_iterate_phdr` + 运行时 decode 的 needle（rodata 不见明文 `frida`/`gum`）

**5. `.text` 完整性 / CRC（和 Tick 互锁）**

- 检测线程周期性采样代码段（可走 `process_vm_readv` 读 `/proc/self/mem`，不依赖 `dl_iterate_phdr`）
- 结果写入共享槽；`Tick` 侧比对
- **inline hook 落 trampoline 会改字节 → CRC 失败 → 杀进程**  
  这比单纯 fork/ptrace 更常导致「能 attach、一 hook 就崩」

**6. `exit` 页保护**

- 检查 `exit` 首指令是否被改（如是否仍像正常 prologue）
- `mprotect(page_align(&exit), …, PROT_READ|PROT_EXEC)` 去掉写权限，挡后续 inline hook

**7. 10 秒时序 / 反向心跳**

- 后台线程约每 3s「证明还活着」并更新 baseline（共享时间槽，如 `0x1834B8` 一带）
- `Tick` 里 `llabs(now - baseline)` 与约 `10_000_000` µs（10s）比较
- 证明中断或 diff 过大 → 自毁  
  赛中若先不绕过，**约有 10s 窗口**够 dump 一点信息，但撑不久

**8. 原始 `openat` 探 procfs**

- syscall 56 + 隐藏路径模板（先 decode 再探测）

**9. 其它 marker / 全局 flag**

- 若干 `.bss` marker 字节、CFF 状态字；cold start 全 0 时部分分支可先走通，热路径更刁

### 现象与绕过思路

| 现象 | 常见原因 | 思路 |
|------|----------|------|
| `frida -n` 附不上 / 秒退 | tracer 已占、CRC / task 扫描 | 改 `-f` spawn；或先截断 fork 链 |
| 一 hook 就 `exit_group` | `.text` CRC / maps | **少改 .text**；数据层改 `.scn` 触发碰撞 |
| Godot 花屏 / 马赛克 | Frida 碰渲染/引擎线程 | 换 NDK 小程序 `ptrace` 调 `set_global_position` 等 |
| 约 10s 后自杀 | Tick 心跳超时 | 周期性刷新 baseline；或 patch Tick 判定为 RET |
| hook `exit` 反而更惨 | `mprotect` + 首指令检测 | 别 inline hook `exit`；必要时 GOT/PLT |

几条已经验证过的对抗方向（赛后 WP 与本题笔记一致处）：

1. **数据层优先**：改场景 / 传送 Trigger，不碰 `libsec2026` 代码段 → CRC 与心跳可自然过
2. **改 kill sink / constructor**：`0x99094` 直接 `ret` 不拉起线程；或 `exit`/`exit_group` sink 改跳 epilogue（别整段 NOP 维护逻辑）
3. **Tick 心跳**：运行时每几秒把 baseline 写成 `now`，让 diff 永远 &lt; 10s；或 patch Tick 里 10s 判定
4. **proc 扫描**：`openat`/`opendir` 对 `/proc/self/task`、`/proc/self/fd` 返回失败
5. **双进程**：`kill -9` 掉 tracer 子进程；或早期加载自研 so，在 `libsec2026` 之前截断 fork
6. **完整性**：校验函数直接 return success（要摸清互锁槽，乱 ret 易二次崩）

共享资源（时间槽、mutex、scratch、marker）别乱砍：粗暴把大段检测 `ret` 掉，进程可能短暂安静，随后在 `Process` / 输入路径上以 mutex abort 二次爆炸——tombstone 看着像别处崩了，其实是 teardown 后遗症。

## 小结

决赛相对初赛的增量是：

1. **多 Part**：脚本 Feistel、魔改 AES、隐藏 TEA/VM 三条线并存
2. **输入形态不同**：Part2 用 token 的 ASCII 字节，不是 hex decode
3. **反调试是状态机 + 心跳互锁**：fork/ptrace、proc 扫描、`.text` CRC、`exit` 页保护、Tick 10s；对抗宜少改代码段、瞄准 sink / 数据层

和初赛合在一起看，这届安卓客户端赛的主轴始终是：弄清 Godot 如何装脚本、脚本如何调扩展、扩展里哪段才是真正的变换核心。

## 赛后借鉴

- [2026腾讯游戏安全技术竞赛-安卓决赛VM分析与还原](https://bbs.kanxue.com/thread-290879.htm)
- [2026 腾讯游戏安全竞赛决赛 - Android WriteUp](https://bbs.kanxue.com/thread-290971.htm)
- [2026腾讯游戏安全竞赛Android决赛 wp](https://bbs.kanxue.com/thread-291005.htm)
- [2026腾讯游戏安全竞赛-决赛-安卓](https://bbs.kanxue.com/thread-290891.htm)
