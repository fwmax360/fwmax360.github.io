---
title: '从 42 到 43：读一次 OP-TEE 调用'
description: '沿 hello_world 源码读 UUID、会话、命令和参数检查，再看值参数与共享内存的区别。'
pubDate: 2026-10-10
updatedDate: 2026-10-11
category: 'Android'
tags: ['Security', 'TEE', 'TrustZone', 'OP-TEE', '安全架构']
series: '启动与可信执行'
order: 1
---

一个整数从 42 变成 43，值得专门走一趟 TEE 吗？作为业务当然没必要。但用它来读调用接口，比直接从密钥、签名和可信存储开始轻松得多：数据足够小，每一步的变化都看得见。

我想先把这个最小请求读通。选的是 OP-TEE examples 的 `hello_world`，源码固定在提交 `71e8f3f`，下面讨论的是代码路径，没有手机或开发板的运行记录。它也不是 Qualcomm QTEE 的接口实现。

## 先找对三个名字

示例分成普通世界的 [host/main.c](https://github.com/linaro-swg/optee_examples/blob/71e8f3f320eef46a9369700bf30b91d67427d535/hello_world/host/main.c) 和安全侧的 [hello_world_ta.c](https://github.com/linaro-swg/optee_examples/blob/71e8f3f320eef46a9369700bf30b91d67427d535/hello_world/ta/hello_world_ta.c)。两边共用的 [头文件](https://github.com/linaro-swg/optee_examples/blob/71e8f3f320eef46a9369700bf30b91d67427d535/hello_world/ta/include/hello_world_ta.h)定义了 UUID，以及两个命令：增加为 `0`，减少为 `1`。

这三个名字各管一件事。UUID 选择哪一个 TA；命令号选择这个 TA 的哪项操作；参数类型告诉接收方该怎样解释传来的数据。只找到 UUID，还没找到具体业务；看到数字 `0`，也得先知道它属于哪个 TA。

host 先建立 context，再用 UUID 打开 session。这里选择 `TEEC_LOGIN_PUBLIC`，没有附带身份认证材料。示例因此适合观察调用，不适合作为私有密钥服务的授权范本。把算法搬进安全侧之后，谁有权请求它，仍然是一个独立的问题。

## 42 是怎样送进去的

打开会话时，host 没有传 operation。真正调用增加命令前，它才清零 `TEEC_Operation`，把第一个参数设为 `TEEC_VALUE_INOUT`，剩下三个设为 `TEEC_NONE`，并将第一个参数的 `value.a` 写为 42。

`INOUT` 很直观：这个位置既送入数据，也接回结果。返回值负责报告调用是否成功，参数槽负责携带业务结果；两者不是同一个东西。

可以把这次交互压缩成一张便笺：

```text
目标：hello_world 的 UUID
命令：0（增加）
参数：VALUE_INOUT / NONE / NONE / NONE
输入：第一个值参数的 a = 42
成功后的预期：同一个位置的 a = 43
```

这里的 43 是沿源码推出来的预期，不是截图里的一次实测输出。失败时，host 打印结果码和 `err_origin`，随后退出；它只在调用成功后打印增加后的值。读日志时也应保留这个顺序，否则很容易把仍留在参数里的旧值看成返回结果。

还有个小细节：这次传的是**值参数**，没有消息正文，也没有输出缓冲区。先把它讲清楚，再谈共享内存，才不会把所有 TEE 请求都想成“扔一个指针过去”。

## 安全侧先做的事并不是加一

沿 TA 文件找到 `TA_InvokeCommandEntryPoint`，它根据命令号分派到 `inc_value` 或 `dec_value`，其他命令返回 `TEE_ERROR_BAD_PARAMETERS`。增加函数也不是收到请求就立刻加一：它先构造期望的参数类型组合，与来请求的组合比较。

真正修改值的那一行很短：

```c
params[0].value.a++;
```

但它成立的前提在前面。参数是联合体，同一块位置可以解释成 value，也可以解释成 memref。双方约定“这里是整数”之后，接收方还要检查请求确实遵守了约定。

如果把 host 的第一个参数改成输入缓冲区，并让这个类型到达增加函数，代码会在类型比较处返回错误，走不到加一。这里拒绝的是形状不匹配的请求，而不是整数本身。

值得注意的是，打开会话和调用命令各检查一次类型，期望值却不同。`TA_OpenSessionEntryPoint` 接受四个 `NONE`；`inc_value` 接受一个 `VALUE_INOUT` 和三个 `NONE`。这对应 host 的两次操作，并不矛盾。会话建立成功，只说明这次会话能打开，后来的命令仍有自己的输入约定。

## 一个加一示例留下的边界

类型匹配之后，整数是不是也被限制了？在这个示例里，没有。增加函数直接执行无符号值的加一；若输入是 32 位最大值，按无符号运算会回到 0。

这对演示算术没什么奇怪的。如果把同样的代码拿来维护“只增不减”的安全计数器，问题就变了：参数类型完全正确，数值却越过了业务允许的范围。类型检查和业务约束是两层检查，前者成功不会替后者作决定。

同样，示例没有实现调用者白名单、密钥用途限制或持久计数器。它的价值恰好在于简短：可以看到入口怎样分派、检查发生在使用之前、结果怎样回到客户端，而不必假设那些没出现的功能已经存在。

## 中间那段路，源码没有画出来

host 只调用了客户端 API，TA 只实现了入口函数。把两个文件并排放着看，会缺少中间的传输、调度和装载。

对于经典 SMC 路径，可以先按这个层次理解：

```text
host → libteec → Linux TEE 驱动
     → Secure Monitor → OP-TEE core → TA 入口
```

这是一张层次图，不是调用栈。Monitor 负责世界切换，core 再处理可信线程与服务分派；TA 的命令号不等于 SMC 的功能标识。调用期间还可能因为 RPC 或中断返回普通世界，然后恢复安全侧线程。因此一次 `InvokeCommand` 可以包含多次世界切换。[OP-TEE Core 文档](https://optee.readthedocs.io/en/latest/architecture/core.html)展开了这部分机制；如果想接着看寄存器和恢复路径，可以转到[单独的 SMC 笔记](/posts/secure-monitor-smc/)。

## 换成缓冲区，才轮到共享内存的问题

整数例子读通之后，再把请求换成“输入一段消息，返回签名”，新增的问题就很清楚了：输入有长度，输出有容量，消息内容可能在解析期间变化。

比如消息头声明正文长 128 字节，而实际输入只有 32 字节。参数类型即使正确，也还要检查正文范围。检查子区间时，我会先写成下面这个关系，而不是直接相加：

```c
/* 自写的范围检查示意，total 是可用长度。 */
bool range_ok(size_t offset, size_t length, size_t total)
{
    return offset <= total && length <= total - offset;
}
```

先保证偏移在范围内，减法才有意义；再比较剩余空间，避免 `offset + length` 先溢出。它只处理长度关系，指针映射、访问权限和生命周期仍由实际内存路径处理。

另一个问题发生在两次读取之间：第一次按消息头检查长度，第二次重新读取消息头来执行操作。如果缓冲区仍可由外部修改，两次看到的可能是不同内容。需要稳定输入的服务，应在取得私有副本后，围绕同一份副本完成解析和业务判断。具体接口是否复制、何时复制，要继续读实现；这次整数示例没有验证那条路径。

到这里，TEE 就不再只是一个装着“安全代码”的盒子了。它有一份具体的协议：目标是谁，操作是什么，输入如何解释，哪些请求被接受。密钥和存储的讨论建立在这份协议之上，放到[TA 加载与可信存储](/posts/tee-ta-storage/)里继续读，比在一个加一例子后面硬接一整本手册更合适。

如果关心 Android 的证明密钥从哪里来，存储篇还补了 [Keybox、RKP 与 BCC 的关系](/posts/tee-ta-storage/#到-android-keybox先问下发的是什么)：远程签发证书和本地执行密钥操作，需要分开看。

<a href="/silicon/" data-astro-reload>回到芯片专题 →</a>
