// The engines' input hash: what engines.yml builds the engine zip from.  The
// zip is published as the release `engines-<hash>`, and release.yml (through
// engines/fetch.mjs) downloads the one whose hash the checked-out tree gives.
//
//   node engines/hash.mjs           prints <hash>
//   node engines/hash.mjs --tag     prints engines-<hash>
//   node engines/hash.mjs --list    prints each input file and its own hash
//                                   (to compare two machines that disagree)
//
// The inputs (INPUTS below): the SPIM core, the addon's sources and the build
// script that builds it for Electron, RarsProbe's sources, the pins
// (engines.lock), RARS's build script and the workflow itself.  A missing
// directory or file adds nothing (so the hash works on a partial tree).
//
// Deterministic across platforms: paths are relative, '/'-separated and sorted
// by code unit; each file's CRLF is read as LF (a Windows checkout with
// core.autocrlf gives the same hash as a Linux one).  Plain Node, no packages.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Directories (every file under them, recursively) and single files, relative to the repo root.
const INPUTS = [
  { dir: 'CPU' },
  { dir: 'electron/native', skip: ['build', 'node_modules'] },
  { dir: 'probe/src' },
  { file: 'engines/engines.lock' },
  { file: 'engines/build-rars.sh' },
  { file: 'electron/tools/build-electron.ts' },
  { file: '.github/workflows/engines.yml' },
];
// Bump when the recipe changes in a way the inputs above do not show.
const SCHEME = 'engines-hash 1';
const LENGTH = 12;

export function inputFiles() {
  const files = [];
  for (const input of INPUTS) {
    if (input.file) {
      if (existsSync(path.join(ROOT, input.file)) && statSync(path.join(ROOT, input.file)).isFile()) files.push(input.file);
      continue;
    }
    if (!existsSync(path.join(ROOT, input.dir))) continue;
    const found = [];
    walkDir(input.dir, input.dir, input.skip ?? [], found);
    files.push(...found);
  }
  return [...new Set(files)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// `skip` names directories directly under the input's own directory (electron/native/build).
function walkDir(base, rel, skip, out) {
  for (const entry of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === '.DS_Store') continue;
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (rel === base && skip.includes(entry.name)) continue;
      walkDir(base, child, skip, out);
    } else if (entry.isFile()) {
      out.push(child);
    }
  }
}

function contents(rel) {
  const bytes = readFileSync(path.join(ROOT, rel));
  // CRLF -> LF, byte-wise (binary files get the same treatment on every platform).
  const out = Buffer.allocUnsafe(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a) continue;
    out[n++] = bytes[i];
  }
  return out.subarray(0, n);
}

export function engineHash({ list = false } = {}) {
  const total = createHash('sha256');
  total.update(`${SCHEME}\n`);
  for (const rel of inputFiles()) {
    const data = contents(rel);
    const own = createHash('sha256').update(data).digest('hex');
    total.update(`${rel}\0${own}\n`);
    if (list) console.log(`${own.slice(0, 16)}  ${rel}`);
  }
  return total.digest('hex').slice(0, LENGTH);
}

export function engineTag() {
  return `engines-${engineHash()}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => !['--tag', '--list'].includes(a));
  if (unknown.length) {
    console.error(`hash.mjs: unknown argument ${unknown.join(' ')} (use --tag or --list)`);
    process.exit(2);
  }
  const hash = engineHash({ list: args.includes('--list') });
  console.log(args.includes('--tag') ? `engines-${hash}` : hash);
}
