---
title: 'Hook 大法'
description: 'IAT Hook、Inline Hook、代码覆写、Frida 与 ptrace 等常见 Hook 方式原理对比与实现。'
pubDate: 2025-07-26
updatedDate: 2026-10-11
category: 'Binary'
tags: ['Hook', 'IAT', 'Inline Hook']
---

## 常见Hook方式原理对比

### 1. IAT Hook（导入表劫持）

- 原理：修改PE文件的导入地址表（IAT），将API函数指针替换为自定义函数地址。
- 流程：定位IAT表 → 找到目标API指针 → 修改为自定义函数地址。
- 优点：实现简单，适合API劫持，稳定。
- 缺点：仅能hook导入API，易被检测，无法hook内部函数。

### 2. Inline Hook（内联劫持）

- 原理：直接修改目标函数机器码开头，写入jmp跳转到自定义代码（通常为5字节jmp rel32或12字节jmp abs）。
- 流程：保存原始指令 → 修改入口为jmp → 自定义代码执行后可跳回原函数剩余部分（trampoline）。
- 优点：可hook任意函数，灵活，常用于逆向和CTF。
- 缺点：需处理指令对齐、trampoline，易被检测，破坏原始代码段。

### 3. Code Overwrite Hook（代码覆盖劫持）

- 原理：覆盖任意地址的机器码为jmp或call，劫持执行流到自定义代码。
- 流程：定位目标地址 → 保存原始指令 → 覆盖为jmp/call → 自定义代码执行后可跳回。
- 优点：可hook任意代码位置，极为灵活，适合逆向分析、破解。
- 缺点：破坏性强，需手动处理指令边界，易引发崩溃。

### 4. Frida Hook

- 原理：基于Frida动态插桩框架，通过注入JS脚本，动态修改目标进程内存、函数实现或API行为。
- 流程：Frida注入目标进程 → JS脚本定位并hook函数 → 动态修改参数/返回值/行为。
- 优点：跨平台、无需重启进程、支持动态分析、逆向、自动化。
- 缺点：需依赖Frida环境，易被反检测，hook粒度受限于Frida API。

### 5. Ptrace Hook

- 原理：利用Linux的ptrace系统调用，父进程控制/调试子进程，动态修改其内存、寄存器、代码，实现hook。
- 流程：父进程ptrace attach目标 → 读写内存/寄存器 → 注入shellcode或修改指令 → 实现劫持。
- 优点：无需修改目标文件，适合动态调试、逆向、自动化分析。
- 缺点：仅限Linux，操作复杂，性能开销大，易被检测。

### 总结对比表

方式

典型场景

优点

缺点

IAT Hook API劫持 稳定，易实现 仅API，易检测 Inline Hook 任意函数/逆向 灵活，常用 破坏性，需trampoline CodeOverwrite 任意代码/破解 极灵活，任意地址 破坏性强，易崩溃 Frida Hook 动态分析/自动化 跨平台，动态，强大 依赖环境，易反检测 Ptrace Hook Linux调试/逆向 无需改文件，动态 仅Linux，复杂

实际逆向和CTF中，常结合多种hook手段，选择最适合场景的方式。

## HOOK

### IAT HOOK

主要通过IAT表实现

#### 原理

IAT表存储着当前这个模块所用到的所有api函数地址，并且这些api函数在IAT表里的位置都是挨在一起的，因此只要将这些函数的地址修改成指向我们自行设置的函数地址，就能实现所谓的IAT Hook

具体操作原理是通过GetModuleHandle读取该exe加载到内存中的地址，因为Dos中存放PE头的偏移量，IAT表偏移量存放在PE中，因此我们通过访问PE中的OptionalHeader中的DataDirectory，就能读取出import表偏移量，通过一开始的加载到内存中的地址+偏移量 == 最终地址，就可以找到所调用的函数、系统调用、API等。因为只可读，所以得通过VirtualProtect实现改权限，更改指向地方

    #include <windows.h>
    #include <stdio.h>
    #include <stdint.h>

    typedef int (WINAPI *PfnMsgA)(HWND, LPCSTR, LPCSTR, UINT);
    PfnMsgA g_OldMsgBox = NULL;

    int WINAPI MyMessageBox(HWND hWnd, LPCSTR lpText, LPCSTR lpCaption, UINT uType) {
        return g_OldMsgBox(hWnd, "HOOK succses!", lpCaption, uType);
    }

    void SetIATHook() {
        HMODULE hMod = GetModuleHandle(NULL);
        if (!hMod) return;

        uint8_t *base = (uint8_t*)hMod;
        IMAGE_DOS_HEADER *dos = (IMAGE_DOS_HEADER*)base;
        IMAGE_NT_HEADERS *nt = (IMAGE_NT_HEADERS*)(base + dos->e_lfanew);
        DWORD importRVA = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT].VirtualAddress;
        if (!importRVA) return;

        IMAGE_IMPORT_DESCRIPTOR *importDesc = (IMAGE_IMPORT_DESCRIPTOR*)(base + importRVA);

        for (; importDesc->Name; importDesc++) {
            const char *dllName = (const char*)(base + importDesc->Name);
            if (_stricmp(dllName, "user32.dll") != 0) continue;

            IMAGE_THUNK_DATA *thunk = (IMAGE_THUNK_DATA*)(base + importDesc->FirstThunk);
            for (; thunk->u1.Function; thunk++) {
                FARPROC *funcPtr = (FARPROC*)&thunk->u1.Function;
                if (*funcPtr == (FARPROC)MessageBoxA) {
                    DWORD oldProtect;
                    VirtualProtect(funcPtr, sizeof(void*), PAGE_EXECUTE_READWRITE, &oldProtect);//执行、读、写
                    g_OldMsgBox = (PfnMsgA)*funcPtr;
                    *funcPtr = (FARPROC)MyMessageBox;
                    VirtualProtect(funcPtr, sizeof(void*), oldProtect, &oldProtect);
                    printf("[+] IAT Hook succses: MessageBoxA -> MyMessageBox\n");
                    return;
                }
            }
        }
    }

    int main() {
        SetIATHook();
        MessageBoxA(NULL, "abcde", "Hello_world", MB_OK);
        return 0;
    }

在ida中打开发现为

    int __cdecl main(int argc, const char **argv, const char **envp)
    {
      _main(argc, argv, envp);
      SetIATHook();
      MessageBoxA(0i64, "abcde", "Hello_world", 0);
      return 0;
    }

很明显哪怕去符号化也很容易找到，因此，我们可以试试放到start里，也就是初始化程序地方

在MSVC下可以在开头加上下面的

    #pragma section(".CRT$XCU", read)
    typedef void(*PVFV)(void);
    __declspec(allocate(".CRT$XCU")) static PVFV pInitHook = SetIATHook;

`.CRT$XCU` 段是 Windows CRT 初始化代码用来调用构造函数的特殊段，程序启动时，CRT会自动遍历.CRT\$XCU段里所有函数指针并调用它们

gcc mingw64为

    __attribute__((constructor))
    void init_hook() {
        SetIATHook();
    }

在gcc下使用\_\_attribute\_\_((constructor))，编译器会将这个函数的指针放入可执行文件的特殊段，这个特殊段会被运行时启动代码（CRT 初始化代码）扫描，并在程序正式进入 main() 前调用这些函数

    main为
    int __cdecl main(int argc, const char **argv, const char **envp)
    {
      _main(argc, argv, envp);
      MessageBoxA(0i64, "abcde", "Hello_world", 0x30u);
      return 0;
    }
    对init x为
    Direction   Type    Address Text
    Up    o   .pdata:0000000000405078 RUNTIME_FUNCTION <rva SetIATHook, rva Init, rva stru_406084>
        o   .pdata:0000000000405084 RUNTIME_FUNCTION <rva Init, rva main, rva stru_406090>
    上面为正常的，但并不是hook进去的，而是链接器将它纳入 PE 文件的数据段的一部分，运行时由 C Runtime 执行，是 链接期静态插入的

并且比较难寻，调用地点在

    if ( i )
    {
      v1 = (void (**)(void))&(*refptr___CTOR_LIST__)[i];
      v2 = &(*refptr___CTOR_LIST__)[i - (unsigned __int64)(i - 1) - 1];
      do
        (*v1--)();
      while ( v1 != (void (**)(void))v2 );
    }

这，`__CTOR_LIST__` 存放所有构造函数地址的数组，通常是逆序

解决方法为三种

    for seg_ea in Segments():
        segname = get_segm_name(seg_ea)
        print(segname)

查对应的dll和段。

也可以查看是否存在`___CTOR_LIST__`

最简单也是最常用的就x，查调用就可

完整代码为

    #include <windows.h>
    #include <stdio.h>
    #include <stdint.h>

    typedef int (WINAPI *PfnMsgA)(HWND, LPCSTR, LPCSTR, UINT);
    PfnMsgA g_OldMsgBox = NULL;

    // 自定义 Hook 函数
    int WINAPI MyMessageBox(HWND hWnd, LPCSTR lpText, LPCSTR lpCaption, UINT uType) {
        return g_OldMsgBox(hWnd, "HOOK succses!", lpCaption, uType);
    }

    // 设置 IAT Hook
    void SetIATHook() {
        HMODULE hMod = GetModuleHandle(NULL);
        if (!hMod) return;

        uint8_t *base = (uint8_t*)hMod;
        IMAGE_DOS_HEADER *dos = (IMAGE_DOS_HEADER*)base;
        IMAGE_NT_HEADERS *nt = (IMAGE_NT_HEADERS*)(base + dos->e_lfanew);
        DWORD importRVA = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_IMPORT].VirtualAddress;
        if (!importRVA) return;

        IMAGE_IMPORT_DESCRIPTOR *importDesc = (IMAGE_IMPORT_DESCRIPTOR*)(base + importRVA);
    /*直接修改dll，类似InlineHook，详细的请看Inlinehook.c
        FARCPROC *funcPtr;
        *funcPtr = GetProcAddress(GetModuleHandleA("user32.dll"), "MessageBoxA");
        if (!funcPtr) {
            printf("[-] Cannot find MessageBoxA\n");
            return;
        }
        DWORD oldProtect;
        VirtualProtact(funcPtr, sizeof(void*), PAGE_EXECUTE_READWRITE, &oldProtect);//执行、读、写
        g_OldMsgBox = (PfnMsgA)*funcPtr;
        WriteJumpInstruction(pFunc, MyMessageBox);
        VirtualProtect(funcPtr, sizeof(void*), oldProtect, &oldProtect);
        printf("[+] IAT Hook succses: MessageBoxA -> MyMessageBox\n");
        return;
    */
        for (; importDesc->Name; importDesc++) {
            const char *dllName = (const char*)(base + importDesc->Name);
            if (_stricmp(dllName, "user32.dll") != 0) continue;

            IMAGE_THUNK_DATA *thunk = (IMAGE_THUNK_DATA*)(base + importDesc->FirstThunk);
            for (; thunk->u1.Function; thunk++) {
                FARPROC *funcPtr = (FARPROC*)&thunk->u1.Function;
                if (*funcPtr == (FARPROC)MessageBoxA) {
                    DWORD oldProtect;
                    VirtualProtect(funcPtr, sizeof(void*), PAGE_EXECUTE_READWRITE, &oldProtect);//执行、读、写
                    g_OldMsgBox = (PfnMsgA)*funcPtr;
                    *funcPtr = (FARPROC)MyMessageBox;
                    VirtualProtect(funcPtr, sizeof(void*), oldProtect, &oldProtect);
                    printf("[+] IAT Hook succses: MessageBoxA -> MyMessageBox\n");
                    return;
                }
            }
        }
    }

    __attribute__((constructor))
    void Init() {
        SetIATHook();
        printf("[+] IAT Hook initialized.\n");
    }

    int main() {
        MessageBoxA(NULL, "abcde", "Hello_world", MB_ICONWARNING);
        return 0;
    }

### Inline Hook：覆盖字节之前先处理指令

Inline Hook 改的是函数入口机器码，不是 IAT 指针。x86 的 `E8` 是相对 call，`E9` 才是相对 jmp，二者还受目标距离限制。

原稿三个手写跳板示例存在明确错误，已撤下完整安装代码：

- 固定复制 12 或 16 字节可能截断指令；被搬走的 RIP-relative 指令和相对分支也需要重定位。
- 全局 `BYTE trampoline[]` 不保证拥有执行权限。代码页保护修改、错误处理和恢复也不能省略。
- 间接跳转示例把 RIP 位移写成 8，却把地址放在 `src+9`；7 字节指令之后算出的有效地址是 `src+15`，与数据位置不一致。另一个例子覆盖 17 字节，却只保存和恢复 12 字节。
- call/pop 示例里 `E8` 的位移 5 会落到 `src+10`，不是紧随 call 的 `src+5`；返回地址基准、add 编码长度和目标范围还被混淆。

单纯改大 `HOOK_LEN` 解决不了这些问题。需要先反汇编完整指令，直到覆盖长度足够，再构造可执行跳板，重定位被搬走的指令，校验目标地址与调用约定；安装和撤销还涉及线程同步与指令缓存刷新。

要做可复现的演示，可以从 [Microsoft Detours 的官方用法](https://github.com/microsoft/Detours/wiki/Using-Detours) 和它随仓库提供的样例开始：记录工具版本和编译选项，通过事务安装与撤销，对照原函数、替代函数与跳板的行为。本文没有在 Windows 环境重新执行这些样例，故不把源码示意写成“已验证成功”。

前面的 IAT 示例也只是当前进程、普通导入表的演示；它不覆盖延迟导入、`GetProcAddress` 获取的指针或所有其他模块。MinGW 的 constructor 属性与 MSVC 的 `.CRT$XCU` 不是一套可直接混用的编译语法，`VirtualProtect` 等返回值必须检查。初始化放在 main 之前也不等于静态分析找不到它。
