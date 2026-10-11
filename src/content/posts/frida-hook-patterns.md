---
title: 'Frida 常用 Hook 模式整理'
description: '把平时反复写的那几段 Frida 脚本固化下来：Java 层重载定位、Native 导出函数、动态注册的 JNI、以及 dlopen 之后再挂钩子。'
pubDate: 2026-01-16
updatedDate: 2026-10-11
category: 'Android'
tags: ['Frida', 'Hook', 'jni', '动态调试']
---

Frida 的 API 不复杂，但每次现场写都要翻文档。这里把高频场景的模板存下来。

本文按 Frida 17+ API 调整：旧的 `Module.findExportByName` 和 `findBaseAddress` 已移除，见 [Frida 17 发布说明](https://frida.re/news/2025/05/17/frida-17-0-0-released/)。CLI 的 Java bridge 与自建 agent 的导入方式要分开核对。

## Java 层：处理重载

`overload` 的参数必须写完整签名，否则会抛异常。参数类型用 Java 的写法，不是 smali 描述符。

```javascript title="hook-java.js"
Java.perform(() => {
  const Checker = Java.use('com.example.security.Checker')

  // 无参重载
  Checker.isRooted.overload().implementation = function () {
    console.log('[*] isRooted() -> false')
    return false
  }

  // 带参重载
  Checker.verify.overload('java.lang.String', 'int').implementation = function (token, level) {
    console.log(`[*] verify("${token}", ${level})`)
    const ret = this.verify(token, level)
    console.log(`    original -> ${ret}`)
    return true
  }
})
```

不确定有哪些重载时，先打印出来：

```javascript
Java.use('com.example.security.Checker').verify.overloads.forEach((o) => {
  console.log(o.argumentTypes.map((t) => t.className).join(', '))
})
```

## Native：导出函数

有符号的直接按名字找：

```javascript title="hook-export.js"
const addr = Process.getModuleByName('libnative.so').getExportByName('Java_com_example_Native_check')

Interceptor.attach(addr, {
  onEnter(args) {
    // 普通 JNI：args[0] = JNIEnv*, args[1] = jobject/jclass
    // CriticalNative 不遵循这两个隐含参数的布局
    this.env = args[0]
    console.log('[+] check() called from\n' +
      Thread.backtrace(this.context, Backtracer.ACCURATE)
        .map(DebugSymbol.fromAddress).join('\n'))
  },
  onLeave(retval) {
    console.log(`[+] returned ${retval}`)
    retval.replace(ptr(1))
  },
})
```

## Native：只有偏移的情况

strip 不等于所有导出、动态符号和定位线索都消失；已确认的模块相对偏移是一种定位方式。注意 **Thumb 模式下 arm32 的地址要加 1**，arm64 没有这个问题。

```javascript title="hook-offset.js"
const base = Process.getModuleByName('libnative.so').base
const target = base.add(0x1a2c4)

Interceptor.attach(target, {
  onEnter(args) {
    console.log(`[+] sub_1A2C4  x0=${args[0]}  x1=${args[1]}`)
  },
})
```

## 动态注册的 JNI 函数

很多加固会用 `RegisterNatives` 动态绑定，这时候 `Java_` 开头的导出符号根本不存在。办法是 hook `RegisterNatives` 本身，把注册表打出来：

```javascript title="dump-register-natives.js" {6,11,12}
const RegisterNatives = Process.getModuleByName('libart.so').findSymbolByName(
  '_ZN3art3JNI15RegisterNativesEP7_JNIEnvP7_jclassPK15JNINativeMethodi')

if (RegisterNatives === null) throw new Error("当前 libart 未暴露这个符号；请核对系统构建")
Interceptor.attach(RegisterNatives, {
  onEnter(args) {
    const count = args[3].toInt32()
    const methods = args[2]

    for (let i = 0; i < count; i++) {
      // JNINativeMethod = { char* name; char* sig; void* fnPtr; }
      const entry = methods.add(i * Process.pointerSize * 3)
      const name = entry.readPointer().readCString()
      const sig = entry.add(Process.pointerSize).readPointer().readCString()
      const fn = entry.add(Process.pointerSize * 2).readPointer()

      const mod = Process.findModuleByAddress(fn)
      const offset = mod ? fn.sub(mod.base) : ptr(0)
      console.log(`${name}${sig}  ->  ${mod?.name}!0x${offset.toString(16)}`)
    }
  },
})
```

这个 C++ 符号名依赖 libart 的版本和构建，不是稳定 JNI 接口；缺少符号时不要把 null 交给 Interceptor。拿到的地址仍需记录对应模块、架构和文件哈希。

## 等 so 被加载后再 hook

目标模块可能已经加载，也可能晚些时候才加载。Frida 17 的模块观察接口能覆盖两者：

```javascript title="wait-for-so.js"
const observer = Process.attachModuleObserver({
  onAdded(module) {
    if (module.name !== 'libcore.so') return
    console.log(`${module.name} @ ${module.base}`)
    // 按这个构建已确认的导出符号或偏移安装 hook
  },
})
// 结束观察时调用 observer.detach()
```

在 `dlopen` 返回后安装 hook，可能已经错过构造函数执行；监听加载和回调的具体时序见 [官方 JS API](https://frida.re/docs/javascript-api/)。偏移不能跨不同构建直接复用。

## 读写内存的几个常用形式

以下片段要放到有 `args` / `retval` 的回调作用域内。`std::string` 布局还取决于 libc++ ABI、短字符串优化和构建选项，下面只是已知布局的示意；未确认布局、长度和可读地址时不要直接套用。

```javascript
// 读一段 buffer
console.log(hexdump(args[1], { length: 64, ansi: true }))

// 读 std::string（libc++，注意短字符串优化）
function readStdString(p) {
  const flag = p.readU8()
  if (flag & 1) {
    // 长字符串：容量 | 长度 | 指针
    return p.add(2 * Process.pointerSize).readPointer().readUtf8String()
  }
  return p.add(1).readUtf8String()
}

// 改写返回值
retval.replace(ptr(0))

// 主动调用 native 函数
const fn = new NativeFunction(addr, 'int', ['pointer', 'int'])
console.log(fn(buf, 16))
```

## 启动方式

```bash
# spawn 模式，能抓到 so 加载前的逻辑
frida -U -f com.example.app -l hook.js

# attach 到已运行的进程
frida -U -n com.example.app -l hook.js

# 参数以安装版本为准
frida --help
```

`--no-pause` 是旧 CLI 用法，现行版本不要照搬。spawn 与 attach 能覆盖的时序不同；这里没有声称哪一种能通用于所有反调试场景。
