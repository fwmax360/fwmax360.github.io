---
title: 'DES 详解'
description: 'DES 对称加密算法结构、Feistel 网络与加解密流程整理。'
pubDate: 2025-07-30
updatedDate: 2026-10-11
category: 'Binary'
tags: ['DES', '加密', '密码学']
series: '密码学基础'
order: 2
---
## DES

这篇用于读旧程序与复现算法，不把 DES 当作新系统的加密选型。[NIST 已于 2005 年撤销 FIPS 46-3](https://csrc.nist.gov/pubs/fips/46-3/final)。算法结构以该历史标准为依据，是否能解密回来还要与已知答案比较。

### 定义

DES（Data Encryption Standard）是一种对称密钥加密算法，用于数据加密和解密。它使用一个56位的密钥对64位的数据块进行加密

因此，如果需要加密的明文长度不足64位，需要进行填充；如果明文长度超过64位，则需要使用分组模式进行分组加密

### 工作步骤

- 初始置换（IP置换）
- 加密轮次
- 末置换（FP置换）

1.  **密钥生成**：从用户提供的56位密钥中生成16个48位的子密钥
2.  **初始置换**：对64位明文进行初始置换
3.  **分组加密**：对明文进行16轮处理，每轮使用一个48位的子密钥进行加密
    - 每轮包括扩展置换、S盒替换、P盒置换
4.  **逆初始置换**：对加密后的数据进行逆初始置换，得到最终的密文
5.  **解密**：使用相同的密钥和相同的步骤进行解密，得到原始明文

#### 初始置换（IP置换）

IP 是固定的位重排，FP 是它的逆置换；它们本身不提供密码学安全性，不能把初始置换解释成非线性扩散。

我们将把64位的顺序按下表中规定的顺序放置，图中的数字是在64位明文中每个比特的索引位置。注意，在DES中，这个置放规则是固定的

    | 58 50 42 34 26 18 10 2 |
    | 60 52 44 36 28 20 12 4 |
    | 62 54 46 38 30 22 14 6 |
    | 64 56 48 40 32 24 16 8 |
    +--------------------+

#### 末置换（FP置换）

    | 40 8 48 16 56 24 64 32 |
    | 39 7 47 15 55 23 63 31 |
    | 38 6 46 14 54 22 62 30 |
    | 37 5 45 13 53 21 61 29 |
    +--------------------+

#### 密钥生成

1.  **PC-1**：8 字节密钥含 64 位，其中 8 位用于奇偶校验；PC-1 选取并重排 56 位有效密钥位。
2.  **密钥分割**：分为 C、D 两个 28 位半部。
3.  **循环左移**：每轮分别在 28 位范围内循环左移 1 或 2 位。
4.  **PC-2**：拼接两个半部，从 56 位中选取 48 位子密钥。
5.  **重复**：重复上述步骤16次，得到16个48位的子密钥

#### 分组加密

1.  **扩展置换**：将32位的右半部分扩展为48位
2.  **S盒替换**：将48位的扩展结果与48位的子密钥进行异或操作，然后通过8个S盒进行替换，得到32位的结果
3.  **P盒置换**：对32位的结果进行P盒置换
4.  **Feistel 更新**：新左半部等于旧右半部，新右半部等于旧左半部与 F 输出的异或。
5.  **轮次迭代**：重复上述步骤16次，每次使用不同的子密钥进行加密

#### 解密

解密过程与加密过程类似，只是使用的子密钥顺序相反。具体步骤如下：

1.  **初始置换**：对密文进行初始置换
2.  **分组解密**：对密文进行16轮处理，每轮使用一个48位的子密钥进行解密
    - 每轮包括扩展置换、S盒替换、P盒置换
3.  **逆初始置换**：对解密后的数据进行逆初始置换，得到原始明文

#### 算法讲解

1.  初始置换（IP）
    - 将64位明文按固定顺序重新排列
    - 通过IP表实现（58位变第1位，50位变第2位…）
2.  子密钥生成
    - PC-1置换（64位密钥→56位有效密钥）
    - 分为左半部分和右半部分，各28位的C0和D0
    - 16轮迭代，每轮左移1或2位，循环左移（轮次不同移位数不同）
    - PC-2置换（56位→48位子密钥）
3.  16轮加密（Feistel结构）


    L[i] = R[i-1]
    R[i] = L[i-1] XOR F(R[i-1], K[i])

其中F是轮函数，K是子密钥,R\[i-1\]是上一轮的右半部分，L\[i-1\]是上一轮的左半部分

4.  轮函数F
    - 扩展置换（E）：32位→48位（重复部分位）
    - 密钥混合：与48位子密钥异或
    - S盒替换（核心非线性部件）：
      - 将48位输入分为8组，每组6位
      - 每组通过S盒映射到4位输出
    - S盒是预定义的查找表，提供非线性变换
    - P置换：将32位输出重新排列
5.  末置换（IP-1）
    - 将最终的 R16 与 L16 按这个顺序合并，再进行逆初始置换
    - 通过IP-1表实现（第1位变第40位，第2位变第8位…）
6.  解密过程
    - 解密过程与加密类似，但使用的子密钥顺序相反
7.  填充
    - DES加密要求输入数据长度为64位的倍数

### 标准与库示例

[FIPS 46-3 原文](https://csrc.nist.gov/files/pubs/fips/46-3/final/docs/fips46-3.pdf)附有完整 IP、FP、PC-1、PC-2 和八张 S 盒表。上面的 IP/FP 片段只展示前四行，下面的 C 实现使用完整表。

Python 示例只演示历史 DES-ECB 与填充；ECB 会泄露重复块关系，这个封装没有消息认证。用 PKCS#7 保留明文末尾原有的零字节，别用 `rstrip(b'\0')` 猜真实长度。

```python
from Crypto.Cipher import DES
from Crypto.Util.Padding import pad, unpad

def des_encrypt(key, data):
    cipher = DES.new(key, DES.MODE_ECB)
    return cipher.encrypt(pad(data, DES.block_size))

def des_decrypt(key, data):
    cipher = DES.new(key, DES.MODE_ECB)
    return unpad(cipher.decrypt(data), DES.block_size)

key = b'abcdefgh'
data = b'Hello, DES!\0'
assert des_decrypt(key, des_encrypt(key, data)) == data
```

详细用c语言写为(不用库)

    #include <stdio.h>
    #include <string.h>
    #include <stdint.h>
    #include <assert.h>

    // DES常量定义
    #define DES_BLOCK_SIZE 8  // 64位块大小
    #define KEY_SIZE 8        // 64位密钥（实际56位有效）

    // 初始置换表（IP）
    static const int IP[64] = {
        58, 50, 42, 34, 26, 18, 10, 2,
        60, 52, 44, 36, 28, 20, 12, 4,
        62, 54, 46, 38, 30, 22, 14, 6,
        64, 56, 48, 40, 32, 24, 16, 8,
        57, 49, 41, 33, 25, 17, 9, 1,
        59, 51, 43, 35, 27, 19, 11, 3,
        61, 53, 45, 37, 29, 21, 13, 5,
        63, 55, 47, 39, 31, 23, 15, 7
    };

    // 逆初始置换表（FP）
    static const int FP[64] = {
        40, 8, 48, 16, 56, 24, 64, 32,
        39, 7, 47, 15, 55, 23, 63, 31,
        38, 6, 46, 14, 54, 22, 62, 30,
        37, 5, 45, 13, 53, 21, 61, 29,
        36, 4, 44, 12, 52, 20, 60, 28,
        35, 3, 43, 11, 51, 19, 59, 27,
        34, 2, 42, 10, 50, 18, 58, 26,
        33, 1, 41, 9, 49, 17, 57, 25
    };

    // 扩展置换表（E）
    static const int E[48] = {
        32, 1, 2, 3, 4, 5, 4, 5,
        6, 7, 8, 9, 8, 9, 10, 11,
        12, 13, 12, 13, 14, 15, 16, 17,
        16, 17, 18, 19, 20, 21, 20, 21,
        22, 23, 24, 25, 24, 25, 26, 27,
        28, 29, 28, 29, 30, 31, 32, 1
    };

    // P置换表
    static const int P[32] = {
        16, 7, 20, 21, 29, 12, 28, 17,
        1, 15, 23, 26, 5, 18, 31, 10,
        2, 8, 24, 14, 32, 27, 3, 9,
        19, 13, 30, 6, 22, 11, 4, 25
    };

    // PC-1置换表（密钥初始置换）
    static const int PC1[56] = {
        57, 49, 41, 33, 25, 17, 9, 1,
        58, 50, 42, 34, 26, 18, 10, 2,
        59, 51, 43, 35, 27, 19, 11, 3,
        60, 52, 44, 36, 63, 55, 47, 39,
        31, 23, 15, 7, 62, 54, 46, 38,
        30, 22, 14, 6, 61, 53, 45, 37,
        29, 21, 13, 5, 28, 20, 12, 4
    };

    // PC-2置换表（子密钥生成）
    static const int PC2[48] = {
        14, 17, 11, 24, 1, 5, 3, 28,
        15, 6, 21, 10, 23, 19, 12, 4,
        26, 8, 16, 7, 27, 20, 13, 2,
        41, 52, 31, 37, 47, 55, 30, 40,
        51, 45, 33, 48, 44, 49, 39, 56,
        34, 53, 46, 42, 50, 36, 29, 32
    };

    // 循环左移表
    static const int shifts[16] = {
        1, 1, 2, 2, 2, 2, 2, 2,
        1, 2, 2, 2, 2, 2, 2, 1
    };

    // S盒定义（8个4x16表）
    static const int S_BOX[8][4][16] = {
        {{14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7},
         {0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8},
         {4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0},
         {15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13}},
        {{15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10},
         {3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5},
         {0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15},
         {13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9}},
        {{10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8},
         {13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1},
         {13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7},
         {1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12}},
        {{7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15},
         {13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9},
         {10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4},
         {3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14}},
        {{2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9},
         {14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6},
         {4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14},
         {11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3}},
        {{12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11},
         {10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8},
         {9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6},
         {4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13}},
        {{4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1},
         {13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6},
         {1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2},
         {6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12}},
        {{13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7},
         {1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2},
         {7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8},
         {2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11}}
    };

    // 通用置换函数
    void permute(const unsigned char *in, unsigned char *out, const int *table, int size) {
        memset(out, 0, (size + 7) / 8); // 修正：每次置换前清零
        for (int i = 0; i < size; i++) {
            int pos = table[i] - 1;
            int byte_idx = pos / 8;
            int bit_idx = 7 - (pos % 8);
            unsigned char bit = (in[byte_idx] >> bit_idx) & 0x01;
            out[i/8] |= (bit << (7 - (i % 8)));
        }
    }

    // 28 位半部必须按位分割，不能用重叠 memcpy 当作两个 32 位数组。
    uint32_t rotate28(uint32_t value, unsigned shift) {
        return ((value << shift) | (value >> (28 - shift))) & 0x0fffffff;
    }

    void generate_subkeys(const unsigned char *key, unsigned char subkeys[16][6]) {
        unsigned char selected[7] = {0};
        permute(key, selected, PC1, 56);
        uint64_t bits = 0;
        for (int i = 0; i < 7; i++) bits = (bits << 8) | selected[i];
        uint32_t C = (uint32_t)(bits >> 28);
        uint32_t D = (uint32_t)(bits & 0x0fffffff);
        for (int round = 0; round < 16; round++) {
            C = rotate28(C, shifts[round]);
            D = rotate28(D, shifts[round]);
            bits = ((uint64_t)C << 28) | D;
            unsigned char combined[7];
            for (int i = 6; i >= 0; i--) {
                combined[i] = (unsigned char)bits;
                bits >>= 8;
            }
            permute(combined, subkeys[round], PC2, 48);
        }
    }

    // Feistel轮函数
    void feistel(unsigned char *R, const unsigned char *subkey) {
        unsigned char expanded[6] = {0};
        permute(R, expanded, E, 48);

        // 与子密钥异或
        for (int i = 0; i < 6; i++) {
            expanded[i] ^= subkey[i];
        }

        // S盒替换（6位输入 -> 4位输出）
        unsigned char output[4] = {0};
        for (int i = 0; i < 8; i++) {
            int idx = i * 6;
            int row = ((expanded[idx/8] >> (7 - (idx%8))) & 0x01) << 1;
            row |= (expanded[(idx+5)/8] >> (7 - ((idx+5)%8))) & 0x01;

            int col = 0;
            for (int j = 1; j <= 4; j++) {
                col <<= 1;
                col |= (expanded[(idx+j)/8] >> (7 - ((idx+j)%8))) & 0x01;
            }

            int val = S_BOX[i][row][col];
            output[i/2] |= (i % 2 == 0) ? (val << 4) : val;
        }

        // P置换
        unsigned char temp[4] = {0};
        permute(output, temp, P, 32);
        memcpy(R, temp, 4);
    }

    // DES加密核心函数
    void des_crypt(const unsigned char *key, const unsigned char *input,
                  unsigned char *output, int encrypt) {
        unsigned char subkeys[16][6];
        generate_subkeys(key, subkeys);

        // 初始置换
        unsigned char block[8] = {0};
        permute(input, block, IP, 64);

        // 分成左右两部分（各32位）
        unsigned char L[4], R[4];
        memcpy(L, block, 4);
        memcpy(R, block + 4, 4);

        // 16轮Feistel网络
        for (int i = 0; i < 16; i++) {
            unsigned char temp[4];
            memcpy(temp, R, 4);

            int idx = encrypt ? i : 15 - i;
            feistel(R, subkeys[idx]);

            for (int j = 0; j < 4; j++) {
                R[j] ^= L[j];
            }

            memcpy(L, temp, 4);
        }

        // 最终交换并合并
        unsigned char combined[8];
        memcpy(combined, R, 4);
        memcpy(combined + 4, L, 4);

        // 逆初始置换
        permute(combined, output, FP, 64);
    }

    // 加密接口
    void des_encrypt(const unsigned char *key,
                    const unsigned char *input,
                    unsigned char *output) {
        des_crypt(key, input, output, 1);
    }

    // 解密接口
    void des_decrypt(const unsigned char *key,
                    const unsigned char *input,
                    unsigned char *output) {
        des_crypt(key, input, output, 0);
    }

    int main() {
        // 测试向量（符合标准DES测试数据）
        unsigned char key[8] = {0x13, 0x34, 0x57, 0x79, 0x9B, 0xBC, 0xDF, 0xF1};
        unsigned char plaintext[8] = {0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF};
        unsigned char ciphertext[8];
        unsigned char decrypted[8];

        printf("Plaintext:  ");
        for (int i = 0; i < 8; i++) printf("%02X ", plaintext[i]);

        des_encrypt(key, plaintext, ciphertext);
        printf("\nCiphertext: ");
        for (int i = 0; i < 8; i++) printf("%02X ", ciphertext[i]);

        des_decrypt(key, ciphertext, decrypted);
        printf("\nDecrypted:  ");
        for (int i = 0; i < 8; i++) printf("%02X ", decrypted[i]);
        const unsigned char expected[8] = {0x85,0xE8,0x13,0x54,0x0F,0x0A,0xB4,0x05};
        assert(memcmp(ciphertext, expected, 8) == 0);
        assert(memcmp(decrypted, plaintext, 8) == 0);
        printf("\n");
        return 0;
    }

## 识别算法时，什么算证据

8 字节分组与 8 字节密钥只是线索，不能单独识别 DES；输入也可能经过编码、密钥派生或容器封装。更有用的是沿执行路径核对 PC-1/PC-2、八张 S 盒、16 轮 Feistel 更新及子密钥顺序，再用已知输入输出确认。

上面固定向量的密文应为 `85E813540F0AB405`。只检查“加密后再解密得到原文”会漏掉错误但可逆的实现；子密钥分割错误时就可能出现这种情况。这个示例只处理一个 8 字节块，不是完整文件加密工具。
