---
title: 'MITM 代理抓包：原理、Reqable 配置与代理检测对抗'
description: '从网络分层与 TLS 握手讲清应用层 MITM 如何解密 HTTPS，配合 Reqable 做 Android 抓包，并整理 App 常见代理检测与 Hook 绕过。'
pubDate: 2026-02-03
category: 'Android'
tags: ['抓包', 'MITM', 'HTTPS', 'Reqable', 'Frida']
series: '抓包实战'
order: 1
---

日常说的「MITM 抓包」多半指应用层代理：在客户端和真实服务器之间各建一条 TLS，中间人能看到 HTTP 明文。链路层 ARP、透明代理那套会在本系列后续文章展开。

## 一、基础原理

### 1.1 网络分层与 MITM 落点

用五层模型看拦截位置：

- **应用层**：HTTP / FTP / SMTP 等，进程间用应用协议通信
- **传输层**：TCP / UDP，提供端到端传输
- **网络层**：IP，路由与主机互联
- **链路层**：帧封装与邻接传输
- **物理层**：比特流

MITM 可以落在不同层：

- 链路层：ARP 欺骗，把流量导到自己
- 网络 / 传输层：端口转发、透明代理（iptables / TPROXY）
- **应用层（最常见）**：显式 HTTP/HTTPS 代理 —— 人们说「MITM 抓包」时通常指这一种

应用层代理常配合下层（路由、iptables、ARP）把流量先引到代理进程。

### 1.2 HTTP 与 HTTPS

- **HTTP** 明文：请求行、头、正文都可读，中间设备直接看 TCP 流即可
- **HTTPS** = HTTP + TLS：先握手建加密通道，再在通道里传 HTTP；外面看到的是密文

因此：

1. HTTP 的 MITM 很简单：浏览器 → TCP → 80 端口，中间代理/抓包机读流就能改
2. HTTPS 的难点：若只做「透明转发」而不终止 TLS，你只能看到加密字节流，拿不到明文

### 1.3 TLS 握手（简化）

1. **ClientHello**：客户端随机数、支持的 TLS 版本与套件，以及 SNI（要访问的主机名）
2. **ServerHello + Certificate**：服务器选套件，返回证书链；证书含公钥，由受信任 CA 签名
3. **密钥交换 & Finished**：双方推导对称密钥，之后用对称加密；最后互发 Finished 确认

证书是客户端验证「对面真的是 example.com」的关键：信任证书才会继续用协商出的密钥加密。

一张 X.509 证书通常包含（简化）：

- Subject / SAN：域名身份
- 公钥
- Issuer：签发 CA
- 有效期
- Key Usage
- CA 对证书内容的签名

更细一点的握手步骤：

1. ClientHello
2. ServerHello + Certificate
3. ServerKeyExchange（可选，临时公钥 + 证书私钥签名）
4. ClientKeyExchange → 双方推导共享密钥
5. ChangeCipherSpec / Finished → 切到对称加密通道

要拿到明文，中间人必须在握手阶段**伪造证书**，并完成**两次**密钥协商（client↔MITM、MITM↔真实服务器）。

## 二、MITM 工作流程

1. 客户端访问目标域名，发出带 SNI 的 ClientHello
2. MITM 截获：显式代理直接收；透明代理靠路由 / iptables 转发
3. MITM 伪装成服务器：用自签证书；客户端须信任 MITM 根 CA → 完成 client↔MITM TLS（Key_C↔M）
4. MITM 再与真实服务器建第二条 TLS（Key_M↔S），按需透传或改请求
5. 响应回来时：先用 Key_M↔S 解密，再用 Key_C↔M 加密回客户端 → 明文可视化

## 三、Reqable + Android 配置

官方入门：[Reqable Getting Started](https://reqable.com/zh-CN/docs/getting-started/)

### 桌面端

1. 安装桌面端，按向导导出 / 安装 CA（右上角 SSL 相关入口）
2. 要对 Android 抓包时，选移动端 / Android 相关连接方式
3. 确认本机监听地址与端口，防火墙放行

### 移动端 Wi-Fi 代理

演示环境：arm64、Android 12、Pixel 6 Pro 模拟器。

```text
设置 → Wi-Fi → 当前网络 → 编辑
→ Proxy = Manual
→ 填 Proxy hostname（宿主机 IP）和 Proxy port
→ Save
```

模拟器访问宿主机常用 `10.0.2.2`；真机填电脑局域网 IP。

### 验证是否解密成功

随便打一条 HTTPS。例如微信安全相关：

```text
https://weixin110.qq.com/security/newreadtemplate?t=findpasswd/index&wechat_real_lang=en
```

关注：

- 状态码 200、协议 HTTP/1.1（经代理解密后的视图）
- Query：`t`、`wechat_real_lang` 等
- Cookie / User-Agent / Referer 等头（常被风控使用）
- 响应 `Content-Type`、`Cache-Control`

能看到明文请求行与响应体，说明 MITM + 证书信任基本打通。

### Android 7+ 证书注意

用户安装的证书**默认不被 App 信任**。要解密系统级 / 多数 App 流量，CA 最好装到：

```text
/system/etc/security/cacerts/
```

需要 root（模拟器常用 `writable-system`）。仅装用户证书时，浏览器可能能抓，目标 App 经常抓不到。

## 四、App 如何检测代理

### 4.1 读系统属性

Android 开 WLAN 代理后，主机与端口会进系统属性：

```kotlin
fun detectBySystemProperties(): Boolean {
    val httpHost = System.getProperty("http.proxyHost")
    val httpPort = System.getProperty("http.proxyPort")?.toIntOrNull() ?: -1
    if (!httpHost.isNullOrEmpty() && httpPort > 0) return true

    val httpsHost = System.getProperty("https.proxyHost")
    val httpsPort = System.getProperty("https.proxyPort")?.toIntOrNull() ?: -1
    return !httpsHost.isNullOrEmpty() && httpsPort > 0
}
```

老接口（兼容旧设备）：

```java
public static boolean detectByLegacyProxy(Context context) {
    String host = android.net.Proxy.getHost(context);
    int port = android.net.Proxy.getPort(context);
    return host != null && host.length() > 0 && port != -1;
}
```

### 4.2 ConnectivityManager / LinkProperties

API 23+：

```kotlin
@RequiresApi(Build.VERSION_CODES.M)
fun detectByConnectivityManager(context: Context): Boolean {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = cm.activeNetwork ?: return false
    val link = cm.getLinkProperties(network) ?: return false
    val proxy = link.httpProxy ?: return false
    return proxy.host.isNotEmpty() && proxy.port > 0
}
```

旧接口 `getDefaultProxy()` 在不少 ROM 上仍有效：

```java
@SuppressWarnings("deprecation")
public static boolean detectByDefaultProxy(Context context) {
    ConnectivityManager cm =
        (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
    if (cm == null) return false;
    ProxyInfo info = cm.getDefaultProxy();
    return info != null && info.getHost() != null && info.getPort() > 0;
}
```

### 4.3 ProxySelector / OkHttp

```kotlin
fun detectByProxySelector(): Boolean {
    return try {
        val selector = ProxySelector.getDefault() ?: return false
        val proxies = selector.select(URI("https://www.example.com"))
        proxies.any { it.type() != Proxy.Type.DIRECT }
    } catch (_: Exception) {
        false
    }
}

fun detectOkHttpProxy(client: OkHttpClient): Boolean {
    val proxy = client.proxy()
    return proxy != null && proxy.type() != Proxy.Type.DIRECT
}
```

### 4.4 环境变量与 Settings

```kotlin
fun detectByEnvAndSettings(context: Context): Boolean {
    System.getenv("http_proxy")?.let { if (it.isNotEmpty()) return true }
    val globalProxy = Settings.Global.getString(context.contentResolver, "http_proxy")
    return !globalProxy.isNullOrEmpty()
}
```

### 4.5 链路 / DNS 旁路探测

风控常见：对比有无代理时的延迟；DNS 是否解析到内网。

```kotlin
suspend fun detectByLatency(): Boolean {
    val baseline = measureLatency(proxy = Proxy.NO_PROXY)
    val current = measureLatency(proxy = null) // null = 走系统代理
    return current - baseline > 150
}

fun detectByDns(host: String): Boolean {
    val addresses = InetAddress.getAllByName(host)
    return addresses.any { addr ->
        val ip = addr.hostAddress ?: return@any false
        ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("172.16.")
    }
}
```

### 4.6 业务侧串联示例

```kotlin
fun isProxyEnabled(context: Context): Boolean {
    if (!android.net.Proxy.getDefaultHost().isNullOrEmpty()) return true
    if (!System.getProperty("http.proxyHost").isNullOrEmpty()) return true
    if (!System.getProperty("https.proxyHost").isNullOrEmpty()) return true

    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    cm.getLinkProperties(cm.activeNetwork)?.httpProxy?.let { proxy ->
        if (!proxy.host.isNullOrEmpty() && proxy.port != 0) return true
    }

    try {
        val proxies = ProxySelector.getDefault()?.select(URI("https://www.example.com"))
        if (proxies?.any { it.type() != Proxy.Type.DIRECT } == true) return true
    } catch (_: Exception) {
    }
    return false
}
```

### 4.7 大厂常见做法（观察向）

- **微信**：初始化网络栈时读 `http(s).proxyHost`，并多次问 `ProxySelector`；命中后支付等模块降级
- **支付宝**：`NetworkProxyUtils` 一类逻辑遍历代理属性，交易链路强制关代理
- **抖音系**：结合 `getDefaultProxy` 与 `ProxySelector`，上报埋点并拦敏感接口
- **银行类**：启动即检代理 + VPN，常配合 JNI `getprop` / 读系统配置

### 4.8 进阶对抗面（不只是「有没有代理」）

- 检测逻辑热更新，静态 Patch 很快失效
- Native 再检一遍，甚至读 wifi 配置文件
- **SSL Pinning**：即使用户信了抓包 CA，也校验证书指纹
- Android 7+ 默认不信用户证书
- App 自建网络栈，绕过系统代理
- HTTP/2 / **QUIC（UDP）**：TCP 代理抓不到，需强制降级（如拦 UDP 443）

抓不到包时，先分清是「代理被识破」还是「证书 / Pinning / QUIC」。

## 五、如何绕过检测

目标：让检测 API 读不到代理，同时代理本身仍在转发。

### 5.1 Hook 系统属性（Xposed / LSPosed）

```java
public class ProxyBypassModule implements IXposedHookLoadPackage {
    @Override
    public void handleLoadPackage(final LoadPackageParam lpparam) {
        XposedHelpers.findAndHookMethod(System.class, "getProperty", String.class,
            new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    String key = (String) param.args[0];
                    if ("http.proxyHost".equals(key) || "http.proxyPort".equals(key)
                            || "https.proxyHost".equals(key) || "https.proxyPort".equals(key)) {
                        param.setResult(null);
                    }
                }
            });

        Class<?> proxyClass = XposedHelpers.findClass("android.net.Proxy", lpparam.classLoader);
        XposedHelpers.findAndHookMethod(proxyClass, "getDefaultHost", new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam param) {
                param.setResult(null);
            }
        });
        XposedHelpers.findAndHookMethod(proxyClass, "getDefaultPort", new XC_MethodHook() {
            @Override protected void afterHookedMethod(MethodHookParam param) {
                param.setResult(-1);
            }
        });
    }
}
```

Frida 版：

```javascript
Java.perform(function () {
  var System = Java.use('java.lang.System')
  System.getProperty.overload('java.lang.String').implementation = function (key) {
    if (key && key.indexOf('proxy') !== -1) return null
    return this.getProperty(key)
  }
})
```

### 5.2 伪造 ConnectivityManager

```java
XposedHelpers.findAndHookMethod(
    "android.net.ConnectivityManager", lpparam.classLoader,
    "getDefaultProxy", new XC_MethodHook() {
        @Override protected void afterHookedMethod(MethodHookParam param) {
            param.setResult(null);
        }
    });

Class<?> linkProperties =
    XposedHelpers.findClass("android.net.LinkProperties", lpparam.classLoader);
XposedHelpers.findAndHookMethod(linkProperties, "getHttpProxy", new XC_MethodHook() {
    @Override protected void afterHookedMethod(MethodHookParam param) {
        param.setResult(null);
    }
});
```

无 Hook 时的临时反射（脆弱，仅作了解）：

```kotlin
val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
val field = ConnectivityManager::class.java.getDeclaredField("sDefaultProxy")
field.isAccessible = true
field.set(null, null)
```

### 5.3 重写 ProxySelector / OkHttp

```kotlin
class NoProxySelector : ProxySelector() {
    override fun select(uri: URI?): List<Proxy> = listOf(Proxy.NO_PROXY)
    override fun connectFailed(uri: URI?, sa: SocketAddress?, ioe: IOException?) {}
}

fun installNoProxySelector() {
    if (ProxySelector.getDefault() !is NoProxySelector) {
        ProxySelector.setDefault(NoProxySelector())
    }
}

val client = OkHttpClient.Builder()
    .proxy(Proxy.NO_PROXY)
    .proxySelector(ProxySelector.getDefault())
    .build()
```

注意：这是「让 App 自己以为直连」的思路；真要抓包，通常是 **Hook 检测返回值**，而不是在抓包机上把 OkHttp 改成 `NO_PROXY`（那样流量就不进代理了）。对抗时分清「在目标 App 里 Hook」和「在你自己的测试客户端里配置」。

### 5.4 清 Settings / 环境变量

Root：

```bash
settings put global http_proxy :0
# 或按 ROM 使用 resetprop / 清空 http_proxy
```

Frida 拦 `Settings.Global.getString`：

```javascript
Java.perform(function () {
  var SettingsGlobal = Java.use('android.provider.Settings$Global')
  SettingsGlobal.getString
    .overload('android.content.ContentResolver', 'java.lang.String')
    .implementation = function (resolver, name) {
      if (name === 'http_proxy') return ''
      return this.getString(resolver, name)
    }
})
```

### 5.5 干扰延迟 / DNS 检测

```kotlin
class CleanDns : Dns {
    override fun lookup(hostname: String): List<InetAddress> {
        return InetAddress.getAllByName(hostname).filterNot { it.isSiteLocalAddress }
    }
}
```

JNI 读 `getprop` 时，再 Hook `android.os.SystemProperties.get`：

```java
XposedHelpers.findAndHookMethod(
    "android.os.SystemProperties", lpparam.classLoader,
    "get", String.class, new XC_MethodHook() {
        @Override protected void afterHookedMethod(MethodHookParam param) {
            String key = (String) param.args[0];
            if ("http.proxyHost".equals(key) || "http.proxyPort".equals(key)) {
                param.setResult("");
            }
        }
    });
```

### 5.6 Pinning（单独战场）

仅清代理属性不够。常见还要处理：

- OkHttp `CertificatePinner`
- `TrustManager` / `TrustManagerImpl`
- `network_security_config`
- native `libssl` / 自研校验

## 小结

显式 MITM 上手快，也最容易被「读系统代理」打掉。下一篇讲 VPN 抓包：不写 `http.proxyHost`，从路由层把流量导到 `tun0`。
