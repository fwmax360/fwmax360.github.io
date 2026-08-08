---
title: '解包之后：怎样把压成一行的 JavaScript 读得下去'
description: '解包成功不等于可读。先保护字符串/注释/正则，再做定点替换，最后交给语法感知的美化器——比全局正则靠谱得多。'
pubDate: 2026-01-20
category: 'Android'
tags: ['javascript', '解包', '美化', '小程序', '逆向基础']
series: '逆向基础'
order: 4
---

小程序、插件、H5 壳解包之后，JS 经常只剩一两行：空白没了，变量名被压扁，字符串和正则挤在一起。这通常不是解包失败，而是构建链做过压缩 / 混淆：

- 删除空白、换行和注释
- 变量名、函数名压缩
- 合并表达式和控制流
- 字符串转义或拆分
- 打包成单文件 / 再过混淆器

**解包**和**可读化**是两件事。前者拿文件，后者让人能读。后续还可以继续做变量重命名、字符串整理和逻辑分析。

## 别对整文件瞎正则

直接 `re.sub` 改关键字，在 JS 里很容易误伤：

```js
const text = "const value = 1";
const re = /const\s+value/;
// const value should remain in this comment
```

如果直接搜 `const`，字符串、正则字面量和注释里的内容也可能被改掉。替换一次后后面字符位置会变，继续用旧偏移就会改错。

更稳的三段式：

```text
扫描受保护区域
    → 只在普通代码区做正则 / 偏移编辑
    → 交给 JS 美化器重新排版
```

## 保护区域 + 倒序应用编辑

### 先识别受保护区域

至少要保护：

- `'...'` / `"..."` / `` `...` ``
- `//` 与 `/* */`
- 正则字面量 `/.../flags`（和除法区分开）

保护区域只记起止：

```python
ProtectedSpan(start=120, end=168)
```

之后规则只在这些区域之外跑。这里不需要完整 JS 编译器，但必须有足够保守的词法扫描——否则 `/` 很难区分是除法还是正则开头。常见启发：看前一个有效字符是否在 `([{,:;=!&|?+-*%^~<>`，或前一个词是否是 `return` / `typeof` / `case` 等。

### 用编辑记录代替立即替换

不要在 `re.sub()` 回调里不断改原串，先记编辑：

```python
OffsetEdit(start=300, end=315, replacement="decodedValue")
```

一轮扫完后，按 `start` **从大到小**应用：

```python
for edit in sorted(edits, key=lambda e: e.start, reverse=True):
    source = source[:edit.start] + edit.replacement + source[edit.end:]
```

这样前面的偏移不会被后面的长度变化带崩。重叠编辑应直接报错，不要猜该留哪一个。

### 每条规则完成后重新扫描

如果一条规则改了长度，下一条不能复用上一轮的保护区域：

```text
规则 1：扫描 → 生成编辑 → 倒序应用
规则 2：重新扫描 → 生成编辑 → 倒序应用
规则 3：重新扫描 → 生成编辑 → 倒序应用
```

规则可以放 JSON：

```json
[
  {
    "pattern": "旧函数名",
    "replacement": "新函数名",
    "flags": ["I"]
  }
]
```

只会命中普通代码区；字符串、注释、正则字面量被刻意跳过。注意用的是 Python `re` 语法，不是 JS 正则的全部特性。

## 排版交给美化器

定点规则适合改个别符号；括号、对象、链式调用应交给 `jsbeautifier` 这类语法感知工具。常用策略：

- 默认四个空格缩进
- 保留有限原始空行
- 文件末尾补换行
- 美化前后都做 Node 语法检查

```bash
# 安装依赖（按你本机工具目录）
python3 -m pip install -r requirements.txt

# 只美化 JS / WXS
python3 beatifual_js.py /path/to/unpacked

# 顺带 WXSS / JSON，并备份
python3 beatifual_js.py /path/to/unpacked \
  --include-css --include-json --backup

# 先看会改哪些文件
python3 beatifual_js.py /path/to/unpacked --dry-run
```

`--dry-run` 只报告变化、不写回；确认后再加 `--backup`，写回前生成同名 `.bak`，并用临时文件 + `os.replace()` 做原子替换。

## 完整工作流

### 1. 保留原始解包目录

不要在唯一副本上反复试：

```text
unpacked-original/    原始解包结果（只读）
unpacked-work/        美化和分析目录
rules.json            项目专用规则
```

### 2. 先做纯格式化

先不启用自定义规则，看美化器能否正常解析。语法完整的代码，这一步通常就能恢复缩进、换行和块结构。

### 3. 再添加定点规则

只有确认某段文本确实需要修复时才加规则。每条规则应有明确输入、输出和作用范围，避免过宽的 `.*`。

### 4. 检查语法和差异

```bash
node --check file.js
```

批量结果还要看：

- 文件数量是否与解包目录一致
- 是否出现大量空文件
- 字符串数量是否异常减少
- `require` / `import` / 导出对象是否还在
- 关键函数调用前后是否一致

## 常见问题

### 美化器报错

先用 `--dry-run` 定位文件。若 Node 语法检查失败，脚本应跳过并保留原文。确实存在非标准语法时，可临时：

```bash
python3 beatifual_js.py /path/to/unpacked --no-syntax-check
```

这时务必先复制工作目录，处理后手动抽查。

### 美化后仍然难以阅读

这说明问题已经超出排版范围：

- 变量名压缩到失去语义
- 控制流平坦化
- 字符串运行时拼接 / 解密

美化器只能恢复布局，不能凭空恢复原始变量名。下一步应结合调用关系、字符串 xref 和控制流逐步重命名，而不是继续堆全局正则。

### 正则规则没有命中

检查目标是否其实在字符串 / 注释 / 正则字面量里——保护扫描会故意跳过。再确认 pattern 是否按 Python `re` 写对了。

## 小结

```text
词法保护 → 定点编辑 → 美化器 → 语法检查 → 备份写回
```

脚本实现可以很朴素：一段保守的词法扫描 + 规则 JSON + `jsbeautifier`。仓库里若有现成 `beatifual_js.py`，把它当成流水线执行器即可；文章本身只需要把这条边界守住——**字符串里的文本不是代码**。
