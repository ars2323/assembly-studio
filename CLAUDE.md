# Assembly Studio — 작업 규칙

MIPS(SPIM)와 RISC-V(RARS) 어셈블리 시뮬레이터. 실행하면 ISA 를 고르고, 고른 ISA 의 엔진을 띄운다.
계획과 단계는 `PLAN.md`.

## 구조

| 경로 | 무엇 |
|---|---|
| `CPU/` | SPIM 코어. **고치지 않는다** |
| `probe/` | RARS 래퍼(`RarsProbe.java`). RARS 자체는 고정 커밋에서 빌드하고 **고치지 않는다** |
| `electron/src` | 앱 (main, renderer, core, sim). MIPS 는 `core/ sim/ renderer/app/`, RISC-V 만의 것은 `isa/riscv/` |
| `electron/native` | SPIM N-API 애드온 |
| `electron/brands/generic` | 브랜드(판은 이것 하나): 이름, appId, 마크, 아이콘, 설치 관리자 그림 |
| `engines/`, `.github/workflows/` | 엔진 빌드(`engines.yml`)와 배포(`release.yml`) |

## 명령 (electron/)

    npm ci && npm run build      # 의존성, 애드온 (Linux: bison, flex, g++)
    npm run brand                # 브랜드 배치 (src/brand.ts, src/renderer/assets/brand/ 생성)
    npm run typecheck
    npm test                     # core 단위 테스트
    npm run electron [-- --isa=riscv]   # 앱 실행 (기본 MIPS)
    xvfb-run -a -s '-screen 0 2400x1400x24' npm run shot -- <out-dir> [width] [--isa riscv]   # 화면 캡처

RISC-V 엔진 (저장소 루트): `bash probe/setup.sh` (RARS 를 `~/.cache/assembly-studio/rars` 에 받아 빌드),
`bash probe/run.sh build` (RarsProbe → `probe/build/classes`). JDK 21 이 PATH 에 있어야 한다.
`electron/engine/{runtime,rars.jar,classes}` 가 있으면 그것을 먼저 쓴다.

## 지킬 것

- `CPU/` 와 RARS 는 고치지 않는다. 고쳐야만 되는 일이 나오면 멈추고 보고한다.
- 화면 구성(버튼 위치, 패널, 크기, 동작)은 요청받은 것만 바꾼다. 임의로 바꾸지 않는다.
- 색은 `app.css` 의 토큰으로만 쓴다.
- 판은 범용판 하나뿐이다. 특정 학교·기관의 이름이나 자산, '실습' 같은 용도 한정 문구를 넣지 않는다.
  이름·마크는 `brand` (`src/brand.ts`) 로만.
- UI 를 바꾸면 캡처를 찍어 직접 본다.
- 문서(README, 릴리스 노트 등)는 이 프로젝트에 대해서만 쓴다. 다른 저장소나 이전 제품을 언급하지 않는다.
- 자동 CI 는 없다. 검증은 최소로: core 단위 테스트, 캡처, 검토 시점의 사람 확인.
- 커밋은 작게, 한 목적씩. 단계마다 push 한다.
- 1.0.0 이후의 변경은 버전을 올려 낸다(고침 1.0.x, 기능 1.x.0): `electron/package.json`, `docs/releases/<버전>.md`, 태그 `v<버전>`.
