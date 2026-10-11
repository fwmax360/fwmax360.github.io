---
title: 'Inside the Silicon：从芯片结构到信任边界'
description: '专题示例文章：区分物理封装与执行环境，以 Arm TrustZone 和 OP-TEE 为例，理解 Normal World、Secure World 与跨边界调用。'
status: sample
pubDate: 2026-10-01
updatedDate: 2026-10-10
category: '系统架构'
tags: ['示例文章', 'TrustZone', 'TEE']
---

> **专题示例 · 待替换内容**
>
> 这篇笔记根据 Arm 和 OP-TEE 的公开文档重新整理，用于预览芯片专题与文章的连接效果。它不是作者的设备实测，也不描述某款芯片的真实布局。后续将替换为正式研究文章。

<img src="/images/silicon/layers.webp" width="840" height="580" alt="概念芯片分层视图：封装、晶粒与连接结构" loading="lazy" />

<a href="/silicon/" data-astro-reload>Explore architecture → 进入交互芯片专题</a>

## Structure

交互模型展开的是封装与连接结构；讨论 TEE 时，我们转向的是执行环境与访问边界。把两种视图接起来，是为了帮助阅读，不代表软件运行在动画中某一块独立的物理薄片上。

本文的阅读顺序很简单：先放下芯片外观，问哪些资源需要隔离；再看运行状态；最后跟随一次跨边界请求。动画最后的两个光场也只是概念标记，并非芯片面积分配图。

## Worlds

在这里采用的经典 Arm A-profile TrustZone 模型中，Normal World 与 Secure World 表示两种安全状态下的系统环境。隔离涉及硬件和软件资源，不只是给应用换一个权限标签。具体系统如何分配资源，取决于 SoC 设计和平台配置。[Arm 的 TrustZone 架构概述](https://support.arm.com/documentation/PRD29-GENC-009492/latest/TrustZone-Hardware-Architecture/Overview)给出了这一基础划分。

普通操作系统与应用运行在 Normal World；安全侧可以承载较小的可信软件栈。TEE 是可信执行环境的概念，TrustZone 则提供构建这种环境的架构基础，两者不是同一个层次的名称。此处仅讨论上述模型，不覆盖 CCA 等扩展体系。[Arm 的 TEE 参考文档入口](https://www.arm.com/technologies/trustzone-for-cortex-a/tee-reference-documentation)适合继续阅读。

### 安全状态与异常级别是两条坐标

在经典 AArch64 两世界模型中，EL0/EL1 等异常级别回答执行权限的问题，Secure/Non-secure 状态回答另一维度的资源访问问题。普通系统的内核权限不直接等于安全侧权限。也不能把所有安全软件都标成 EL3：Monitor 与可信操作系统、可信应用承担不同角色，实际部署依赖平台。

### 芯片模型没有画出的边界

隔离还涉及内存控制、外设、中断和其他总线访问主体。只检查 CPU 的软件页表，不足以描述整个 SoC 的保护配置。动画里的分层与光场用于帮助理解层次，不呈现真实的访问控制寄存器或资源归属。

## Calls

以 OP-TEE 文档描述的 SMC 调用路径为例，可以先把流程缩成下面这条线：

```text
Normal World
    │ SMC exception
    ▼
Secure Monitor
    │ 保存 / 恢复执行上下文
    ▼
OP-TEE OS
    │ 完成服务并经 Monitor 返回
    ▼
Normal World
```

Monitor 负责安全世界的进入与退出；当请求指向可信操作系统时，它将执行切换到 OP-TEE OS。返回时进行反向的上下文切换。这张图省略了客户端库、驱动和可信应用的细节，也省略了中断与 RPC 分支，不能当作所有平台通用的完整调用栈。[OP-TEE Core 文档](https://optee.readthedocs.io/en/latest/architecture/core.html#normal-world-invokes-op-tee-os-using-smc)解释了这些切换过程。

### 请求成功不等于调用方被授权

参数可以跨过世界边界，调用方的业务权限仍需由具体服务验证。共享缓冲区还需要处理参数类型、长度和使用期间的数据一致性；私钥不导出，也不等于任何签名请求都应接受。详细调用路径、TA 加载和存储条件见 [TEE 调用与安全边界](/posts/tee-call-security/)。

## Boot

XBL、ABL 等启动组件应放在启动时间线上解释，而不是标成芯片封装的一层。启动阶段先决定哪些软件获得执行权，运行时再由内存与外设访问控制、可信服务接口共同维护边界。

Qualcomm 的公开材料存在架构代际差异：旧式说明中的 XBL/XBL_SEC，与较新说明中的 XBL-SC/TME 应分别阅读。这里不把它们混接成一条适用于全部设备的启动链。完整展开见 [XBL 如何加载：PBL、镜像认证、ABL 与 Android](/posts/xbl-boot-chain/)。

对具体设备的结论，应补充平台版本、固件或源码依据，以及实际观察到的调用路径。当前页面没有这些证据，因此不对任何设备作实现判断。

---

**回到模型，再看一次。** <a href="/silicon/" data-astro-reload>打开 Inside the Silicon →</a>
