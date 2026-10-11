---
title: 'iptables / netfilter：透明代理需要哪几条链'
description: '理清 PREROUTING、INPUT、FORWARD、OUTPUT、POSTROUTING 与 DNAT/SNAT/MASQUERADE，为按 UID 做透明代理打基础，并附常见排障。'
pubDate: 2026-02-10
updatedDate: 2026-10-11
category: 'Android'
tags: ['抓包', 'iptables', 'netfilter', '透明代理', 'root']
series: '抓包实战'
order: 3
---

透明代理不改 App 的代理设置，而是在内核把指定流量 DNAT 到本机 `redsocks` 这类进程；TPROXY 是另一条路线，涉及 mangle 表、透明 socket 和策略路由，不等同于 DNAT。Android 上通常要 root，规则写在 `nat` 表的 `OUTPUT`。本文先把 netfilter 链讲清楚；下一篇给完整抓包方案。

## 包在内核里怎么走

应用用户态 `send()` / `connect()` → 包进内核网络栈 → 按路由决定后续：

- **目的是本机**：`PREROUTING` → `INPUT` → 本机进程收
- **本机发出去**：`OUTPUT` → 路由决策 → `POSTROUTING` → 出网卡
- **外来包要转发到别的主机**（当路由器）：`PREROUTING` → `FORWARD` → `POSTROUTING`

记三句：

- 外部 → 本机：`PREROUTING` → `INPUT`
- 外部 → 转发：`PREROUTING` → `FORWARD` → `POSTROUTING`
- 本机发出：`OUTPUT` → `POSTROUTING`

五个 hook：`PREROUTING`、`INPUT`、`FORWARD`、`OUTPUT`、`POSTROUTING`。规则在这些点上匹配，决定修改、放行、丢弃或做 NAT。

## NAT 是什么

NAT（Network Address Translation）在包过防火墙时改包头源/目的地址，用来伪装源 IP、重定向目的、做端口映射。

| 类型 | 作用方向 | 示例 | 说明 |
|------|----------|------|------|
| **SNAT** | 改源地址 | 内网访问外网时，源 IP 改成网关公网 IP | 出站伪装 |
| **DNAT** | 改目的地址 | 访问 `1.2.3.4:80` 实际到 `192.168.0.100:8080` | 入站/本地重定向 |
| **MASQUERADE** | 动态 SNAT | 自动用出口网卡当前 IP | 动态 IP 场景 |

NAT 规则挂在部分链上：

| 链 | 位置 | 可做 NAT | 抓包常用 |
|----|------|----------|----------|
| **PREROUTING** | 包刚到主机、路由前 | DNAT | 网关/端口映射、TPROXY 标记 |
| **OUTPUT** | 本机程序发出、路由前 | DNAT | **本地透明代理** |
| **POSTROUTING** | 即将离开主机、路由后 | SNAT / MASQUERADE | 出站伪装 |

口诀：

- DNAT → `PREROUTING` / `OUTPUT`
- SNAT → `POSTROUTING`

## 五条链细说

### PREROUTING

- **何时**：包刚进内核、做路由判断之前（来自网卡的入站）
- **对象**：外部进来的包，也包括桥接场景
- **常见用途**：
  - DNAT / 端口重写（公网 `IP:port` → 内网主机）
  - `mangle` 打 MARK，给策略路由或 TPROXY 用

例：把到达 80 的请求转到内网 `192.168.1.100:8080`

```bash
iptables -t nat -A PREROUTING -p tcp --dport 80 \
  -j DNAT --to-destination 192.168.1.100:8080
```

注意：在路由前改目的地址，会直接影响后面是走 `INPUT` 还是 `FORWARD`。

### INPUT

- **何时**：路由后判定「最终目的是本机」
- **对象**：发给本机监听端口的流量
- **常见用途**：防火墙放行/拒绝 SSH、管理口等

```bash
iptables -A INPUT -p tcp --dport 22 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 22 -j DROP
```

一般不拿 INPUT 做「把 App 流量拽进代理」。

### FORWARD

- **何时**：包不是给本机，要转发到其他接口/主机
- **对象**：路由器 / NAT 网关场景
- **普通手机终端**：本机 App 生成的出站包走 OUTPUT，不因打开 IP 转发就改走 FORWARD；热点转发的其他设备流量是另一个来源

```bash
iptables -A FORWARD -i eth0 -o eth1 -s 192.168.1.0/24 -j ACCEPT
iptables -A FORWARD -j DROP
```

### OUTPUT（透明代理关键）

- **何时**：本机进程生成包、发到网络之前
- **对象**：应用 `socket` 发出的连接
- **常见用途**：
  - 对本机流量做透明重定向：`-j REDIRECT` / `DNAT`
  - 按进程 UID 限制：`-m owner --uid-owner`（用于本机生成包，本文放在 OUTPUT；也可用于相应 POSTROUTING 路径，不适用于转发包）

例：UID=1000 发往 80 的 TCP → 本机 12345

```bash
iptables -t nat -A OUTPUT -p tcp \
  -m owner --uid-owner 1000 --dport 80 \
  -j REDIRECT --to-ports 12345
```

Android 上按 App UID 劫持流量，核心就在这条链。

### POSTROUTING

- **何时**：路由完成、即将出接口之前（本机发出或转发都经过）
- **常见用途**：SNAT / MASQUERADE、改 TTL、清 MARK、统计

```bash
iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE
```

## 和下一篇的衔接

完整抓包链路：

```text
App(UID) → iptables OUTPUT DNAT → redsocks2 → Charles/Reqable SOCKS5 → 互联网
```

两条必记：

1. **排除 `127.0.0.1`**：回环排除不等于排除了代理的所有上游连接，还要保证代理 UID 不被规则捕获
2. **HTTPS 明文另看应用信任配置和证书绑定**：iptables 只解决「流量怎么被拽过来」

## 常见问题（对接 Charles + redsocks 时）

### Charles 看不到流量

```bash
# ① Charles SOCKS5 是否启用
# Proxy → Proxy Settings → SOCKS Proxy → Enable

# ② redsocks 是否在跑
adb shell su -c "ps -ef | grep redsocks"

# ③ iptables 是否命中（看 pkts 计数是否涨）
adb shell su -c "iptables -t nat -L OUTPUT -n -v"

# ④ 看日志
adb shell su -c "cat /data/local/tmp/redsocks.log"
```

### HTTPS 无法解密

- target SDK 24+ 默认不信任用户 CA，应用可以通过配置显式允许
- 系统 CA 也不自动绕过证书绑定；Android 版本、TLS 栈与证书部署位置要分别核对

### 脚本报「设备未连接」

```bash
adb devices
./start_proxy.sh emulator-5554   # 换成实际 serial
```

### redsocks 启动失败

```bash
adb shell su -c "netstat -tunlp | grep 16666"
adb shell su -c "cat /data/local/tmp/redsocks.log"
```

### 检查组件是否齐全

```bash
adb shell su -c "ps -ef | grep redsocks"
# 期望：/data/local/tmp/redsocks -c ...

adb shell su -c "iptables -t nat -L OUTPUT -n -v"
# 期望：DNAT ... owner UID match <uid> ... to:127.0.0.1:16666

adb shell ps -ef | grep <你的包名>
```

下一篇用知到 App（`com.able.wisdomtree`）走一遍完整搭建与自动化脚本。

## 机制依据

- [Netfilter 的包路径与 hook](https://www.netfilter.org/documentation/HOWTO/netfilter-hacking-HOWTO-3.html)
- [Android Network Security Configuration](https://developer.android.com/privacy-and-security/security-config)
