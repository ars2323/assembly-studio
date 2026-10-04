# engines/

The two engines' build outputs are built once, kept as GitHub Release assets, and downloaded when the installer is made.

| Output | What | Inputs |
|---|---|---|
| `spim.node` | MIPS engine: the SPIM core + N-API addon (Windows x64) | `CPU/`, `electron/native/` |
| `engine/runtime/` | Java runtime made with jlink (Temurin, `java_modules` only) | `engines.lock` |
| `engine/rars.jar` | RISC-V engine: RARS 1.6 built from source at the pinned commit (`--release 11`) | `engines.lock` |
| `engine/classes/` | `RarsProbe` (the stdio JSON wrapper) | `probe/src/` |

## Files

- `engines.lock` — the pins: RARS commit, Temurin version, jlink modules.
- `hash.mjs` — the input hash. The inputs are `CPU/`, `electron/native/` (without build/), `probe/src/`,
  `engines.lock`, `build-rars.sh`, `electron/tools/build-electron.ts` and `.github/workflows/engines.yml`. Paths are
  sorted and CRLF is read as LF, so Windows and Linux produce the same value.
  `node engines/hash.mjs` → `<hash>`; `--tag` → `engines-<hash>`; `--list` → a hash per file (to compare when two
  machines disagree).
- `build-rars.sh` — fetches RARS at the pinned commit (+ the jsoftfloat submodule), builds `rars.jar` with RARS's own
  `build-jar.sh` (RARS is not modified), and compiles `probe/src/*.java` into `classes/`. Runs on Linux and in Git Bash.
  `bash engines/build-rars.sh <dir>` → `<dir>/rars.jar`, `<dir>/classes/`.
- `fetch.mjs` — downloads `engines-<hash>.zip` for the current tree's hash from Releases and unpacks it.

## When they run

- `.github/workflows/engines.yml` — on a push that changes the inputs above, or by hand (Actions → engines → Run
  workflow). If the Release for the hash already has the zip, it ends without doing anything. Otherwise it builds,
  on Windows, the addon (MSVC, winflexbison, node-gyp, Electron headers), RARS, RarsProbe and the jlink runtime,
  sends RarsProbe a ping with that runtime, and uploads everything as the `engines-<hash>` pre-release. As long as the
  inputs do not change, this happens once.
- `.github/workflows/release.yml` — on a `v*` tag (or by hand). It gets the engines with `fetch.mjs`, builds the
  installer and publishes it. It fails if the engine Release is missing — run `engines.yml` first.

The engine zip is kept as a Release asset, not in the Actions cache (the cache is deleted after 7 days without use).
`engines-*` Releases are never deleted.

## Downloading locally

```sh
node engines/fetch.mjs                      # repository: GITHUB_REPOSITORY, else ars2323/assembly-studio
node engines/fetch.mjs --repo owner/name    # another repository (a fork)
node engines/fetch.mjs --force              # download again even if already present
```

Result: `electron/native/build/Release/spim.node` and `electron/engine/` (`runtime/`, `rars.jar`, `classes/`,
`runtime.txt`, `engines.txt`). If `electron/engine/engines.txt` already names the current tag, nothing is downloaded.
For a private repository, set `GH_TOKEN`.
Both are for **Windows x64** — Linux development does not use them; build them directly with `node-gyp rebuild` and
`build-rars.sh`.

The error "no release engines-…" means the engines for the current tree have not been built yet: run `engines.yml`,
then fetch again.
