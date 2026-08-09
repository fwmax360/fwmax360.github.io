---
title: 'ELF 文件格式解析'
description: 'ELF Header、Program Header、Section Header 与加载视图/链接视图的结构梳理。'
pubDate: 2025-07-20
category: 'Binary'
tags: ['ELF', 'Linux', '可执行文件']
---
## ELF

    +--------------------+
    | Elf64_Ehdr         |
    +--------+-----------+
             |
             | --> Program Header Table (e_phoff)
             v
    +--------+-----------+
    | Elf64_Phdr[]       | --> 段 (加载信息)
    +--------+-----------+

             |
             | --> Section Header Table (e_shoff)
             v
    +--------+-----------+
    | Elf64_Shdr[]       | --> 节 (.text, .data 等)
    +--------------------+

    .shstrtab 是节名字符串表，索引由 e_shstrndx 指定

详细一点为

    +----------------------+
    | ELF Header           | → 文件头，描述整个文件
    +----------------------+
    | Program Header Table | → 程序头表，给 Loader 用（段：Segment）
    +----------------------+
    | Section Header Table | → 节头表，给链接器用（节：Section）
    +----------------------+
    | Sections             | → 如 .text, .data, .bss, .rodata 等节内容
    +----------------------+

### ELF Header

    typedef struct {
        unsigned char e_ident[16]; // 魔数、类、数据格式、版本等
        uint16_t      e_type;      // 文件类型，如 ET_EXEC、ET_REL、ET_DYN
        uint16_t      e_machine;   // 架构，如 x86、ARM、AARCH64 等
        uint32_t      e_version;   // 版本，通常为 1
        uint64_t      e_entry;     // 程序入口点虚拟地址（main 函数地址）
        uint64_t      e_phoff;     // 程序头表（Program Header）偏移
        uint64_t      e_shoff;     // 节头表（Section Header）偏移
        uint32_t      e_flags;     // 特定平台的标志位
        uint16_t      e_ehsize;    // ELF 文件头大小
        uint16_t      e_phentsize; // 程序头表中每个条目的大小
        uint16_t      e_phnum;     // 程序头表中的条目数量
        uint16_t      e_shentsize; // 节头表中每个条目的大小
        uint16_t      e_shnum;     // 节头表中的条目数量
        uint16_t      e_shstrndx;  // 节头表中节名字符串表的索引
    } Elf64_Ehdr;

### Program Header

    typedef struct {
        uint32_t p_type;   // 段类型，如 PT_LOAD、PT_DYNAMIC、PT_INTERP
        uint32_t p_flags;  // 段标志，如 PF_X、PF_R、PF_W（执行/读/写）
        uint64_t p_offset; // 段在文件中的偏移
        uint64_t p_vaddr;  // 段加载后的虚拟地址
        uint64_t p_paddr;  // 物理地址，常为0（用于裸机）
        uint64_t p_filesz; // 段在文件中的大小
        uint64_t p_memsz;  // 段在内存中的大小（通常 >= filesz）
        uint64_t p_align;  // 对齐要求
    } Elf64_Phdr;

### Section Header

    typedef struct {
        uint32_t sh_name;      // 节名称在节字符串表中的偏移
        uint32_t sh_type;      // 节类型，如 SHT_PROGBITS、SHT_SYMTAB
        uint64_t sh_flags;     // 节属性，如 SHF_WRITE、SHF_EXECINSTR
        uint64_t sh_addr;      // 节加载到内存中的地址（可执行时）
        uint64_t sh_offset;    // 节在文件中的偏移
        uint64_t sh_size;      // 节大小
        uint32_t sh_link;      // 与节相关的索引（如符号表）
        uint32_t sh_info;      // 附加信息
        uint64_t sh_addralign; // 地址对齐要求
        uint64_t sh_entsize;   // 若节是表格（如符号表），则为表项大小
    } Elf64_Shdr;

### Sections

节名

含义

说明

`.text` 程序代码段 可执行指令 `.data` 已初始化的全局变量 可读写 `.bss` 未初始化的全局变量 占用内存，不占文件空间 `.rodata` 只读数据段 常量、字符串字面量 `.symtab` 符号表 变量和函数名信息 `.strtab` 字符串表 存储名字的实际字符串 `.rel.text` / `.rela.text` 重定位信息 用于链接器进行地址修正

### 在Linux下段不等于节

项目

段（Segment）

节（Section）

作用 加载运行 链接分析 由谁使用 加载器（loader） 编译器、链接器（ld） 描述结构体 `Elf64_Phdr`（Program Header） `Elf64_Shdr`（Section Header） 示例 `.text + .rodata` 合成 PT_LOAD 段 `.text`, `.data`, `.bss`, `.symtab` 等 文件关系 映射的是“段”部分 更细粒度的组织

项目

PE (Windows)

ELF (Linux/Android)

文件头 DOS 头 + NT 头（PE Header） ELF Header 元数据 节头表 Section Header（给链接器） 节头表 Section Header（同样给链接器） 加载数据 映射节（Section） 映射段（Segment） 加载结构 PEB + TEB + heap + stack 无显式 PEB，用户空间构造堆栈和 argv/envp/auxv 加载控制 Windows Loader (ntdll) Linux Loader（`ld.so` 或内核直接加载） 起始执行点 Optional Header → `AddressOfEntryPoint` ELF Header → `e_entry`（入口虚拟地址） 起始函数 CRTStartup → main() `_start()` → libc → main()

读取 ELF Header -\> 读取 Program Header Table -\> 进行重定位（可选） -\> 构造用户栈 -\> 跳转入口点 e_entry

详细一点为：

### 读取 ELF Header

- 验证 Magic：\x7F E L F

- 确认是 32 位还是 64 位

- 找到程序头表（e_phoff）的位置和数量（e_phnum）

### 读取 Program Header Table（段表）

每一个 Elf64_Phdr 描述一个 Segment（段），Loader 会：

- 遍历每个 Program Header

- 找出 p_type == PT_LOAD 的段，加载进内存

- 分配足够内存并将文件中对应 p_offset → p_vaddr 区间拷贝到内存

- 零初始化 .bss 区段（p_memsz \> p_filesz 的部分）


    for (i = 0; i < e_phnum; ++i) {
        if (phdr[i].p_type == PT_LOAD) {
            mmap(phdr[i].p_vaddr, phdr[i].p_memsz, phdr[i].p_flags, ...);
            memcpy(phdr[i].p_vaddr, file + phdr[i].p_offset, phdr[i].p_filesz);
        }
    }

### 构造用户栈

内核负责构造初始栈，包括：

- argc、argv\[\]

- envp\[\]

- auxv\[\]（用于传递系统级信息，如系统页大小、UID、AT_PHDR 位置等）

### 跳转入口点 e_entry

内核最终设置好寄存器：

- rsp 指向用户栈顶

- rip 跳转至 e_entry 处（通常是 \_start）

- \_start → \_\_libc_start_main(main, …) → main()
