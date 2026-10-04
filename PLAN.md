# Assembly Studio — plan

MIPS and RISC-V in one app. On launch the user chooses the ISA, and the app starts that ISA's engine.
The colours follow the start screen (the circuit board). The screen layout (button positions, panels, sizes,
behaviour) changes only where a review asks for it.
There is one edition, the generic one.

Status: **1.0.0 is released.** Stages S0–S6 are done; later work follows §9.

## 1. Components

| What | Where |
|---|---|
| App (Electron UI) | `electron/src` |
| SPIM core and its addon | `CPU/`, `electron/native/` |
| RARS wrapper | `probe/` (RARS 1.6 is built from a pinned commit and not kept in the repository) |
| Engine build and release | `engines/`, `.github/workflows/` |

## 2. Decisions

| Topic | Decision |
|---|---|
| Engines | MIPS = SPIM (`CPU/` + N-API addon, in a `utilityProcess` worker). RISC-V = RARS 1.6 (JVM, `RarsProbe` over stdio JSON). Neither is modified |
| Choosing the ISA | Step 0 of the first screen's card: "MIPS / RISC-V". Chosen on every launch, never remembered. Only the chosen ISA's engine runs; going back home stops it and the user chooses again. `--isa=mips\|riscv` for development and tests |
| Editions | One generic edition. The brand layer (`electron/brands/generic`) only keeps the name, mark and icons in one place |
| Name | `Assembly Studio`; executable `AssemblyStudio` |
| UI language | The work screen's states and names are in English (Assemble panel, status line, panel labels). Instruction explanations (Inspector), the tutorial, the first screen and dialogs are in Korean or English: a KO/EN switch (first screen's card, status line, Settings), for the run only, starting from the system's language (since 1.1.0) |
| Logo | Chosen from two or three drafts |
| Screen | Button positions, panel arrangement, sizes and behaviour stay as they are. Only the colours change (§4) |
| Themes | Dark and light, switched at any time with the sun/moon switch |
| Colour policy | Structure in black and white. Muted colour only where it carries meaning: errors, values that just changed, format badges. Final colours were set from the S2 drafts |
| Versions and releases | From 1.0.0. One installer per tag |
| Verification and CI | Minimal verification, no automatic CI, three reviews (§5, §6) |

## 3. Structure

```
CPU/                    SPIM core — do not modify
probe/                  RarsProbe.java and setup.sh — RARS is built from a pinned commit, not kept in the repository
electron/brands/
  generic/              brand.ts (name, appId, wordmark, About text), logo, icons, installer pictures
electron/
  native/               SPIM N-API addon
  src/
    engine/mips/        SPIM engine boundary (worker, host, transport, protocol)
    engine/riscv/       RARS engine boundary (JVM transport, host, protocol)
    isa/mips/           decoder, op table, registers, syntax, explanations, near-miss hints, machine bundle, tutorial, examples
    isa/riscv/          the same parts
    main/ renderer/     shared: first screen, panels, editor, layout. The ISA and the brand come in as modules
```

- The main process's `sim:*` IPC only forwards to the active engine. The two engines' message formats do not change.
- `app.ts` exists once per ISA at first. Shared parts are pulled out only when there is a real reason to touch them.
- UI code reads the name and the mark only through `brand.*`.

## 4. Colour — Circuit Dark

The starting point is the start screen (`startfield/render.ts`: `#0d0d0d` `#181818` `#1c1c1c` `#282828`, white lines and glow).
The table below was the draft; the final values were set at S2 and live as tokens in `app.css`.

| Role | Before | Draft |
|---|---|---|
| Window background | `#f5f7fa` | `#0d0d0d` |
| Panel surface / title bar | `#ffffff` | `#141414` / `#101010` |
| Borders | `#e1e5ea` | `#2a2a2a` |
| Hover / selection | `#f3f6f9` / blue tint | `#1f1f1f` / `#262626` |
| Text / secondary / dim | dark greys | `#e6e6e6` / `#a3a3a3` / `#5c5c5c` |
| Emphasis (titles, links, active tab) | navy, blue | white |
| Primary button (Step) | blue fill | white outline + soft glow (like the start screen's buttons) |
| Register or memory that just changed | yellow row | white glow + white bar on the left |
| Current PC row | blue tint | `#262626` + white bar |
| Error | red | red tuned for a dark background (around `#ff6b5b`) |
| Format badges, syntax highlighting | colour tints | muted colours or grey steps — two drafts |

- Change together: the Windows caption buttons and the window background (`titleBarOverlay` and `backgroundColor` in
  `main.ts`; otherwise a white flash shows at startup), scrollbars, selection colour, focus ring, dialogs, editor syntax colours.
- Do not change: the start screen, the logo's colours, printing (stays light).
- Contrast: 4.5:1 for body text, 3:1 for large text.
- Colours are used only through tokens. At the start, `app.css` had 84 colour values outside the tokens; S1 moved them all
  into tokens. Token names describe meaning (`--white` → `--surface`, for example).

## 5. Stages

There are only three reviews: **① S2 colour drafts, ② end of S4 (using an installer with both ISAs on Windows), ③ S6 before publishing.**
The other stages run on without stopping.

| Stage | Content | Check | Status |
|---|---|---|---|
| **S0 Import** | Bring in the app, `CPU/`, the addon and packaging. Rename to Assembly Studio and split out the brand layer. `CLAUDE.md`, `engines.yml` | It runs | Done |
| **S1 Tokens** | The 84 colour values and the colours in `main.ts` become tokens. Token names describe meaning | One screenshot | Done |
| **S2 Dark theme** | Two drafts (format badges, emphasis) → **review ①** → apply | One screenshot at 1280, one at 910 | Done |
| **S3 RISC-V engine** | `probe/`, the RARS engine boundary, the RISC-V ISA module. The RISC-V CSS is brought in on the new tokens. `--isa` | Imported core unit tests; it runs | Done |
| **S4 Choosing the ISA** | Step 0 of the first screen, starting the engine after the choice, switching from home. Title, About and file filters follow the ISA. A trial installer (pre-release) | **Review ②** | Done |
| **S5 Finishing the edition** | Name, logo, icon, About, a new tutorial (both ISAs, no characters), usage guide, `.asx` export (both ISAs) | Screenshots | Done |
| **S6 1.0.0** | Publish the installer | **Review ③** | Done |

S2 (colour) came before S3 (RISC-V): changing colours while there was only MIPS meant doing it once, and the RISC-V CSS
could use the new tokens as it came in.

## 6. Verification, CI, release

The engines (SPIM, RARS) are already proven and are used without changes, so verification is kept minimal.

**Tests kept:** only the ISA core unit tests (decoder, format, registers and so on — fast, and they catch imports broken while moving files).
**Not kept:** end-to-end suites, golden files, mutants, per-width measurements, installer/IME/upgrade checks, probe checks, and their tools.
**Not added:** new end-to-end tests, contrast unit tests (contrast was computed once when the drafts were made), screenshot comparison tools.
**Screen check:** one screenshot script; take one or two shots of the changed screen and look at them.
**Windows check:** a person uses the trial installer at review ② (no automatic Windows checks).

| Workflow | When | What it does |
|---|---|---|
| `engines.yml` | When an engine input changes (`CPU/`, `native/`, `probe/`, the RARS commit, the Temurin version), or by hand | Builds `spim.node`, the RARS jar, the `RarsProbe` classes and the jlink runtime, and uploads them as `engines-<input hash>.zip`, a Release asset. In practice, once |
| `release.yml` | A `v*` tag, or by hand | Downloads the engine zip → UI bundle → installer → publish. No tests |

- There is no automatic CI.
- The engine zip is kept as a Release asset, not in the Actions cache (the cache is deleted after 7 days without use).
- Earlier releases are never deleted. A problem is fixed with a patch release; until then users can go back to the previous installer.

## 7. Rules

- Do not modify `CPU/` or RARS. If a task cannot be done without modifying them, stop and report.
- Change the screen layout (button positions, panels, sizes, behaviour) only as requested.
- Colours only through tokens.
- Keep commits small, one purpose each. Push at the end of each stage.

## 8. Risks

| Risk | Response |
|---|---|
| Installer size — around 140 MB because of the JVM runtime | Accepted. The jlink runtime has the minimum modules (java.base, java.prefs, java.desktop) |
| JVM cold start when RISC-V is chosen | Start the engine right after the choice and wait while the first screen's next step is shown |
| Behaviour differences between the engines (breakpoints: address vs line; input: re-run vs event; reading while running; progress) | Each engine boundary stays as it is and the per-ISA `app.ts` absorbs the difference. Progress while running is MIPS only |
| Problems found late because verification is minimal | Checked on real Windows at review ②. Users can go back to an earlier release |
| Old `SPIM_*` environment variable names | Renamed to `STUDIO_*` in S0 |

## 9. After 1.0.0 — versioning

1.0.0 is published. Every later change ships under a new version:

- **1.x.y** — fixes only (the last number).
- **1.x.0** — new features.

Each version has its own branch, `release/<version>`, made from the previous version's branch; the work for that
version goes there. Earlier versions' branches are kept. The newest version's branch is the default branch (changed
in the repository settings). `branch-cleanup.yml` is only for temporary branches. For each release:

1. Make the branch `release/<version>` and set `version` in `electron/package.json`.
2. Write `docs/releases/<version>.md` (it becomes the release notes).
3. Push the tag `v<version>`, or run `release.yml` by hand with `release` ticked, to publish `v<version>`.
