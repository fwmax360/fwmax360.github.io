---
title: '文件在普通世界，为什么还能叫可信存储'
description: '用一次权限撤销的例子，读 TA 签名、加密存储、防回滚和事务之间的区别。'
pubDate: 2026-10-10
updatedDate: 2026-10-11
category: 'Android'
tags: ['TEE', 'TA', 'RPMB', '可信存储', '密钥', 'Security']
series: '启动与可信执行'
order: 4
---

在普通文件系统里发现 TA 文件或安全服务的数据时，第一反应可能是：既然普通世界能改这个文件，隔离还有什么用？

关键要看安全侧怎样使用它。存放字节的位置，和决定这些字节是否有效的位置，可以不同。先从“撤销一项权限后，旧文件又被放回来”这个小例子入手，比先背一串密钥名字更容易看清问题。

前半篇用 OP-TEE 解释存储，后面转向 Android 的证明密钥配置。权限版本的示例用于解释机制；RKP 部分另外引用一组设备请求的留档，并区分原始测试记录与这次对附件的离线核对。两套实现和协议分开讨论，也不把 OP-TEE 的格式当作 QTEE 的格式。

## 合法的旧数据，也可能是错误的当前状态

假设服务保存一个对象，内容很简单：

```text
版本 7：允许某项操作
版本 8：该权限已撤销
```

如果外部随意修改版本 8 的密文，完整性保护应发现修改。但如果放回一整份原来的版本 7 呢？它曾经由正确的服务写出，认证标签也可能完全有效。

加密回答内容是否暴露，完整性保护回答是否被未授权修改；它们不会自动告诉服务“这是昨天的状态”。防回滚需要另一个可靠的依据，表明当前已经走到了哪个版本。

把版本号和对象一起加密，仍然没有解决问题：外部恢复旧对象时，也把旧版本号恢复了。服务需要的不是更多字段，而是一份同样不能被倒退的参照。

## 文件系统负责存，安全侧负责解释

OP-TEE 的 REE 文件系统存储路径由安全侧加密数据，再通过 RPC 让 `tee-supplicant` 执行普通文件操作。普通侧因此可以保存密文，而不承担把它认定为有效明文的职责。[Secure storage 文档](https://optee.readthedocs.io/en/latest/architecture/secure_storage.html)说明了这条路径。

这也解释了为什么“在 Linux 目录里找到了文件”本身不奇怪。真正要继续看的，是安全侧读取时的保护机制和配置。

不过，保存与解释分开，不会让保存这一侧失去影响。它仍可能删除文件、拒绝服务或迟迟不返回。保密、完整性与可用性在这里会出现不同结果：读不出私密内容，不代表没有能力让请求失败。

## PRIVATE 这个名字没有选定 RPMB

OP-TEE 可以使用 REE 文件系统或 RPMB 相关后端。一个容易遗漏的细节是存储 ID：文档中，`TEE_STORAGE_PRIVATE` 在 REE 后端可用时优先选择它，否则选择 RPMB；两个后端还各有明确的专用 ID：`TEE_STORAGE_PRIVATE_REE` 与 `TEE_STORAGE_PRIVATE_RPMB`。[官方文档的后端选择说明](https://optee.readthedocs.io/en/latest/architecture/secure_storage.html#background)直接列出了这个顺序。

所以，即使构建里启用了 RPMB，也要看对象实际选择了哪个后端。读到 `PRIVATE`，只按名字认定“这个对象直接存在 RPMB 中”，会跳过选择逻辑。

但还要补上另一半：**对象留在 REE 文件系统，不等于防回滚也只能依赖普通世界。** 两个后端同时启用时，OP-TEE 会把 REE 文件系统的状态摘要保存在 RPMB 的 `dirfile.db.hash` 中。数据的位置与保护状态的位置可以分开；[REE FS hash state](https://optee.readthedocs.io/en/latest/architecture/secure_storage.html#ree-fs-hash-state)解释的正是这个组合。判断一块板子的保护能力，要一起看后端选择、RPMB 配置及平台密钥实现。

RPMB 提供认证和防重放相关能力，但不是自动理解业务版本的数据库。服务仍要确定受保护的对象、更新关系，以及失败后保留什么状态。设备密钥基础和量产配置也参与保障，桌面后端的行为不能当作设备结果。

## TA 的版本与数据的版本，是两条线

数据可以过时，执行它的代码也可以过时。一份签名正确的旧 TA，可能仍包含已经修复的问题。

OP-TEE 的 REE-FS TA 由普通侧传入，安全侧检查并加载；签名和可选加密承担不同职责。其文档还明确指出，REE-FS TA 的版本检查使用安全存储中的 `ta_ver.db`，版本来自 `CFG_TA_VERSION`，有效的防降级依赖 `CFG_RPMB_FS=y`。[Trusted Applications 的防回滚章节](https://optee.readthedocs.io/en/latest/architecture/trusted_applications.html#ree-fs-ta-rollback-protection)给出了这些条件。

这就有两份时间线：代码更新到了哪个版本，业务对象更新到了哪个状态。接受新 TA，不会自动迁移所有旧对象；保护了对象的新鲜性，也不会自动禁止旧代码加载。版本迁移需要让两条线相互兼容。

## 一个操作原子，不等于两次操作一起原子

回到撤销权限的例子。假设权限保存在对象 A，密钥引用保存在对象 B。服务先更新 A，再更新 B，中间断电。即使每次写入都具有原子性，重启后也可能得到“新 A、旧 B”。

这是两个完整操作之间的断点，并非某次写入只写了一半。存储接口的原子更新保证，与业务跨对象的事务，是不同粒度。[OP-TEE 的 Atomic Operation 说明](https://optee.readthedocs.io/en/latest/architecture/secure_storage.html#atomic-operation)列出写入、截断、重命名、创建、删除等操作，不能据此推导两次独立 API 调用也共同提交。

一种便于推理的设计，是把必须共同变化的字段保存在同一份可原子更新的状态里；另一种是引入提交记录或恢复协议。选择后者时，要明确哪份记录决定已提交、旧副本何时退役。这里是业务设计示意，不是 OP-TEE 内置事务 API。

如果恢复时遇到损坏对象，也要小心“友好默认值”。把读取错误解释成权限未设置，再默认放行，可能让存储故障变成授权变化。失败后的业务状态要由协议决定，而不是顺手补一个能继续运行的值。

## 到 Android Keybox，先问下发的是什么

说到 Android 的证明密钥，常会遇到 Keybox 这个名字。在传统工厂配置路径里，它指向包含证明私钥及相应证书链的配置材料。NXP 的 [Android 安全指南](https://www.nxp.com/docs/en/user-guide/UG10158-AUTO.pdf)仍明确区分传统 attestation keybox 与 RKP。这不是应用普通密钥的统称，也别与 DRM 场景里的同名材料混在一起。

Android 12 引入 Remote Key Provisioning（RKP），把原先在工厂配置证明私钥的方式，转向设备内生成密钥、远程签发证书。因此，“现在改成下发处理”抓住了变化，但**下发的是证书链，不是证明私钥**。[Google 的机制介绍](https://android-developers.googleblog.com/2022/03/upgrading-android-attestation-remote.html)说明了这个区别。

可以只跟着一份新生成的证明公钥走：

```text
设备安全组件生成证明密钥对
    → 设备构造带认证材料的证书请求
    → 远程服务验证请求，为公钥签发证书
    → 系统保存并分配返回的证书链
```

私钥在设备安全组件中使用。普通侧可能保存受保护的 key blob，不代表拿到了可直接使用的明文私钥；服务器签发公钥证书，也不代表服务器负责生成这把设备私钥。

Android 12 是引入节点，不能据此认定所有升级到 12 的设备都取消了传统路径。读具体产品还要看发布代际、HAL 能力及采用的配置。Android 14 又把远程配置整合进 `com.android.rkpd` Mainline 模块；之前主要由 `RemoteProvisioner` 与 Keystore 2.0 分担工作。[AOSP RKP 页面](https://source.android.com/docs/core/ota/modular-system/remote-key-provisioning)说明了这次软件分层变化，它和下面的硬件信任链阶段不是同一条版本轴。

## BCC 是哪条链，不是应用拿到的那条链

服务器收到一个公钥，还需要知道：请求是否来自可接受的设备安全组件？只让公钥自己签名，能证明持有对应私钥，却不能凭空建立设备身份。

旧版 RKP 设计把这份设备信任材料称为 Boot Certificate Chain（BCC）。它用 CBOR/COSE 结构组织从设备信任根到安全组件签名密钥的关系；服务器返回给设备的证明证书链则采用 X.509。**两者在同一流程里，但不是同一份链。** [固定修订的 RKP 设计说明](https://android.googlesource.com/platform/hardware/interfaces/+/0d520e8e1751fde5a3207c6f27be88a8bbc245dc/security/rkp/README.md)保留了 BCC 的定义。

这里还有一个代际细节。Phase 1 可以是单个自签名证书，信任扎根于 TEE；更完整的 DICE 阶段才把硬件根与启动过程连接起来。看到 BCC 一词，不应自动画出每个启动阶段都有证书的完整链。

[当前 RKP 设计](https://android.googlesource.com/platform/hardware/interfaces/+/refs/heads/main/security/rkp/README.md)改用 UDS 公钥与 Android Profile for DICE 的表述，并区分退化 DICE、硬件 DICE、SoC 厂商认证等阶段。旧资料中的 DK、KM、BCC 名称要放回对应修订读，不能机械套成所有新 HAL 的字段。

如果继续追踪“服务器相信谁”，这条链很重要。它连接设备根与发出请求的组件，和前面 TA 文件的签名检查解决的是不同问题：TA 加载检查某份代码是否接受，RKP 需要建立远程请求的可信来源。

## Google 后端参与的是签发，不是每次本地密钥操作

在 [Google 2022 年公布的部署说明](https://android-developers.googleblog.com/2022/03/upgrading-android-attestation-remote.html)里，工厂提取的设备公钥上传到 Google 后端，用来建立后续请求的信任基础。后端验证请求并签发证书；公开设计还考虑了分离设备身份验证与证书签发处理，以减少身份关联。AOSP 定义协议接口，不意味着任意自行构建的设备都自动具备 Google 后端认可的注册关系。

这也解释了网络为什么会影响证明能力，却不等于每次签名都要在线。系统可以预先维持证明密钥和证书池，按需要补充。旧版 [RemoteProvisioner 的公开说明](https://android.googlesource.com/platform/packages/apps/RemoteProvisioner/)同时描述了周期补充和池不足时触发配置的路径；因此暂时断网与证书池耗尽，是不同条件。Android 的 [KeyStoreException 源码说明](https://android.googlesource.com/platform/frameworks/base/+/bcf46f722cac/keystore/java/android/security/KeyStoreException.java)也把证明密钥池耗尽、设备未注册等情况列为 `ERROR_ATTESTATION_KEYS_UNAVAILABLE` 的可能原因，并限定在仅依赖远程配置密钥的设备上。

最后别把这件事直接画成 Play Integrity 的通过开关。RKP 配置证明材料，Key Attestation 用证书表达密钥与相关状态，某项远程业务再依据自己的规则判断是否接受。成功取得一条证书链，只回答了其中一个环节。验证方还要核对可信根、链上签名、相关证明字段及撤销状态；RKP 证书的有效期也应检查。[Android 官方验证指南](https://developer.android.com/privacy-and-security/security-key-attestation)分别讨论了这些要求。本文只是比较两份附件，不是对某项业务给出接受判定。

## 两个 challenge，分别问谁

读 RKP 时还有一个容易串线的地方：配置服务发出的 challenge，与应用调用 `setAttestationChallenge()` 时传入的 challenge，处在两次不同的交互里。

前者用于证明密钥的远程配置。固定修订的 [AOSP `ServerInterface.java`](https://android.googlesource.com/platform/packages/modules/RemoteKeyProvisioning/+/d57b562c0b89579a839b55ea1ba266eca7b699db/app/src/com/android/rkpdapp/interfaces/ServerInterface.java)在 `fetchGeek()` 注释中说明，服务端返回挑战是为了检查后续签发请求的新鲜性；`requestSignedCertificates()` 又说明，同一挑战除了在请求体中出现，还会放进 URL，便于服务端拒绝错误请求。这描述了客户端的约定和设计意图，不等于公开了 Google 后端的完整校验实现。

后者用于应用密钥的证明。[`setAttestationChallenge()` 的 API 文档](https://developer.android.com/reference/android/security/keystore/KeyGenParameterSpec.Builder#setAttestationChallenge(byte[]))说明，这个值会进入生成的证明证书，让验证方判断密钥是否针对某个具体请求创建。RKP 提供的证明密钥可以参与签发应用密钥的证明证书，但这两把密钥、这两次挑战不是同一个对象。

因此，下文比较的是 RKP 返回的证明密钥证书，不是应用针对一次业务请求取得的密钥证明。它没有直接检验某个应用服务端是否正确核对了自己的 challenge。

## 证书换了一张，设备就重新证明过了吗

这里有一组比概念更值得细看的材料：2026 年 10 月 4 日的一份 RKP 请求记录，以及随附的两条证书链。它涉及一台 Pixel 6 Pro，系统是 Android 16，实际使用的 `IRemotelyProvisionedComponent` 硬件协议版本却是 2。系统版本、KeyMint 接口版本和 RKP 协议版本，各自描述不同的东西；把它们混在一起，很容易从第一步就读错请求格式。

按原始记录，第一次请求让 TEE 为服务端挑战 C1 生成材料，随后正常取得证书。约 15 秒后又取得挑战 C2，第二次提交仍然使用先前那份请求体，只更换 URL 中的挑战和请求标识，没有让 TEE 为 C2 再生成一份材料。记录里的两次结果都是 HTTP 200。

先别急着把它叫作“拿到了新 Keybox”。这次整理时，对留存附件做了离线解析；虽然扩展名写着 `.p7b`，实际内容是连续拼接的 DER 证书。两份附件各含四张证书，比较结果是：

| 比较的位置 | 留档中看到的差异 |
| --- | --- |
| 叶证书的公钥（SPKI） | 相同 |
| 叶证书的序列号、签名 | 不同 |
| 后续三张证书 | 字节完全相同 |
| 叶证书的到期时间 | 不同，第二张反而更早到期 |

这些附件支持“同一个公钥取得了另一张叶证书”，没有展示一把新的私钥。离线比较也不等于重新执行了网络实验：两次请求的发送方式和 HTTP 状态来自原始记录，证书差异才是这次直接核对的部分。原始请求体、挑战值和设备标识没有随文公开。

它留下的疑问是：**来源可信的旧材料，在多长时间内仍然可以用于签发？** URL 带了 C2，并不自动说明后端把 C2 当作签名材料的新鲜性依据。后端可能以请求体中的 C1 为准，也可能允许一定时间内重复使用；这一组记录区分不了这些解释。仅从返回另一张证书，推不出服务端内部采用了哪种策略。

处理结论也需要放在观察旁边。根据随材料提供、此前核对的邮件，Google Android Security Team 在 2026 年 10 月 10 日的回复中，将这份报告认定为不构成安全漏洞，并关闭报告，同时记录为可能的后续改进项。这封邮件属于报告处理记录，没有公开公告链接，也不是协议规范；回复没有解释具体校验策略。因此这里保留的是一次重复签发的观察，而不是一个已经确认的安全绕过。

尤其要留意记录的边界：总共两次签发请求，其中一次是重放；没有第三次，也没有等材料过期后再试。第二张证书更早到期，更谈不上已经证明可以延长有效期。材料同样没有展示绕过设备注册、提取 TEE 私钥或通过 Play Integrity。

这和前面旧权限文件的例子有一个共同问题：验证材料来自谁，还要接着问它对应什么时候。但两者不能直接画等号。存储里的防回滚，和远程签发协议中的重试、有效窗口、挑战绑定，是不同的规则。读 BCC 时关注来源，读签发过程时再关注时效，才不会把一条可信链当成所有条件都已满足的凭据。

## 私钥没出来，接口仍然需要限制

存储保护终于把状态保住了，接下来仍要看调用协议。一个只返回签名、不导出私钥的服务，如果接受任意调用者和任意消息，私钥虽然留在内部，使用权限却可能过宽。

这是[TEE 调用那篇](/posts/tee-call-security/)里类型检查之后的下一层：类型正确，只说明请求可以按约定解析。允许谁用这把密钥、签什么内容，要由服务另行判断。

可信存储于是有了一个更具体的含义：安全侧在自己的策略下，把需要保存的状态可靠地取回来。它不是一个目录名，也不是在文件前面加上“加密”两个字。

## 沿着原文继续读

想继续看实现，优先从 [OP-TEE Secure storage](https://optee.readthedocs.io/en/latest/architecture/secure_storage.html)的后端选择、状态摘要和平台密钥注意事项读起；Android 一侧则先看 [AOSP RKP 模块说明](https://source.android.com/docs/core/ota/modular-system/remote-key-provisioning)，再对照文中固定修订的 BCC 设计与客户端源码。它们分别回答存储、软件分层和协议的问题。

以上官方页面于 2026 年 10 月 11 日核对。带 `latest` 或 `main` 的链接会继续变化；历史 BCC 和客户端行为使用固定提交。设备留档与处理邮件是本文另外的材料来源，不用官方设计说明替它们背书。

<a href="/silicon/" data-astro-reload>回到芯片专题 →</a>
