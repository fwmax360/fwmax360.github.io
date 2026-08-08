---
title: '文件描述符（File Descriptor）'
description: 'Linux 里 FD 是打开文件、socket、管道等资源的抽象句柄；这篇整理概念与常见用法。'
pubDate: 2025-07-18
category: 'Binary'
tags: ['Linux', 'FD', '系统']
---
## File Descriptor

在操作系统（如 Linux）中，一个“文件描述符（File Descriptor）”是对打开文件、socket、管道等资源的抽象引用，是内核用于跟踪文件 I/O 的机制

功能

示例

**打开文件** `open()` 返回一个 fd **读写文件** `read(fd, buf, size)` / `write(fd, buf, size)` **关闭文件** `close(fd)` **控制fd属性** `fcntl(fd, F_GETFL)` 查询状态，`dup()` 复制 fd **事件监听** `select()`、`poll()`、`epoll()` 都以 fd 为单位操作 **服务实现中使用 fd 表** 服务端程序会用数组/哈希表保存当前活跃的 fd，如 socket fd、log fd、pipe fd 等

下面详细介绍一下：

文件描述符是操作系统内核中用于标识已打开文件的一个非负整数。不仅仅是文件，还可以是：

- 普通文件

- 目录

- 管道（pipe）

- 套接字（socket）

- 终端设备

在 Unix/Linux/macOS 中，每个进程维护一个“文件描述符表”（File Descriptor Table），是一个数组，里面的每一项都是一个 FD，指向“打开文件表”的条目，这些条目最终指向 inode 结构

操作系统默认给每个进程分配 3 个文件描述符：

FD 值

名称

说明

0 stdin 标准输入（键盘） 1 stdout 标准输出（屏幕） 2 stderr 标准错误（屏幕）

进程的 FD 表： \[0\] → 打开文件表 → inode → 实际文件内容\[1\] → …\[2\] → …

在Mac上打开文件并写入内容为

    #include <fcntl.h>
    #include <unistd.h>
    #include <stdio.h>
    #include <string.h>

    int main() {
        int fd = open("test.txt", O_WRONLY | O_CREAT | O_TRUNC, 0644);
        if (fd == -1) {
            perror("open failed");
            return 1;
        }

        const char *msg = "Hello from File Descriptor!\n";
        write(fd, msg, strlen(msg));

        close(fd);
        return 0;
    }
