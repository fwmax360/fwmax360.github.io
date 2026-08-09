---
title: 'PEB / TEB 与 IsDebuggerPresent 反调试'
description: '从 Windows 进程加载与 PE 映射切入，看 PEB/TEB 结构以及常见反调试检测点。'
pubDate: 2025-07-24
category: 'Binary'
tags: ['Windows', '反调试', 'PEB', 'TEB']
---
## 反调试技术学习

先以Windows为例

当我们运行一个可执行程序时，操作系统会从磁盘读取 PE 文件结构，在进程的虚拟地址空间中，按需映射（Map）PE 文件的各个节，根据 PE 文件中的信息构造运行时环境

- 构造 PEB（Process Environment Block）；
- 初始化 TEB（Thread Environment Block）（每个线程一个）；
- 创建默认堆栈、加载器信息、命令行参数、环境变量等；

完整过程为：读PE头-\>读NT头-\>读可选头-\>加载段-\>构造PEB、TEB、heap、stack-\>ImageBase + EntryPoint

详细的可以看看操作系统_map原理，里面详细介绍了程序如何加载的

### PEB(Process Environment Block)

存放进程的全局信息，如模块加载列表、堆地址、ImageBase

PEB 是 Windows 加载器在启动进程时创建的结构体，它的地址可以通过 fs:\[0x30\]（x86）或 gs:\[0x60\]（x64）获得

简化版为

    typedef struct _PEB {
        BYTE InheritedAddressSpace;
        BYTE ReadImageFileExecOptions;
        BYTE BeingDebugged;                 // 是否处于调试状态
        BYTE BitField;

        PVOID Mutant;
        PVOID ImageBaseAddress;            // 可执行文件的加载地址（ImageBase）
        PPEB_LDR_DATA Ldr;                 // 指向模块加载器数据（模块链表）
        PRTL_USER_PROCESS_PARAMETERS ProcessParameters;

        PVOID SubSystemData;
        PVOID ProcessHeap;                 // 主进程堆地址
        PVOID FastPebLock;

        // ... 还有很多字段，如ActiveProcessAffinityMask、GdiHandleBuffer 等
    } PEB, *PPEB;

这里需要注意的是ImageBaseAddress为主模块（EXE）真正被加载到的地址，是操作系统分配并实际映射的地，而可选头中的建议加载地址，是理论上的

在这里我们主要注意的是`BeingDebugged`，里面存放着调试信息

### TEB(Thread Environment Block)

每个线程都有一个 TEB。它保存线程局部的状态信息。可以通过 fs:\[0x18\]（x86）或 gs:\[0x30\]（x64）获得其地址

简化版

    typedef struct _TEB {
        NT_TIB NtTib;                      // 包含 SEH、栈信息
        PVOID EnvironmentPointer;
        CLIENT_ID ClientId;               // 线程和进程 ID
        PVOID ActiveRpcHandle;
        PVOID ThreadLocalStoragePointer;  // TLS 数据
        PEB *ProcessEnvironmentBlock;     // 指向本线程所属进程的 PEB

        // ... 还有线程 ID，线程堆栈上限/下限，最后错误码等
    } TEB, *PTEB;

字段名

含义

`ThreadLocalStoragePointer` TLS 的地址 `ProcessEnvironmentBlock` 指向所属进程的 PEB `ClientId.UniqueThread` 线程 ID `NtTib.ExceptionList` 异常处理链（SEH） `NtTib.StackBase` / `StackLimit` 栈上限与下限 这也是tls为什么在程序主程序执行前执行

    [TEB (gs:[0x30])]
     ├──> [PEB]
     │     ├──> ImageBaseAddress
     │     ├──> ProcessHeap
     │     └──> Ldr → 模块链表
     ├──> TLS
     ├──> 栈信息
     └──> 异常处理链（SEH）

调试和运行时的区别

每个运行中的进程都有一个PEB结构，其0x02偏移处就是`BeingDebugged`标志，如果程序处于调试状态，该标志的值会被设置为非零值。相关Windows API就是通过访问该值来进行反调试操作，比如`IsDebuggerPresent`

因为在x86下存在fs段寄存器，在 Windows 32 位系统 中，fs 寄存器专门用来访问当前线程相关的数据结构

TEB 结构在 0x18 偏移处放了一个“自指针”，在 TEB 的结构中，偏移 0x30 是 ProcessEnvironmentBlock

所以，对于读取有两种方法

    mov eax, fs:[0x30]     ; 获取 PEB 指针

    mov eax, fs:[0x18]     ; 得到 TEB 自身地址
    mov eax, [eax+0x30]    ; 取 TEB 中的 PEB 指针

    | 平台  | TEB/PEB访问方式                    |
    | --- | ---------------------------------  |
    | 32位 | TEB: `fs:[0x18]`，PEB: `fs:[0x30]` |
    | 64位 | TEB: `gs:[0x30]`，PEB: `gs:[0x60]` |

所以对于x86为例，fs:\[0x30\] + 2 为`BeingDebugged`标志

1.  IsDebuggerPresent

IsDebuggerPresent函数通过获取进程环境块（PEB）中的BeingDebugged标志来检测进程是否处于调试状态

大概就像上面那样

    mov eax , fs:[0x30]
    movzx eax , byte ptr [eax+2]
    retn

伪代码为

    BOOL IsDebuggerPresent() {
        return NtCurrentPeb()->BeingDebugged;
    }

对其改返回值eax即可

2.  CheckRemoteDebuggerPresent

`CheckRemoteDebuggerPresent`为很特别的一个系统调用，因为它并不是通过`BeingDebugged`来反调试的

我们都知道运行任何程序，都会加载一些动态库如dll，在前面我们了解PEB时里面存在一个Ldr，而dll也是在这加载的

PEB -\> Ldr -\> InMemoryOrderModuleList // 链表记录所有加载模块

而其中`CheckRemoteDebuggerPresent` 是 `kernel32.dll`(任何程序都会加载的dll，在windows下) 的导出函数，它内部会调用 `NtQueryInformationProcess`，获取 `ProcessDebugPort`，如果 DebugPort 不为 0，就说明进程被调试，然后将结果写入 `*pbDebuggerPresent` 中

    User Mode
    ├── kernel32!CheckRemoteDebuggerPresent
    │   └── ntdll!NtQueryInformationProcess
    │       └── 内核系统调用: ZwQueryInformationProcess
    │           └── 获取 EPROCESS 结构中的 DebugPort 成员

    typedef struct _EPROCESS {
      ...
      PVOID DebugPort; // 进程的调试端口，如果不为 NULL 说明被调试
      ...
    } EPROCESS;

### Linux下的反调

方法类型

方法名

原理

是否常见

系统调用 `ptrace` 检查是否被调试 ✅ 非常常见 文件检测 `/proc/self/status` 检查 `TracerPid` 字段 ✅ syscall 检测 直接调用 syscall 传递调试控制码 类似 ptrace 底层版本 ✅ 信号检测 `raise(SIGTRAP)` / 捕获信号 观察信号是否被调试器截获 ✅

    #include <sys/ptrace.h>

    int is_debugged_by_ptrace() {
        errno = 0;
        ptrace(PTRACE_TRACEME, 0, NULL, 0);
        if (errno != 0) {
            return 1; // 被调试
        }
        return 0; // 没被调试
    }

其实无论是哪种反调试函数，都只是读取数的过程，然后通过eax返回，程序据此判断是否被调试，然后执行如 `ExitProcess` 或崩溃逻辑，阻止被调试者逆向分析，所以逆向时下断点，改eax值即可
