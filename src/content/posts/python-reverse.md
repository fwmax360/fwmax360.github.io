---
title: 'Python 逆向'
description: '从识别 PyInstaller 打包、提取 pyc 到反编译还原的 Python 逆向流程。'
pubDate: 2025-08-03
updatedDate: 2026-10-11
category: 'Binary'
tags: ['Python', '逆向', 'pyc']
---

拿到一个 EXE，先别急着套“提取、解密、反编译”三连。PyInstaller、Nuitka、嵌入式解释器生成的文件，后续路线不同；识别工具的标签只能作为入口，还要看归档结构和运行时依赖。

## 先把打包版本记下来

如果确认是 PyInstaller，保留原文件的 SHA-256、Python 版本线索、打包器版本和提取器的提交号，再在副本上提取：

```bash
python pyinstxtractor.py sample.exe
```

这是 [pyinstxtractor 原项目](https://github.com/extremecoders-re/pyinstxtractor) 的基本用法；原稿里的 `pyinstxtractor.py --key ...` 不是这个脚本提供的命令行接口。提取器的提示也应保留，尤其是 PYZ 提取失败、Python 版本不匹配和缺少头部的提示。

输出里哪些文件有完整 `.pyc` 头、哪些只是归档里的 marshal 数据，要分别确认。不要默认 `struct.pyc` 一定存在，也不要把它的整个头部复制到所有文件上。

## 加密是旧版本分支，不是必经步骤

旧版 PyInstaller 曾有 `--key` 字节码加密选项；现行版本已移除这项功能，具体变更见 [官方变更记录](https://pyinstaller.org/en/stable/CHANGES.html)。遇到历史文件，应回到对应版本的归档读取和解密实现，确认密钥处理、IV、加密模式及压缩顺序。

长度是 16 的倍数，不足以确定 CBC 或 ECB；尾部有 16 个非零字节，也不足以认定那里是 GCM tag。原稿依据这些特征猜模式的脚本已经撤下。解密后的 zlib 解压失败，应保留失败和输入供核对，而不是把异常吞掉后将结果命名成“解密成功的 pyc”。

## pyc 头和内存中的 PyCodeObject 是两件事

Python 3.7 引入的头部布局是 16 字节：

```text
0..3    magic number
4..7    flags（小端）
8..15   时间戳 + 源文件大小，或 8 字节源文件 hash
16..    marshal 序列化数据
```

flags 的最低位为 0 时走时间戳布局，为 1 时走 hash 布局；第二位涉及 hash 校验方式。旧版 Python 的头部长度另查对应版本。依据是 [PEP 552](https://peps.python.org/pep-0552/)，不是把 C 结构体直接当磁盘格式。

下面只读头部，不反序列化或执行样本：

```python
import struct

def inspect_pyc_header(data: bytes) -> dict:
    if len(data) < 16:
        raise ValueError("不足 16 字节，先确认 Python 版本和提取格式")
    magic, flags = struct.unpack_from("<4sI", data)
    if flags & ~3 or flags == 2:
        raise ValueError("flags 不符合本文处理的 PEP 552 布局")
    result = {"magic": magic.hex(), "flags": flags}
    if flags & 1:
        result.update(source_hash=data[8:16].hex(), check_source=bool(flags & 2))
    else:
        timestamp, source_size = struct.unpack_from("<II", data, 8)
        result.update(timestamp=timestamp, source_size=source_size)
    return result
```

函数假定输入已经识别为 Python 3.7+ 的 pyc；它不验证 magic 对应的解释器，也不证明后面的代码对象有效。改 magic 只是改标签，不会把一种版本的字节码转换成另一种。

`PyCodeObject` 是解释器内部的内存对象，字段、字节码和序列化约定会变化。Python 官方还明确提醒 [marshal](https://docs.python.org/3/library/marshal.html) 的版本依赖和不可信输入风险。需要分析代码对象时，用匹配版本的隔离环境；这里的头部查看不需要 `marshal.loads()`。

## 反汇编可靠，反编译仍要核对

先确认工具是否支持样本的 Python 字节码版本，再看控制流和常量。`pycdc` 和 `pycdas` 属于 [Decompyle++ 项目](https://github.com/zrax/pycdc)，分别侧重反编译与反汇编；不是一个叫 Decompyle++ 的工具能补齐另一个工具的所有版本缺口。

对可信的自建代码对象，可以用匹配版本的 [dis 模块](https://docs.python.org/3/library/dis.html) 观察指令。它展示的是解释器相关字节码，不是跨版本稳定的指令集。Python 3.11 起还需考虑内联缓存、跳转和异常表。

反编译结果要按分支条件、异常路径、闭包变量、栈效果逐项对回字节码。工具输出了 Python 文本，不等于恢复出了原作者源码。

## “花指令”先证明无效，再考虑改

原稿按字节模式删除 `LOAD_CONST`、`RETURN_VALUE`、`POP_TOP` 的做法会删掉合法指令，还可能破坏跳转、缓存与异常处理。那段清理代码已经撤下。

更合适的顺序是保留原始字节码，标出基本块入口与异常边，计算指令的栈效果，再判断某个块是否真的不可达。若要修改，还得同步修正偏移和相关表，并在自建样例上验证分支与异常行为。不满足这些条件时，保留注释后的反汇编比一份看起来整齐、实际改变语义的“源码”更有用。
