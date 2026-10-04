# 엔진 프로토콜 (engine protocol) — 버전 2

Electron 앱(이하 **앱**)과 RARS 를 감싼 Java 래퍼(이하 **엔진**, 현재 구현은
`probe/src/RarsProbe.java`) 사이의 계약이다. 이 문서가 기준이고, 구현이 다르면
구현이 틀린 것이다.

## 1. 전송

- 엔진은 자식 프로세스다. 앱은 엔진의 **stdin 에 요청**을 쓰고 **stdout 에서 응답과
  이벤트**를 읽는다.
- 한 줄에 JSON 객체 하나, UTF-8, 줄 끝은 `\n`. 메시지 안에 날 개행은 없다(문자열 안의
  개행은 `\n` 이스케이프).
- **stdout(fd 1)은 프로토콜 전용이다.** RARS 나 JVM 이 무엇을 출력하든 fd 1 에는
  프로토콜 메시지만 나간다. 프로그램의 콘솔 출력은 `out`/`err` 이벤트로 감싸 나온다.
  JVM 은 `-Xlog:disable -Xlog:all=warning:stderr` 로 띄운다(기본값이면 JVM 경고가 fd 1
  로 나가 스트림이 깨진다 — 실제로 깨진 적이 있다).
- stderr 는 진단용 자유 텍스트다. 앱은 기록만 하고 해석하지 않는다.
- 엔진 하나가 프로그램 하나를 다룬다(RARS 상태가 프로세스 전역이다). 여러 프로그램이
  필요하면 엔진을 여러 개 띄운다.

## 2. 메시지의 세 종류

| 종류 | 구별법 | 예 |
|---|---|---|
| 요청 (앱 → 엔진) | `cmd` 가 있다 | `{"id":7,"cmd":"step"}` |
| 응답 (엔진 → 앱) | `id` 키가 있다 | `{"id":7,"ok":true,"reason":"MAX_STEPS",...}` |
| 이벤트 (엔진 → 앱) | `ev` 가 있고 `id` 키가 없다 | `{"ev":"out","text":"42"}` |

### 요청

```json
{"id": <number|string>, "cmd": "<명령>", ...명령별 매개변수}
```

- `id` 는 앱이 고른다. 엔진은 응답에 **같은 값, 같은 JSON 타입**으로 돌려준다.
  `id` 를 빼면 응답의 `id` 는 `null` 이다. 진행 중인 요청끼리 겹치지 않게 하는 것은 앱의 몫이다.
- 매개변수의 타입이 틀리거나 빠지면 `bad_request` 실패 응답.

### 응답

모든 응답은 `ok` 를 갖는다.

```json
{"id": 7, "ok": true, ...}
{"id": 7, "ok": false, "code": "<오류 코드>", "error": "<사람용 메시지>", ...}
```

`code` 는 기계용, `error` 는 사람용이다. 앱은 `code` 로 분기하고 `error` 를 그대로
보여 주거나 로그에 남긴다. `error` 의 문구는 계약이 아니다.

| code | 뜻 |
|---|---|
| `bad_json` | 줄이 JSON 이 아니다. 이때 `id` 는 알 수 없으므로 `null` |
| `bad_request` | `cmd` 가 없거나 문자열이 아니다, 또는 매개변수가 빠지거나 타입이 틀렸다 |
| `unknown_cmd` | 모르는 명령 |
| `busy` | step/run 이 진행 중이라 받을 수 없는 명령 (§4.1) |
| `not_runnable` | 어셈블된 프로그램이 없거나 이미 끝났다 |
| `assemble_error` | 어셈블 실패. `errors` 가 함께 온다 (§6) |
| `address` | 메모리 주소가 매핑되지 않았거나 범위 밖 |
| `nothing_to_undo` | backstep 할 기록이 없다 |
| `internal` | 엔진 내부 예외. 버그다 — `error` 를 그대로 보고할 것 |

## 3. 수의 표현

- 레지스터 값, 주소, 명령 인코딩은 **부호 있는 32비트 정수**로 나온다. RARS 가 그렇게
  저장하기 때문이다. `0x80000000` 이상의 주소(예: MMIO `0xffff0000`)와 최상위 비트가
  선 인코딩은 **음수**로 온다. 앱은 표시 전에 부호 없는 값으로 바꾼다(JS: `v >>> 0`).
- 앱이 보내는 주소도 같은 규칙이다. `0xffff0000` 은 `-65536` 으로 보내도 되고
  `4294901760` 으로 보내도 된다(엔진이 하위 32비트를 쓴다).
- 64비트 값(`fbits`)은 JS 의 수 정밀도(2^53)를 넘으므로 **16자리 소문자 hex 문자열**이다.
- 메모리 내용(`mem`)은 바이트당 hex 2자리 문자열이다.

## 4. 상태와 동시성

엔진의 상태:

| 상태 | 뜻 | 들어가는 길 |
|---|---|---|
| `empty` | 실행할 프로그램 없음 | 시작 직후, 어셈블 실패 후 |
| `ready` | 실행 가능, 멈춰 있음 | 어셈블 성공, step/run 이 BREAKPOINT·MAX_STEPS·STOP 으로 끝남, backstep |
| `running` | step/run 진행 중 (`busy`) | step, run |
| `waiting` | running 중 콘솔 입력 대기 | 프로그램이 입력 syscall 에서 막힘 |
| `finished` | 프로그램 종료 | NORMAL_TERMINATION, CLIFF_TERMINATION, EXCEPTION |

`status` 의 `busy`, `waiting`, `terminated` 로 읽을 수 있다(`terminated` 는 `empty` 와
`finished` 모두 true). **어셈블이 실패하면 이전 프로그램도 버려진다**(`empty`).

### 4.1 진행 중에 받는 명령

step/run 은 응답이 늦게 온다(run 은 수 초, 입력 대기면 무기한). 그 동안 엔진은 다음만 받는다.

    stop, input, status, ping, quit

나머지는 `busy` 로 즉시 실패한다. 진행 중에는 레지스터·메모리를 읽을 수 없다
(RARS 시뮬레이터 스레드와 경쟁하기 때문). 느린 Run("1 line/s")은 앱이 타이머로
`step` 을 보내서 만든다.

### 4.2 순서 보장

1. 응답과 이벤트는 엔진이 쓴 순서대로 도착한다.
2. step/run 이 만든 `out`/`err` 이벤트는 **모두 그 step/run 의 응답보다 먼저** 온다.
3. `input_wanted` 는 막힌 step/run 의 응답보다 먼저 온다.
4. 진행 중에 보낸 `stop`/`input`/`status` 의 응답은 진행 중인 step/run 의 응답보다
   **먼저 올 수도 나중에 올 수도 있다.** 앱은 `id` 로 짝을 맞춘다.

## 5. 명령

### 5.1 `ready` 이벤트 (시작)

엔진은 시작하면 요청을 받기 전에 이것을 한 번 보낸다.

```json
{"ev":"ready","protocol":2,"rars":"1.6"}
```

`protocol` 은 이 문서의 버전(§9), `rars` 는 RARS 의 `Globals.version`. 앱은 `ready` 를
받기 전에 요청을 보내지 않는다.

### 5.2 `assemble`

```json
{"id":1,"cmd":"assemble","source":"<소스 전체>"}
```

소스 문자열 하나를 어셈블한다. 성공하면 레지스터·메모리·힙·심벌·콘솔 입력 버퍼를 모두
초기화한 `ready` 상태가 된다(같은 엔진에서 51회 반복해도 새 엔진과 같음을 검사한다).

성공 응답:

```json
{"id":1,"ok":true,
 "warnings":[ <ErrorItem>... ],
 "text":[ {"addr":4194304,"code":264307991,"basic":"auipc x10,0x0000fc10","line":5,"src":"main:   la   a0, msg"}, ... ],
 "symbols":[ {"name":"msg","addr":268500992,"segment":"data","global":false}, ... ],
 "breakpoints":[ {"line":8,"addr":4194320}, {"line":3,"addr":null} ],
 "pc":4194304}
```

| 필드 | 뜻 |
|---|---|
| `text[]` | 텍스트 세그먼트의 기계어 한 줄마다 하나, 주소 순 |
| `text[].addr` | 명령 주소 |
| `text[].code` | 32비트 인코딩 (부호 있는 정수) |
| `text[].basic` | RARS 의 기본 명령 디스어셈블(레지스터는 `x10` 식) |
| `text[].line` | 원본 줄 번호 (1부터) |
| `text[].src` | 원본 줄 텍스트. **의사명령이 여러 기계어로 펼쳐지면 두 번째부터는 빈 문자열**이고 `line` 은 같다. 앱은 `line` 으로 묶는다 |
| `symbols[]` | 라벨. `segment` 는 `"text"` 또는 `"data"`, `global` 은 `.globl` 로 선언된 것. 한 이름은 한 번만 나온다 |
| `breakpoints[]` | 지금 걸려 있는 중단점(§5.6)을 **이 어셈블 결과에 다시 건 것**. `addr:null` 은 그 줄에 기계어가 없어 지금은 걸리지 않는 것 |
| `pc` | 실행 시작 주소 |
| `warnings[]` | 경고 (형식은 §6) |

실패 응답: `code:"assemble_error"` 와 `errors[]`(§6).

### 5.3 `step`

```json
{"id":2,"cmd":"step","backstep":true}
```

정확히 한 명령을 실행한다. `backstep`(기본 true)이 false 면 이 명령은 되돌리기 기록을
남기지 않는다. 응답은 실행이 끝났을 때 온다(입력 대기면 입력이 들어올 때까지 보류).

```json
{"id":2,"ok":true,"reason":"MAX_STEPS","steps":1,"ns":281000,
 "executed":{"addr":4194304,"code":264307991,"basic":"auipc x10,0x0000fc10","line":5,"src":"main:   la   a0, msg"},
 "pc":4194308,"x":[0,0,2147479548,...],"f":[2143289344,...],"fbits":["0000000000000000",...]}
```

| 필드 | 뜻 |
|---|---|
| `reason` | 멈춘 이유 (§5.4 표) |
| `steps` | 이번 요청에서 **완료된**(retired) 명령 수. 예외를 낸 명령과 프로그램을 끝낸 `ecall` 은 세지 않는다 |
| `ns` | 엔진 안에서 잰 경과 시간(나노초) |
| `executed` | 이번에 실행한 명령. 형식은 `text[]` 의 원소와 같다. step 에만 있다 |
| `pc` | 다음에 실행할 주소 |
| `x[32]` | x0–x31 |
| `f[32]` | f0–f31 의 **단정도 보기**: NaN-boxing 된 값이면 하위 32비트, 아니면 `0x7fc00000`(NaN). RARS 의 표시 규칙과 같다 |
| `fbits[32]` | f0–f31 의 64비트 원본(hex). double 은 여기서만 보인다 |
| `exit` | 프로그램이 끝났을 때만. Exit2(93)로 넘긴 값, 그 밖에는 0 |
| `cause`, `message`, `line` | 예외로 끝났을 때만 (§6.2) |

### 5.4 `run`

```json
{"id":3,"cmd":"run","max":5000,"backstep":false}
```

멈출 때까지 실행한다. `max` 를 주면 그만큼 실행하고 `MAX_STEPS` 로 멈춘다("Instant"
류의 묶음 실행). 응답은 `step` 과 같고 `executed` 만 없다.

| reason | 다음 상태 | 뜻 |
|---|---|---|
| `MAX_STEPS` | ready | step 이 끝남, 또는 run 의 `max` 도달 |
| `BREAKPOINT` | ready | 중단점(§5.6) 또는 `ebreak` |
| `STOP` | ready | `stop` 요청 |
| `NORMAL_TERMINATION` | finished | Exit / Exit2 syscall |
| `CLIFF_TERMINATION` | finished | 프로그램 끝을 지나 빈 곳으로 떨어짐 |
| `EXCEPTION` | finished | 처리되지 않은 실행 시간 오류 (§6.2) |

### 5.5 `stop`

```json
{"id":4,"cmd":"stop"}  →  {"id":4,"ok":true,"was_running":true}
```

진행 중인 step/run 을 멈춘다. 진행 중인 요청은 곧 `reason:"STOP"` 으로 응답한다(측정값
1 ms 안팎). 아무것도 진행 중이 아니면 `was_running:false` 이고 아무 일도 없다.
입력 대기 중의 stop 은 §7.3 — 엔진이 그 `ecall` 을 스스로 되돌리고, STOP 응답에
`input_cancelled:true` 와 `undone` 을 붙인다.

### 5.6 `bp`

```json
{"id":5,"cmd":"bp","lines":[8,3]}
  →  {"id":5,"ok":true,"breakpoints":[{"line":3,"addr":null},{"line":8,"addr":4194320}]}
```

중단점은 **원본 줄 번호**로 건다. 목록 전체를 **바꾼다**(빈 목록이면 모두 해제, 중복은 하나로,
응답은 줄 순).

- 엔진은 줄 번호를 들고 있다가 **어셈블할 때마다 새 결과에 스스로 다시 건다.** 앱은 재어셈블
  뒤에 `bp` 를 다시 보낼 필요가 없다. 다시 건 결과는 `assemble` 응답의 `breakpoints` 에 온다.
- 한 줄이 여러 기계어로 펼쳐지면(의사명령) 그 줄의 **첫 기계어**에 건다.
- 기계어가 없는 줄(주석, 라벨만, `.data` 쪽)은 `addr:null` 로 남는다. 지워지지 않고, 나중에
  그 줄에 코드가 생기면 그때 걸린다. 앱은 `null` 인 줄을 "걸리지 않은 중단점" 으로 흐리게 보인다.
- 편집으로 줄이 밀리면 줄 번호를 옮기는 것은 앱(편집기)의 일이다. 앱은 바뀐 줄 번호로 `bp` 를
  보내고, 엔진은 그것을 다음 어셈블에 건다.

멈추는 시점: 한 명령을 실행한 **뒤** 다음 PC 가 중단점이면 멈춘다. 그래서 중단점 줄에서 run 을
시작하면 그 명령부터 실행하고 지나간다(GUI 의 "계속" 과 같다).

### 5.7 `backstep`

```json
{"id":6,"cmd":"backstep"}  →  {"id":6,"ok":true,"pc":...,"x":[...],"f":[...],"fbits":[...]}
```

RARS 의 back-stepper 로 마지막 한 명령을 되돌린다(레지스터·메모리·PC). 기록은
`backstep:true` 로 실행한 명령에만 있다. 상한은 RARS 설정(기본 2000). `finished` 에서도
되돌릴 수 있고, 되돌리면 `ready` 가 된다. 기록이 없으면 `nothing_to_undo`.

### 5.8 `regs`

```json
{"id":7,"cmd":"regs"}  →  {"id":7,"ok":true,"pc":...,"x":[...],"f":[...],"fbits":[...]}
```

### 5.9 `mem`

```json
{"id":8,"cmd":"mem","addr":268500992,"len":4096}  →  {"id":8,"ok":true,"addr":268500992,"hex":"0000c03f..."}
```

`addr` 부터 `len` 바이트, 주소 순(리틀 엔디안 그대로). 중간에 매핑되지 않은 주소를 만나면
`code:"address"` 와 그때까지 읽은 `partial`.  RARS 의 스택은 `0x7ffffffc` 에서 끝난다(그 위
바이트는 범위 밖): 스택은 `[sp, 0x7ffffffc)` 로 읽는다.

### 5.10 `input`

```json
{"id":9,"cmd":"input","text":"21\n"}  →  {"id":9,"ok":true,"waiting":true}
```

콘솔 입력 버퍼 끝에 `text` 를 붙인다. `waiting` 은 붙이기 **직전**에 프로그램이 입력을
기다리고 있었는지. 정수·문자열 읽기 syscall 은 줄 단위로 읽으므로 사용자가 Enter 를
쳤을 때 `\n` 까지 붙여 보낸다. 흐름은 §7.

### 5.11 `status`, `ping`, `quit`

```json
{"cmd":"status"} → {"ok":true,"busy":false,"waiting":false,"terminated":false}
{"cmd":"ping"}   → {"ok":true}
{"cmd":"quit"}   → {"ok":true}   그리고 엔진 종료
```

### 5.12 이벤트

| ev | 필드 | 뜻 |
|---|---|---|
| `ready` | `protocol`, `rars` | 시작 (§5.1) |
| `out` | `text` | 프로그램의 표준 출력. syscall 의 flush 하나가 이벤트 하나 |
| `err` | `text` | 프로그램의 표준 오류, 그리고 RARS 가 System.err 에 쓴 것 |
| `input_wanted` | `pc` | 프로그램이 콘솔 입력에서 막혔다 (§7). `pc` 는 이미 그 `ecall` **다음** 주소다(RARS 는 실행 전에 PC 를 올린다) |

## 6. 오류 보고

### 6.1 어셈블 오류 (`ErrorItem`)

```json
{"line":3,"col":9,"warning":false,"message":"\"addi\": Too few or incorrectly formatted operands. Expected: addi t1,t2,-100"}
```

- `line` 원본 줄(1부터), `col` 열(1부터, 토큰 시작). 줄을 특정할 수 없는 오류는 둘 다 0.
- 오류는 **한 번에 여러 개** 온다(RARS 의 상한까지).
- `message` 는 RARS 원문이다. 학생이 RARS 문서·검색 결과에서 보는 문구와 같아야 하므로
  엔진은 번역하거나 바꾸지 않는다. 번역은 앱의 몫이다.

### 6.2 실행 시간 오류

step/run 응답이 `reason:"EXCEPTION"` 이고 다음이 붙는다.

```json
{"reason":"EXCEPTION","cause":4,"line":6,"exit":0,
 "message":"Runtime exception at 0x00400008: Load address not aligned to word boundary 0x10010001"}
```

| 필드 | 뜻 |
|---|---|
| `cause` | RISC-V 예외 원인 번호(`mcause` 체계: 0 명령 주소 정렬, 1 명령 접근, 2 잘못된 명령, 4 load 정렬, 5 load 접근, 6 store 정렬, 7 store 접근, 8 ecall). **-1 은 트랩이 아닌 오류**(예: 정수 입력 syscall 에 숫자가 아닌 입력) |
| `line` | 오류를 낸 명령의 원본 줄. 모르면 0 |
| `message` | RARS 원문 |

예외 처리기(`utvec`)를 설치한 프로그램에서는 트랩이 처리기로 가므로 EXCEPTION 이 오지 않는다.

## 7. 콘솔 입력 흐름

### 7.1 Run 중 입력

```
앱                                     엔진
 ── {"id":10,"cmd":"run"} ─────────────▶
                                        (ReadInt ecall 에서 막힘)
 ◀──────────── {"ev":"input_wanted","pc":4194316}
 (콘솔 입력칸 활성화, 사용자가 21 Enter)
 ── {"id":11,"cmd":"input","text":"21\n"} ▶
 ◀──────────── {"id":11,"ok":true,"waiting":true}
 ◀──────────── {"ev":"out","text":"42"}
 ◀──────────── {"id":10,"ok":true,"reason":"NORMAL_TERMINATION",...}
```

`id:11` 과 `id:10` 의 순서는 보장되지 않는다(§4.2-4).

### 7.2 Step 중 입력

입력 syscall 을 step 하면 그 step 의 응답이 입력이 올 때까지 **보류**된다. 앱은
`input_wanted` 를 받으면 "입력 대기 중" 을 표시하고, F10 을 다시 눌러도 새 step 을
보내지 않는다(보내면 `busy`).

### 7.3 입력 대기 중 Stop — 엔진이 되돌린다

RARS 는 입력 대기 중에 멈추라는 요청을 받으면 그 `ecall` 을 **RARS 의 기본 입력으로 완료한
뒤** 멈춘다. 정수 읽기면 `"0"`, 문자열 읽기면 `""`(버퍼에 0 바이트를 쓴다). 그대로 두면 학생
프로그램이 입력하지 않은 `0` 을 조용히 받는다.

**버전 2 부터 엔진이 STOP 응답을 보내기 전에 그 `ecall` 을 되돌린다.** 레지스터·메모리·PC 가
`ecall` 직전으로 돌아가고, 다음 step/run 이 다시 `input_wanted` 를 낸다. `backstep:false` 로 돌린
run 에서도 된다(엔진이 취소되는 순간 그 ecall 의 기록을 켠다).

```
 ── run ─────────────────▶   ◀── input_wanted
 ── stop ────────────────▶   ◀── {"ok":true,"was_running":true}
                             ◀── {"reason":"STOP","input_cancelled":true,"undone":true,
                                   "pc":<ecall>,"x":[..a0=원래 값..]}
```

| 필드 | 뜻 |
|---|---|
| `input_cancelled` | 이 STOP 이 입력 대기를 끊었다. 그런 경우에만 붙는다 |
| `undone` | 엔진이 그 ecall 을 되돌렸다. `false` 면 되돌리지 못했다는 뜻이고, 앱은 "입력 대기 중 멈춤 — 다시 어셈블하세요" 처럼 알려야 한다. 검사에서는 늘 `true` 다 |

앱은 따로 할 일이 없다. 응답의 `pc`·`x` 로 화면을 그리면 된다.

### 7.4 남은 입력

`input` 은 버퍼에 쌓인다. 한 번에 여러 줄을 보내면 다음 입력 syscall 들이 차례로 소비한다.
**어셈블하면 버퍼와 RARS 의 읽기 버퍼가 모두 비워진다**(이전 실행에서 남은 줄이 새지 않음을
검사한다).

## 8. 읽는 쪽의 의무

앱(그리고 엔진이 읽는 요청)에 대해:

1. **모르는 필드는 무시한다.** 오류로 다루지 않는다.
2. **모르는 이벤트(`ev`)는 무시한다**(로그에는 남긴다).
3. **모르는 `code` 는 `internal` 처럼 다룬다**: 실패로 보고 `error` 를 보여 준다.
4. **모르는 `reason` 은 "멈췄고, 실행 가능 여부는 모름" 으로 다룬다**: `status` 로 확인한다.
5. `ready.protocol` 이 **앱이 아는 것보다 크면** 엔진을 쓰지 않고 "엔진이 앱보다 새 버전" 이라고
   알린다. 작으면 "엔진이 앱보다 오래된 버전" 이라고 알린다. 같아야만 쓴다(앱과 엔진은 한
   설치본으로 함께 배포되므로 다르면 설치가 깨진 것이다).
6. stdout 에서 JSON 이 아닌 줄을 만나면 **크게** 알린다(로그 + 개발 빌드에서는 화면). 조용히
   버리지 않는다. 프로토콜 채널이 오염됐다는 뜻이다.
7. 정해진 시간 안에 `ready` 가 오지 않으면(권장 10초) 엔진의 stderr 를 붙여 실패를 알린다.

## 9. 버전

`ready.protocol` 은 정수 하나다. 지금은 **1**.

**버전을 올리는 변경** (호환이 깨지는 것):

- 필드·명령·이벤트를 없애거나 이름을 바꿈
- 필드의 타입, 단위, 의미를 바꿈 (예: `addr` 를 부호 없는 수로, `ns` 를 마이크로초로)
- 기존 명령의 동작을 바꿈 (예: `bp` 를 "추가" 로, `steps` 가 예외 명령을 세도록)
- 요청에 **필수** 매개변수를 추가함
- §4.2 의 순서 보장을 바꿈
- 기본값을 바꿈 (예: `backstep` 기본값)

**버전을 올리지 않는 변경** (읽는 쪽 의무 §8 로 흡수되는 것):

- 응답·이벤트에 필드 추가
- 선택 매개변수 추가 (빼면 이전과 같은 동작)
- 명령·이벤트·`code`·`reason` 값 추가

버전을 올릴 때는 이 문서의 §1 위 제목과 엔진의 `PROTOCOL` 상수를 같은 커밋에서 바꾸고,
바뀐 점을 문서 끝 "변경 기록" 에 적는다.

## 10. 알려진 구멍 (버전 2 에 남아 있는 것)

명세를 쓰면서 찾은 것. 고친 것은 "변경 기록" 에, 남은 것은 여기에 둔다.

1. **쓰기 명령이 없다.** 레지스터·메모리 값 편집(GUI 에서 셀을 고치는 기능)을 할 수 없다.
   `setreg`, `setmem` 이 필요하다. 추가만 하면 되므로 버전은 안 오른다.
2. **CSR 을 읽을 수 없다.** `ustatus`, `ucause`, `uepc` 등 예외 처리기 수업에 필요하다.
3. **어셈블 옵션이 없다.** RARS 의 "의사명령 허용", "경고를 오류로", "main 에서 시작",
   "자기 수정 코드 허용", 메모리 구성(compact 등)을 고를 수 없다. 지금은 RARS 기본값 고정.
4. **파일이 하나뿐이다.** 여러 파일 어셈블, `.include` 의 기준 디렉터리, 오류의 파일 이름이 없다.
   파일 syscall(open/read/write)의 상대 경로 기준도 정해져 있지 않다.
5. **출력 홍수에 대한 대비가 없다.** 출력 루프는 flush 마다 이벤트를 하나씩 보낸다. 상한·합치기가
   없어 앱이 밀릴 수 있다. 엔진 쪽 합치기(예: 16 ms 단위)를 넣어도 버전은 안 오르지만, 앱이
   "flush 하나 = 이벤트 하나" 에 기대면 안 된다는 점을 지금 못박아 둔다.
6. ~~입력 대기 중 Stop 의 복구가 앱의 의무다~~ — 버전 2 에서 엔진의 책임이 됐다(§7.3).
7. **진행 중에는 아무것도 읽을 수 없다**(§4.1). 느린 Run 을 step 으로 흉내 내므로 당장은 괜찮지만,
   빠른 Run 중의 "현재 PC" 표시는 할 수 없다.
8. **Pause 가 없다.** RARS 에는 PAUSE 가 있지만(STOP 과 사실상 같다) 노출하지 않았다.
9. **진행 상황 이벤트가 없다.** 긴 run 동안 앱은 실행된 명령 수를 모른다.
10. ~~`bp` 가 주소 기준이라 재어셈블마다 앱이 다시 보내야 한다~~ — 버전 2 에서 줄 번호 기준,
    엔진이 재어셈블마다 다시 건다(§5.6).

## 변경 기록

- **2**. 앱이 아직 1 을 쓰지 않을 때(쓰는 것이 하나도 없을 때) 올렸다. 협상 경로는 없다.
  "앱의 의무" 로 남겨 둔 둘을 엔진의 책임으로 옮겼다. 둘 다 앱이 잊으면 조용히 틀리는 종류다.
  - **입력 대기 중 Stop**(§7.3): 엔진이 STOP 응답 전에 ecall 을 되돌린다. STOP 응답에
    `input_cancelled`, `undone` 추가. 이전에는 a0 에 RARS 의 기본 입력 0 이 남았고 앱이 `backstep`
    을 보내야 했다 — 잊으면 학생 프로그램이 입력 0 을 조용히 받는다.
  - **중단점**(§5.6): `bp` 의 매개변수가 주소 목록 `set` 에서 줄 번호 목록 `lines` 로 바뀌었다.
    엔진이 줄을 들고 있다가 재어셈블마다 다시 건다. 응답이 `count` 에서 `breakpoints` 로 바뀌었고,
    `assemble` 응답에 `breakpoints` 추가. 이전에는 재어셈블 뒤 앱이 새 주소를 보내지 않으면
    중단점이 엉뚱한 줄(옛 주소)에 남았다.
  - 엔진 버그 수정(프로토콜 변경 아님): `mem` 이 `0x80000000` 에서 끝나는 구간을 읽으면 루프의
    `addr + len` 이 int 로 넘쳐 **빈 `hex` 를 `ok:true` 로** 돌려주었다. 이제 범위 밖 바이트에서
    `address` 오류다.
  - 엔진 버그 수정(프로토콜 변경 아님): RARS 의 `SimThread.setStop()` 이 `stop` 을 세운 **뒤에**
    멈춘 이유를 적어서, 그 사이에 루프가 끝나면 STOP 이 `reason:"null"` 로 왔다(200번에 9번).
    RARS 는 고치지 않고, 래퍼가 자기가 stop 을 요청했음을 기억해 `STOP` 으로 답한다
    (`-Dprobe.rawStopReason=true` 로 옛 동작).
  - 엔진을 `-Dprobe.v1Breakpoints=true` / `-Dprobe.v1StopInput=true` 로 띄우면 버전 1 동작으로 돌아간다.

- **1** (이 문서의 첫 판). 탐침의 프로토콜을 명세로 고정하면서 다음을 고쳤다:
  `ready.protocol` 추가; 실패 응답에 `code` 추가; 요청 `id` 를 타입 그대로 돌려줌(전에는
  문자열 id 가 따옴표 없이 찍혀 JSON 이 깨졌다); `bad_json` 응답에 `id:null`; 어셈블 결과에
  `symbols` 추가; double 이 `f[]` 에서 NaN 으로만 보이던 문제에 `fbits` 추가.
