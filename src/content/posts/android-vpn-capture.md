---
title: 'Android VPN 抓包：VpnService、Reqable 与 VPN 检测对抗'
description: '系统如何把流量导到 tun0，为何 VPN 能绕过系统代理检测，Reqable 协同与系统证书安装，以及 App 枚举网卡 / 路由 / NetworkCapabilities 的对抗。'
pubDate: 2026-02-06
updatedDate: 2026-10-11
category: 'Android'
tags: ['抓包', 'VPN', 'VpnService', 'Reqable', 'Frida']
series: '抓包实战'
order: 2
---

系统代理靠 App 自觉走 `ProxySelector`；VPN 通过路由和应用范围接管匹配的流量；排除的应用、未覆盖的 IPv6 路由，以及被 `protect()` 保护的隧道 socket 不在同一范围内。Reqable、HttpCanary 一类工具的「VPN 模式」就是这个模型。

## 一、VPN 工作原理

### 1.1 基本概念

Android 通过 `VpnService` 建本地隧道：

- 创建虚拟网卡（常见 `tun0`）作为新出口
- 系统把匹配路由的数据包导入 `tun0`
- VPN 应用在用户态读、改、记，再从真实网卡（`wlan0` / `eth0`）发出

### 1.2 Socket 路径 vs VPN 路径

```text
┌─────────────────────────────────────────┐
│ 应用层：HttpURLConnection / OkHttp 等     │
│        ↓ Socket API                     │
└─────────────────────────────────────────┘
                    ↓ sendto / recvfrom
┌─────────────────────────────────────────┐
│ 传输层：TCP / UDP                        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│ 网络层：IP + 路由决策                     │
└─────────────────────────────────────────┘
          ↓                       ↓
   正常：wlan0/eth0         VPN：tun0 → VPN App → wlan0
```

一句话：

```text
App → Socket → Kernel TCP/IP → Routing → tun0 → VPN App → wlan0 → Internet
```

应用层代码只是：

```java
Socket socket = new Socket("api.example.com", 443);
socket.getOutputStream().write("Hello".getBytes());
```

内核做 TCP/IP；VPN 在**路由查询**阶段接管。Socket 是应用与内核网络栈的接口；VPN 通过改路由把流量导向 `tun0`。

### 1.3 路由表变化

```bash
# VPN 未启动
$ ip route show
default via 192.168.1.1 dev wlan0
192.168.1.0/24 dev wlan0

# 路由覆盖的简化示意，不是所有 Android 设备的实际输出
$ ip route show
0.0.0.0/1 dev tun0        # 半个地址空间
128.0.0.0/1 dev tun0      # 另一半
192.168.1.1/32 dev wlan0  # 保留到网关，方便再转发
```

`0.0.0.0/1` + `128.0.0.0/1` 覆盖全部 IPv4，且比默认路由更具体、优先级更高。Android 还使用策略路由和独立路由表；只看 `ip route show` 的主表可能漏掉 VPN 路由。检查时同时记录 `ip rule`、相关 table 和应用范围。

### 1.4 VPN vs 代理

```text
代理模式：应用 →（可选）代理 → 网络
VPN 模式：应用 → Socket → 内核 → 路由重写 → tun0 → VPN App → 网络
```

- VPN 强制匹配流量经过 `tun0`
- 本地抓包 VPN ≠ 远程跨境 VPN 隧道（模型类似，目的不同）
- 不写 `http.proxyHost`，单纯读系统代理的检测会失效

## 二、为什么 VPN 适合抓包

1. **流量必经**：路由改写后，TCP/UDP/DNS 都可进隧道
2. **可不 root**：系统弹 VPN 授权即可（证书装系统分区仍常要 root）
3. **绕过「系统代理」检测**：没设 WLAN Proxy，读属性那套打空
4. **包级可见**：能看到 IP 头、端口、TLS 握手前字节；HTTPS 明文仍依赖 CA / Pinning 处理

## 三、VpnService 的接口片段

这部分只展示接口与包的方向，不是一份可直接部署的 VPN 服务。入口需要先处理 `VpnService.prepare()` 的用户许可，Manifest 声明 `BIND_VPN_SERVICE`，并按系统版本处理前台服务、重建隧道和关闭 FD。[Android 官方 VPN 指南](https://developer.android.com/develop/connectivity/vpn) 给出了生命周期要求。

### 3.1 建立隧道

```kotlin
class PacketCaptureVpnService : VpnService() {
    private var vpnInterface: ParcelFileDescriptor? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        establishVpn()
        startPacketCapture()
        return START_STICKY
    }

    private fun establishVpn() {
        vpnInterface = Builder()
            .setSession("PacketCapture")
            .addAddress("10.0.0.2", 24)
            .addRoute("0.0.0.0", 0)
            .addDnsServer("8.8.8.8")
            .establish()
    }
}
```

- 继承 `VpnService` 才能拿到建虚拟网卡的能力
- `Builder` 配虚拟 IP、路由、DNS，相当于往路由表注册新出口
- `establish()` 返回对应 `tun0` 的 FD

### 3.2 读写方向别反了

```text
读 TUN：应用发出的 IP 包 → VPN → 隧道网关 / 用户态协议栈
写 TUN：网关 / 用户态协议栈返回的 IP 包 → 内核 → 应用
```

原稿把刚读到的出站包原样写回 TUN，并标注“写回才能连通”，这个方向有误。写入是在向应用侧注入入站包，不是把包发到互联网。

完整转发有两条常见路线：把 IP 包装进通往网关的隧道，或用用户态 TCP/IP 栈转换成真实连接。前者的隧道 socket 需要 `protect()`，否则可能再次被 VPN 捕获。两者都还要处理返回包、连接状态、超时与关闭；只做 `read()` / `write()` 没有实现这些行为。

### 3.3 粗解析

```kotlin
private fun parsePacket(buffer: ByteBuffer): PacketInfo {
    val ipVersion = (buffer.get(0).toInt() and 0xF0) shr 4
    if (ipVersion == 4) {
        val protocol = buffer.get(9).toInt() and 0xFF
        val headerLength = (buffer.get(0).toInt() and 0x0F) * 4
        when (protocol) {
            6 -> parseTCP(buffer, headerLength)
            17 -> parseUDP(buffer, headerLength)
        }
    }
    return PacketInfo(/* ... */)
}
```

上面的解析只是偏移示意：访问任何字段前都要检查实际包长、IPv4 IHL、总长度、分片与传输层头部；IPv6 还涉及扩展头。`PacketInfo`、`parseTCP` 和 `parseUDP` 未在本文实现。首字节高 4 位是 IP 版本；`protocol` 区分 TCP/UDP，再按偏移拆端口与载荷。

## 四、Reqable 协同抓包

### 环境

- 桌面端 + Android 端都装 Reqable
- 演示：Pixel 6 Pro，Android 12，arm64，同一局域网 / 模拟器

### 连接流程

1. 移动端选 **Collaborative Mode**
2. 扫码或手动输入桌面端 `IP:端口`
3. 点 Done，状态变为已连接
4. 主界面右下角启动调试（纸飞机一类入口）
5. 桌面端「应用程序」出现设备后点选，确认监听 IP/端口

### 证书

首次可能提示 root certificate 未安装：

- `Install` → 用户级证书，部分场景够用
- 是否信任用户 CA 取决于应用的 target SDK、Network Security Configuration 和自己的 TLS 实现，不能按品牌一概判断。target SDK 24+ 默认不信任用户添加的 CA，应用可以显式配置；见 [官方信任配置](https://developer.android.com/privacy-and-security/security-config)。

模拟器常见坑：

- 二维码导入失败 → 侧边栏相册，或手动输 IP:端口
- 桌面无流量 → 监听地址与设备页签是否对上
- 证书已装仍提示 → Reqable 提醒，可在 Certificate Management 关掉重复提示

### 系统证书安装（需 adb root）

下面是原笔记 Android 12 可写模拟器的路径示例，不代表 Android 14+ Conscrypt APEX 或生产设备的证书部署方式。先记录系统镜像、证书原状及回滚方案；安装 CA 也不会自动绕过证书绑定。

思路：导出 `.0` → 可写 system → 推到 `cacerts` → 权限 / SELinux → 重启。

```bash
adb root
adb disable-verity   # 允许改 /system（AVB/dm-verity）
adb reboot

# 以可写系统模式启动模拟器，例如：
# emulator -avd Pixel_6_Pro -writable-system

adb root && adb remount
adb pull /sdcard/Download/Reqable/你的证书.0 .
openssl x509 -inform PEM -subject_hash_old -in 你的证书.0 -noout
# 按输出的 hash 重命名，再 push
adb push <hash>.0 /system/etc/security/cacerts/<hash>.0
adb shell chmod 644 /system/etc/security/cacerts/<hash>.0
adb shell chown root:root /system/etc/security/cacerts/<hash>.0
adb shell restorecon /system/etc/security/cacerts/<hash>.0
adb reboot
```

步骤含义：

1. `adb root` → root
2. `disable-verity` → 关分区校验
3. reboot → 生效
4. `-writable-system` → 可写 system 启动
5. `remount` → `/system` 可写
6. pull / openssl hash / push
7. `chmod` `chown` `restorecon`
8. reboot → 信任库生效

### 故障恢复

无流量或断网：关掉 Reqable VPN 再连；或重启模拟器网络后重新协同。

## 五、App 如何检测 VPN

`ip route show` 能直接看到 `tun0`，敏感 App 启动时会多手段检查。

### 5.1 网卡名

```java
public static boolean detectVpnByNetworkInterface() {
    try {
        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
        while (interfaces.hasMoreElements()) {
            String name = interfaces.nextElement().getName().toLowerCase();
            if (name.contains("tun") || name.contains("ppp") || name.contains("pptp")) {
                return true;
            }
        }
    } catch (Exception e) {
        e.printStackTrace();
    }
    return false;
}
```

### 5.2 NetworkCapabilities

```java
public static boolean detectVpnByConnectivityManager(Context context) {
    ConnectivityManager cm =
        (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN);
    }
    NetworkInfo info = cm.getActiveNetworkInfo();
    return info != null && info.getType() == ConnectivityManager.TYPE_VPN;
}
```

`TRANSPORT_VPN` 常量值为 **4**。

### 5.3 路由表

```java
public static boolean detectVpnByRoute() {
    try (BufferedReader reader = new BufferedReader(new FileReader("/proc/net/route"))) {
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.contains("tun0") || line.contains("ppp0")) {
                return true;
            }
        }
    } catch (Exception e) {
        e.printStackTrace();
    }
    return false;
}
```

### 5.4 本地 IP / DNS / MTU

虚拟网卡常见 `10.x`、部分 `172.x`；DNS 被改成隧道 DNS；MTU 异常偏小。风控也会做延迟对比（与代理篇类似）。

| 检测方式 | 位置 | 常见绕过 |
|----------|------|----------|
| tun0 网卡 | `NetworkInterface` | Hook `getName()` |
| VPN 传输层 | `NetworkCapabilities` | Hook `hasTransport()` |
| 路由表 | `/proc/net/route` | `mount --bind` 假文件 |
| DNS | `net.dns*` / SystemProperties | Hook 属性 |
| MTU | `getMTU` | Hook 返回固定值 |

## 六、绕过 VPN 检测

### 6.1 Hook hasTransport

```javascript
Java.perform(function () {
  var NetworkCapabilities = Java.use('android.net.NetworkCapabilities')
  NetworkCapabilities.hasTransport.implementation = function (transportType) {
    if (transportType == 4) { // TRANSPORT_VPN
      console.log('[*] 拦截 VPN 检测')
      return false
    }
    return this.hasTransport(transportType)
  }
})
```

### 6.2 Hook 网卡名

```javascript
Java.perform(function () {
  var NetworkInterface = Java.use('java.net.NetworkInterface')
  NetworkInterface.getName.implementation = function () {
    var name = this.getName()
    if (name.indexOf('tun') !== -1 || name.indexOf('ppp') !== -1) {
      console.log('[*] 隐藏接口: ' + name)
      return 'dummy0'
    }
    return name
  }
})
```

### 6.3 伪造路由表（root）

```bash
cp /proc/net/route /data/local/tmp/fake_route
# 编辑 fake_route，删掉 tun0 行
mount --bind /data/local/tmp/fake_route /proc/net/route
```

### 6.4 仍要处理 SSL Pinning

```javascript
Java.perform(function () {
  var CertificatePinner = Java.use('okhttp3.CertificatePinner')
  CertificatePinner.check
    .overload('java.lang.String', 'java.util.List')
    .implementation = function (hostname, pins) {
      console.log('[*] bypass pinning: ' + hostname)
      // 空实现
    }
})
```

VPN 解决「流量必经」；Pinning / 自定义信任链是另一层。

## 小结

- VPN 用 `tun0` 做系统级劫持，能躲「读系统代理」
- Reqable 协同 + 系统 CA 是实操主线
- App 仍可用接口名、`TRANSPORT_VPN`、路由表等多点检测
- 两边都被盯死时，下一篇用 iptables 按 UID 做透明代理：既不设代理，也不起 VPN
