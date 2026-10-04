# Assembly Studio

MIPS 와 RISC-V 어셈블리를 쓰고, 어셈블하고, 한 줄씩 실행하면서 레지스터와 메모리,
명령의 32비트가 어떻게 바뀌는지 보는 시뮬레이터입니다. 실행하면 먼저 ISA 를 고릅니다.

- MIPS 엔진: SPIM 9.1.24
- RISC-V 엔진: RARS 1.6

Windows 10/11 (64비트)용 설치본은 릴리스에 올라갑니다. 지금은 개발 중입니다.

## 개발

Node.js 22 이상이 필요합니다. 자세한 명령은 [CLAUDE.md](CLAUDE.md), 계획은 [PLAN.md](PLAN.md).

    cd electron
    npm ci && npm run build
    npm run electron

## 라이선스

이 프로젝트는 BSD 3-Clause ([LICENSE](LICENSE)). 함께 들어가는 구성 요소의 조건은 [NOTICE](NOTICE).
