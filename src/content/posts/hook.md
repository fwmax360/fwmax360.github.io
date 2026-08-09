---
title: 'Hook 大法'
description: 'IAT Hook、Inline Hook、代码覆写、Frida 与 ptrace 等常见 Hook 方式原理对比与实现。'
pubDate: 2025-07-26
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

### Inline Hook

核心出装：jmp

相比IAThook，修改目标从导入表(IAT)中的函数指针变成了函数本身的机器代码，也是CTF中常用操作

具体操作为
通过更改操作码实现，首先想改，就需要VirtualProtect，再者将原来的指向想要的，一般通过E8实现，需要注意的是这种覆盖会导致原来的出问题，所以为了后续再调用，可以trampoline储存，并且为高效利用内存，所以上面改多少，建立多少

代码为

    #include <windows.h>
    #include <stdio.h>
    #include <stdint.h>

    #define HOOK_LEN 12
    #define JMP_ABS_LEN 12

    void function1(uint8_t *data, size_t len) {
        for (size_t i = 0; i < len; i++)
            data[i] ^= 0x11;
    }

    void function2(uint8_t *data, size_t len) {
        for (size_t i = 0; i < len; i++)
            data[i] ^= 0x22;
    }

    BYTE originalBytes[HOOK_LEN] = {0};
    BYTE trampoline[HOOK_LEN + JMP_ABS_LEN] = {0};
    void function1hook(uint8_t *data, size_t len) {
        void (*trampolineFunc)(uint8_t *, size_t) = (void *)trampoline;
        trampolineFunc(data, len);
    }

    void WriteAbsoluteJump(BYTE *src, void *dst) {
        src[0] = 0x48;
        src[1] = 0xB8;
        *(void **)(src + 2) = dst;
        src[10] = 0xFF;
        src[11] = 0xE0;
    }

    void InstallHook() {
        DWORD oldProtect;
        memcpy(originalBytes, function1, HOOK_LEN);
        memcpy(trampoline, originalBytes, HOOK_LEN);
        WriteAbsoluteJump(trampoline + HOOK_LEN, (BYTE *)function1 + HOOK_LEN);
        VirtualProtect(function1, HOOK_LEN, PAGE_EXECUTE_READWRITE, &oldProtect);
        WriteAbsoluteJump((BYTE *)function1, function2);
        VirtualProtect(function1, HOOK_LEN, oldProtect, &oldProtect);
    }

    void UninstallHook() {
        DWORD oldProtect;
        VirtualProtect(function1, HOOK_LEN, PAGE_EXECUTE_READWRITE, &oldProtect);
        memcpy(function1, originalBytes, HOOK_LEN);
        VirtualProtect(function1, HOOK_LEN, oldProtect, &oldProtect);
    }

    __attribute__((constructor))
    void SetupHook() {
        InstallHook();
        printf("[+] Hook installed: function1 -> function2\n");
    }
    int main() {
        uint8_t data1[] = "abcdefg";
        function1(data1, sizeof(data1) - 1);
        printf("function: %s\n", data1);

        uint8_t data2[] = "abcdefg";
        function1hook(data2, sizeof(data2) - 1);
        printf("通过 trampoline 执行原始 function1: %s\n", data2);
        return 0;
    }

在ida中静态为0x11，动态为

    .text:0000000000401550 public function1
    .text:0000000000401550 ; __int64 __fastcall function1(_QWORD, _QWORD)
    .text:0000000000401550 function1 db  48h ; H                   ; CODE XREF: main+27↓p
    .text:0000000000401550                                         ; DATA XREF: InstallHook+8↓r
    .text:0000000000401550                                         ; InstallHook+64↓o
    .text:0000000000401550                                         ; InstallHook+7B↓o
    .text:0000000000401550                                         ; InstallHook+99↓o
    .text:0000000000401550                                         ; UninstallHook+1A↓o
    .text:0000000000401550                                         ; UninstallHook+31↓w
    .text:0000000000401550                                         ; UninstallHook+56↓o
    .text:0000000000401550                                         ; .pdata:000000000040506C↓o
    .text:0000000000401550
    .text:0000000000401551 db 0B8h
    .text:0000000000401551
    .text:0000000000401554 db  40h ; @
    .text:0000000000401554
    .text:0000000000401558 loc_401558 db    0                      ; DATA XREF: InstallHook+16↓r
    .text:0000000000401558                                         ; UninstallHook+3E↓w
    .text:0000000000401558
    .text:000000000040155C

原因很简单，因为不是常规函数开头且修改了代码段内容，所以IDA 会显示为 db 形式，c一下就好了

C、p一下为

    __int64 function1()
    {
      return function2();
    }

就恢复了
打题时仍然只需要X就能查到了，那主播主播，有没有pro版本

当然是有的， 间接跳转、动态计算跳转地址、 自解码、 汇编混淆：动态构造跳转目标都是CTF中T1级别的方法

间接跳转

    jmp rax
    jmp [rsp]
    jmp [mem]

    例如：
    WriteAbsoluteJump:
        mov rax, dst
        jmp rax

动态计算跳转地址

    void (*func)() = ...;
    func();  // 动态跳转

    mov rax, [address]
    call rax

自解码

    DWORD old;
    VirtualProtect(target, len, PAGE_EXECUTE_READWRITE, &old);
    memcpy(target, shellcode, len);

汇编混淆

    mov ecx, 0x1000
    xor ecx, 0x1234
    jmp rcx

稍微对其混淆一下

    #include <windows.h>
    #include <stdio.h>
    #include <stdint.h>

    #define HOOK_LEN 12
    #define JMP_ABS_LEN 12

    void WriteAbsoluteJump(BYTE *src, void *dst);
    void WriteObfuscatedJump(BYTE *src, void *dst);

    void function1(uint8_t *data, size_t len) {
        for (size_t i = 0; i < len; i++)
            data[i] ^= 0x11;
    }

    void function2(uint8_t *data, size_t len) {
        for (size_t i = 0; i < len; i++)
            data[i] ^= 0x22;
    }

    BYTE originalBytes[HOOK_LEN] = {0};
    BYTE trampoline[HOOK_LEN + JMP_ABS_LEN] = {0};

    void *g_hidden_target = NULL;

    void function1hook(uint8_t *data, size_t len) {
        void (*trampolineFunc)(uint8_t *, size_t) = (void *)trampoline;
        trampolineFunc(data, len);
    }

    void WriteHiddenJump(BYTE *src, void *dst) {
        /*
            mov rax, [rip+0]     ; 7 bytes
            jmp rax              ; 2 bytes
            (8 byte地址)
            总共 17 字节

            rax <- *(rip+8) → jmp rax
        */

        src[0] = 0x48;
        src[1] = 0x8B;
        src[2] = 0x05;  // ModRM: RIP-relative
        *(int32_t *)(src + 3) = 8; // offset from RIP to addr
        src[7] = 0xFF;
        src[8] = 0xE0;

        *(void **)(src + 9) = dst; // 存储真正跳转地址
    }

    void InstallHook() {
        DWORD oldProtect;
        memcpy(originalBytes, function1, HOOK_LEN);
        memcpy(trampoline, originalBytes, HOOK_LEN);
        WriteAbsoluteJump(trampoline + HOOK_LEN, (BYTE *)function1 + HOOK_LEN);
        //pro地方
        g_hidden_target = function2;

        // 写入 hook（使用间接跳转）
        VirtualProtect(function1, 17, PAGE_EXECUTE_READWRITE, &oldProtect);
        WriteHiddenJump((BYTE *)function1, g_hidden_target);
        VirtualProtect(function1, 17, oldProtect, &oldProtect);
    }

    void UninstallHook() {
        DWORD oldProtect;
        VirtualProtect(function1, HOOK_LEN, PAGE_EXECUTE_READWRITE, &oldProtect);
        memcpy(function1, originalBytes, HOOK_LEN);
        VirtualProtect(function1, HOOK_LEN, oldProtect, &oldProtect);
    }

    void WriteAbsoluteJump(BYTE *src, void *dst) {
        src[0] = 0x48;
        src[1] = 0xB8;
        *(void **)(src + 2) = dst;
        src[10] = 0xFF;
        src[11] = 0xE0;
    }

    __attribute__((constructor))
    void SetupHook() {
        InstallHook();
        printf("[+] Hook installed: function1 -> function2 (via hidden jump)\n");
    }

    int main() {
        uint8_t data1[] = "abcdefg";
        function1(data1, sizeof(data1) - 1);
        printf("function1 (hooked): %s\n", data1);

        uint8_t data2[] = "abcdefg";
        function1hook(data2, sizeof(data2) - 1);
        printf("trampoline 原始 function1: %s\n", data2);

        return 0;
    }

然而X后仔细观察仍然会轻松发现

那只能启动promax版本

核心出装

    function1:
        call label
    label:
        pop rax
        add rax, offset
        jmp rax

这样不产生明确 xref，代码为

    #include <windows.h>
    #include <stdio.h>
    #include <stdint.h>

    #define HOOK_LEN 16  // call+pop+jmp 需要大约16字节
    #define TRAMPOLINE_LEN (HOOK_LEN + 12)

    void WriteAbsoluteJump(BYTE *src, void *dst);
    void WriteObfuscatedJump(BYTE *src, void *dst);

    void function1(uint8_t *data, size_t len) {
        for (size_t i = 0; i < len; i++)
            data[i] ^= 0x11;
    }

    void function2(uint8_t *data, size_t len) {
        for (size_t i = 0; i < len; i++)
            data[i] ^= 0x22;
    }

    BYTE originalBytes[HOOK_LEN] = {0};
    BYTE trampoline[TRAMPOLINE_LEN] = {0};

    void function1hook(uint8_t *data, size_t len) {
        void (*tramp)(uint8_t *, size_t) = (void *)trampoline;
        tramp(data, len);
    }

    // 写入混淆跳转代码：call+pop+jmp
    void WriteObfuscatedJump(BYTE *src, void *dst) {
        /*
            call +5            ; 5 bytes
        label:
            pop rax            ; 1 byte
            add rax, imm32     ; 7 bytes
            jmp rax            ; 2 bytes
            => total: 15 bytes
        */

        intptr_t offset = (intptr_t)dst - ((intptr_t)src + 15);  // 相对地址

        src[0] = 0xE8;  // call
        *(int32_t *)(src + 1) = 5;  // call +5

        src[5] = 0x58;  // pop rax
        src[6] = 0x48;
        src[7] = 0x05;
        *(int32_t *)(src + 8) = (int32_t)offset;  // add rax, offset

        src[12] = 0xFF;
        src[13] = 0xE0; // jmp rax
    }

    void WriteAbsoluteJump(BYTE *src, void *dst) {
        src[0] = 0x48;
        src[1] = 0xB8;
        *(void **)(src + 2) = dst;
        src[10] = 0xFF;
        src[11] = 0xE0;
    }

    void InstallHook() {
        DWORD oldProtect;
        memcpy(originalBytes, function1, HOOK_LEN);
        memcpy(trampoline, originalBytes, HOOK_LEN);
        WriteAbsoluteJump(trampoline + HOOK_LEN, (BYTE *)function1 + HOOK_LEN);

        VirtualProtect(function1, HOOK_LEN, PAGE_EXECUTE_READWRITE, &oldProtect);
        WriteObfuscatedJump((BYTE *)function1, function2);
        VirtualProtect(function1, HOOK_LEN, oldProtect, &oldProtect);
    }

    void UninstallHook() {
        DWORD oldProtect;
        VirtualProtect(function1, HOOK_LEN, PAGE_EXECUTE_READWRITE, &oldProtect);
        memcpy(function1, originalBytes, HOOK_LEN);
        VirtualProtect(function1, HOOK_LEN, oldProtect, &oldProtect);
    }

    __attribute__((constructor))
    void SetupHook() {
        InstallHook();
        printf("[+] Hook installed with obfuscated call+pop+jmp chain\n");
    }

    int main() {
        uint8_t data1[] = "abcdefg";
        function1(data1, sizeof(data1) - 1);
        printf("function1 (hooked): %s\n", data1);

        uint8_t data2[] = "abcdefg";
        function1hook(data2, sizeof(data2) - 1);
        printf("trampoline 原始 function1: %s\n", data2);
        return 0;
    }

不过仍然能看出，不过比前面来说更难看懂，尤其是去符号化

### Code Overwrite Hook

基于汇编层面的手动劫持任意地址执行流的 Hook 技术，关键点是使用 汇编重写目标函数开头的指令，并跳转到我们自己的代码段

比较上InlineHook，也采用jmp，但采用BeaEngine(轻量级反汇编引擎)

Hook方式

本质手段

可Hook对象

修改点

原函数调用保留

特点

**IAT Hook** 修改导入地址表（Import Table） 仅限 API 函数 `.idata` 段 IAT 表 ✅ 一般无需 trampoline 稳定、易检测，常用于 API 劫持 **Inline Hook** 在函数入口写 `jmp` 跳转 通常是函数 函数入口前几字节 ✅ trampoline 保存原始指令 常用于函数间跳转，执行完可以回调原函数 **Code Overwrite** 覆盖任意地址代码并劫持执行流 函数/任意地址（代码段） 任何代码地址 ❌ 不一定保留原逻辑，依赖场景 灵活，可用于关键指令覆盖，偏逆向分析

    #include <windows.h>
    #include <stdio.h>
    #include <stdint.h>

    #define HOOK_LEN 5  // JMP rel32 指令长度固定为5字节

    void function1(uint8_t *data, size_t len) {
        for (size_t i = 0; i < len; i++)
            data[i] ^= 0x11;
    }

    BYTE originalBytes[HOOK_LEN] = {0};
    void *originalContinueAddr = NULL;

    // Hook后的自定义函数，裸函数实现，跳回原函数剩余代码
    __declspec(naked) void MyHookFunction() {
        __asm__(
            "pushad\n\t"    // 保存所有通用寄存器
            "pushfd\n\t"    // 保存EFLAGS寄存器

            "call function2\n\t"

            "popfd\n\t"
            "popad\n\t"

            // 跳回原函数继续执行
            "jmp *originalContinueAddr\n\t"
        );
    }

    void function2(uint8_t *data, size_t len) {
        for (size_t i = 0; i < len; i++)
            data[i] ^= 0x22;
    }
    //偏移
    int CalcRelJmp(void *src, void *dst) {
        return (int)((intptr_t)dst - (intptr_t)src - 5);
    }

    void InstallHook() {
        DWORD oldProtect;
        BYTE *target = (BYTE *)function1;

        memcpy(originalBytes, target, HOOK_LEN);

        originalContinueAddr = target + HOOK_LEN;

        VirtualProtect(target, HOOK_LEN, PAGE_EXECUTE_READWRITE, &oldProtect);

        target[0] = 0xE9;
        *(int *)(target + 1) = CalcRelJmp(target, MyHookFunction);

        VirtualProtect(target, HOOK_LEN, oldProtect, &oldProtect);

        printf("[+] Hook installed.\n");
    }

    void UninstallHook() {
        DWORD oldProtect;
        BYTE *target = (BYTE *)function1;

        VirtualProtect(target, HOOK_LEN, PAGE_EXECUTE_READWRITE, &oldProtect);

        memcpy(target, originalBytes, HOOK_LEN);

        VirtualProtect(target, HOOK_LEN, oldProtect, &oldProtect);

        printf("[-] Hook removed.\n");
    }

    int main() {
        uint8_t data[] = "abcdefg";

        InstallHook();

        function1(data, sizeof(data) - 1);

        printf("after hook: %s\n", data);

        UninstallHook();

        return 0;
    }

### Ptrace Hook

ptrace一般用于双线程或frida等其他中

`ptrace`：Linux 内核提供的系统调用，用于让一个进程控制另一个进程的执行
`long ptrace(enum __ptrace_request request, pid_t pid, void *addr, void *data);`
其中`request`有

`request` 值

含义

`PTRACE_TRACEME` 当前进程表示“我希望被调试”，通常子进程中调用（用于 gdb 这类调试器） `PTRACE_ATTACH` 附加到一个已存在的进程，开始调试它（会暂停它） `PTRACE_DETACH` 脱离调试，让目标进程恢复正常执行 `PTRACE_CONT` 继续执行目标进程（从上一次暂停的地方） `PTRACE_SINGLESTEP` 单步执行一条指令，然后暂停（调试器常用） `PTRACE_PEEKDATA` 从目标进程地址空间中**读取数据**（一次读取一个 `long`） `PTRACE_POKEDATA` 向目标进程地址空间中**写入数据** `PTRACE_GETREGS` / `PTRACE_SETREGS` 读取/设置通用寄存器 `PTRACE_SYSCALL` 让目标进程在每次系统调用进入/退出时都暂停（可以做系统调用监控）

PID：`PTRACE_TRACEME`为0，其他为要附加的PID，`PTRACE_TRACEME`经常用于父子进程中

addr：对于`PEEKDATA`、`POKEDATA`为读写的内存地址，其他一般为0

data：含义也取决于 request：

request 类型

`data` 的含义

`POKEDATA` 要写入目标地址的数据 `PEEKDATA` 结果通过返回值获得，`data` 通常为 0 `CONT` 如果进程因为信号暂停，你可以在这里传递信号号（如 `SIGSTOP`、`0` 表示无） `GETREGS` 指向 `struct user_regs_struct` 的指针，用于接收寄存器内容 `SETREGS` 同上，传入要设置的新寄存器值

用父子进程举例：

    #include <sys/ptrace.h>
    #include <sys/types.h>
    #include <sys/wait.h>
    #include <unistd.h>
    #include <stdio.h>
    #include <stdlib.h>
    #include <errno.h>

    int main() {
        pid_t pid = fork();
        if (pid < 0) {
            perror("fork");
            exit(EXIT_FAILURE);
        }
        if (pid == 0) {
            if (ptrace(PTRACE_TRACEME, 0, NULL, NULL) == -1) {
                perror("ptrace");
                exit(EXIT_FAILURE);
            }

            if (execl("/bin/ls", "ls", NULL) == -1) {
                perror("execl");
                exit(EXIT_FAILURE);
            }
        }
        else {
            int status;
            while (1) {
                if (waitpid(pid, &status, 0) == -1) {
                    perror("waitpid");
                    exit(EXIT_FAILURE);
                }

                if (WIFEXITED(status)) {
                    printf("Child exited normally with code %d\n", WEXITSTATUS(status));
                    break;
                } else if (WIFSIGNALED(status)) {
                    printf("Child was terminated by signal %d\n", WTERMSIG(status));
                    break;
                } else if (WIFSTOPPED(status)) {
                    printf("Child stopped by signal %d\n", WSTOPSIG(status));
                    if (ptrace(PTRACE_CONT, pid, NULL, NULL) == -1) {
                        perror("ptrace CONT");
                        exit(EXIT_FAILURE);
                    }
                } else {
                    printf("Unexpected child status\n");
                }
            }
        }
        return 0;
    }

执行为

    sleep3r@LAPTOP-55N4U9T7:/mnt/d/re/frida_ptrace_hook$ ./ptrace111
    Child stopped by signal 5 //正常的，因为有ptrace(PTRACE_TRACEME, 0, NULL, NULL)
    frida.md  ptrace111  ptrace111.c
    Child exited normally with code 0

原理：调用 fork() 时，当前正在执行的线程被复制到子进程中，这两个单线程进程，会在内核调度下并发运行，因为不同pid，执行不同内容
