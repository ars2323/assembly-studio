# Engine protocol — version 2

The contract between the Electron app (the **app**) and the Java wrapper around RARS (the **engine**; the current
implementation is `probe/src/RarsProbe.java`). This document is the reference: where the implementation differs,
the implementation is wrong.

## 1. Transport

- The engine is a child process. The app writes **requests to the engine's stdin** and reads **responses and
  events from its stdout**.
- One JSON object per line, UTF-8, lines end with `\n`. Messages contain no raw newlines (a newline inside a string
  is the `\n` escape).
- **stdout (fd 1) is for the protocol only.** Whatever RARS or the JVM prints, only protocol messages go to fd 1.
  The program's console output comes wrapped in `out`/`err` events. The JVM is started with
  `-Xlog:disable -Xlog:all=warning:stderr` (by default JVM warnings go to fd 1 and break the stream — this has
  happened).
- stderr is free-form diagnostic text. The app logs it and does not interpret it.
- One engine handles one program (RARS state is process-wide). If several programs are needed, start several engines.

## 2. The three kinds of message

| Kind | How to tell | Example |
|---|---|---|
| Request (app → engine) | has `cmd` | `{"id":7,"cmd":"step"}` |
| Response (engine → app) | has an `id` key | `{"id":7,"ok":true,"reason":"MAX_STEPS",...}` |
| Event (engine → app) | has `ev` and no `id` key | `{"ev":"out","text":"42"}` |

### Requests

```json
{"id": <number|string>, "cmd": "<command>", ...per-command parameters}
```

- The app chooses `id`. The engine returns **the same value, with the same JSON type**, in the response.
  If `id` is left out, the response's `id` is `null`. Keeping ids of outstanding requests distinct is the app's job.
- A parameter of the wrong type, or a missing one, gives a `bad_request` failure response.

### Responses

Every response has `ok`.

```json
{"id": 7, "ok": true, ...}
{"id": 7, "ok": false, "code": "<error code>", "error": "<message for people>", ...}
```

`code` is for the machine, `error` for people. The app branches on `code` and shows or logs `error` as it is.
The wording of `error` is not part of the contract.

| code | Meaning |
|---|---|
| `bad_json` | The line is not JSON. The `id` cannot be known, so it is `null` |
| `bad_request` | `cmd` is missing or not a string, or a parameter is missing or of the wrong type |
| `unknown_cmd` | Unknown command |
| `busy` | A step/run is in progress and this command cannot be accepted (§4.1) |
| `not_runnable` | There is no assembled program, or it has already finished |
| `assemble_error` | Assembly failed. `errors` comes with it (§6) |
| `address` | The memory address is unmapped or out of range |
| `nothing_to_undo` | No history to backstep |
| `internal` | An exception inside the engine. This is a bug — report `error` as it is |

## 3. Numbers

- Register values, addresses and instruction encodings come as **signed 32-bit integers**, because RARS stores
  them that way. Addresses at or above `0x80000000` (such as MMIO `0xffff0000`) and encodings with the top bit set
  come as **negative** numbers. The app converts them to unsigned before display (JS: `v >>> 0`).
- Addresses the app sends follow the same rule. `0xffff0000` may be sent as `-65536` or as `4294901760` (the engine
  uses the low 32 bits).
- 64-bit values (`fbits`) exceed JS number precision (2^53), so they are **16-digit lowercase hex strings**.
- Memory contents (`mem`) are hex strings, 2 digits per byte.

## 4. State and concurrency

Engine states:

| State | Meaning | Entered by |
|---|---|---|
| `empty` | No program to run | Right after start; after a failed assembly |
| `ready` | Runnable, stopped | Successful assembly; step/run ending with BREAKPOINT, MAX_STEPS or STOP; backstep |
| `running` | A step/run is in progress (`busy`) | step, run |
| `waiting` | Running and waiting for console input | The program blocks in an input syscall |
| `finished` | The program has ended | NORMAL_TERMINATION, CLIFF_TERMINATION, EXCEPTION |

`status` reports them as `busy`, `waiting` and `terminated` (`terminated` is true for both `empty` and
`finished`). **A failed assembly also discards the previous program** (`empty`).

### 4.1 Commands accepted while running

The response to step/run can be late (run: seconds; waiting for input: indefinitely). Meanwhile the engine accepts
only:

    stop, input, status, ping, quit

Anything else fails at once with `busy`. Registers and memory cannot be read while running (that would race with
the RARS simulator thread). The slow Run ("1 line/s") is made by the app sending `step` on a timer.

### 4.2 Ordering guarantees

1. Responses and events arrive in the order the engine wrote them.
2. All `out`/`err` events produced by a step/run arrive **before that step/run's response**.
3. `input_wanted` arrives before the response of the blocked step/run.
4. The responses to `stop`/`input`/`status` sent while running may arrive **before or after** the running
   step/run's response. The app pairs them by `id`.

## 5. Commands

### 5.1 The `ready` event (start)

On start, before accepting requests, the engine sends this once:

```json
{"ev":"ready","protocol":2,"rars":"1.6"}
```

`protocol` is this document's version (§9); `rars` is RARS's `Globals.version`. The app sends no request before
it receives `ready`.

### 5.2 `assemble`

```json
{"id":1,"cmd":"assemble","source":"<the whole source>"}
```

Assembles one source string. On success the engine is `ready` with registers, memory, heap, symbols and the console
input buffer all reset (a check confirms that 51 repeats in the same engine match a fresh engine).

Success response:

```json
{"id":1,"ok":true,
 "warnings":[ <ErrorItem>... ],
 "text":[ {"addr":4194304,"code":264307991,"basic":"auipc x10,0x0000fc10","line":5,"src":"main:   la   a0, msg"}, ... ],
 "symbols":[ {"name":"msg","addr":268500992,"segment":"data","global":false}, ... ],
 "breakpoints":[ {"line":8,"addr":4194320}, {"line":3,"addr":null} ],
 "pc":4194304}
```

| Field | Meaning |
|---|---|
| `text[]` | One entry per machine word in the text segment, in address order |
| `text[].addr` | Instruction address |
| `text[].code` | 32-bit encoding (signed integer) |
| `text[].basic` | RARS's basic-instruction disassembly (registers written as `x10`) |
| `text[].line` | Source line number (from 1) |
| `text[].src` | Source line text. **When a pseudo-instruction expands to several machine words, it is the empty string from the second one on**, with the same `line`. The app groups by `line` |
| `symbols[]` | Labels. `segment` is `"text"` or `"data"`; `global` means declared with `.globl`. Each name appears once |
| `breakpoints[]` | The current breakpoints (§5.6), **re-applied to this assembly's result**. `addr:null` means the line has no machine code, so the breakpoint does not take effect for now |
| `pc` | Start address |
| `warnings[]` | Warnings (format in §6) |

Failure response: `code:"assemble_error"` with `errors[]` (§6).

### 5.3 `step`

```json
{"id":2,"cmd":"step","backstep":true}
```

Executes exactly one instruction. If `backstep` (default true) is false, this instruction leaves no undo history.
The response comes when execution finishes (if it waits for input, it is held until input arrives).

```json
{"id":2,"ok":true,"reason":"MAX_STEPS","steps":1,"ns":281000,
 "executed":{"addr":4194304,"code":264307991,"basic":"auipc x10,0x0000fc10","line":5,"src":"main:   la   a0, msg"},
 "pc":4194308,"x":[0,0,2147479548,...],"f":[2143289344,...],"fbits":["0000000000000000",...]}
```

| Field | Meaning |
|---|---|
| `reason` | Why it stopped (table in §5.4) |
| `steps` | Number of instructions **retired** by this request. The instruction that raised an exception and the `ecall` that ended the program are not counted |
| `ns` | Elapsed time measured inside the engine (nanoseconds) |
| `executed` | The instruction just executed, in the same form as a `text[]` entry. Only in step |
| `pc` | The next address to execute |
| `x[32]` | x0–x31 |
| `f[32]` | **Single-precision view** of f0–f31: the low 32 bits if the value is NaN-boxed, otherwise `0x7fc00000` (NaN). Same as RARS's display rule |
| `fbits[32]` | Raw 64 bits of f0–f31 (hex). Doubles are visible only here |
| `exit` | Only when the program ended. The value passed to Exit2 (93), otherwise 0 |
| `undo` | How many instructions `backstep` can undo now (§5.7) |
| `cause`, `message`, `line` | Only when it ended with an exception (§6.2) |

### 5.4 `run`

```json
{"id":3,"cmd":"run","max":5000,"backstep":false}
```

Runs until it stops. With `max`, it runs that many instructions and stops with `MAX_STEPS` (batched execution of
the "Instant" kind). The response is like `step`'s, without `executed`. `backstep` (default true) works as in
`step`; recording costs a run about a third more time (RARS's back-stepper; measured on a 13.8 M-instruction loop:
9.1 s without, 12.2 s with). The app records runs too, so that Step back works after Run.

| reason | Next state | Meaning |
|---|---|---|
| `MAX_STEPS` | ready | A step finished, or run reached `max` |
| `BREAKPOINT` | ready | A breakpoint (§5.6) or `ebreak` |
| `STOP` | ready | A `stop` request |
| `NORMAL_TERMINATION` | finished | Exit / Exit2 syscall |
| `CLIFF_TERMINATION` | finished | Fell past the end of the program into empty memory |
| `EXCEPTION` | finished | An unhandled runtime error (§6.2) |

### 5.5 `stop`

```json
{"id":4,"cmd":"stop"}  →  {"id":4,"ok":true,"was_running":true}
```

Stops the step/run in progress. The running request soon responds with `reason:"STOP"` (measured at about 1 ms).
If nothing is running, `was_running` is false and nothing happens. Stop while waiting for input: see §7.3 — the
engine undoes that `ecall` itself and adds `input_cancelled:true` and `undone` to the STOP response.

### 5.6 `bp`

```json
{"id":5,"cmd":"bp","lines":[8,3]}
  →  {"id":5,"ok":true,"breakpoints":[{"line":3,"addr":null},{"line":8,"addr":4194320}]}
```

Breakpoints are set by **source line number**. The request **replaces** the whole list (an empty list clears all;
duplicates collapse to one; the response is in line order).

- The engine keeps the line numbers and **re-applies them to every new assembly result itself.** The app does not
  need to send `bp` again after reassembling. The re-applied result comes in the `assemble` response's
  `breakpoints`.
- When a line expands to several machine words (a pseudo-instruction), the breakpoint goes on its **first machine
  word**.
- A line without machine code (a comment, a label alone, the `.data` part) stays with `addr:null`. It is not
  removed; if that line later gets code, the breakpoint takes effect then. The app shows `null` lines dimmed, as
  "breakpoints that do not apply".
- Moving line numbers when edits shift lines is the app's (the editor's) job. The app sends `bp` with the new line
  numbers, and the engine applies them at the next assembly.

When it stops: after executing an instruction, if the next PC is a breakpoint. So a run started on a breakpoint
line executes that instruction and goes on (like "continue" in a GUI).

### 5.7 `backstep`

```json
{"id":6,"cmd":"backstep"}  →  {"id":6,"ok":true,"undo":41,"pc":...,"x":[...],"f":[...],"fbits":[...]}
```

Undoes the last instruction executed (registers, floating-point registers, CSRs, memory, PC) with RARS's
back-stepper, one instruction per request. The response has `undo`, how many more instructions can be undone.
With none: `nothing_to_undo`.

- History exists only for instructions executed with `backstep:true` (step and run). A step or run with
  `backstep:false` that executes anything leaves none (`undo` 0): what was recorded before it no longer leads up to
  the machine as it is.
- The engine counts at most the last **1000** instructions. RARS itself keeps its records as changes (a register, a
  word of memory, PC), at most 2000 of them (its `BackstepLimit`); an instruction makes one or two, so 1000
  instructions fit, but instructions that make many (ReadString writes one per byte) can make the history shorter.
  `undo` then reaches 0 early. RARS undoes consecutive executions of one same instruction (a one-instruction
  loop) together.
- It works in `finished` too, and undoing returns to `ready`. After the Exit or Exit2 `ecall` the first `backstep`
  puts PC back on that `ecall` (RARS records nothing for it). After an `EXCEPTION`, the first `backstep` undoes what
  the faulting instruction wrote (`ucause`, `uepc`, `utval`) and puts PC back on it.
- Console output already sent and input already read are not undone.

### 5.8 `regs`

```json
{"id":7,"cmd":"regs"}  →  {"id":7,"ok":true,"pc":...,"x":[...],"f":[...],"fbits":[...]}
```

### 5.9 `mem`

```json
{"id":8,"cmd":"mem","addr":268500992,"len":4096}  →  {"id":8,"ok":true,"addr":268500992,"hex":"0000c03f..."}
```

`len` bytes from `addr`, in address order (little-endian as stored). If an unmapped address is met on the way,
the response is `code:"address"` with `partial`, what was read up to that point. RARS's stack ends at `0x7ffffffc`
(bytes above it are out of range): read the stack as `[sp, 0x7ffffffc)`.

### 5.10 `input`

```json
{"id":9,"cmd":"input","text":"21\n"}  →  {"id":9,"ok":true,"waiting":true}
```

Appends `text` to the console input buffer. `waiting` tells whether the program was waiting for input **just
before** the append. The integer and string read syscalls read whole lines, so when the user presses Enter the app
sends the text including `\n`. The flow is in §7.

### 5.11 `status`, `ping`, `quit`

```json
{"cmd":"status"} → {"ok":true,"busy":false,"waiting":false,"terminated":false}
{"cmd":"ping"}   → {"ok":true}
{"cmd":"quit"}   → {"ok":true}   and the engine exits
```

### 5.12 Events

| ev | Fields | Meaning |
|---|---|---|
| `ready` | `protocol`, `rars` | Start (§5.1) |
| `out` | `text` | The program's standard output. One syscall flush is one event |
| `err` | `text` | The program's standard error, and whatever RARS wrote to System.err |
| `input_wanted` | `pc` | The program is blocked on console input (§7). `pc` is already the address **after** that `ecall` (RARS advances the PC before executing) |

## 6. Error reporting

### 6.1 Assembly errors (`ErrorItem`)

```json
{"line":3,"col":9,"warning":false,"message":"\"addi\": Too few or incorrectly formatted operands. Expected: addi t1,t2,-100"}
```

- `line` is the source line (from 1), `col` the column (from 1, start of the token). Both are 0 for an error that
  cannot be tied to a line.
- Errors come **several at a time** (up to RARS's limit).
- `message` is RARS's original text. It must match what users see in RARS's documentation and in search results,
  so the engine neither translates nor rewrites it. Translation is the app's job.

### 6.2 Runtime errors

A step/run response with `reason:"EXCEPTION"` carries the following.

```json
{"reason":"EXCEPTION","cause":4,"line":6,"exit":0,
 "message":"Runtime exception at 0x00400008: Load address not aligned to word boundary 0x10010001"}
```

| Field | Meaning |
|---|---|
| `cause` | RISC-V exception cause number (`mcause` numbering: 0 instruction address misaligned, 1 instruction access fault, 2 illegal instruction, 4 load address misaligned, 5 load access fault, 6 store address misaligned, 7 store access fault, 8 ecall). **-1 is an error that is not a trap** (for example, non-numeric input to the integer read syscall) |
| `line` | The source line of the instruction that failed. 0 if unknown |
| `message` | RARS's original text |

In a program that installs an exception handler (`utvec`), traps go to the handler, so EXCEPTION does not occur.

## 7. Console input flow

### 7.1 Input during Run

```
app                                    engine
 ── {"id":10,"cmd":"run"} ─────────────▶
                                        (blocks in a ReadInt ecall)
 ◀──────────── {"ev":"input_wanted","pc":4194316}
 (console input box enabled; the user types 21 and Enter)
 ── {"id":11,"cmd":"input","text":"21\n"} ▶
 ◀──────────── {"id":11,"ok":true,"waiting":true}
 ◀──────────── {"ev":"out","text":"42"}
 ◀──────────── {"id":10,"ok":true,"reason":"NORMAL_TERMINATION",...}
```

The order of `id:11` and `id:10` is not guaranteed (§4.2, item 4).

### 7.2 Input during Step

Stepping an input syscall **holds** that step's response until input arrives. On `input_wanted` the app shows
"waiting for input", and pressing F10 again does not send a new step (that would get `busy`).

### 7.3 Stop while waiting for input — the engine undoes it

When RARS is asked to stop while waiting for input, it **completes that `ecall` with RARS's default input** and then
stops: `"0"` for an integer read, `""` for a string read (it writes 0 bytes to the buffer). Left alone, the user's
program would silently receive a `0` that nobody typed.

**From version 2, the engine undoes that `ecall` before sending the STOP response.** Registers, memory and the PC
go back to just before the `ecall`, and the next step/run raises `input_wanted` again. This also works in a run with
`backstep:false` (the engine turns on history for that ecall at the moment it is cancelled).

```
 ── run ─────────────────▶   ◀── input_wanted
 ── stop ────────────────▶   ◀── {"ok":true,"was_running":true}
                             ◀── {"reason":"STOP","input_cancelled":true,"undone":true,
                                   "pc":<ecall>,"x":[..a0 = its earlier value..]}
```

| Field | Meaning |
|---|---|
| `input_cancelled` | This STOP interrupted a wait for input. Present only in that case |
| `undone` | The engine undid that ecall. `false` means it could not, and the app must say so (for example "stopped while waiting for input — assemble again"). In tests it is always `true` |

The app has nothing else to do: it draws the screen from the response's `pc` and `x`.

### 7.4 Leftover input

`input` accumulates in the buffer. If several lines are sent at once, the following input syscalls consume them in
turn. **Assembling empties both this buffer and RARS's read buffer** (a check confirms that no line left from a
previous run leaks through).

## 8. Duties of a reader

For the app (and for the requests the engine reads):

1. **Ignore unknown fields.** Do not treat them as errors.
2. **Ignore unknown events (`ev`)** (but log them).
3. **Treat an unknown `code` like `internal`**: report a failure and show `error`.
4. **Treat an unknown `reason` as "stopped; whether it can run is unknown"**: check with `status`.
5. If `ready.protocol` is **greater than the app knows**, do not use the engine and report "the engine is newer
   than the app". If it is smaller, report "the engine is older than the app". Use it only when equal (the app and
   the engine ship together in one installer, so a difference means a broken installation).
6. A non-JSON line on stdout must be reported **loudly** (log, and on screen in development builds), never dropped
   silently. It means the protocol channel is polluted.
7. If `ready` does not arrive within a set time (10 seconds recommended), report the failure with the engine's
   stderr attached.

## 9. Versions

`ready.protocol` is a single integer, currently **2**.

**Changes that raise the version** (breaking changes):

- Removing or renaming a field, command or event
- Changing a field's type, unit or meaning (for example, `addr` as unsigned, `ns` as microseconds)
- Changing an existing command's behaviour (for example, `bp` meaning "add", or `steps` counting the faulting
  instruction)
- Adding a **required** parameter to a request
- Changing the ordering guarantees of §4.2
- Changing a default (for example, `backstep`'s default)

**Changes that do not raise the version** (absorbed by the reader's duties, §8):

- Adding fields to responses or events
- Adding optional parameters (leaving them out keeps the old behaviour)
- Adding commands, events, or `code` or `reason` values

When raising the version, change the title above §1 and the engine's `PROTOCOL` constant in the same commit, and
record what changed in the "Change log" at the end of this document.

## 10. Known gaps (remaining in version 2)

Found while writing the specification. Fixed ones are in the change log; the rest stay here.

1. **No write commands.** Registers and memory cannot be edited (as a GUI does when a cell is changed).
   `setreg` and `setmem` are needed. They are additions only, so the version does not go up.
2. **CSRs cannot be read.** `ustatus`, `ucause`, `uepc` and so on are needed for working with exception handlers.
3. **No assembler options.** RARS's "permit pseudo-instructions", "warnings are errors", "start at main",
   "self-modifying code" and memory configuration (compact and so on) cannot be chosen. RARS's defaults are fixed
   for now.
4. **One file only.** No multi-file assembly, no base directory for `.include`, no file name in errors. The base for
   relative paths in the file syscalls (open/read/write) is not defined either.
5. **No guard against output floods.** The output loop sends one event per flush, with no limit or merging, so the
   app may fall behind. Merging in the engine (for example, every 16 ms) would not raise the version; this item
   records now that the app must not depend on "one flush = one event".
6. ~~Recovering from Stop while waiting for input is the app's duty~~ — the engine's responsibility from version 2
   (§7.3).
7. **Nothing can be read while running** (§4.1). The slow Run imitates running with steps, so this is fine for now,
   but a "current PC" display during a fast Run is not possible.
8. **No Pause.** RARS has PAUSE (practically the same as STOP), but it is not exposed.
9. **No progress events.** During a long run the app does not know how many instructions have executed.
10. ~~`bp` works on addresses, so the app must resend it after every reassembly~~ — from version 2 it works on
    line numbers and the engine re-applies it on every reassembly (§5.6).
11. **The assembler does not report where the next data would go.** How far the data segment extends (including a
    trailing `.space`) cannot be learned from memory alone. The `.asx` export (`docs/asx-format.md` §6) appends
    `.data` and a label to the source, assembles it, and reads that label's address. Adding a field to the
    `assemble` response would not raise the version.

## Change log

- Additions in version 2 (no version change): `undo` in the `step`, `run` and `backstep` responses; `backstep`
  undoes exactly one instruction, also the Exit `ecall` and a faulting instruction, counting at most 1000.

- **2**. Raised while the app did not yet use version 1 (nothing depended on it). There is no negotiation path.
  Two items left as "the app's duty" became the engine's responsibility. Both are the kind that goes silently wrong
  if the app forgets.
  - **Stop while waiting for input** (§7.3): the engine undoes the ecall before the STOP response. `input_cancelled`
    and `undone` added to the STOP response. Before, RARS's default input 0 stayed in a0 and the app had to send
    `backstep` — if it forgot, the user's program silently received the input 0.
  - **Breakpoints** (§5.6): `bp`'s parameter changed from an address list `set` to a line-number list `lines`. The
    engine keeps the lines and re-applies them on every reassembly. The response changed from `count` to
    `breakpoints`, and `breakpoints` was added to the `assemble` response. Before, if the app did not send the new
    addresses after reassembling, breakpoints stayed on the wrong lines (the old addresses).
  - Engine bug fix (not a protocol change): when `mem` read a range ending at `0x80000000`, the loop's
    `addr + len` overflowed an int and it returned **an empty `hex` with `ok:true`**. It is now an `address` error at
    the out-of-range byte.
  - Engine bug fix (not a protocol change): RARS's `SimThread.setStop()` records the stop reason **after** setting
    `stop`, so if the loop ended in between, STOP came back as `reason:"null"` (9 times in 200). RARS is not modified;
    the wrapper remembers that it asked for the stop and answers `STOP` (`-Dprobe.rawStopReason=true` restores the
    old behaviour).
  - Starting the engine with `-Dprobe.v1Breakpoints=true` / `-Dprobe.v1StopInput=true` restores the version 1
    behaviour.

- **1** (the first edition of this document). Fixing the probe's protocol as a specification changed the following:
  `ready.protocol` added; `code` added to failure responses; the request `id` returned with its type (before, a string
  id was printed without quotes and broke the JSON); `id:null` in `bad_json` responses; `symbols` added to the
  assembly result; `fbits` added because doubles appeared only as NaN in `f[]`.
