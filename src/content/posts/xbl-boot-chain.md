---
title: 'XBL 如何加载：镜像什么时候获得执行权'
description: '从 XBL 与 XBL_SEC 的合作读起，用 ELF 字段拆开读取、认证和执行，再区分 XBL-SC 的新架构。'
pubDate: 2026-10-10
updatedDate: 2026-10-11
category: 'Android'
tags: ['Security', 'XBL', 'ABL', 'Secure Boot', 'AVB', 'TEE']
series: '启动与可信执行'
order: 2
---

“PBL 加载 XBL，XBL 加载 ABL”这句话很容易记，也很容易让人误以为已经理解了启动。加载究竟是从存储读了一份文件，还是已经允许 CPU 执行它？如果读文件的人和决定执行的人不同，这条箭头又该怎么画？

我更想从这个区别入手。先用 Qualcomm 较早公开的 XBL/XBL_SEC 架构把过程拆开，再看新版为什么出现了 XBL-SC。这里读的是公开架构与文件格式，没有特定手机的镜像或启动 trace。

## 读镜像的人，未必决定它能不能运行

在 [Qualcomm v2.0 白皮书](https://www.qualcomm.com/media/documents/files/secure-boot-and-image-authentication-technical-overview-v2-0.pdf)的 TEE Loading 一节里，一个细节很有意思：XBL_SEC 不直接访问存储。它依赖 XBL 把后续 Qualcomm TEE 镜像读入内存，再对镜像做隔离、认证和执行处理。

同一节说明，PBL 之后先执行 XBL_SEC；XBL_SEC 配置访问控制，再让 XBL 在较低权限运行，两者通过 SMC 通信。因此，把 XBL 和 XBL_SEC 画成互不相关的两条支线，会遗漏关键的合作关系。

只截取这段 TEE 加载过程，可以这样记：

```text
XBL：     从存储取得后续 TEE 镜像，放进内存
                      │ 通过接口请求安全侧处理
                      ▼
XBL_SEC： 隔离镜像 → 认证 → 执行交接
```

这不是整机完整的启动顺序，只是在强调职责。运送文件的人可以工作在较低信任的环境；决定执行的人仍要验证收到的对象，并保护后面实际使用的内容。

从这里再回头看日志，`read`、`authenticate`、`jump` 就不该合成一个“加载成功”。文件读完，可能仍是候选；认证通过，也还要满足内存和执行状态的交接条件。真正进入下一阶段，是另一件事。

## 文件里的位置和内存里的位置

镜像到内存之后，先别急着找入口。ELF 的 Program Header 提供了另一组线索：从文件哪里取字节，取多少，在内存里占多少空间。

拿一个刻意简化的例子。下面的数字都是教学用的，不对应手机地址：

```text
段类型       PT_LOAD
文件起点     p_offset = 0x1000
文件长度     p_filesz = 0x600
内存长度     p_memsz  = 0x800
虚拟地址     p_vaddr  = 0x80000000
入口         e_entry  = 0x80000100
```

假设加载器采用这里声明的地址，文件的 `[0x1000, 0x1600)` 会对应到内存的 `[0x80000000, 0x80000600)`；剩下 `0x200` 字节没有对应的文件内容。标准 ELF 的 `PT_LOAD` 语义要求这部分为零。[ELF ABI](https://gabi.xinuos.com/elf/07-pheader.html)给出了这些字段的定义。

入口落在段内偏移 `0x100`，所以按这份假设，它对应的文件偏移是 `0x1100`。这里最容易搞混的就是这个换算：入口是执行地址，文件偏移是容器里的位置，二者之间隔着加载规则。

还可以继续问一句：如果入口落在那段零填充区域呢？仅仅“地址属于段的内存范围”就不够了，还要看段权限、入口校验和实际执行环境。格式可以表达一种布局，并不意味着任何布局都值得接受。Qualcomm 镜像也有专用段与认证规则，实际加载策略要读对应版本的实现。

这里没有用 Section Header 推导加载。Section 更适合解释链接和分析视图；启动时首先关心的，是加载器会拿走哪些段，以及这些段如何进入内存。

## 为什么签了代码还要管头部

设想刚才的代码字节完全没变，只把入口从段内偏移 `0x100` 改成 `0x200`。CPU 执行的起点已经变了。再设想改的是段长度或加载位置，代码还是同一份，内存布局却可能不同。

这说明认证对象不能只理解成“指令字节”。解释这些字节的元数据也参与决定程序行为。

v2.0 白皮书的 Signed Image Format 一节描述了 hash segment：签名绑定相应头部、元数据和 hash table，再用表中的摘要核对镜像段；其中还包含对 ELF Header 和 Program Header 的绑定。证书链与平台约束决定谁的签名、哪类镜像可以被接受。[原文的镜像认证说明](https://www.qualcomm.com/media/documents/files/secure-boot-and-image-authentication-technical-overview-v2-0.pdf)比“整个 ELF 文件签了一次名”的说法更准确。

我会把这件事理解成两个连在一起的问题：这份加载描述是否可信，按描述取得的内容是否与它绑定？只有后一个问题，会漏掉控制信息；只有前一个问题，会漏掉实际段内容。

hash segment 本身也不是一段“启动后顺着执行的代码”。它承担认证材料的组织工作，解析时应按专用格式看。具体偏移和版本字段得从格式确定，拿另一个平台的偏移直接套上去，得到的数字再漂亮也没有意义。

## 用工具时，先回答一个小问题

如果手上已有一份 ELF 镜像副本，可以先做这些只读检查：

```sh
# xbl.elf 换成实际取得的本地文件；这里不是设备操作。
shasum -a 256 ./xbl.elf
file ./xbl.elf
readelf -h -l -W ./xbl.elf
```

macOS 默认未必带 `readelf`，可用已有的 GNU binutils 或 LLVM 对应工具。上面的命令没有在真实 XBL 镜像上执行。

先看 ELF class、目标架构和入口，再把每个 Program Header 的文件区间列出来。假如某段声明 `p_offset = 0x1000`、`p_filesz = 0x600`，而文件总长只有 `0x1400`，这一段已经越过文件末尾；这时应该停在格式问题，而不是继续解释认证失败。

工具能解析文件，说明它认识相应结构。至于签名根、平台匹配和受保护版本状态，它通常没有设备侧的全部策略。这也是为什么我更愿意先拿工具回答“文件长什么样”，而不让一次 `readelf` 输出承担“设备会接受它”的结论。

## 新版出现 XBL-SC，不是多加一个箭头

前面的讨论有年代。Qualcomm [2024 年白皮书](https://www.qualcomm.com/content/dam/qcomm-martech/dm-assets/documents/secure-boot-and-image-authentication.pdf)引入 TME，并说明 XBL-SC 替代原来的 XBL/XBL_SEC。PBL 认证 TME runtime 和 XBL-SC，XBL-SC 负责外设初始化、后续镜像加载，并使用 TME 的认证与资源服务。

所以我不会把 `PBL → XBL → XBL_SEC → XBL-SC → TME` 写成一条进化后的启动链。那是在把两代架构的名字混在一起。面对固件包，先确定平台代际，再解释文件名，顺序更稳妥。

代际虽然变了，本文最初的问题仍然有用：谁把字节搬进内存，谁认证它，谁控制资源，谁完成执行交接？换的是这些职责的分配方式，不是省掉了它们。

## 到 ABL 时，换了一份验证协议

XBL 后面还会有平台固件和 OS bootloader。对采用 ABL 的 Android 平台，ABL 接手 Android 相关启动工作；进入这里之后，讨论对象开始转向 Android 镜像、槽位和 AVB 元数据。

AVB 的 `vbmeta` 和描述符组织 Android 分区的验证关系，bootloader 则负责集成信任策略。[AOSP AVB 文档](https://android.googlesource.com/platform/external/avb/+/master/README.md)说明了这套接口。它和前面 Qualcomm 的签名镜像格式各有职责，别因为都叫“验证”就把它们当作同一个解析器。

这部分另放在 [ABL 如何交接给 Android](/posts/abl-android-handoff/)，槽位与降级另看 [AVB、A/B 与防回滚](/posts/avb-slots-rollback/)。先停在这里，反而能留下一个明确的答案：镜像的执行权来自前级的验证和受控交接，不是来自文件名，也不是来自它已经躺在内存里。

<a href="/silicon/" data-astro-reload>回到芯片专题 →</a>
