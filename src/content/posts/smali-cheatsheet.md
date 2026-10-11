---
title: 'Smali 速查：从 Java 源码到 Dalvik 字节码'
description: 'baksmali 出来的代码看着像天书，其实结构非常固定。把 Java 的常见写法和它对应的 smali 形态放在一起对照，读起来就快了。'
pubDate: 2026-01-08
updatedDate: 2026-10-11
category: 'Android'
tags: ['smali', 'dalvik', 'dex', '逆向基础']
series: '逆向基础'
order: 1
---

反编译 APK 拿到 smali 之后，最大的障碍不是指令本身难，而是**寄存器编号和类型描述符**让人一眼看不出在干什么。这篇把最常遇到的几种结构列出来对照。

## 类型描述符

每个类型在 DEX 里都是一个字符串。基本类型是单字母，对象类型是 `L` 开头 `;` 结尾，数组在前面加 `[`。

| 描述符 | Java 类型 | 说明 |
| --- | --- | --- |
| `V` | `void` | 只能作返回值 |
| `Z` | `boolean` | 注意不是 `B` |
| `B` | `byte` | |
| `S` | `short` | |
| `C` | `char` | |
| `I` | `int` | |
| `J` | `long` | 占两个寄存器 |
| `F` | `float` | |
| `D` | `double` | 占两个寄存器 |
| `Ljava/lang/String;` | `String` | 包名用 `/` 分隔 |
| `[I` | `int[]` | |
| `[[Ljava/lang/String;` | `String[][]` | |

`J` 和 `D` 占两个连续寄存器这点很关键。看到 `move-wide v0, v2` 时，实际动的是 `v0/v1` 和 `v2/v3` 四个槽位。

## 寄存器：v 和 p 的区别

方法头上的 `.registers` 声明了总数，`.locals` 声明的是不含参数的局部变量数量。

- `vN` 从 0 开始，指向全部寄存器里的第 N 个
- `pN` 是参数寄存器的别名，落在最后几个槽位上

非静态方法的 `p0` 永远是 `this`。所以看到 `iget-object v0, p0, ...` 就知道在读自己的成员变量。

```smali title="一个典型的方法头" {1,3}
.method private checkLicense(Ljava/lang/String;I)Z
    .registers 6
    .param p1, "token"    # Ljava/lang/String;
    .param p2, "level"    # I

    const/4 v0, 0x0

    iget-object v1, p0, Lcom/example/App;->mKey:[B

    invoke-static {p1, v1}, Lcom/example/Crypto;->verify(Ljava/lang/String;[B)Z

    move-result v2

    if-eqz v2, :cond_fail

    const/4 v1, 0x3

    if-lt p2, v1, :cond_fail

    const/4 v0, 0x1

    :cond_fail
    return v0
.end method
```

`.registers 6` 加上两个参数和一个 `this`，意味着 `v0`–`v2` 是局部变量，`v3`(`p0`)、`v4`(`p1`)、`v5`(`p2`) 是参数。

## 方法调用的五种常见形态

选哪条 `invoke-*` 完全由方法的性质决定，这是判断调用目标最快的线索：

- `invoke-virtual` — 普通实例方法，有多态
- `invoke-direct` — 构造函数、private 方法，不走虚表
- `invoke-static` — 静态方法，参数里没有 `this`
- `invoke-interface` — 接口方法
- `invoke-super` — 显式调用父类实现

需要接收返回值时，紧跟对应的 `move-result*` 指令；`void` 调用或主动丢弃结果时不写它：

```smali
invoke-virtual {p0}, Landroid/content/Context;->getPackageName()Ljava/lang/String;
move-result-object v0
```

漏看 `move-result-object` 是新手最容易出错的地方 —— 中间插入其他指令不符合该指令的使用约束，可能导致校验失败。

## 先看跳到哪里，再解释条件

Java 里 `if (a == b) { X }`，smali 通常编译成「条件不成立就跳过 X」：

```smali title="if (x > 0) { ... } 的常见形态"
if-lez v0, :cond_skip

# 这里是 if 体

:cond_skip
```

这只是常见编译形态，不是所有条件分支都要取反；先确定跳转目标对应哪个代码块。对应关系：`if-eqz` 判零相等、`if-nez` 判非零、`if-lez` 小于等于零、`if-gtz` 大于零，带 `z` 后缀的都是和 0 比。

## 字段读写

访问成员用 `iget`/`iput`，静态字段用 `sget`/`sput`，后缀跟着类型：

```smali
# this.count = this.count + 1
iget v0, p0, Lcom/example/App;->count:I
add-int/lit8 v0, v0, 0x1
iput v0, p0, Lcom/example/App;->count:I

# String s = Config.NAME
sget-object v1, Lcom/example/Config;->NAME:Ljava/lang/String;
```

`add-int/lit8` 这类带 `/lit8`、`/lit16` 后缀的是立即数版本，省一个寄存器。

## 实际改包时的两个坑

**第一，改返回值别只改 `const`。** 想让一个校验函数永远返回 true，把方法体整个换掉最稳：

```smali title="直接短路整个方法"
.method private checkLicense(Ljava/lang/String;I)Z
    .registers 6
    const/4 v0, 0x1
    return v0
.end method
```

保留原来的 `.registers` 声明，否则 dex2smali 回编译时可能报寄存器越界。

**第二，注意 `.line` 和 `.local` 指令。** 它们只是调试信息，删掉不影响运行，但保留着能让你回编译后再反编译时对得上号。

---

下一篇会讲 ARM64 这边的调用约定，Native 层的分析要从那里开始。

指令操作数与结果指令的约束以 [AOSP Dalvik bytecode format](https://source.android.com/docs/core/runtime/dalvik-bytecode) 为准。`if-lt` 比较两个寄存器，不接受直接写入的立即数。
