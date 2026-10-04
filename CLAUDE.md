# Assembly Studio — working rules

An assembly simulator for MIPS (SPIM) and RISC-V (RARS). On launch the user chooses the ISA, and the app starts that ISA's engine.
The plan and its stages are in `PLAN.md`.

## Layout

| Path | What |
|---|---|
| `CPU/` | The SPIM core. **Do not modify** |
| `probe/` | The RARS wrapper (`RarsProbe.java`). RARS itself is built from a pinned commit and **not modified** |
| `electron/src` | The app (main, renderer, core, sim). MIPS lives in `core/ sim/ renderer/app/`; what is RISC-V only lives in `isa/riscv/` |
| `electron/native` | The SPIM N-API addon |
| `electron/brands/generic` | The brand (the only edition): name, appId, mark, icons, installer pictures |
| `engines/`, `.github/workflows/` | Engine build (`engines.yml`) and release (`release.yml`) |

## Commands (in electron/)

    npm ci && npm run build      # dependencies, the addon (Linux: bison, flex, g++)
    npm run brand                # put the brand in place (generates src/brand.ts, src/renderer/assets/brand/)
    npm run typecheck
    npm test                     # core unit tests
    npm run electron [-- --isa=riscv]   # run the app (MIPS by default)
    xvfb-run -a -s '-screen 0 2400x1400x24' npm run shot -- <out-dir> [width] [--isa riscv]   # screenshots

RISC-V engine (from the repository root): `bash probe/setup.sh` (downloads RARS into `~/.cache/assembly-studio/rars` and builds it),
`bash probe/run.sh build` (RarsProbe → `probe/build/classes`). JDK 21 must be on PATH.
If `electron/engine/{runtime,rars.jar,classes}` exists, it is used first.

## Rules

- Do not modify `CPU/` or RARS. If a task cannot be done without modifying them, stop and report.
- Change the screen layout (button positions, panels, sizes, behaviour) only as requested. Never change it on your own.
- Use colours only through the tokens in `app.css`.
- There is one edition only, the generic one. Do not add the name or assets of any school or institution, or wording that
  limits what the program is for (for example, presenting it as exercise material for a class). Names and marks come
  only from `brand` (`src/brand.ts`).
- When you change the UI, take screenshots and look at them yourself.
- Documentation (README, release notes, and so on) is about this project only. Do not mention other repositories or earlier products.
- There is no automatic CI. Keep verification minimal: core unit tests, screenshots, and a human check at review points.
- Keep commits small, one purpose each. Push at the end of each stage.
- After 1.0.0, every change ships under a new version (fixes 1.x.y, features 1.x.0), on its own branch
  `release/<version>` made from the previous version's branch: update `electron/package.json`, write
  `docs/releases/<version>.md`, then run release.yml by hand on that branch (with `release` ticked) to publish
  `v<version>`. Earlier versions' branches are kept; `branch-cleanup.yml` is only for temporary branches.
