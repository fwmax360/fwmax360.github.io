---
title: 'AES 详解'
description: 'AES 对称加密与 CBC/CTR/ECB/GCM 等常见模式：参数、填充与实现要点。'
pubDate: 2025-07-28
category: 'Binary'
tags: ['AES', '加密', '密码学']
series: '密码学基础'
order: 1
---
## AES (Advanced Encryption Standard)

### AES介绍

AES（高级加密标准）是一种对称加密算法，广泛用于数据加密。它支持多种模式，如CBC、CTR、ECB和GCM等。以下是一些常见的AES加密模式及其特点：

- CBC（Cipher Block Chaining）：需要IV（初始化向量），数据长度必须是块大小的整数倍。
- CTR（Counter）：使用IV和计数器，数据长度可以是任意长度，不需要填充。
- ECB（Electronic Codebook）：不使用IV，直接加密数据，数据长度必须是块大小的整数倍。
- GCM（Galois/Counter Mode）：使用IV、加密数据和认证标签（16字节），加密数据长度可以是任意长度。

### 各模式所需参数说明

#### 1. CBC（Cipher Block Chaining）模式

- **密钥**：必须，长度为16/24/32字节（AES-128/192/256）
- **明文**：要加密的数据，长度必须是16字节（块大小）的整数倍（不足需填充）
- **IV（初始化向量）**：必须，长度为16字节

#### 2. CTR（Counter）模式

- **密钥**：必须，长度为16/24/32字节
- **明文**：要加密的数据，长度可以任意，无需填充
- **IV（初始计数器/nonce）**：必须，长度为16字节（有些实现可变）

#### 3. ECB（Electronic Codebook）模式

- **密钥**：必须，长度为16/24/32字节
- **明文**：要加密的数据，长度必须是16字节的整数倍（不足需填充）
- **IV**：不需要

#### 4. GCM（Galois/Counter Mode）模式

- **密钥**：必须，长度为16/24/32字节
- **明文**：要加密的数据，长度可以任意
- **IV（nonce）**：必须，推荐12字节（也可16字节）
- **认证标签（Tag）**：加密后生成，通常为16字节，用于数据完整性校验

### 总结

- CBC/CTR/GCM 都需要密钥、明文、IV（或nonce），ECB只需密钥和明文。
- CBC/ECB 明文需补齐到块大小，CTR/GCM 明文可任意长度。
- GCM 额外有认证标签（Tag），用于完整性校验。


    from Crypto.Cipher import AES
    from Crypto.Util.Padding import pad, unpad
    def aes_encrypt_cbc(key, plaintext, iv):
        cipher = AES.new(key, AES.MODE_CBC, iv)
        ciphertext = cipher.encrypt(pad(plaintext, AES.block_size))
        return ciphertext
    def aes_decrypt_cbc(key, ciphertext, iv):
        cipher = AES.new(key, AES.MODE_CBC, iv)
        plaintext = unpad(cipher.decrypt(ciphertext), AES.block_size)
        return plaintext
    def aes_encrypt_ctr(key, plaintext, iv):
        cipher = AES.new(key, AES.MODE_CTR, nonce=iv)
        ciphertext = cipher.encrypt(plaintext)
        return ciphertext
    def aes_decrypt_ctr(key, ciphertext, iv):
        cipher = AES.new(key, AES.MODE_CTR, nonce=iv)
        plaintext = cipher.decrypt(ciphertext)
        return plaintext
    def aes_encrypt_ecb(key, plaintext):
        cipher = AES.new(key, AES.MODE_ECB)
        ciphertext = cipher.encrypt(pad(plaintext, AES.block_size))
        return ciphertext
    def aes_decrypt_ecb(key, ciphertext):
        cipher = AES.new(key, AES.MODE_ECB)
        plaintext = unpad(cipher.decrypt(ciphertext), AES.block_size)
        return plaintext
    def aes_encrypt_gcm(key, plaintext, iv):
        cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
        ciphertext, tag = cipher.encrypt_and_digest(plaintext)
        return ciphertext, tag
    def aes_decrypt_gcm(key, ciphertext, iv, tag):
        cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)
        return plaintext

### 填充

对于CBC、ECB模式，明文长度必须是块大小的整数倍。如果明文长度不是块大小的整数倍，需要进行填充。最常用的填充方式是PKCS#7。

#### PKCS#7填充原理

PKCS#7是一种标准的块加密填充方式，适用于块大小为8~255字节的加密算法（AES块大小为16字节）。

**填充规则：**

- 假设块大小为N（AES为16），明文长度为L。
- 计算需要填充的字节数：P = N - (L % N)
- 在明文末尾补P个字节，每个字节的值都为P。
- 如果明文本身刚好是块大小整数倍，则补N个字节，每个字节值为N。

**举例：**

- 明文：`b"HelloWorld"`，长度10，块大小16
- 需要填充：16 - (10 % 16) = 6
- 填充后：`b"HelloWorld" + b"\x06\x06\x06\x06\x06\x06"`

**去除填充：**

- 解密后，取最后一个字节的值P，去掉末尾P个字节即可还原原文。

**示例：**
明文：`b"1234567890ABCDEF"`（16字节）
填充：补16个`\x10`，结果为`b"1234567890ABCDEF" + b"\x10"*16`

**优点：**

- 兼容性好，广泛用于AES、DES等块加密算法
- 可自动判断填充长度，解密时安全去除

```python
from Crypto.Util.Padding import pad, unpad

# 填充明文到块大小
def pad_plaintext(plaintext):
    return pad(plaintext, AES.block_size)

# 去除填充
def unpad_plaintext(padded_plaintext):
    return unpad(padded_plaintext, AES.block_size)

# 示例
plaintext = b"Hello, World!"
padded_plaintext = pad_plaintext(plaintext)
ciphertext = aes_encrypt_cbc(key, padded_plaintext, iv)
decrypted_padded_plaintext = aes_decrypt_cbc(key, ciphertext, iv)
unpad_plaintext(decrypted_padded_plaintext)
```

### 加密

AES 加密过程分为多个“轮”（Round），每一轮包含若干操作。不同密钥长度轮数不同：

- AES-128：10轮
- AES-192：12轮
- AES-256：14轮

每一轮分为：初始轮、普通轮、最终轮。

#### 1. 初始轮（Round 0）

- 只做一次“轮密钥加”（AddRoundKey），即明文与第一个轮密钥异或。

#### 2. 普通轮（Round 1~N-1）

每一轮包含四步：

1.  **字节替换（SubBytes）**
    - 用S盒（Substitution box）对每个字节进行非线性替换，增加混淆性。
2.  **行移位（ShiftRows）**
    - 按行循环左移：第0行不动，第1行左移1字节，第2行左移2字节，第3行左移3字节。
    - 破坏行间相关性，增强扩散。
3.  **列混淆（MixColumns）**
    - 每列用固定多项式变换，进一步扩散字节间关系。
    - 使每个输出字节依赖于输入列的所有字节。
4.  **轮密钥加（AddRoundKey）**
    - 当前状态与本轮密钥异或。

#### 3. 最终轮（最后一轮）

与普通轮类似，但**不做列混淆（MixColumns）**，只做：

1.  字节替换（SubBytes）
2.  行移位（ShiftRows）
3.  轮密钥加（AddRoundKey）

### 各步骤详细说明

#### C语言伪代码示例

**1. 字节替换（SubBytes）**

    // 假设 state[4][4] 为当前状态，Sbox[256] 为标准S盒
    for(int i=0;i<4;i++){
        for(int j=0;j<4;j++){
            state[i][j] = Sbox[state[i][j]];
        }
    }

**2. 行移位（ShiftRows）**

    // 只对每行做循环左移
    // 第0行不动，第1行左移1，第2行左移2，第3行左移3
    for(int i=1;i<4;i++){
        uint8_t tmp[4];
        for(int j=0;j<4;j++) tmp[j] = state[i][(j+i)%4];
        for(int j=0;j<4;j++) state[i][j] = tmp[j];
    }

**3. 列混淆（MixColumns）**

    // 伪代码，实际需GF(2^8)乘法
    uint8_t mul2(uint8_t x) { return (x<<1) ^ ((x>>7)*0x1b); }
    uint8_t mul3(uint8_t x) { return mul2(x) ^ x; }
    for(int j=0;j<4;j++){
        uint8_t s0=state[0][j], s1=state[1][j], s2=state[2][j], s3=state[3][j];
        state[0][j] = mul2(s0) ^ mul3(s1) ^ s2 ^ s3;
        state[1][j] = s0 ^ mul2(s1) ^ mul3(s2) ^ s3;
        state[2][j] = s0 ^ s1 ^ mul2(s2) ^ mul3(s3);
        state[3][j] = mul3(s0) ^ s1 ^ s2 ^ mul2(s3);
    }

**4. 轮密钥加（AddRoundKey）**

    // roundkey[4][4] 为本轮密钥
    for(int i=0;i<4;i++){
        for(int j=0;j<4;j++){
            state[i][j] ^= roundkey[i][j];
        }
    }

### 总结

- 初始轮：只做一次轮密钥加。
- 普通轮：字节替换→行移位→列混淆→轮密钥加。
- 最终轮：字节替换→行移位→轮密钥加（无列混淆）。

### S盒定义与打印

AES S盒是一个256字节的查表数组，部分定义如下：

    uint8_t Sbox[256] = {
        0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
        // ... 共256项，详见AES标准
    };
    // 打印S盒
    for(int i=0;i<256;i++) printf("%02x%s", Sbox[i], (i%16==15)?"\n":" ");

**字节替换（SubBytes）**

    for(int i=0;i<4;i++){
        for(int j=0;j<4;j++){
            state[i][j] = Sbox[state[i][j]];
        }
    }

### 常见填充方式

- **PKCS#7**：每个填充字节的值等于填充长度，最常用。
- **Zero Padding**：用0x00填充，不推荐（明文可能以0结尾，解密不安全）。
- **ISO/IEC 7816-4**：先填充0x80，再补0x00到块末。
- **ANSI X.923**：前面填充0x00，最后一个字节为填充长度。

实际应用推荐PKCS#7，兼容性最好。

### AES-128/192/256区别

- **AES-128**：密钥长度16字节，10轮加密
- **AES-192**：密钥长度24字节，12轮加密
- **AES-256**：密钥长度32字节，14轮加密
- 轮数越多，安全性越高，但加解密速度略慢
