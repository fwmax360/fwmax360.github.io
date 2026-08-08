---
title: 'RC4 学习'
description: 'RC4 流加密：S 盒初始化、伪随机密钥流生成，以及与明文异或的过程。'
pubDate: 2025-08-01
category: 'Binary'
tags: ['RC4', '加密', '密码学']
series: '密码学基础'
order: 3
---
## RC4 加密算法原理

RC4 是一种流加密算法，它基于一个可变长度的密钥来初始化一个状态向量（S 盒），并生成伪随机密钥流与明文进行异或操作以实现加密。

## 步骤总览

1.  初始化 S 盒
2.  生成初始密钥数组
3.  生成密钥流并进行加解密

## 初始化 S 盒

S 是一个 256 字节长度的数组，初始内容是 0~255 的升序排列：

    s_box = list(range(256))  # [0, 1, 2, ..., 255]

## 初始化密钥并执行 KSA

将用户输入的密钥扩展为长度为 256 的数组，并与 S 盒进行初步置换：

    def ksa(s_box, key):
        j = 0
        key_length = len(key)

        # 扩展密钥：将其重复填充到 256 长度
        key_stream = [ord(key[i % key_length]) for i in range(256)]

        for i in range(256):
            j = (j + s_box[i] + key_stream[i]) % 256
            s_box[i], s_box[j] = s_box[j], s_box[i]

        return s_box

注意：

- `ord(key[i % key_length])`：将字符转为 ASCII 整数（或你也可以直接支持字节输入）
- `s_box[i], s_box[j] = s_box[j], s_box[i]`：交换当前索引和计算后的索引位置

## 生成密钥流并加解密

使用置换后的 S 盒生成伪随机字节流，并对明文进行异或操作：

    def prga(s_box, plaintext):
        i = j = 0
        keystream = []
        ciphertext = []

        for char in plaintext:
            i = (i + 1) % 256
            j = (j + s_box[i]) % 256
            s_box[i], s_box[j] = s_box[j], s_box[i]

            k = s_box[(s_box[i] + s_box[j]) % 256]
            keystream.append(k)

            # 与明文字节进行异或加密
            ciphertext.append(ord(char) ^ k)

        return ciphertext  # 返回的是加密后的字节流

## 解密过程

由于 RC4 是对称加密，**同样的密钥再次异或即可解密**：

    # 加密
    s_box = list(range(256))
    ksa(s_box, "mysecret")
    cipher = prga(s_box, "Hello")

    # 解密
    s_box = list(range(256))
    ksa(s_box, "mysecret")
    plaintext = prga(s_box, ''.join(chr(c) for c in cipher))
    print(''.join(chr(c) for c in plaintext))  # 输出 Hello

    #include <stdio.h>
    #include <string.h>
    #include <stdint.h>

    #define SBOX_LEN 256

    // 初始化 S 盒
    void rc4_init(uint8_t *s, const uint8_t *key, int key_len) {
        for (int i = 0; i < SBOX_LEN; i++) {
            s[i] = i;
        }

        int j = 0;
        for (int i = 0; i < SBOX_LEN; i++) {
            j = (j + s[i] + key[i % key_len]) % SBOX_LEN;
            // 交换 s[i] 和 s[j]
            uint8_t temp = s[i];
            s[i] = s[j];
            s[j] = temp;
        }
    }

    // RC4 加/解密（流加密）
    void rc4_crypt(uint8_t *s, const uint8_t *input, uint8_t *output, int len) {
        int i = 0, j = 0;

        for (int n = 0; n < len; n++) {
            i = (i + 1) % SBOX_LEN;
            j = (j + s[i]) % SBOX_LEN;

            // 交换 s[i] 和 s[j]
            uint8_t temp = s[i];
            s[i] = s[j];
            s[j] = temp;

            // 生成密钥流字节
            uint8_t k = s[(s[i] + s[j]) % SBOX_LEN];

            // 加密或解密
            output[n] = input[n] ^ k;
        }
    }

    // 示例主函数
    int main() {
        const char *key = "mysecret";         // 密钥
        const char *plaintext = "HelloWorld"; // 明文

        int text_len = strlen(plaintext);
        uint8_t s[SBOX_LEN];       // S 盒
        uint8_t ciphertext[512];   // 密文缓冲
        uint8_t decrypted[512];    // 解密结果

        // 初始化 S 盒并加密
        rc4_init(s, (const uint8_t *)key, strlen(key));
        rc4_crypt(s, (const uint8_t *)plaintext, ciphertext, text_len);

        printf("Ciphertext (hex): ");
        for (int i = 0; i < text_len; i++) {
            printf("%02X ", ciphertext[i]);
        }
        printf("\n");

        // 解密：重新初始化 S 盒，再解密
        rc4_init(s, (const uint8_t *)key, strlen(key));
        rc4_crypt(s, ciphertext, decrypted, text_len);
        decrypted[text_len] = '\0'; // 添加字符串结尾

        printf("Decrypted text: %s\n", decrypted);

        return 0;
    }
