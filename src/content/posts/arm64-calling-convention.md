---
title: 'ARM64 调用约定与栈帧还原'
description: '分析 so 的时候，能不能快速看出一个函数收了几个参数、返回值在哪、局部变量怎么摆，直接决定了效率。AAPCS64 的规则其实只有几条。'
pubDate: 2026-01-12
updatedDate: 2026-10-11
category: 'Binary'
tags: ['arm64', 'aarch64', '汇编', '逆向基础', 'so']
series: '逆向基础'
order: 2
---

Android 上 arm64-v8a 已经是绝对主流，`libxxx.so` 拖进 IDA 之后看到的就是 AArch64 汇编。这篇整理 AAPCS64 里对逆向最有用的那部分。

## 寄存器分工

64 位下有 31 个通用寄存器，`x0`–`x30`。同一个寄存器用 `w` 前缀访问就是低 32 位，比如 `w0` 是 `x0` 的低半部分。写入 `w0` 还会把 `x0` 的高 32 位清零；这与只替换内存中的低四字节不同。

| 寄存器 | 用途 | 谁负责保存 |
| --- | --- | --- |
| `x0`–`x7` | 整数/指针参数与结果寄存器，分配取决于类型 | 调用者 |
| `x8` | 间接返回地址（大结构体返回） | 调用者 |
| `x9`–`x15` | 临时寄存器 | 调用者 |
| `x16`/`x17` | IP0/IP1，链接器跳板会用 | 调用者 |
| `x18` | 平台寄存器，用途由目标平台 ABI 决定 | 按平台约定 |
| `x19`–`x28` | 被调用者保存 | 被调用者 |
| `x29` | FP，帧指针 | 被调用者 |
| `x30` | LR，`bl` / `blr` 写入返回地址 | 非叶子函数应保留自己的返回路径 |
| `sp` | 栈指针，必须 16 字节对齐 | — |

浮点和向量参数走 `v0`–`v7`，返回值也在 `v0`。

看函数开头读取 `x0`、`x1`、`x2`，可以提出参数候选，但不要据此直接数出三个源代码参数：结构体可能占多个寄存器，优化也可能删除某些读取。需要回到调用点和类型分配规则核对。

普通 JNI 的前两个参数是 `JNIEnv*` 与 `jobject` / `jclass`，Java 显式参数随后按自身类型分配；浮点参数仍涉及浮点寄存器。`@CriticalNative` 等特殊入口不应套用普通 JNI 规则。`x18` 在使用 ShadowCallStack 的配置中有特定用途，也不是每个函数都能随意借用。相关配置与特殊 JNI 入口分别见 [AOSP ShadowCallStack](https://source.android.com/docs/security/test/shadow-call-stack) 和 [Android JNI tips](https://developer.android.com/ndk/guides/jni-tips)。

## 标准的函数序言

常见非叶子函数长这样：

```armasm title="函数序言" {1,2,3}
stp     x29, x30, [sp, #-0x30]!
mov     x29, sp
stp     x19, x20, [sp, #0x10]
str     x21, [sp, #0x20]
```

逐条看：

- `stp x29, x30, [sp, #-0x30]!` —— 一次压两个寄存器。末尾的 `!` 是 pre-index，先把 `sp` 减 `0x30` 再存，等于同时开辟了 0x30 字节的栈帧
- `mov x29, sp` —— 帧指针指向当前栈顶，这个示例设置了帧指针，但后续局部变量仍可能通过 `sp` 或其他寄存器寻址
- 后面几条保存 `x19` 以上的寄存器，说明函数内部要用它们存长期存活的值

尾声是对称的：

```armasm title="函数尾声"
ldr     x21, [sp, #0x20]
ldp     x19, x20, [sp, #0x10]
ldp     x29, x30, [sp], #0x30
ret
```

这里的 `[sp], #0x30` 是 post-index，先按 `sp` 取值再把 `sp` 加回去。`ret` 默认跳到 `x30`。

这个示例总共为栈分配了 0x30 字节。更复杂的函数可能先 `sub sp`、分段分配栈或动态调整；应累计各路径上的 SP 变化，不能只取第一条 `stp` 的立即数。

## 叶子函数会省掉一切

不调用其他函数的叶子函数，不需要保存 `x30`，往往连栈都不开：

```armasm title="一个典型的叶子函数"
    lsl     w8, w0, #2
    add     w8, w8, w1
    eor     w0, w8, #0x5a
    ret
```

缺少 `stp x29, x30` 不能证明它是叶子函数：编译器可以省略帧指针，采用其他保存方式，或使用尾调用。判断时检查调用与返回路径，而不是只找一个序言模式。

## 参数超过 8 个怎么办

对十个普通 64 位整数参数的简单例子，前八个放在 `x0`–`x7`，第九、十个在函数入口 SP 对应的栈参数区，通常可从 `[sp]`、`[sp, #8]` 读取。不要把这推广成所有类型都“从右往左压栈”：浮点、聚合体、对齐与可变参数有各自规则。函数建立栈帧后，还要把当前地址换算回入口 SP，再判断它属于栈参数还是局部变量。

## PAC：新设备上多出来的指令

支持指针认证的硬件与采用相应编译配置的程序，可能在函数头尾出现下面的模式。仅凭 Android 版本不能判断是否启用：

```armasm
paciasp
...
autiasp
ret
```

`paciasp` 用栈指针作上下文给 `x30` 加签名，`autiasp` 在返回前验证。追踪普通业务数据流时可以暂时把认证过程单独标注，但还原返回路径、异常或栈完整性时应保留其语义；认证使用的 SP 上下文必须与签名时匹配。有些编译器会把 `autiasp; ret` 合并成一条 `retaa`。

## 一个完整的例子

把上面的规则套到一个真实形态的 JNI 函数上：

```armasm title="Java_com_example_Native_check" {1,2,6,7,12}
    stp     x29, x30, [sp, #-0x20]!
    mov     x29, sp
    stp     x19, x20, [sp, #0x10]

    mov     x19, x0                  ; x19 = JNIEnv*
    mov     x20, x2                  ; x20 = 第一个 Java 参数 (jstring)

    ldr     x8, [x19]                ; 取 JNIEnv 的函数表
    ldr     x8, [x8, #0x538]         ; GetStringUTFChars 的偏移
    mov     x0, x19
    mov     x1, x20
    mov     x2, xzr
    blr     x8                       ; 调用

    ; x0 现在是 const char*
    bl      validate

    ldp     x19, x20, [sp, #0x10]
    ldp     x29, x30, [sp], #0x20
    ret
```

关键点在 `ldr x8, [x8, #0x538]` 这类**通过偏移调用 JNIEnv 函数表**的模式。`0x538` 在 arm64 上对应 `GetStringUTFChars`。IDA 里导入 `jni.h` 并把 `x19` 的类型设成 `JNIEnv*`，这些偏移就会自动变成可读的函数名，效率提升非常明显。

这个片段只展示参数准备与间接调用：完整 JNI 实现还应检查 `GetStringUTFChars` 的空指针返回，并在使用完后调用 `ReleaseStringUTFChars`。`0x538 = 169 × 8` 来自 64 位函数指针大小与 JNI 表索引；32 位应重新计算，不要复用该字节偏移。

## 小结

分析一个陌生 so 函数，按这个顺序看最快：

1. 调用和返回路径 — 判断叶子、非叶子或尾调用
2. 各路径的 SP 变化 — 栈帧分配与恢复
3. 调用点和寄存器/栈使用 — 结合类型推断参数
4. 保存了哪些 `x19`+ — 内部有几个长期变量
5. 所有 `bl` / `blr` — 调用了什么


规则核对以 [Arm AAPCS64](https://github.com/ARM-software/abi-aa/blob/main/aapcs64/aapcs64.rst) 为准；JNI 表项与字符串生命周期见 [Oracle JNI Functions](https://docs.oracle.com/en/java/javase/17/docs/specs/jni/functions.html#getstringutfchars)。本文汇编是机制示例，不附带设备执行证据。
