import type { LanguageRegistration } from 'shiki'

/**
 * Smali（Dalvik 字节码汇编）的 TextMate 语法。
 * Shiki 没有内置，这里按 dalvik opcode 表手写一份。
 */
export const smali: LanguageRegistration = {
  name: 'smali',
  scopeName: 'source.smali',
  aliases: ['baksmali'],
  patterns: [
    { include: '#comment' },
    { include: '#directive' },
    { include: '#label' },
    { include: '#string' },
    { include: '#type' },
    { include: '#invoke' },
    { include: '#opcode' },
    { include: '#register' },
    { include: '#number' },
    { include: '#accessor' },
  ],
  repository: {
    comment: {
      match: '#.*$',
      name: 'comment.line.number-sign.smali',
    },

    directive: {
      match:
        '(^\\s*)(\\.(?:class|super|source|implements|field|subannotation|annotation|end|restart|local|prologue|epilogue|line|parameter|param|enum|method|registers|locals|array-data|packed-switch|sparse-switch|catchall|catch|declared-synchronized)\\b[\\w-]*)',
      captures: {
        2: { name: 'keyword.control.directive.smali' },
      },
    },

    /* :goto_0 / :cond_2 / :try_start_0 这类标签 */
    label: {
      match: '(:[\\w$-]+)',
      name: 'entity.name.label.smali',
    },

    string: {
      begin: '"',
      end: '"',
      name: 'string.quoted.double.smali',
      patterns: [{ match: '\\\\.', name: 'constant.character.escape.smali' }],
    },

    /* Lcom/example/Foo; 形式的类型描述符，以及基本类型 */
    type: {
      patterns: [
        {
          match: '\\[*L[\\w$/-]+;',
          name: 'entity.name.type.class.smali',
        },
        {
          match: '\\[*[VZBSCIJFD](?=[;)\\s]|$)',
          name: 'storage.type.primitive.smali',
        },
      ],
    },

    invoke: {
      match:
        '\\b(invoke-(?:virtual|super|direct|static|interface|polymorphic|custom)(?:/range)?|execute-inline|invoke-direct-empty)\\b',
      name: 'keyword.control.invoke.smali',
    },

    opcode: {
      match:
        '\\b(nop|move(?:-wide|-object|-result|-result-wide|-result-object|-exception)?(?:/from16|/16)?|return(?:-void|-wide|-object)?|const(?:-wide|-string|-class|-method-handle|-method-type)?(?:/16|/4|/high16|/32|/jumbo)?|monitor-enter|monitor-exit|check-cast|instance-of|array-length|new-instance|new-array|filled-new-array(?:/range)?|fill-array-data|throw|goto(?:/16|/32)?|packed-switch|sparse-switch|cmpl-float|cmpg-float|cmpl-double|cmpg-double|cmp-long|if-(?:eq|ne|lt|ge|gt|le)(?:z)?|aget(?:-wide|-object|-boolean|-byte|-char|-short)?|aput(?:-wide|-object|-boolean|-byte|-char|-short)?|iget(?:-wide|-object|-boolean|-byte|-char|-short|-volatile)?|iput(?:-wide|-object|-boolean|-byte|-char|-short|-volatile)?|sget(?:-wide|-object|-boolean|-byte|-char|-short|-volatile)?|sput(?:-wide|-object|-boolean|-byte|-char|-short|-volatile)?|neg-(?:int|long|float|double)|not-(?:int|long)|int-to-(?:long|float|double|byte|char|short)|long-to-(?:int|float|double)|float-to-(?:int|long|double)|double-to-(?:int|long|float)|(?:add|sub|mul|div|rem|and|or|xor|shl|shr|ushr|rsub)-(?:int|long|float|double)(?:/2addr|/lit16|/lit8)?)\\b',
      name: 'keyword.operator.opcode.smali',
    },

    /* v0 p1 这类寄存器 */
    register: {
      match: '\\b([vp]\\d+)\\b',
      name: 'variable.language.register.smali',
    },

    number: {
      patterns: [
        { match: '\\b-?0x[0-9a-fA-F]+[lLsSt]?\\b', name: 'constant.numeric.hex.smali' },
        { match: '\\b-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?[lLfFdDsSt]?\\b', name: 'constant.numeric.smali' },
      ],
    },

    accessor: {
      match:
        '\\b(public|private|protected|static|final|synchronized|bridge|varargs|native|abstract|strictfp|synthetic|constructor|declared-synchronized|interface|enum|annotation|volatile|transient)\\b',
      name: 'storage.modifier.smali',
    },
  },
}
