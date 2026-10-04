# engines/

두 엔진의 빌드 결과물을 한 번 만들어 GitHub Release 자산으로 보관하고, 설치본을 만들 때 내려받는다.

| 결과물 | 무엇 | 입력 |
|---|---|---|
| `spim.node` | MIPS 엔진: SPIM 코어 + N-API 애드온 (Windows x64) | `CPU/`, `electron/native/` |
| `engine/runtime/` | jlink 로 만든 Java 런타임 (Temurin, `java_modules` 만) | `engines.lock` |
| `engine/rars.jar` | RISC-V 엔진: 고정 커밋에서 소스 빌드한 RARS 1.6 (`--release 11`) | `engines.lock` |
| `engine/classes/` | `RarsProbe` (stdio JSON 래퍼) | `probe/src/` |

## 파일

- `engines.lock` — 고정값: RARS 커밋, Temurin 버전, jlink 모듈.
- `hash.mjs` — 입력 해시. 입력은 `CPU/`, `electron/native/`(build/ 제외), `probe/src/`, `engines.lock`, `build-rars.sh`, `electron/tools/build-electron.ts`, `.github/workflows/engines.yml`. 경로를 정렬하고 CRLF 를 LF 로 읽어서 Windows 와 Linux 가 같은 값을 낸다.
  `node engines/hash.mjs` → `<hash>`, `--tag` → `engines-<hash>`, `--list` → 파일별 해시(두 기계 값이 다를 때 비교용).
- `build-rars.sh` — RARS 를 고정 커밋(+ jsoftfloat 서브모듈)에서 받아 RARS 의 `build-jar.sh` 로 `rars.jar` 를 만들고(RARS 는 고치지 않는다), `probe/src/*.java` 를 `classes/` 로 컴파일한다. Linux 와 Git Bash 에서 돈다.
  `bash engines/build-rars.sh <dir>` → `<dir>/rars.jar`, `<dir>/classes/`.
- `fetch.mjs` — 지금 트리의 해시에 맞는 `engines-<hash>.zip` 을 Release 에서 받아 푼다.

## 언제 도나

- `.github/workflows/engines.yml` — 위 입력이 바뀐 push, 또는 수동 실행(Actions → engines → Run workflow).
  해시에 해당하는 Release 가 이미 zip 을 갖고 있으면 아무것도 하지 않고 끝난다. 없으면 Windows 에서
  애드온(MSVC, winflexbison, node-gyp, Electron 헤더), RARS, RarsProbe, jlink 런타임을 빌드하고,
  런타임으로 RarsProbe 에 ping 을 보내 본 뒤 `engines-<hash>` pre-release 로 올린다. 입력이 바뀌지 않는 한 사실상 한 번.
- `.github/workflows/release.yml` — 태그 `v*`. `fetch.mjs` 로 엔진을 받고 설치본을 만들어 발행한다.
  엔진 Release 가 없으면 실패한다 — 먼저 `engines.yml` 을 돌린다.

엔진 zip 은 Actions 캐시가 아니라 Release 자산에 둔다(캐시는 7일 쓰지 않으면 지워진다). `engines-*` Release 는 지우지 않는다.

## 로컬에서 받기

```sh
node engines/fetch.mjs                      # 저장소: GITHUB_REPOSITORY, 없으면 ars2323/assembly-studio
node engines/fetch.mjs --repo owner/name    # 다른 저장소(포크)
node engines/fetch.mjs --force              # 이미 있어도 다시 받기
```

결과: `electron/native/build/Release/spim.node`, `electron/engine/`(`runtime/`, `rars.jar`, `classes/`, `runtime.txt`, `engines.txt`).
`electron/engine/engines.txt` 가 지금 태그를 가리키면 내려받지 않는다. 저장소가 비공개면 `GH_TOKEN` 을 설정한다.
둘 다 **Windows x64** 용이다 — Linux 개발에서는 쓰지 않고, `node-gyp rebuild` 와 `build-rars.sh` 로 직접 만든다.

"no release engines-…" 오류는 지금 트리의 엔진이 아직 빌드되지 않았다는 뜻이다: `engines.yml` 을 돌린 뒤 다시 받는다.
