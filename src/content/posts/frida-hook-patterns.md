---
title: 'Frida 常用 Hook 模式整理'
description: '把平时反复写的那几段 Frida 脚本固化下来：Java 层重载定位、Native 导出函数、动态注册的 JNI、以及 dlopen 之后再挂钩子。'
pubDate: 2026-01-16
category: 'Android'
tags: ['frida', 'hook', 'jni', '动态调试']
---

Frida 的 API 不复杂，但每次现场写都要翻文档。这里把高频场景的模板存下来。

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
const addr = Module.findExportByName('libnative.so', 'Java_com_example_Native_check')

Interceptor.attach(addr, {
  onEnter(args) {
    // args[0] = JNIEnv*, args[1] = jobject, args[2] 起才是 Java 参数
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

so 被 strip 过就只能用偏移。注意 **Thumb 模式下 arm32 的地址要加 1**，arm64 没有这个问题。

```javascript title="hook-offset.js"
const base = Module.findBaseAddress('libnative.so')
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
const RegisterNatives = Module.findExportByName('libart.so',
  '_ZN3art3JNI15RegisterNativesEP7_JNIEnvP7_jclassPK15JNINativeMethodi')

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

这段基本是每次分析加固应用的第一步，拿到偏移之后就能接着上一节的方式挂钩子。

## 等 so 被加载后再 hook

目标 so 常常是运行时才 `dlopen` 的，脚本一启动就找会返回 null。挂在 `dlopen` 的返回上等它：

```javascript title="wait-for-so.js"
const TARGET = 'libcore.so'
let hooked = false

const dlopen = Module.findExportByName(null, 'android_dlopen_ext')
  ?? Module.findExportByName(null, 'dlopen')

Interceptor.attach(dlopen, {
  onEnter(args) {
    this.path = args[0].readCString()
  },
  onLeave() {
    if (hooked || !this.path?.includes(TARGET)) return
    hooked = true
    console.log(`[*] ${TARGET} loaded, installing hooks`)
    installHooks()
  },
})

function installHooks() {
  const base = Module.findBaseAddress(TARGET)
  // ... 在这里挂具体的钩子
}
```

## 读写内存的几个常用形式

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

# 不落地，直接管道
frida -U -f com.example.app --no-pause -l hook.js
```

调试反调试比较狠的目标时，`-f` 加 `--no-pause` 常常会被检测到，改用 gadget 注入或者先过掉检测再 attach 更稳。
