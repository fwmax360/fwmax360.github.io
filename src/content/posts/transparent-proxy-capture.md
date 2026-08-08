---
title: '透明代理抓包：iptables + redsocks2 + Charles'
description: '按 UID 劫持指定 App 流量，不设系统代理、不起 VPN。以知到为例给出准备、规则、自动化脚本、清理与排障。'
pubDate: 2026-02-14
category: 'Android'
tags: ['抓包', '透明代理', 'redsocks', 'Charles', 'iptables']
series: '抓包实战'
order: 4
---

基于 `iptables + redsocks2 + Charles`，对指定 App 做无感知透明代理抓包。

核心优势：App 读不到系统代理，也看不到 VPN/`tun0`；只拦某个 UID；HTTPS 仍需把 Charles CA 装进系统分区。

参考：[安卓上基于透明代理对特定 APP 抓包](https://blog.seeflower.dev/archives/207/)、[iptables 在 Android 抓包中的妙用](https://blog.seeflower.dev/archives/191/)。

## 方案原理

```text
目标 App 流量 → iptables 按 UID 拦截 → redsocks2 透明代理 → Charles SOCKS5 → 互联网
```

关键点：

- 没有设置系统代理 → 常规代理检测落空
- 不使用 VPN → `tun` / `TRANSPORT_VPN` 检测落空
- 按 UID 只拦目标包，不影响整机其它 App
- HTTPS 明文仍依赖系统信任 Charles CA

下面以知到 `com.able.wisdomtree` 为例，换成你的包名即可。

## 准备工作

### 1. 获取 UID

```bash
# 方法1：先启动 App，再看进程
adb shell ps -ef | grep wisdomtree

# 方法2：包管理器
adb shell dumpsys package com.able.wisdomtree | grep userId=
```

示例：`u0_a428` 或数字 UID `10428`。`-m owner --uid-owner` 用数字形式。

### 2. 下载 redsocks2

```bash
curl -L -o android-redsocks2.tgz https://fh0.github.io/assets/android-redsocks2.tgz
tar -xzf android-redsocks2.tgz
# 备用：https://github.com/semigodking/redsocks/releases
```

把 arm64 二进制推到设备，例如 `/data/local/tmp/redsocks`。

### 3. Charles

1. `Proxy` → `Proxy Settings` → `SOCKS Proxy` → Enable，端口如 `1080`
2. CA **必须**装到 `/system/etc/security/cacerts/`（用户证书不够）

## 操作步骤

### 步骤 1：保存规则并推送配置

```bash
adb shell su -c "iptables-save > /data/local/tmp/iptables.rules"

cat > redsocks.conf << 'EOF'
base {
    log_debug = off;
    log_info = on;
    log = stderr;
    daemon = off;
    redirector = iptables;
}

redsocks {
    bind = "127.0.0.1:16666";
    relay = "10.0.2.2:1080";
    type = socks5;
    autoproxy = 0;
    timeout = 13;
}
EOF

adb push redsocks2_arm64 /data/local/tmp/redsocks
adb push redsocks.conf /data/local/tmp/redsocks.conf
adb shell chmod +x /data/local/tmp/redsocks
```

配置说明：

- `bind = "127.0.0.1:16666"`：设备上透明代理监听地址
- `relay = "10.0.2.2:1080"`：Charles SOCKS5
  - 模拟器访问宿主机用 `10.0.2.2`
  - 真机改成电脑局域网 IP，如 `192.168.1.14:1080`
- `redirector = iptables`：配合 nat 表 DNAT/REDIRECT

### 步骤 2：写 iptables（按 UID）

```bash
APP_UID="10428"   # 换成实际 UID

adb shell su -c "\
iptables -t nat -A OUTPUT \
  -p tcp ! -d 127.0.0.1 \
  -m owner --uid-owner $APP_UID \
  --dport 0:65535 \
  -j DNAT --to-destination 127.0.0.1:16666"

adb shell su -c "iptables -t nat -L OUTPUT -n -v"
```

`! -d 127.0.0.1` 很关键：防止 redsocks 连 Charles / 回环时再次被劫持，形成回路。

可选：只拦 80/443：

```bash
adb shell su -c "\
iptables -t nat -A OUTPUT \
  -p tcp ! -d 127.0.0.1 \
  -m owner --uid-owner $APP_UID \
  -m multiport --dports 80,443 \
  -j DNAT --to-destination 127.0.0.1:16666"
```

### 步骤 3：启动 redsocks2

前台调试：

```bash
adb shell
su
cd /data/local/tmp
./redsocks -c /data/local/tmp/redsocks.conf
```

后台：

```bash
adb shell su -c "cd /data/local/tmp && \
  nohup ./redsocks -c /data/local/tmp/redsocks.conf \
  > /data/local/tmp/redsocks.log 2>&1 &"
```

### 步骤 4：启动 App

```bash
adb shell monkey -p com.able.wisdomtree -c android.intent.category.LAUNCHER 1
```

Charles 里应出现该 App 流量。若没有，先看 OUTPUT 链的 pkts 计数和 redsocks 日志。

## 恢复 / 清理

### 删规则

```bash
# 方法1：精确删除（参数须与添加时一致）
adb shell su -c "\
iptables -t nat -D OUTPUT \
  -p tcp ! -d 127.0.0.1 \
  -m owner --uid-owner 10428 \
  --dport 0:65535 \
  -j DNAT --to-destination 127.0.0.1:16666"

# 方法2：restore（部分 Android 上不稳定）
adb shell su -c "iptables-restore /data/local/tmp/iptables.rules"

# 方法3：最省事
adb reboot
```

### 停 redsocks

```bash
adb shell su -c "ps -ef | grep redsocks"
adb shell su -c "pkill -f redsocks"
```

## 自动化脚本

### setup_transparent_proxy.sh

```bash
#!/bin/bash
DEVICE="${1:-emulator-5554}"
APP_PACKAGE="com.able.wisdomtree"
CHARLES_HOST="${2:-10.0.2.2}"   # 真机改成电脑 IP
CHARLES_PORT="${3:-1080}"
PROXY_PORT="16666"
REDSOCKS_BIN="${REDSOCKS_BIN:-./redsocks2_arm64}"

echo "[*] 查找 UID..."
APP_UID=$(adb -s "$DEVICE" shell dumpsys package "$APP_PACKAGE" \
  | grep userId= | head -1 | sed 's/.*userId=//')
echo "[*] UID: $APP_UID"

cat > redsocks.conf << EOF
base {
    log_debug = off;
    log_info = on;
    log = stderr;
    daemon = off;
    redirector = iptables;
}

redsocks {
    bind = "127.0.0.1:$PROXY_PORT";
    relay = "$CHARLES_HOST:$CHARLES_PORT";
    type = socks5;
    autoproxy = 0;
    timeout = 13;
}
EOF

adb -s "$DEVICE" push "$REDSOCKS_BIN" /data/local/tmp/redsocks
adb -s "$DEVICE" push redsocks.conf /data/local/tmp/redsocks.conf
adb -s "$DEVICE" shell chmod +x /data/local/tmp/redsocks

echo "[*] 写 iptables..."
adb -s "$DEVICE" shell su -c "iptables-save > /data/local/tmp/iptables.rules.bak"
adb -s "$DEVICE" shell su -c "\
iptables -t nat -A OUTPUT \
  -p tcp ! -d 127.0.0.1 \
  -m owner --uid-owner $APP_UID \
  --dport 0:65535 \
  -j DNAT --to-destination 127.0.0.1:$PROXY_PORT"

echo "[*] 启动 redsocks..."
adb -s "$DEVICE" shell su -c "cd /data/local/tmp && \
  nohup ./redsocks -c /data/local/tmp/redsocks.conf \
  > /data/local/tmp/redsocks.log 2>&1 &"
sleep 2

echo "[*] 启动 App..."
adb -s "$DEVICE" shell monkey -p "$APP_PACKAGE" -c android.intent.category.LAUNCHER 1

echo "[+] 完成。日志: adb -s $DEVICE shell su -c 'cat /data/local/tmp/redsocks.log'"
echo "[+] 清理: pkill redsocks; iptables -t nat -F OUTPUT; 或 adb reboot"
```

### cleanup_transparent_proxy.sh

```bash
#!/bin/bash
DEVICE="${1:-emulator-5554}"
adb -s "$DEVICE" shell su -c "pkill -f redsocks"
adb -s "$DEVICE" shell su -c "iptables -t nat -F OUTPUT"
echo "[+] 清理完成"
```

使用前 `chmod +x`。`REDSOCKS_BIN` 指到你本机解压出的二进制路径。

## 注意事项

1. **证书**：透明代理不解决信任链，系统 CA 仍是硬条件
2. **UID**：装完/清数据后 UID 可能变，规则要用新值
3. **回环排除**：`! -d 127.0.0.1` 别删
4. **restore 不稳**：搞不定直接重启
5. **端口占用**：确认 `16666` 空闲
6. **只拦 TCP**：纯 QUIC/UDP 仍可能漏；必要时配合禁 UDP 443 强制降级

## 常见问题

### 1. redsocks：Connection refused

- Charles SOCKS 是否 Enable
- `relay` 是否指向正确主机（模拟器 `10.0.2.2` / 真机局域网 IP）
- 电脑防火墙是否拦了 1080

### 2. Charles 看不到数据

```bash
adb shell su -c "iptables -t nat -L OUTPUT -n -v"
adb shell su -c "ps -ef | grep redsocks"
adb shell su -c "cat /data/local/tmp/redsocks.log"
```

确认 pkts 在涨、进程在跑、日志无反复 connect fail。

### 3. HTTPS 无法解密

CA 必须在 `/system/etc/security/cacerts/`，不能只装用户证书。

### 4. App 仍提示代理 / 异常网络

```bash
adb shell settings get global http_proxy   # 期望 null 或空
```

确认没开 VPN；若仍失败，可能是 TLS 指纹、Pinning、自建栈等，需要另开对抗。

## 三种方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| 系统代理 | 简单 | 极易被读配置 |
| VPN 代理 | 全局、可无 root | `tun` / `TRANSPORT_VPN` 易查 |
| 透明代理 (redsocks2) | 无代理/VPN 指纹、可按 UID | 要 root、配置重 |

## 参考

- [安卓上基于透明代理对特定 APP 抓包](https://blog.seeflower.dev/archives/207/)
- [iptables 在 Android 抓包中的妙用](https://blog.seeflower.dev/archives/191/)
- [redsocks2 (semigodking)](https://github.com/semigodking/redsocks)
