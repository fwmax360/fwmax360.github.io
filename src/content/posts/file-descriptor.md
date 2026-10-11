---
title: '文件描述符（File Descriptor）'
description: 'Linux 里 FD 是打开文件、socket、管道等资源的抽象句柄；这篇整理概念与常见用法。'
pubDate: 2025-07-18
updatedDate: 2026-10-11
category: 'Binary'
tags: ['Linux', 'FD', '系统']
---

FD 是进程用来引用已打开资源的非负整数。文件、socket、管道和设备都可以通过 FD 读写，但数字本身只在所属进程的描述符表里有意义：两个进程的 `fd=3` 不保证是同一资源。

## 数字、打开状态与文件内容

可以把普通文件的关系看成“FD 表项 → open file description → 文件”。`dup()` 和 `fork()` 产生的描述符可能共享同一个 open file description，因此共享文件偏移和文件状态标志；描述符自身的 `FD_CLOEXEC` 等标志是另一层。socket、管道等资源则不应都画成“最终指向磁盘 inode 内容”。依据见 [Linux open(2)](https://man7.org/linux/man-pages/man2/open.2.html) 和 [dup(2)](https://man7.org/linux/man-pages/man2/dup.2.html)。

通常约定 `0` 为标准输入、`1` 为标准输出、`2` 为标准错误。它们可以接终端，也可以被 shell 重定向到文件或管道，甚至被关闭，不是内核保证每个进程都绑定键盘和屏幕。

## 写入也可能只完成一部分

这份 POSIX 示例会在当前目录创建或覆盖 `test.txt`。`write()` 成功返回的字节数仍可能小于请求长度；遇到 `EINTR` 重试，其他错误保留。这里是阻塞普通文件示例，不把处理方式直接套到非阻塞 socket。

```c
#include <fcntl.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <errno.h>

int main(void) {
    int fd = open("test.txt", O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (fd == -1) { perror("open"); return 1; }
    const char *msg = "Hello from File Descriptor!\n";
    size_t length = strlen(msg), done = 0;
    while (done < length) {
        ssize_t n = write(fd, msg + done, length - done);
        if (n < 0 && errno == EINTR) continue;
        if (n <= 0) {
            if (n == 0) errno = EIO;
            perror("write");
            close(fd);
            return 1;
        }
        done += (size_t)n;
    }
    if (close(fd) == -1) { perror("close"); return 1; }
    return 0;
}
```

这是完整写入示例，不是持久化保证；需要保证落盘的程序还要考虑 `fsync()` 及目录更新。具体返回值与短写行为见 [Linux write(2)](https://man7.org/linux/man-pages/man2/write.2.html)。
