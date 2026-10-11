---
title: '简单 VM 学习'
description: '以 GWCTF2019 babyvm 为例，梳理虚拟机保护题的基本分析思路。'
pubDate: 2025-08-05
updatedDate: 2026-10-11
category: 'Binary'
tags: ['VM', 'CTF', '虚拟机保护']
---
## VM 逆向基础

以GWCTF2019babyvm为例，先简单介绍一下，可以在buuctf里找到，后序有更多例子

写时用的是Mac，上面ida为9.0，部分会与Windows不一样，我Windows主要用的7.7，部分会分开讲

VM一般比较难度，因为正常情况下都是什么寄存器来读取运算，但VM是自己设置的寄存器，因此存在难度

对于VM来说，最重要的是：

- init
- dispatcher

## init

拿例子来说

    unsigned __int64 __fastcall sub_CD1(__int64 a1)
    {
      unsigned __int64 v2; // [rsp+18h] [rbp-8h]

      v2 = __readfsqword(0x28u);
      *(_DWORD *)a1 = 0;
      *(_DWORD *)(a1 + 4) = 18;
      *(_DWORD *)(a1 + 8) = 0;
      *(_DWORD *)(a1 + 12) = 0;
      *(_QWORD *)(a1 + 16) = &opcode;
      *(_BYTE *)(a1 + 24) = 0xF1;
      *(_QWORD *)(a1 + 32) = sub_B5F;
      *(_BYTE *)(a1 + 40) = 0xF2;
      *(_QWORD *)(a1 + 48) = sub_A64;
      *(_BYTE *)(a1 + 56) = 0xF5;
      *(_QWORD *)(a1 + 64) = sub_AC5;
      *(_BYTE *)(a1 + 72) = 0xF4;
      *(_QWORD *)(a1 + 80) = sub_956;
      *(_BYTE *)(a1 + 88) = 0xF7;
      *(_QWORD *)(a1 + 96) = sub_A08;
      *(_BYTE *)(a1 + 104) = 0xF8;
      *(_QWORD *)(a1 + 112) = sub_8F0;
      *(_BYTE *)(a1 + 120) = 0xF6;
      *(_QWORD *)(a1 + 128) = sub_99C;
      input = malloc(0x512uLL);
      memset(input, 0, 0x512uLL);
      return __readfsqword(0x28u) ^ v2;
    }

这种比较明显的，特点为`*(_BYTE *)(a1 + 40) =0xF2;*(_QWORD *)(a1 + 48) = sub_A64;`，一个操作数，一个函数类型的，而前面

    *(_DWORD *)a1 = 0;
      *(_DWORD *)(a1 + 4) = 18;
      *(_DWORD *)(a1 + 8) = 0;
      *(_DWORD *)(a1 + 12) = 0;
      *(_QWORD *)(a1 + 16) = &opcode;

这段其实就是需要恢复的结构体，因为整个都是围绕的a1来操作的，就像`a[0] = 1;a[1] = 2;`等，我们一般为了简化，会设制一个数组来存放，方便观看，而类似的，因为存在不同类型，所以采用结构体

### 设置结构体

shift+F1，进入`Local types`，这里分ida版本，7.7和9.0不太一样

- 7.7为：右键insert，创建，创建完双击名字，来加入，需注意的是可能出现写一个，出现两个，但你写的那个里面指向另外一个结构体，但只需要将你写的的双击，判断不是靠内容，而是结构体名字
- 9.0为：9.0就简单多了，直接能在上面找到`Local types`，进去直接右键add，再edit

当然这上面只举了部分结构体加入方式，b站上有更准确的操作，不懂可以去看看

### 写结构体

对前面简化为

    *(_DWORD *)a1 = 0;
      *(_DWORD *)(a1 + 4) = 18;
      *(_DWORD *)(a1 + 8) = 0;
      *(_DWORD *)(a1 + 12) = 0;
      *(_QWORD *)(a1 + 16) = &opcode;
      *(_BYTE *)(a1 + 16+8*n) = 操作码;
      *(_QWORD *)(a1 + 16+8*(n+1)) = 函数;
      .
      .
      .

因此可以先处理后面重复的

找到相同点

    struct vm_opcode
    {
       unsigned __int64 opcode;
       void (*handle)(void *);
    };

先加入，就成了

    *(_DWORD *)a1 = 0;
      *(_DWORD *)(a1 + 4) = 18;
      *(_DWORD *)(a1 + 8) = 0;
      *(_DWORD *)(a1 + 12) = 0;
      *(_QWORD *)(a1 + 16) = &opcode;
      vm_opcode op_list[OPCODE_N];//OPCODE_N为数目

因此就写成了

    struct vm_cpu // 此布局在 64 位、默认对齐下为 0x98；不证明第 8 项已初始化
    {
        unsigned int R0;
        unsigned int R1;
        unsigned int R2;
        unsigned int R3;
        unsigned __int8 *rip;
        vm_opcode op_list[8]; // 类型暂留 8 项，片段中仅能确认 7 项被初始化
    };

修复好了为

    unsigned __int64 __fastcall sub_CD1(vm_cpu *a1)
    {
      unsigned __int64 v2; // [rsp+18h] [rbp-8h]

      v2 = __readfsqword(0x28u);
      a1->R0 = 0;
      a1->R1 = 18;
      a1->R2 = 0;
      a1->R3 = 0;
      a1->rip = (unsigned __int8 *)&opcode;
      LOBYTE(a1->op_list[0].opcode) = 0xF1;
      a1->op_list[0].handle = (void (*)(void *))sub_B5F;
      LOBYTE(a1->op_list[1].opcode) = 0xF2;
      a1->op_list[1].handle = (void (*)(void *))sub_A64;
      LOBYTE(a1->op_list[2].opcode) = 0xF5;
      a1->op_list[2].handle = (void (*)(void *))sub_AC5;
      LOBYTE(a1->op_list[3].opcode) = 0xF4;
      a1->op_list[3].handle = (void (*)(void *))sub_956;
      LOBYTE(a1->op_list[4].opcode) = 0xF7;
      a1->op_list[4].handle = (void (*)(void *))sub_A08;
      LOBYTE(a1->op_list[5].opcode) = 0xF8;
      a1->op_list[5].handle = (void (*)(void *))sub_8F0;
      LOBYTE(a1->op_list[6].opcode) = 0xF6;
      a1->op_list[6].handle = (void (*)(void *))sub_99C;
      input = malloc(0x512uLL);
      memset(input, 0, 0x512uLL);
      return __readfsqword(0x28u) ^ v2;
    }

## dispatcher

其实就是如何实现上面的

对于该题来说为

    unsigned __int64 __fastcall sub_E0B(vm_cpu *a1)
    {
      unsigned __int64 v2; // [rsp+18h] [rbp-8h]

      v2 = __readfsqword(0x28u);
      a1->rip = (unsigned __int8 *)&opcode;
      while ( *a1->rip != 0xF4 )
        dispatcher(a1);
      return __readfsqword(0x28u) ^ v2;
    }

    unsigned __int64 __fastcall sub_E6E(vm_cpu *a1)
    {
      int i; // [rsp+14h] [rbp-Ch]
      unsigned __int64 v3; // [rsp+18h] [rbp-8h]

      v3 = __readfsqword(0x28u);
      for ( i = 0; *a1->rip != LOBYTE(a1->op_list[i].opcode); ++i )
        ;
      a1->op_list[i].handle(a1);
      return __readfsqword(0x28u) ^ v3;
    }

大概就是rip = 0xF4时退出，否则进入dispatcher

里面就是对根据opcode选择函数执行

至于函数，如

    unsigned __int64 __fastcall sub_B5F(vm_cpu *a1)
    {
      unsigned __int8 *v2; // [rsp+28h] [rbp-18h]
      unsigned __int64 v3; // [rsp+38h] [rbp-8h]

      v3 = __readfsqword(0x28u);
      v2 = a1->rip + 2;
      switch ( a1->rip[1] )
      {
        case 0xE1u:
          a1->R0 = *((char *)input + *(int *)v2);
          break;
        case 0xE2u:
          a1->R1 = *((char *)input + *(int *)v2);
          break;
        case 0xE3u:
          a1->R2 = *((char *)input + *(int *)v2);
          break;
        case 0xE4u:
          *((_BYTE *)input + *(int *)v2) = a1->R0;
          break;
        case 0xE5u:
          a1->R3 = *((char *)input + *(int *)v2);
          break;
        case 0xE7u:
          *((_BYTE *)input + *(int *)v2) = a1->R1;
          break;
        default:
          break;
      }
      a1->rip += 6;
      return __readfsqword(0x28u) ^ v3;
    }

这里看的个人发现了原来没注意的switch汇编形式，和input在哪出现的问题，tab转汇编

    push    rbp
    mov     rbp, rsp
    sub     rsp, 40h
    mov     [rbp+var_38], rdi       ; rdi 是 vm_cpu *a1
    mov     rax, fs:28h
    mov     [rbp+var_8], rax        ; 栈 canary（stack cookie）保护，不用管
    xor     eax, eax
    mov     rax, [rbp+var_38]       ; rax = a1
    mov     rax, [rax+10h]          ; rax = a1->rip
    add     rax, 1
    mov     [rbp+var_20], rax       ; var_20 = a1->rip + 1

    mov     rax, [rbp+var_38]
    mov     rax, [rax+10h]
    add     rax, 2
    mov     [rbp+var_18], rax       ; var_18 = a1->rip + 2
    mov     rax, cs:input           ;**主要问题在这里**
    mov     [rbp+var_10], rax
    mov     rax, [rbp+var_20]       ; rax = a1->rip + 1
    movzx   eax, byte ptr [rax]     ; 读取 *(a1->rip + 1)
    sub     eax, 0E1h               ;** 减去0xE1（起始值）**
    cmp     eax, 6                  ; 是否在 0 ~ 6 范围
    ja      def_BE6                 ; 否则跳转到 default

    ; 跳转表部分
    lea     rdx, ds:0[rax*4]
    lea     rax, jpt_BE6
    mov     eax, ds:(jpt_BE6 - 1130h)[rdx+rax]
    movsxd  rdx, eax
    lea     rax, jpt_BE6
    add     rax, rdx
    jmp     rax                     ; 跳到对应 case 标签

对其标了每个的意思，发现了`mov rax, cs:input `，input在代码段寄存器上，相当于`mov rax, offset input`，跟着后面的函数知道了，以case 0xE1u:为例，其实这就是往寄存器中存放了`input[a1->rip+2]`

简单的分析一下得

    #include<stdio.h>
    void myswap(char*a,char*b);
    int main()
    {
        unsigned char opcode[575] = {
        0xF5, 0xF1, 0xE1, 0x00, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x20, 0x00, 0x00, 0x00, 0xF1, 0xE1,
        0x01, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x21, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x02, 0x00, 0x00,
        0x00, 0xF2, 0xF1, 0xE4, 0x22, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x03, 0x00, 0x00, 0x00, 0xF2, 0xF1,
        0xE4, 0x23, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x04, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x24, 0x00,
        0x00, 0x00, 0xF1, 0xE1, 0x05, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x25, 0x00, 0x00, 0x00, 0xF1,
        0xE1, 0x06, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x26, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x07, 0x00,
        0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x27, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x08, 0x00, 0x00, 0x00, 0xF2,
        0xF1, 0xE4, 0x28, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x09, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x29,
        0x00, 0x00, 0x00, 0xF1, 0xE1, 0x0A, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x2A, 0x00, 0x00, 0x00,
        0xF1, 0xE1, 0x0B, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x2B, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x0C,
        0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x2C, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x0D, 0x00, 0x00, 0x00,
        0xF2, 0xF1, 0xE4, 0x2D, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x0E, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4,
        0x2E, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x0F, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x2F, 0x00, 0x00,
        0x00, 0xF1, 0xE1, 0x10, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x30, 0x00, 0x00, 0x00, 0xF1, 0xE1,
        0x11, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x31, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x12, 0x00, 0x00,
        0x00, 0xF2, 0xF1, 0xE4, 0x32, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x13, 0x00, 0x00, 0x00, 0xF2, 0xF1,
        0xE4, 0x33, 0x00, 0x00, 0x00, 0xF4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0xF5, 0xF1, 0xE1, 0x00, 0x00, 0x00, 0x00, 0xF1, 0xE2, 0x01, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4,
        0x00, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x01, 0x00, 0x00, 0x00, 0xF1, 0xE2, 0x02, 0x00, 0x00, 0x00,
        0xF2, 0xF1, 0xE4, 0x01, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x02, 0x00, 0x00, 0x00, 0xF1, 0xE2, 0x03,
        0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x02, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x03, 0x00, 0x00, 0x00,
        0xF1, 0xE2, 0x04, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x03, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x04,
        0x00, 0x00, 0x00, 0xF1, 0xE2, 0x05, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x04, 0x00, 0x00, 0x00,
        0xF1, 0xE1, 0x05, 0x00, 0x00, 0x00, 0xF1, 0xE2, 0x06, 0x00, 0x00, 0x00, 0xF2, 0xF1, 0xE4, 0x05,
        0x00, 0x00, 0x00, 0xF1, 0xE1, 0x06, 0x00, 0x00, 0x00, 0xF1, 0xE2, 0x07, 0x00, 0x00, 0x00, 0xF1,
        0xE3, 0x08, 0x00, 0x00, 0x00, 0xF1, 0xE5, 0x0C, 0x00, 0x00, 0x00, 0xF6, 0xF7, 0xF1, 0xE4, 0x06,
        0x00, 0x00, 0x00, 0xF1, 0xE1, 0x07, 0x00, 0x00, 0x00, 0xF1, 0xE2, 0x08, 0x00, 0x00, 0x00, 0xF1,
        0xE3, 0x09, 0x00, 0x00, 0x00, 0xF1, 0xE5, 0x0C, 0x00, 0x00, 0x00, 0xF6, 0xF7, 0xF1, 0xE4, 0x07,
        0x00, 0x00, 0x00, 0xF1, 0xE1, 0x08, 0x00, 0x00, 0x00, 0xF1, 0xE2, 0x09, 0x00, 0x00, 0x00, 0xF1,
        0xE3, 0x0A, 0x00, 0x00, 0x00, 0xF1, 0xE5, 0x0C, 0x00, 0x00, 0x00, 0xF6, 0xF7, 0xF1, 0xE4, 0x08,
        0x00, 0x00, 0x00, 0xF1, 0xE1, 0x0D, 0x00, 0x00, 0x00, 0xF1, 0xE2, 0x13, 0x00, 0x00, 0x00, 0xF8,
        0xF1, 0xE4, 0x0D, 0x00, 0x00, 0x00, 0xF1, 0xE7, 0x13, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x0E, 0x00,
        0x00, 0x00, 0xF1, 0xE2, 0x12, 0x00, 0x00, 0x00, 0xF8, 0xF1, 0xE4, 0x0E, 0x00, 0x00, 0x00, 0xF1,
        0xE7, 0x12, 0x00, 0x00, 0x00, 0xF1, 0xE1, 0x0F, 0x00, 0x00, 0x00, 0xF1, 0xE2, 0x11, 0x00, 0x00,
        0x00, 0xF8, 0xF1, 0xE4, 0x0F, 0x00, 0x00, 0x00, 0xF1, 0xE7, 0x11, 0x00, 0x00, 0x00,0xf4};
        //翻译
        for (int i = 0; i < 575; )
        {
            if (opcode[i] == 0xf1)
            {
                switch (opcode[i+1])
                {
                case 0xE1:
                    printf("R0=input[%d]\n",*(int*)&opcode[i+2]);
                    break;
                case 0xE2:
                    printf("R1=input[%d]\n",*(int*)&opcode[i+2]);
                    break;
                case 0xE3:
                    printf("R2=input[%d]\n",*(int*)&opcode[i+2]);
                    break;
                case 0xE4:
                    printf("input[%d]=R0\n",*(int*)&opcode[i+2]);
                    break;
                case 0xE5:
                    printf("R3=input[%d]\n",*(int*)&opcode[i+2]);
                    break;
                case 0xE7:
                    printf("input[%d]=R1\n",*(int*)&opcode[i+2]);
                    break;
                default:
                    printf("mov wrong!!!!!n");
                    break;
                }
                i+=6;
            }
            else if (opcode[i] == 0xf2)
            {
                printf("R0=R0^R1\n");
                i+=1;
            }
            else if (opcode[i] == 0xf5)
            {
                printf("please input:(len)\n");
                i+=1;
            }
            else if (opcode[i] == 0xf4)
            {
                printf("0xF4 nop\n");
                printf("\n");
                i+=1;
            }
            else if (opcode[i] == 0xf7)
            {
                printf("R0*=R3\n");
                i+=1;
            }
            else if (opcode[i] == 0xf8)
            {
                printf("R0<->R1(R0,R1)\n");
                i+=1;
            }
            else if (opcode[i] == 0xf6)
            {
                printf("R0=R2+2*R1+3*R0\n");
                i+=1;
            }
            else if(opcode[i]==0)
            {
                printf("nop\n");
                i++;
            }
        }
        printf("over!!\n");

        return 0;
    }

运行一下得

    please input:(len)
    R0=input[0]
    R0=R0^R1
    input[32]=R0
    R0=input[1]
    R0=R0^R1
    input[33]=R0
    R0=input[2]
    R0=R0^R1
    input[34]=R0
    R0=input[3]
    R0=R0^R1
    input[35]=R0
    R0=input[4]
    R0=R0^R1
    input[36]=R0
    R0=input[5]
    R0=R0^R1
    input[37]=R0
    R0=input[6]
    R0=R0^R1
    input[38]=R0
    R0=input[7]
    R0=R0^R1
    input[39]=R0
    R0=input[8]
    R0=R0^R1
    input[40]=R0
    R0=input[9]
    R0=R0^R1
    input[41]=R0
    R0=input[10]
    R0=R0^R1
    input[42]=R0
    R0=input[11]
    R0=R0^R1
    input[43]=R0
    R0=input[12]
    R0=R0^R1
    input[44]=R0
    R0=input[13]
    R0=R0^R1
    input[45]=R0
    R0=input[14]
    R0=R0^R1
    input[46]=R0
    R0=input[15]
    R0=R0^R1
    input[47]=R0
    R0=input[16]
    R0=R0^R1
    input[48]=R0
    R0=input[17]
    R0=R0^R1
    input[49]=R0
    R0=input[18]
    R0=R0^R1
    input[50]=R0
    R0=input[19]
    R0=R0^R1
    input[51]=R0
    0xF4 nop

    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    nop
    please input:(len)
    R0=input[0]
    R1=input[1]
    R0=R0^R1
    input[0]=R0
    R0=input[1]
    R1=input[2]
    R0=R0^R1
    input[1]=R0
    R0=input[2]
    R1=input[3]
    R0=R0^R1
    input[2]=R0
    R0=input[3]
    R1=input[4]
    R0=R0^R1
    input[3]=R0
    R0=input[4]
    R1=input[5]
    R0=R0^R1
    input[4]=R0
    R0=input[5]
    R1=input[6]
    R0=R0^R1
    input[5]=R0
    R0=input[6]
    R1=input[7]
    R2=input[8]
    R3=input[12]
    R0=R2+2*R1+3*R0
    R0*=R3
    input[6]=R0
    R0=input[7]
    R1=input[8]
    R2=input[9]
    R3=input[12]
    R0=R2+2*R1+3*R0
    R0*=R3
    input[7]=R0
    R0=input[8]
    R1=input[9]
    R2=input[10]
    R3=input[12]
    R0=R2+2*R1+3*R0
    R0*=R3
    input[8]=R0
    R0=input[13]
    R1=input[19]
    R0<->R1(R0,R1)
    input[13]=R0
    input[19]=R1
    R0=input[14]
    R1=input[18]
    R0<->R1(R0,R1)
    input[14]=R0
    input[18]=R1
    R0=input[15]
    R1=input[17]
    R0<->R1(R0,R1)
    input[15]=R0
    input[17]=R1
    0xF4 nop

    over!!

有两段，先看第一段

    please input:(len)
    R0=input[0]
    R0=R0^R1
    input[32]=R0
    R0=input[1]
    R0=R0^R1
    input[33]=R0
    R0=input[2]
    R0=R0^R1
    input[34]=R0
    R0=input[3]
    R0=R0^R1
    input[35]=R0
    R0=input[4]
    R0=R0^R1
    input[36]=R0
    R0=input[5]
    R0=R0^R1
    input[37]=R0
    R0=input[6]
    R0=R0^R1
    input[38]=R0
    R0=input[7]
    R0=R0^R1
    input[39]=R0
    R0=input[8]
    R0=R0^R1
    input[40]=R0
    R0=input[9]
    R0=R0^R1
    input[41]=R0
    R0=input[10]
    R0=R0^R1
    input[42]=R0
    R0=input[11]
    R0=R0^R1
    input[43]=R0
    R0=input[12]
    R0=R0^R1
    input[44]=R0
    R0=input[13]
    R0=R0^R1
    input[45]=R0
    R0=input[14]
    R0=R0^R1
    input[46]=R0
    R0=input[15]
    R0=R0^R1
    input[47]=R0
    R0=input[16]
    R0=R0^R1
    input[48]=R0
    R0=input[17]
    R0=R0^R1
    input[49]=R0
    R0=input[18]
    R0=R0^R1
    input[50]=R0
    R0=input[19]
    R0=R0^R1
    input[51]=R0
    0xF4 nop

发现就是简单的与R1异或，R1 = 18

后面有个简单比较，试试

    char arr[]="Fz{aM{aM|}fMt~suM !!";

        for(int i =0;i<21;i++){
            arr[i]^=18;
        }
        for(int i=0;i<21;i++){
            printf("%c",arr[i]);
        }
        printf("\n");
        //This_is_not_flag_233

接着分析

    please input:(len)
    R0=input[0]
    R1=input[1]
    R0=R0^R1
    input[0]=R0      input[0] = input[0]^input[1]
    R0=input[1]
    R1=input[2]
    R0=R0^R1         input[1] = input[1]^input[2]
    input[1]=R0
    R0=input[2]
    R1=input[3]
    R0=R0^R1
    input[2]=R0
    R0=input[3]
    R1=input[4]
    R0=R0^R1
    input[3]=R0
    R0=input[4]
    R1=input[5]
    R0=R0^R1
    input[4]=R0
    R0=input[5]
    R1=input[6]
    R0=R0^R1
    input[5]=R0
    R0=input[6]
    R1=input[7]
    R2=input[8]
    R3=input[12]
    R0=R2+2*R1+3*R0
    R0*=R3
    input[6]=R0 input[6] = input[12]*(input[8]+2*input[7]+3*input[6])
    R0=input[7]
    R1=input[8]
    R2=input[9]
    R3=input[12]
    R0=R2+2*R1+3*R0
    R0*=R3
    input[7]=R0
    R0=input[8]
    R1=input[9]
    R2=input[10]
    R3=input[12]
    R0=R2+2*R1+3*R0
    R0*=R3
    input[8]=R0
    R0=input[13]
    R1=input[19]
    R0<->R1(R0,R1) //置换  13  19
    input[13]=R0
    input[19]=R1
    R0=input[14]
    R1=input[18]
    R0<->R1(R0,R1) //置换14 18
    input[14]=R0
    input[18]=R1
    R0=input[15]
    R1=input[17]
    R0<->R1(R0,R1) //置换15 17
    input[15]=R0
    input[17]=R1
    0xF4 nop

一开始我接着比较，发现存在问题，在input比较那交叉引用，发现

    unsigned __int64 sub_F00()
    {
      int i; // [rsp+Ch] [rbp-14h]
      unsigned __int64 v2; // [rsp+18h] [rbp-8h]

      v2 = __readfsqword(0x28u);
      for ( i = 0; dword_2022A4 - 1 > i; ++i )
      {
        if ( *((_BYTE *)input + i) != byte_202020[i] )
          exit(0);
      }
      return __readfsqword(0x28u) ^ v2;
    }

这个函数，这个函数试试

    unsigned char result[]={0x69, 0x45, 0x2A, 0x37, 0x09, 0x17, 0xC5, 0x0B, 0x5C, 0x72, 0x33, 0x76, 0x33, 0x21, 0x74, 0x31, 0x5F, 0x33, 0x73, 0x72};
        for(int i=30;i<127;i++)
        {
            if(result[8]==(unsigned char)((result[10]+2*result[9]+3*i)*result[12])){
                result[8] = i;
            }
        }
        for(int i=30;i<127;i++)
        {
            if(result[7]==(unsigned char)((result[9]+2*result[8]+3*i)*result[12])){
                result[7] = i;
            }
        }
        for(int i=30;i<127;i++)
        {
            if(result[6]==(unsigned char)((result[8]+2*result[7]+3*i)*result[12])){
                result[6] = i;
            }
        }
        swap(&result[13],&result[19]);
        swap(&result[14],&result[18]);
        swap(&result[15],&result[17]);
        for(int i=5;i>=0;i--){
            result[i] = result[i]^result[i+1];
        }
        for(size_t i=0;i<sizeof(result);i++){
            printf("%c",result[i]);
        }

这里保留的是原题反编译片段和还原思路，文末片段不是独立程序：`swap` 等定义仍需补齐。`result` 含 20 个元素，打印按 `sizeof(result)` 限定；穷举的 30–126 范围只覆盖假定的可打印候选，不是所有字节。完整求解还需用原题比较函数核对。
