---
title: '有了 boot.img，为什么还启动不了 Android'
description: '从 boot 里缺少的 ramdisk 读起，解释 init_boot、vendor_boot 和镜像头如何共同准备内核的启动输入。'
pubDate: 2026-10-10
updatedDate: 2026-10-11
category: 'Android'
tags: ['ABL', 'Android', '启动链', 'GKI', 'boot', 'Security']
series: '启动与可信执行'
order: 3
---

固件包里找到了 `boot.img`，解包也拿到了内核，下一步似乎就是跳进去。可现代 Android 的启动材料并不总在这一个文件里。

[XBL 那篇](/posts/xbl-boot-chain/)关注镜像怎样取得执行权。这篇往前走一点：在采用 ABL 的平台上，OS bootloader 还要为内核准备哪些输入？这里按 AOSP 的公开格式讨论，不假装手上有某款 ABL 的内部源码。

## boot 里没有 ramdisk，先别判它损坏

一个特别容易误判的现象，是解包后看到了 kernel，却没看到预想中的通用 ramdisk。

AOSP 的 [Generic boot partition](https://source.android.com/docs/core/architecture/partitions/generic-boot)说明：Android 12 的通用 boot 包含 GKI 内核和通用 ramdisk；Android 13 新发布设备把通用 ramdisk移到 `init_boot`。继续使用较早内核的升级设备，则有不同条件，不必因此新增这个分区。

所以，“现在运行 Android 13”和“按 Android 13 新发布架构组织启动镜像”是两件事。要解释缺少的内容，先看产品发布路径和镜像格式，而不是只看系统版本。

对符合这个新拆分的组合，可以先画成：

```text
boot          → GKI 内核
init_boot     → 通用 ramdisk
vendor_boot   → vendor ramdisk、DTB 等产品相关启动材料
```

这只是其中一种组合，不是所有 Android 固件包的清单。它已经足以回答最初的问题：仅有内核，不代表内核所需的早期启动环境已经准备完整。

## 镜像头是拆箱说明，不是装饰

解析之前要先认识头版本。`boot` 的格式和 `vendor_boot` 的格式各有自己的规则，不能拿旧 boot 头的地址、长度和对齐方式去套所有文件。

[AOSP 的 Boot image header](https://source.android.com/docs/core/architecture/bootloader/boot-image-header)按版本列出布局。一个版本上的字段存在，不代表另一个版本也保留同样语义。

这里可以做个简单算术。假设某个区域使用 4096 字节对齐，头长 2128 字节，它占一个对齐单位；接下来的 payload 长 5000 字节，占两个单位。若下一段从这个 payload 后的对齐边界开始，那么它的文件起点是：

```text
4096 + ceil(5000 / 4096) × 4096 = 12288
```

这是布局示意，不是通用解包偏移。它说明了为什么“头长加内容长度”不一定等于下一段的位置：对齐空间同样占文件布局。实际计算时，应从匹配版本的字段和规则出发，还要检查结果在文件长度之内。

## vendor ramdisk 也可能不止一份

`vendor_boot` 不是一个随便塞文件的附件。版本 4 支持多个 vendor ramdisk fragment，并用表描述它们的范围和元信息。[Vendor boot partitions](https://source.android.com/docs/core/architecture/partitions/vendor-boot-partitions)说明了这个布局以及 bootloader 的选择要求。

这意味着“解包工具导出了三个 fragment”和“这次启动用了三个 fragment”之间，还隔着模式与选择策略。正常启动、恢复启动需要的材料可能不同，不能只按目录里出现的文件来推断运行过程。

在文档描述的组合中，选定的 vendor ramdisk 与通用 ramdisk在内存里连续放置，通用部分紧跟在 vendor 部分后面，中间不再额外插入页对齐空隙。内核随后解包得到早期文件系统。

这里有一个值得停下来的区别：**磁盘容器的段对齐，与传给内核的内容拼接，是两套规则。** 前一节算文件偏移时考虑对齐，不能因此在最终 ramdisk 拼接处也机械加一页空白。

## DTB 不负责提供 init

ramdisk 给早期用户空间提供文件，设备树则描述硬件和相关配置。它们都影响能否继续启动，但解决的不是同一个问题。

如果内核使用的硬件描述不匹配，后面可能缺少设备或按错误配置工作；如果早期用户空间缺少所需内容，内核即使进入执行，也可能走不到正常系统。把两类失败都叫“boot 坏了”，会丢掉很重要的定位信息。

bootloader 需要让选定的内核、ramdisk、DT 和启动参数成为一致的输入组合。具体地址、寄存器状态和交接操作由架构及平台实现决定，这里不从文件名推导固定入口。

## 验证通过，为什么仍可能失败

AVB 能约束镜像来源和内容，却不会替内核解决全部兼容性问题。一组分别有正确签名的材料，如果版本或产品组合不合适，仍可能在后面失败。反过来，解锁策略允许某些验证错误继续启动时，“开机成功”也不等于满足锁定设备的信任要求。

因此我会先问最后确认的是哪件事：接受了候选镜像，完成了内容准备，还是内核已经开始执行？如果已经确认进入内核，就该沿内核和 first-stage init 的输出往下看，而不是继续把所有问题归在 XBL 上。

槽位会改变选中的候选，验证策略会改变是否接受它；这两项留到 [AVB 与回退那篇](/posts/avb-slots-rollback/)详细展开。这里先记住更小的一件事：启动 Android 要准备一组输入，`boot.img` 只是这组输入中的一个容器。

<a href="/silicon/" data-astro-reload>回到芯片专题 →</a>
