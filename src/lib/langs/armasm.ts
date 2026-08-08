import type { LanguageRegistration } from 'shiki'

/**
 * ARM / AArch64 汇编的 TextMate 语法。
 * 覆盖 IDA、objdump、Ghidra 反汇编输出以及手写 .S 源码这几种常见形态。
 */
export const armasm: LanguageRegistration = {
  name: 'armasm',
  scopeName: 'source.armasm',
  aliases: ['arm', 'arm64', 'aarch64'],
  patterns: [
    { include: '#comment' },
    { include: '#string' },
    { include: '#directive' },
    { include: '#label' },
    { include: '#branch' },
    { include: '#mnemonic' },
    { include: '#register' },
    { include: '#shift' },
    { include: '#immediate' },
    { include: '#address' },
  ],
  repository: {
    comment: {
      patterns: [
        { match: '(;|//|@).*$', name: 'comment.line.armasm' },
        { begin: '/\\*', end: '\\*/', name: 'comment.block.armasm' },
      ],
    },

    string: {
      patterns: [
        {
          begin: '"',
          end: '"',
          name: 'string.quoted.double.armasm',
          patterns: [{ match: '\\\\.', name: 'constant.character.escape.armasm' }],
        },
        { match: "'(?:\\\\.|[^'])'", name: 'string.quoted.single.armasm' },
      ],
    },

    directive: {
      match:
        '(^|\\s)(\\.(?:align|arch|arm|ascii|asciz|balign|bss|byte|cfi_\\w+|comm|data|double|eabi_attribute|else|end|endif|endm|equ|extern|fill|float|fnend|fnstart|global|globl|hword|if|include|inst|long|macro|p2align|pool|previous|pushsection|popsection|quad|req|section|set|short|size|skip|space|string|syntax|text|thumb|thumb_func|type|unreq|weak|word|xword|zero)\\b)',
      captures: { 2: { name: 'keyword.control.directive.armasm' } },
    },

    /* loc_1234: / _start: / 0000000000401000 <main>: */
    label: {
      patterns: [
        { match: '^\\s*([\\w$.@]+):', captures: { 1: { name: 'entity.name.function.label.armasm' } } },
        { match: '<[\\w$.@+-]+>', name: 'entity.name.function.armasm' },
      ],
    },

    branch: {
      match:
        '(?i)\\b(b|bl|blx|bx|bxj|blr|br|ret|cbz|cbnz|tbz|tbnz|b\\.(?:eq|ne|cs|hs|cc|lo|mi|pl|vs|vc|hi|ls|ge|lt|gt|le|al)|b(?:eq|ne|cs|hs|cc|lo|mi|pl|vs|vc|hi|ls|ge|lt|gt|le|al)|bl(?:eq|ne|cs|cc|mi|pl|hi|ls|ge|lt|gt|le))\\b',
      name: 'keyword.control.flow.armasm',
    },

    mnemonic: {
      match:
        '(?i)\\b(adcs?|adds?|adrp?|ands?|asrs?|bfc|bfi|bics?|brk|cbnz|cbz|ccmp|ccmn|clrex|clz|cmns?|cmps?|cnt|csel|cset|csetm|csinc|csinv|csneg|dc|dmb|dsb|eors?|eret|extr|hlt|hvc|isb|ld[arp]?|ldax[rb]?|ldp|ldr[bhsw]*|ldur[bh]?|ldm(?:ia|db|ea|fd)?|lsls?|lsrs?|madd|mla|mls|mneg|movk?|movn|movz|movs?|movt|movw|mrs|msr|mul|mvns?|negs?|nop|orns?|orrs?|rbit|rev(?:16|32)?|rors?|rrx|sbcs?|sbfiz|sbfx|sdiv|sev|smaddl|smc|smull|smulh|stp|st[lr]?|stlx[rb]?|str[bhw]*|stur[bh]?|stm(?:ia|db|ea|fd)?|subs?|svc|sxt[bhw]|sys|tbl|teq|tst|ubfiz|ubfm|ubfx|udiv|udf|umaddl|umull|umulh|uxt[bhw]|wfe|wfi|yield|push|pop|dcb|dcd|dcw|fmov|fadd|fsub|fmul|fdiv|fcmp|fcvt\\w*|scvtf|ucvtf|ins|dup|zip[12]|uzp[12]|trn[12]|addv|smax|smin|umax|umin)(?:\\.[wnst])?\\b',
      name: 'keyword.operator.mnemonic.armasm',
    },

    register: {
      patterns: [
        /* AArch64 通用 / 向量寄存器 */
        {
          match: '(?i)\\b([xw](?:[12]\\d|3[01]|\\d)|[qdshbv](?:[12]\\d|3[01]|\\d)|xzr|wzr|sp|lr|fp|pc|nzcv)\\b',
          name: 'variable.language.register.armasm',
        },
        /* AArch32 */
        {
          match: '(?i)\\b(r(?:1[0-5]|\\d)|sl|ip|sb|cpsr|spsr|apsr)\\b',
          name: 'variable.language.register.armasm',
        },
      ],
    },

    shift: {
      match: '(?i)\\b(lsl|lsr|asr|ror|rrx|uxt[bhw]|sxt[bhw]|uxtx|sxtx)\\b',
      name: 'storage.modifier.shift.armasm',
    },

    immediate: {
      patterns: [
        { match: '#?-?\\b0x[0-9a-fA-F]+\\b', name: 'constant.numeric.hex.armasm' },
        { match: '#-?\\d+\\b', name: 'constant.numeric.armasm' },
        { match: '\\b\\d+\\b', name: 'constant.numeric.armasm' },
      ],
    },

    /* [x0, #0x10]! 这类寻址 */
    address: {
      match: '[\\[\\]!{}]',
      name: 'punctuation.section.brackets.armasm',
    },
  },
}
