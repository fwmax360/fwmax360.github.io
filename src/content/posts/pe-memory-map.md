---
title: 'PE 文件内存映射详解'
description: 'Windows 如何把 PE 从磁盘映射进进程地址空间：DOS/NT 头、节区与加载过程。'
pubDate: 2025-07-22
updatedDate: 2026-10-11
category: 'Binary'
tags: ['PE', 'Windows', '可执行文件']
---
## 操作系统_map原理

首先要了解到程序是如何执行的(PE为例)

1.  从磁盘读取 PE头部
2.  读取DOS头中的 `IMAGE_DOS_HEADER.e_lfanew` 定位到 `PE` 文件头(又叫`NT`)
3.  确认 `PE\0\0` 签名，读取 NT 头
4.  从 `OptionalHeader`(可选头) 中获取 `AddressOfEntryPoint` 和 `ImageBase`
5.  加载节/段（.text/.data 等）到实际加载基址加各节 `VirtualAddress` 的位置
6.  构造 `PEB`(存放当前进程运行时信息)、`TEB`(每个线程的信息，如栈地址、TLS索引等)、堆、环境变量等运行时环境
7.  加载器还要处理导入、必要的重定位及 TLS 初始化，再把控制权交给实际加载基址加入口 RVA；入口并不等于 main


    [IMAGE_DOS_HEADER]          // MS-DOS头
           ↓
    [Stub Code]                 // DOS 提示程序 ("This program cannot be run...")
           ↓
    [IMAGE_NT_HEADERS]          // 包含 "PE\0\0" 签名
        ├── [IMAGE_FILE_HEADER]         // 文件头
        └── [IMAGE_OPTIONAL_HEADER]     // 可选头，包括入口点、ImageBase等
           ↓
    [IMAGE_SECTION_HEADER[0]]   // 节表：.text 节信息
    [IMAGE_SECTION_HEADER[1]]   // 节表：.data 节信息
    [IMAGE_SECTION_HEADER[2]]   // 节表：.rdata 节信息
    ...
           ↓
    [.text 节数据（代码段）]
    [.data 节数据（数据段）]
    [.rdata 节数据（只读数据）]

而我们又知道PE简单能分为PE头和段，PE又包括DOS、NT、节表等

### PE头文件如何映射

首先我们要知道PE文件映射的本质：并不是直接把整个文件`memcpy`到内存中，只覆盖了文件中的一部分内容

在这之前我们要了解什么是页

页（Page） 是操作系统虚拟内存管理中的基本单位：

- 在 Windows（和大多数现代操作系统）中，一个页的大小通常是 4KB（0x1000）

- 页保护和映射涉及页对齐，但普通堆对象不要求每个对象页对齐。页大小用系统接口获取，不要与分配粒度或 PE 的 SectionAlignment 混用
  好处：

- 实现虚拟内存（虚实地址分离）；

- 支持按需分页、页面保护；

- 提高内存管理效率（内核只需管理一张页表）。

头部大小由 `SizeOfHeaders` 描述，映像大小由 `SizeOfImage` 描述。常见文件的第一节 RVA 为 `0x1000`，不代表系统总会“额外映射一页”。头部和节各按格式及系统映射规则处理，布局数值应从文件读取。

PE 可选头的 `ImageBase` 是首选地址；ASLR 或地址占用会使实际加载基址不同。后续地址应使用“实际基址 + RVA”。[Microsoft PE 格式说明](https://learn.microsoft.com/en-us/windows/win32/debug/pe-format) 区分了这些字段。

### 段是如何映射的

首先得知道代码数据是按段(节)来存放的，其中段按照加载的节表来找到对应位置，而节表为

    typedef struct _IMAGE_SECTION_HEADER {
        BYTE  Name[8];             // 节名
        DWORD VirtualSize;         // 节在内存中的大小，字段本身不保证已按页对齐
        DWORD VirtualAddress;      // 节在内存中的RVA（相对ImageBase）
        DWORD SizeOfRawData;       // 节在文件中的实际大小（磁盘上）
        DWORD PointerToRawData;    // 节在文件中的偏移地址
        ...
    } IMAGE_SECTION_HEADER;

从而找到`VirtualAddress`，又因为在可选头中读取到`ImageBase`，两者相加，但此时仍然要考虑一件事，即考虑页对齐，这样能快速访问

原稿的 C 程序把宿主机的 `IMAGE_NT_HEADERS` 用在任意文件上，并用 `DWORD` 保存可能是 64 位的 ImageBase；还缺少文件范围与目标缓冲区范围检查。下面改成只读结构的 Python 示例：显式区分 PE32 / PE32+，检查头部和节数据边界，不加载或执行文件。

```python
import struct

def inspect_pe(data: bytes) -> dict:
    def check(offset, size):
        if offset < 0 or size < 0 or offset + size > len(data):
            raise ValueError("文件范围越界")
    def u16(offset):
        check(offset, 2)
        return struct.unpack_from("<H", data, offset)[0]
    def u32(offset):
        check(offset, 4)
        return struct.unpack_from("<I", data, offset)[0]

    check(0, 64)
    if data[:2] != b"MZ":
        raise ValueError("缺少 MZ")
    nt = u32(0x3c)
    check(nt, 24)
    if data[nt:nt + 4] != b"PE\0\0":
        raise ValueError("缺少 PE 签名")
    count, opt_size = u16(nt + 6), u16(nt + 20)
    opt = nt + 24
    check(opt, opt_size)
    if opt_size < 64:
        raise ValueError("可选头不足以读取本文字段")
    magic = u16(opt)
    if magic == 0x10b:
        image_base = u32(opt + 28)
    elif magic == 0x20b:
        image_base = struct.unpack_from("<Q", data, opt + 24)[0]
    else:
        raise ValueError("不是本文处理的 PE32 / PE32+")
    image_size, headers_size = u32(opt + 56), u32(opt + 60)
    check(0, headers_size)
    table = opt + opt_size
    check(table, count * 40)
    if headers_size < table + count * 40 or headers_size > image_size:
        raise ValueError("头部与映像大小不一致")
    sections = []
    for i in range(count):
        pos = table + i * 40
        virtual_size, rva, raw_size, raw_offset = struct.unpack_from("<4I", data, pos + 8)
        if raw_size:
            check(raw_offset, raw_size)
        if rva + max(virtual_size, raw_size) > image_size:
            raise ValueError("节超出声明的映像范围")
        sections.append({"name": data[pos:pos + 8].rstrip(b"\0"),
                         "rva": rva, "virtual_size": virtual_size,
                         "raw_size": raw_size, "raw_offset": raw_offset})
    return {"magic": magic, "preferred_image_base": image_base,
            "image_size": image_size, "sections": sections}
```

它只校验和展示本文用到的范围，不是 Windows 加载器的完整有效性判定：数据目录、节对齐、重叠区间、重定位、导入、TLS 和页面保护尚未实现。读出入口地址不等于已经执行到入口。

下面只是资源关系示意，PEB、TEB、堆与栈没有这种固定的高低地址排序：

    高地址
    ┌──────────────────────────────┐
    │   栈 Stack（每线程一个）       │
    ├──────────────────────────────┤
    │   TEB（每线程一个）           │
    ├──────────────────────────────┤
    │   PEB                         │
    ├──────────────────────────────┤
    │   堆 Heap                     │
    ├──────────────────────────────┤
    │   映像区 ImageBase（PE文件）  │
    │   ├─ DOS Header               │
    │   ├─ NT Header                │
    │   ├─ 节表 SectionHeaders      │
    │   ├─ .text / .data / .rdata...│
    └──────────────────────────────┘
    低地址
