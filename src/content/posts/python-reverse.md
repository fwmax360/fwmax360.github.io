---
title: 'Python 逆向'
description: '从识别 PyInstaller 打包、提取 pyc 到反编译还原的 Python 逆向流程。'
pubDate: 2025-08-03
category: 'Binary'
tags: ['Python', '逆向', 'pyc']
---
## Python逆向

### 整体流程概述

1.  识别Python打包文件：使用Detect It Easy (DIE)工具识别是否为Python打包的EXE

2.  提取PYC文件：使用pyinstxtractor工具

3.  处理加密PYC：解密AES加密的PYC文件

4.  分析PYC结构：理解Python字节码文件格式

5.  反编译/反汇编：还原Python源码或分析字节码

6.  处理花指令：清理混淆的字节码

### 详细

#### EXE -\> PYC文件提取

使用pyinstxtractor工具

    # 无加密文件
    python pyinstxtractor.py <filename.exe>

    # 有加密文件（需要先获取密钥）
    # 打包命令示例：
    pyinstaller.exe -F --key your_key --upx-dir "path/to/upx" your_script.py
    # 提取命令：
    python pyinstxtractor.py --key your_key <filename.exe>

提取后的文件结构

    your_exe_extracted/
    ├── struct.pyc          # 关键文件，包含PYC文件头
    ├── main.pyc            # 主程序（可能加密）
    └── other_files...

#### 处理加密的PYC文件

原始流程：.py → 编译为.pyc → zlib压缩 → AES加密 → 嵌入EXE

    import tinyaes
    import zlib
    import os

    def decrypt_pyc(encrypted_file, output_file, key):
        """解密AES加密的PYC文件"""
        CRYPT_BLOCK_SIZE = 16  # AES块大小

        with open(encrypted_file, 'rb') as inf:
            iv = inf.read(CRYPT_BLOCK_SIZE)
            ciphertext = inf.read()

        # 处理不同密钥长度
        key_bytes = key.encode('utf-8')
        if len(key_bytes) < 16:
            key_bytes = key_bytes.ljust(16, b'\0')
        elif len(key_bytes) > 32:
            key_bytes = key_bytes[:32]

        cipher = tinyaes.AES(key_bytes, iv)
        compressed_data = cipher.CTR_xcrypt_buffer(ciphertext)

        try:
            plaintext = zlib.decompress(compressed_data)
        except zlib.error:
            # 可能是未压缩数据
            plaintext = compressed_data

        # 获取正确的PYC文件头（从struct.pyc）
        with open('struct.pyc', 'rb') as hf:
            pyc_header = hf.read(16)

        with open(output_file, 'wb') as outf:
            outf.write(pyc_header)
            outf.write(plaintext)

    # 使用示例
    decrypt_pyc('main.pyc.encrypted', 'main.pyc', 'your_secret_key')

加密模式分析工具

    import os

    def analyze_encryption(file_path):
        """分析加密模式"""
        file_size = os.path.getsize(file_path)
        iv_size = 16
        data_size = file_size - iv_size

        print(f"文件大小: {file_size} 字节")
        print(f"IV大小: {iv_size} 字节")
        print(f"数据部分大小: {data_size} 字节")

        # 检查块大小对齐
        if data_size % 16 == 0:
            print("模式提示: 可能是CBC/ECB模式（数据长度是16的倍数）")
        else:
            print("模式提示: 可能是CTR/GCM模式（数据长度任意）")

        # 检查GCM认证标签
        if data_size > 16:
            with open(file_path, 'rb') as f:
                f.seek(-16, 2)  # 查看最后16字节
                tag = f.read(16)
                if not all(b == 0 for b in tag):
                    print("模式提示: 可能是GCM模式（检测到非零认证标签）")

        # 尝试识别IV位置
        with open(file_path, 'rb') as f:
            header = f.read(32)
            print(f"文件头: {header[:16].hex()}...")

    # 使用示例
    analyze_encryption('encrypted.pyc')

#### PYC文件分析与处理

PYC文件结构

    typedef struct {
        uint32_t magic;                 // 4字节 魔数（Python版本标识）
        uint32_t flags;                 // 4字节 标志位（Python 3.7+）
        uint32_t source_size;           // 4字节 源文件大小（Python 3.7+）
        PyCodeObject code_object;       // 序列化的代码对象
    } PycFileHeader;

    typedef struct {
        // 对象头部（所有Python对象共有）
        PyObject_HEAD

        // 代码对象特有字段
        int co_argcount;                // 位置参数数量
        int co_posonlyargcount;         // 仅位置参数数量（Python 3.8+）
        int co_kwonlyargcount;          // 仅关键字参数数量
        int co_nlocals;                 // 局部变量数量
        int co_stacksize;               // 执行所需栈空间
        int co_flags;                   // 编译标志
        int co_firstlineno;             // 首行行号
        PyObject *co_code;              // 字节码指令序列
        PyObject *co_consts;            // 常量元组
        PyObject *co_names;             // 全局名称元组
        PyObject *co_varnames;          // 局部变量名元组
        PyObject *co_freevars;          // 闭包变量名元组
        PyObject *co_cellvars;          // 被嵌套作用域引用的变量名
        PyObject *co_filename;          // 源文件名
        PyObject *co_name;              // 函数/类名
        PyObject *co_linetable;         // 行号映射表（Python 3.11+）
        PyObject *co_exceptiontable;    // 异常处理表（Python 3.11+）
    } PyCodeObject;

魔数对应关系：

- Python 3.7: 0x42 0x0d 0x0d 0x0a

- Python 3.8: 0x55 0x0d 0x0d 0x0a

- Python 3.9: 0x61 0x0d 0x0d 0x0a

有时候需要修复文件头

    # 修复损坏的PYC文件头
    def fix_pyc_header(input_file, output_file):
        with open(input_file, 'rb') as f:
            data = f.read()

        # 添加标准文件头（Python 3.8示例）
        fixed = b'\x55\x0d\x0d\x0a\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' + data

        with open(output_file, 'wb') as f:
            f.write(fixed)

字节码反汇编

    import marshal
    import dis

    def disassemble_pyc(pyc_file):
        """反汇编PYC文件"""
        with open(pyc_file, 'rb') as f:
            # 跳过文件头（16字节）
            f.read(16)
            code_obj = marshal.load(f)

        print(f"函数名: {code_obj.co_name}")
        print(f"文件名: {code_obj.co_filename}")
        print(f"参数数量: {code_obj.co_argcount}")
        print("\n=== 反汇编结果 ===\n")
        dis.dis(code_obj)

    # 使用示例
    disassemble_pyc('main.pyc')

#### 处理花指令

    import types
    import marshal

    def remove_junk_bytecode(input_file, output_file):
        """移除字节码中的花指令"""
        with open(input_file, 'rb') as f:
            header = f.read(16)
            code_obj = marshal.load(f)

        # 常见花指令模式
        JUNK_PATTERNS = [
            b'\x64\x00',  # LOAD_CONST(None)
            b'\x01',      # POP_TOP
            b'\x64\x01',  # LOAD_CONST(True)
            b'\x53',      # RETURN_VALUE (非函数结尾处)
        ]

        cleaned = bytearray()
        bytecode = code_obj.co_code
        i = 0
        n = len(bytecode)

        while i < n:
            matched = False
            for pattern in JUNK_PATTERNS:
                if bytecode.startswith(pattern, i):
                    i += len(pattern)
                    matched = True
                    break

            if not matched:
                cleaned.append(bytecode[i])
                i += 1

        # 创建新代码对象
        new_code = types.CodeType(
            code_obj.co_argcount,
            code_obj.co_posonlyargcount,
            code_obj.co_kwonlyargcount,
            code_obj.co_nlocals,
            code_obj.co_stacksize,
            code_obj.co_flags,
            bytes(cleaned),
            code_obj.co_consts,
            code_obj.co_names,
            code_obj.co_varnames,
            code_obj.co_filename,
            code_obj.co_name,
            code_obj.co_firstlineno,
            getattr(code_obj, 'co_linetable', b''),
            getattr(code_obj, 'co_exceptiontable', b'')
        )

        # 保存修改后的PYC
        with open(output_file, 'wb') as f:
            f.write(header)
            marshal.dump(new_code, f)

    # 使用示例
    remove_junk_bytecode('obfuscated.pyc', 'cleaned.pyc')

    工具名称 适用Python版本  功能描述
    uncompyle6    2.7-3.8 可靠的反编译为源码
    pycdc    3.9+    支持新版Python的反编译器
    pycdas 所有版本    将PYC转换为可读的字节码表示
    Decompyle++    3.9+    基于pycdc的增强版

注：
但是在pyc文件存储的不是内存中的PyCodeObject结构体，而是它的序列化表示，通过Python的marshal模块实现，以序列化格式（Python 3.11+）：

    [ 魔数 4字节 ]  // 标识Python版本
    [ 标志位 4字节 ]  // Python 3.7+新增
    [ 源文件大小 4字节 ] // Python 3.7+新增
    [ 序列化的代码对象 ]

    63                                   // 类型码: 'c'表示代码对象
    [ co_argcount (4字节) ]
    [ co_posonlyargcount (4字节) ]
    [ co_kwonlyargcount (4字节) ]
    [ co_nlocals (4字节) ]
    [ co_stacksize (4字节) ]
    [ co_flags (4字节) ]
    [ co_firstlineno (4字节) ]
    74                                   // 类型码: 't'表示字节串
    [ co_code长度 (4字节) ]
    [ co_code内容 (N字节) ]
    [ 其他字段... ]
