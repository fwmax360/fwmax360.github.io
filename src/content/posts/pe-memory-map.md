---
title: 'PE 文件内存映射详解'
description: 'Windows 如何把 PE 从磁盘映射进进程地址空间：DOS/NT 头、节区与加载过程。'
pubDate: 2025-07-22
category: 'Binary'
tags: ['PE', 'Windows', '可执行文件']
---
## 操作系统_map原理

首先要了解到程序是如何执行的(PE为例)

1.  从磁盘读取 PE头部
2.  读取DOS头中的 `IMAGE_DOS_HEADER.e_lfanew` 定位到 `PE` 文件头(又叫`NT`)
3.  确认 `PE\0\0` 签名，读取 NT 头
4.  从 `OptionalHeader`(可选头) 中获取 `AddressOfEntryPoint` 和 `ImageBase`
5.  加载节/段（.text/.data 等）到内存的 `ImageBase` 起始处
6.  构造 `PEB`(存放当前进程运行时信息)、`TEB`(每个线程的信息，如栈地址、TLS索引等)、堆、环境变量等运行时环境
7.  最终 跳转到 `ImageBase + EntryPoint`(start) 开始执行程序


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

- 所有内存分配、映射都必须按页对齐（即地址是 0x1000 的整数倍，大小是页的整数倍）
  好处：

- 实现虚拟内存（虚实地址分离）；

- 支持按需分页、页面保护；

- 提高内存管理效率（内核只需管理一张页表）。

像DOS头 + NT头 + 节表，位于文件开头，约占前 0x200 字节，对其访问原因为在 .text段(不一定是text)的 VirtualAddress = 0x1000，之前的空间（0x0~0xFFF）仍然可以装载 DOS头与NT头，操作系统在加载时，会 从文件开头开始按页（通常4KB）加载整个 PE 文件头所在区域，即从文件偏移 0 到 .text 节之前，额外映射一页内存

所以，DOS 头 + PE 头 + 节表 = 全部加载在 ImageBase 开头（通常 0x400000）起始的内存页中

### 段是如何映射的

首先得知道代码数据是按段(节)来存放的，其中段按照加载的节表来找到对应位置，而节表为

    typedef struct _IMAGE_SECTION_HEADER {
        BYTE  Name[8];             // 节名
        DWORD VirtualSize;         // 节在内存中的大小（对齐后）
        DWORD VirtualAddress;      // 节在内存中的RVA（相对ImageBase）
        DWORD SizeOfRawData;       // 节在文件中的实际大小（磁盘上）
        DWORD PointerToRawData;    // 节在文件中的偏移地址
        ...
    } IMAGE_SECTION_HEADER;

从而找到`VirtualAddress`，又因为在可选头中读取到`ImageBase`，两者相加，但此时仍然要考虑一件事，即考虑页对齐，这样能快速访问

    #include <stdio.h>
    #include <stdlib.h>
    #include <stdint.h>
    #include <string.h>
    #include <windows.h>

    #define PAGE_ALIGN 0x1000

    // 对齐函数：向上对齐到align倍数
    DWORD align_up(DWORD val, DWORD align) {
        return (val + align - 1) & ~(align - 1);
    }

    // 显示节的权限
    void show_section_permissions(DWORD characteristics) {
        printf("    Permissions: ");
        if (characteristics & IMAGE_SCN_MEM_EXECUTE) printf("X ");
        if (characteristics & IMAGE_SCN_MEM_READ)    printf("R ");
        if (characteristics & IMAGE_SCN_MEM_WRITE)   printf("W ");
        printf("\n");
    }

    int main() {
        FILE *fp = fopen("example.exe", "rb");
        if (!fp) {
            perror("Open failed");
            return 1;
        }

        // 读取 DOS Header
        IMAGE_DOS_HEADER dos;
        fread(&dos, sizeof(dos), 1, fp);
        if (dos.e_magic != IMAGE_DOS_SIGNATURE) {
            printf("[-] Not a valid MZ file.\n");
            fclose(fp);
            return 1;
        }

        // 定位并读取 PE Header
        fseek(fp, dos.e_lfanew, SEEK_SET);
        IMAGE_NT_HEADERS nt;
        fread(&nt, sizeof(nt), 1, fp);
        if (nt.Signature != IMAGE_NT_SIGNATURE) {
            printf("[-] Not a valid PE file.\n");
            fclose(fp);
            return 1;
        }

        WORD num_sections = nt.FileHeader.NumberOfSections;
        DWORD image_size = nt.OptionalHeader.SizeOfImage;
        DWORD image_base = nt.OptionalHeader.ImageBase;

        printf("[*] Sections: %d\n", num_sections);
        printf("[*] ImageBase: 0x%08X\n", image_base);
        printf("[*] SizeOfImage: 0x%08X bytes\n", image_size);
        printf("[*] EntryPoint RVA: 0x%08X\n", nt.OptionalHeader.AddressOfEntryPoint);

        // 分配模拟的进程内存
        uint8_t *memory = (uint8_t *)malloc(image_size);
        if (!memory) {
            perror("malloc");
            fclose(fp);
            return 1;
        }
        memset(memory, 0, image_size);

        // 加载 headers（含 DOS头、NT头、节表）
        DWORD headers_size = align_up(nt.OptionalHeader.SizeOfHeaders, PAGE_ALIGN);
        fseek(fp, 0, SEEK_SET);
        fread(memory, 1, headers_size, fp);
        printf("[+] Mapped PE Headers to memory [0x%08X ~ 0x%08X]\n",
               image_base, image_base + headers_size - 1);

        // 定位节表
        DWORD section_table_offset = dos.e_lfanew + sizeof(DWORD) + sizeof(IMAGE_FILE_HEADER) + nt.FileHeader.SizeOfOptionalHeader;
        fseek(fp, section_table_offset, SEEK_SET);

        for (int i = 0; i < num_sections; i++) {
            IMAGE_SECTION_HEADER section;
            fread(&section, sizeof(section), 1, fp);

            printf("\n[*] Section: %.*s\n", 8, section.Name);
            printf("    VirtualAddress: 0x%08X\n", section.VirtualAddress);
            printf("    VirtualSize   : 0x%08X\n", section.Misc.VirtualSize);
            printf("    RawOffset     : 0x%08X\n", section.PointerToRawData);
            printf("    RawSize       : 0x%08X\n", section.SizeOfRawData);
            show_section_permissions(section.Characteristics);

            if (section.SizeOfRawData == 0)
                continue;

            // 读取节原始数据
            uint8_t *section_data = (uint8_t *)malloc(section.SizeOfRawData);
            if (!section_data) {
                perror("section malloc");
                break;
            }
            fseek(fp, section.PointerToRawData, SEEK_SET);
            fread(section_data, 1, section.SizeOfRawData, fp);

            // 拷贝到模拟内存（ImageBase + VirtualAddress）
            memcpy(memory + section.VirtualAddress, section_data, section.SizeOfRawData);
            printf("    [=] Loaded at 0x%08X - 0x%08X\n",
                   image_base + section.VirtualAddress,
                   image_base + section.VirtualAddress + section.SizeOfRawData - 1);

            free(section_data);
        }

        printf("\n[!] Simulated EntryPoint @ 0x%08X (VA: %p)\n",
               image_base + nt.OptionalHeader.AddressOfEntryPoint,
               memory + nt.OptionalHeader.AddressOfEntryPoint);

        free(memory);
        fclose(fp);
        return 0;
    }

最后得到

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
