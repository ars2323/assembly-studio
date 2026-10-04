# Executable image format (.asx) — version 1

An `.asx` file is a text file that holds an assembled program **exactly as it sits in memory**: instruction words,
data bytes, the start address and the labels. It is meant for programs that run MIPS or RISC-V code without an
assembler. It is not an object file: there is nothing to link or relocate.

The app's toolbar button **Export executable image (.asx)** writes it. In both ISAs the button is shown while a file
is open and works once the program has been assembled. The image is of the **program assembled last** (even if the
editor has changed since). The writer is `electron/src/core/asx.ts`; this document is the reference.

## 1. Example

```
ASX 1
isa           riscv
source        sum.s
source-sha256 b96f3bf3bde4b725229f8bc5e0153d950c325a7b4b51dc27150c765d1ab8083a
produced-by   Assembly Studio 1.0.0
assembled     2026-10-04T16:27+09:00
endian        little

entry         0x00400000
reg sp        0x7fffeffc
reg gp        0x10008000

symbol main   0x00400000
symbol result 0x10010000

.text 0x00400000 words 21
f0f0f2b7
0f028293
…
00000073

.data 0x10010000 bytes 4
00 00 00 00
```

## 2. File

- UTF-8, LF line endings; the last line also ends with LF.
- Blank lines only separate groups and carry no meaning. A reader skips them.
- All numbers are unsigned 32-bit. Addresses and register values are `0x` followed by 8 lowercase hex digits.
- **Key-value lines**: a key, one or more spaces, then the value (to the end of the line; it may contain spaces).
  A key is one word, or two words such as `reg <name>` and `symbol <name>`. The writer pads keys to 13 columns
  (one space if longer), but a reader must not depend on the column count.

## 3. Header

The order is fixed.

| Line | Value |
|---|---|
| `ASX 1` | Magic string and version. The first line. If it differs, do not read the file |
| `isa` | `mips` or `riscv` |
| `source` | Source file name (no path). `untitled.s` if it was never saved |
| `source-sha256` | SHA-256 of the assembled source (64 lowercase hex digits), over the bytes **as written in the file** (encoding, BOM, line endings). If a saved file was assembled as it is, this equals that file's SHA-256. A new file counts as UTF-8, no BOM, LF |
| `produced-by` | App name and version |
| `assembled` | When it was assembled: local time to the minute with the UTC offset, e.g. `2026-10-04T16:27+09:00` |
| `endian` | `little` or `big`: the byte order in which words are placed in memory |
| `entry` | The PC where execution starts |
| `reg <name>` | Register values right after assembly: stack pointer, then global pointer (§6) |
| `symbol <name>` | A label and its address. Zero or more, ordered by address, then by name for equal addresses. If there are none, the group and the blank line after it are absent |

## 4. `.text`

```
.text <address> words <n>
```

Followed by one item per line:

- `xxxxxxxx` — one word, 8 lowercase hex digits. This is **the word's value** (the instruction encoding), not
  the byte order in memory. Word i (from 0) goes at `<address> + 4i`, in `endian` order.
- `zero <k>` — k zero words. The writer uses this only for runs of 4 or more zero words (16 bytes); shorter runs
  are written as `00000000` lines.

The total number of words (including `zero`) is `n`. `.text` is always present (a program with no instructions has
no image).

## 5. `.data`

```
.data <address> bytes <n>
```

If there is no data, the whole group is absent. Followed by one item per line:

- `bb bb …` — 1 to 16 bytes, 2 lowercase hex digits each, separated by spaces. They are **in memory address order**
  (byte order is already applied: `.word 1` is `01 00 00 00` on a little-endian machine).
- `zero <k>` — k zero bytes. Used only for runs of 16 or more zero bytes.

The total number of bytes is `n`.

Memory outside `.text` and `.data` (stack, heap, kernel) is not in the image. A reader sets it to 0.

## 6. Per ISA

### MIPS (SPIM)

| Item | Content |
|---|---|
| `.text` | From the first to the last word of the user text segment. Includes the startup code at `0x00400000` (`__start`, from the exception handler file) and excludes kernel text. Gaps left by `.text <address>` are 0 |
| `.data` | From where the assembler placed the first data to where the next data would go (including a trailing `.space`). If the user data segment has non-zero bytes outside that range, the range is widened to a word boundary. Kernel data is excluded |
| `entry` | The address of `main`. For a program with its own `__start` and no exception handler, `__start` |
| `reg` | `$sp`, `$gp` (`$sp` points to argc) |
| `endian` | Taken from the order in which argc at `$sp` is laid out in memory (the order of the machine the core runs on, usually `little`) |
| `symbol` | The program's own labels (global and local) in user text and data. Labels of the exception handler (`__start`, `__eoth`, kernel labels) are excluded |

### RISC-V (RARS 1.6, default memory configuration)

| Item | Content |
|---|---|
| `.text` | The assembled instruction words, from the lower of `entry` and the first instruction to the last instruction; gaps are 0. Pseudo-instructions appear as the basic instructions they expand to. RARS does not accept data directives in `.text`, so every word is an instruction |
| `.data` | From the `.data` base address `0x10010000` to where the next data would go (including a trailing `.space`). Widened to cover data labels (`.extern` starts at `0x10000000`) and non-zero bytes between `0x10000000` and `0x10040000` (the start of the heap) and wherever labels reach (not aligned to a word boundary) |
| `entry` | `0x00400000`, the start of the text segment. The app's engine assembles with RARS's "start at main" setting off, so RARS also starts here. A `main` label (global or not) does not change the start address: the first instruction must come first |
| `reg` | `sp` (x2) = `0x7fffeffc`, `gp` (x3) = `0x10008000`. Values read from the engine |
| `endian` | `little`. RARS memory is always little-endian; the exporter confirms it by having the engine write a known word and reading it back |
| `symbol` | Every label in the RARS symbol table (local, global, `.extern`). RARS has no startup code, so they all belong to the program |

"Where the next data would go" is not reported by the engine. The app appends `.data` and one label
(`__asx_data_end:`) to the program, assembles it in a second engine instance, and reads that label's address.
The appended `.data` continues where the user data segment stopped. That label does not appear among the image's
`symbol` lines. If the program already has a label with that name, nothing is appended; in that case the part of a
trailing `.space` that has neither a label nor a non-zero byte is left out.

## 7. Versions

The number after `ASX` is the version, currently **1**. It goes up whenever a line's meaning or order changes, or a
line is added.
