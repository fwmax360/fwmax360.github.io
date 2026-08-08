---
title: '腾讯游戏安全 2026 初赛：Godot + libsec2026 的 GDC 解密与 Part1'
description: '包名 com.tencent.ACE.gamesec2026.preliminary。从 Godot 扩展加载链入手，Frida dump GDC 解压结果，还原 token → Process → flag，并用飞行补丁做实机复核。'
pubDate: 2026-03-05
category: 'Android'
tags: ['腾讯游戏安全', 'Godot', 'Frida', '逆向', 'CTF']
series: '腾讯游戏安全2026'
order: 1
---

2026 腾讯游戏安全技术竞赛安卓客户端初赛是一道 Godot 题：Java 层几乎没有业务，真正的逻辑在 `libgodot_android.so` 加载的 `libsec2026.so`，以及被压缩存放的 `.gdc` 脚本里。

## Java 层几乎只是壳

`jadx` 打开 APK，入口 Activity 是 `com.godot.game.GodotApp`，清单大致如下：

```xml
package="com.tencent.ACE.gamesec2026.preliminary"
<activity
    android:name="com.godot.game.GodotApp"
    android:exported="true"
    android:launchMode="singleInstancePerTask"
    android:screenOrientation="landscape"
    ...>
    <intent-filter>
        <action android:name="android.intent.action.MAIN"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <category android:name="android.intent.category.LAUNCHER"/>
    </intent-filter>
</activity>
```

包名：

```text
com.tencent.ACE.gamesec2026.preliminary
```

`GodotApp` 本身没有业务。搜 `loadLibrary`，关键的是：

```java
System.loadLibrary("godot_android")
```

程序先进入引擎 `libgodot_android.so`，而不是 Java 直接 `loadLibrary("sec2026")`。业务 so 由 GDExtension 在引擎内 `dlopen` / `dlsym`。

## libsec2026：init_array 里的 SMC

IDA 打开 `libsec2026.so`：导出有 `extension_init` 和 `start`。`start` 挂在 `init_array`，里面能看到：

```c
linux_eabi_syscall(__NR_openat, 0, "/proc/self/auxv", 0);
v18 = linux_eabi_syscall(__NR_write, v14, &v21, *(_QWORD *)(v17 + 8));
v21 = linux_eabi_syscall(__NR_mmap, 0, v22[0], 5, 2, v15, 0);
```

典型自解密 / SMC：so 一加载就先改自己。

引擎侧闭环在 `libgodot_android.so` 的 `gdext_load_library_with_fallback`（约 `0x1056D94`）。rodata 有 `"extension_init"`，同一函数里：

```asm
LDR  X0, [X20]
ADRL X1, aExtensionInit
BL   .dlsym
; 返回值写入 g_extension_init_entry
```

对 `g_extension_init_entry` 做 xref，再跟 `gdext_resolve_and_invoke_entrypoint`，最终进到 `libsec2026.so::extension_init`。

调用链：

```text
godot_android
  → dlsym("extension_init")
  → g_extension_init_entry
  → invoke entrypoint
  → libsec2026.so::extension_init
```

`extension_init` 字符串在 rodata；`g_extension_init_entry` 的 xref 一边是写入（loader），一边是读取后 invoke。大量难啃的引擎胶水可以先标调用关系，再交给 AI 辅助读反编译，但入口链要用静态 + Frida 对上。

## GDC：先过 AES，再谈 GDSC / zstd

assets 里的 `.gdc` 先套了 Godot `FileAccessEncrypted` 外壳，不是磁盘上直接可见的 `GDSC`。看雪 WP 与引擎实现一致：

```text
[0..16)   MD5(明文)
[16..24)  uint64 LE 明文长度
[24..40)  IV（16 bytes，每文件一份）
[40..)    AES-256-CFB 密文
```

- **key**：32 字节，在 `libgodot_android.so` 的 `.data`（导出模板写入的 `script_encryption_key`）
- **IV**：在文件头 `[24..40)`，不要和 key 搞混
- 初赛的 CFB 解密分支有魔改（相对标准 mbedtls / 决赛的标准 CFB-128），抠到 key 后仍可能要按 so 改解密脚本

AES 解开后才是官方 binary token：`GDSC` + `tokenizer_version`（常见 101 / `0x65`）+ `decompressed_size` + 可选 zstd，再进标识符表（`^ 0xB6`）与 token 流。详见 [决赛篇](/posts/tgs-2026-final/) 的分层说明。

静态工具吃不下 assets 文件时，两条路都行：离线 AES 解密再喂 GDRE，或运行时 dump（引擎已解密之后）：

1. 静态标出加载 / 解压链上的关键函数
2. Frida attach 后在解压点 dump `src.bin` / `dst.bin` / `meta.txt`
3. 离线把 `dst` 恢复成 `.pdc`，再按字符串特征分类

下面偏移名是 **本题对无符号 so 的自拟标注**，不是 Godot 公开 API。

### 关键偏移（libgodot_android.so，比赛时标注）

| 偏移 | 角色 |
|------|------|
| `+0x13dc9f4` | register_extensions |
| `+0x13dcc94` | get_type_for_ext |
| `+0x14818f4` | load_path_internal |
| `+0x1481d2c` | load_cached_or_parse |
| `+0x147ef28` | read_gdc_bytes |
| `+0x1443a28` | load_from_gdc_buffer |
| `+0x147d240` | parse_gdc_blob |
| `+0x3770eac` | compression_decompress_core |

高频解压的 `caller` 落在 `parse_gdc_blob` 内部（约 `+0x147d3d0`，`caller_off=21484496`）。

一次完整跑动的统计量级（仅作量感）：`parse_gdc_blob≈14`，`read_gdc_bytes≈14`，`decompress_core` 会到数百次（含其它压缩用途），真正关心的是带 parse caller 的那批。

### Frida 怎么 dump

思路：hook `compression_decompress_core`，在 `onLeave` 里当 caller 落在 `parse_gdc_blob` 附近时：

1. `readBytesSafe(srcPtr, srcLen)` → 压缩前输入
2. `readBytesSafe(dstPtr, dstLen)` → 解压后输出
3. 写盘 `*_src.bin` / `*_dst.bin` / `*_meta.txt`（记 `caller_off/mode/src_len/dst_len`）

```bash
frida -U -f com.tencent.ACE.gamesec2026.preliminary \
  -l hook_gdc_decode_chain.js
```

输出目录一般在 App 的 `files` 下，例如：

```text
/sdcard/Android/data/com.tencent.ACE.gamesec2026.preliminary/files/
```

日志里会看到类似：

```text
[+] libgodot_android.so base=...
[+] hook ... parse_gdc_blob @ ...+0x147d240
[+] hook ... compression_decompress_core @ ...+0x3770eac
[DCP] enter ... mode=2 caller_off=21484496
[DCP] leave ret=1708 caller=libgodot_android.so+0x147d3d0
[DUMP] parse decompress dump#1 src=..._src.bin dst=..._dst.bin meta=..._meta.txt
```

### 离线恢复成 .pdc 并分类

```bash
# 1) dump 三件套 → .pdc 候选
python3 decompress_to_pdc.py \
  --scan-dir parse_dumps \
  --out-dir pdc_py

# 2) 按字符串特征分类恢复
python3 recover_gdc_runtime.py \
  --scan-dir pdc_py \
  --glob '*.pdc' \
  --out-dir recovered_from_pdc_py
```

`recover_gdc_runtime.py` 的分类思路：

1. `extract_ascii_strings`：明文可见串
2. `extract_xor_u32_strings`：按 `word ^ 0xB6B6B6B6` 抽混淆串
3. `classify_blob`：用特征字定类型  
   - 命中 `TOKEN_LEN` / `generate_token` → `token`  
   - 命中 `FLAG_PREFIX` / `GameExtension` → `part_logic`  
   - 命中 `VehicleBody3D` / `accelerate` → `vehicle` 等

一次跑通大约：12 个 `.pdc` → 去重后 6 个有效块（`token` / `part_logic` / `vehicle` / `car_select` / `follow_camera` / `spedometer`），并附 `*.plain.txt`、`*.xor.txt`、`*.pseudo.gd`、`summary.md`。

**两边字符串都要看**：除了明文 ASCII，还有 `word ^ 0xB6B6B6B6` 那一层。

## 从脚本读出 token / flag 形态

恢复出的伪代码里能直接看到：

```gdscript
const TOKEN_LEN := 8
const CHARS := "0123456789abcdef"
# UI: "Token: " + token

const PART1_PREFIX := "sec2026_PART1_"
const FLAG_PREFIX := "flag{"
```

结论：

1. token 是 8 位小写十六进制
2. 计算链：`token → xor_enc(token) → Process(...) → 16 位大写 HEX`
3. 最终：`flag{sec2026_PART1_<HEX>}`

样例（与实机一致）：

```text
token          = 528556e0
xor_enc(token) = 070a0d0003535537
Process(...)   = 7D155E497065764B
flag           = flag{sec2026_PART1_7D155E497065764B}
```

## Process 在 native，不在 GDScript

脚本里的 `Process` 只是绑定名。字符串 `"Process"` / `"input"` 的 xref 落到 `libsec2026.so`：

| 地址（约） | 角色 |
|------------|------|
| `0xED5C4` | `"Process"` 字符串 |
| `0xED5CC` | `"input"` 字符串 |
| `0x4DF84` | `sec_register_process_input_binding` |
| `0x4E1D4` | `sec_process_input_cb_thunk` |
| `0x4E548` | `sec_process_input_to_hexflag` |

在 `sec_process_input_to_hexflag` 可见：

1. `sec_chacha20_*` 调用链
2. `%02X` 逐字节格式化成大写 hex
3. 返回拼接后的字符串

关联函数还包括：

- `sec_chacha20_ctx_init_key_nonce`
- `sec_chacha20_xor_buffer`
- `sec_chacha20_refill_keystream_block`
- `sec_decode_static_nonce_material`
- `sec_decode_static_key_material`

因此：`Process` 输出本质是「8 字节处理后 → 16 位大写 HEX」。

### keystream 共识

对 `Process` 做 keystream hook，三组样本反推都得到同一个 8 字节流：

```text
K = 7A1F53497336237C
P = xor_enc(token) XOR K
```

于是 `token` 与 `part1_hex` 可以互相反推：从 `flag{sec2026_PART1_xxx}` 能反算回 `Token: XXXXXXXX`。

可用 codec 做同值复核（正逆向都过）：

```bash
token_flag_codec enc 528556e0   # → 7D155E497065764B
token_flag_codec dec 7D155E497065764B   # → 528556e0
```

## 实机验证：改 vehicle 脚本飞起来

为了稳定摸到高点位触发，需要可控飞行。恢复结果里 `vehicle.pdc` 有 `turn_right` / `accelerate` / `VehicleBody3D` 等特征，对应资源 `assets/vehicles/vehicle.*`。

做法：把 remap 指到可控脚本——

- `assets/vehicles/vehicle.gd.remap`
- `assets/vehicles/vehicle.gdc.remap`

都指向 `res://vehicles/vehicle.gd`，再写入飞行逻辑：

- `_integrate_forces`：空中物理（yaw、垂直速度、沿车头巡航、阻尼与速度钳制）
- `_physics_process`：输入融合、地面/飞行切换（飞行时禁发动机推力，保留方向轴）

操作约定：

| 输入 | 效果 |
|------|------|
| 中间键 | 上升 |
| 中间 + 上 | 沿车头前飞 |
| 中间 + 下 | 沿车尾后退 |
| 中间 + 左/右 | 空中调 yaw |

重打包签名安装后，用 codec 对三组 token / hex 做正逆向复核：

```text
enc 07226995 → 7D1A534D7C362F4E
enc 6e8a0134 → 29420A187234241B
enc 528556e0 → 7D155E497065764B
dec 7D155E497065764B → 528556e0
```

与截图一致。

## 小结

初赛主线四步：

1. 认清 Godot 扩展加载，别在 Java 里死磕
2. 对 GDC 解压链做运行时 dump，别硬解静态密文
3. 把 token / Part1 的脚本语义和 `libsec2026.Process`（ChaCha20 + keystream）对齐
4. 必要时改资源脚本做可控验证

下一篇写决赛：多 Part、隐藏 collision glue，以及 `libsec2026` 里的反调试状态机。

## 赛后借鉴

- [2026腾讯游戏安全竞赛Android初赛 wp](https://bbs.kanxue.com/thread-290944.htm)
- [2026腾讯游戏安全初赛Android wp](https://bbs.kanxue.com/thread-290852.htm)
- [2026腾讯游戏安全初赛 Android 客户端分析](https://bbs.kanxue.com/thread-290903.htm)
- [南极企鹅游戏安全2026-Android-初赛](https://bbs.kanxue.com/thread-290814.htm)
