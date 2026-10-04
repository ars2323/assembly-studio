// Downloads the engines this tree needs from the GitHub release engines.yml
// made for them, and puts them where packaging expects them:
//
//   electron/native/build/Release/spim.node   the SPIM addon (Windows x64, N-API)
//   electron/engine/                          runtime/ (jlink, Windows x64), rars.jar,
//                                             classes/, runtime.txt, engines.txt
//
//   node engines/fetch.mjs [--repo owner/name] [--force]
//
// The release is `engines-<hash>` (engines/hash.mjs) of the repository named by
// --repo, else GITHUB_REPOSITORY, else ars2323/assembly-studio.  GH_TOKEN or
// GITHUB_TOKEN, when set, is sent (needed while the repository is private).
// Nothing is downloaded when electron/engine/engines.txt already names the tag
// (--force downloads anyway).  Plain Node (>= 18, global fetch), no packages.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, engineHash } from './hash.mjs';

const DEFAULT_REPO = 'ars2323/assembly-studio';

class Failure extends Error {}
function fail(message) {
  throw new Failure(message);
}

function args() {
  const out = { repo: process.env.GITHUB_REPOSITORY || DEFAULT_REPO, force: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo' && argv[i + 1]) out.repo = argv[++i];
    else if (argv[i].startsWith('--repo=')) out.repo = argv[i].slice('--repo='.length);
    else if (argv[i] === '--force') out.force = true;
    else fail(`unknown argument ${argv[i]} (use --repo owner/name, --force)`);
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(out.repo)) fail(`--repo must be owner/name, not ${out.repo}`);
  return out;
}

function headers(accept) {
  const h = { 'User-Agent': 'assembly-studio-engines-fetch', Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// A zip: Windows' own tar.exe (bsdtar) reads zips; elsewhere unzip, else bsdtar.
function unzip(zip, dest) {
  const has = (cmd, flag) => { try { execFileSync(cmd, [flag], { stdio: 'ignore' }); return true; } catch { return false; } };
  if (process.platform === 'win32') {
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    if (existsSync(tar)) return execFileSync(tar, ['-xf', zip, '-C', dest], { stdio: 'inherit' });
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`], { stdio: 'inherit' });
  }
  if (has('unzip', '-v')) return execFileSync('unzip', ['-q', '-o', zip, '-d', dest], { stdio: 'inherit' });
  return execFileSync(has('bsdtar', '--version') ? 'bsdtar' : 'tar', ['-xf', zip, '-C', dest], { stdio: 'inherit' });
}

async function main() {
  const { repo, force } = args();
  const tag = `engines-${engineHash()}`;
  const asset = `${tag}.zip`;
  const engineDir = path.join(ROOT, 'electron', 'engine');
  const addon = path.join(ROOT, 'electron', 'native', 'build', 'Release', 'spim.node');
  const stamp = path.join(engineDir, 'engines.txt');

  if (!force && existsSync(addon) && existsSync(stamp) && readFileSync(stamp, 'utf8').includes(`tag=${tag}\n`)) {
    console.log(`fetch: ${tag} already in place (electron/engine/engines.txt); --force to download again`);
    return;
  }

  const api = `https://api.github.com/repos/${repo}/releases/tags/${tag}`;
  console.log(`fetch: ${repo} release ${tag}`);
  const res = await fetch(api, { headers: headers('application/vnd.github+json') });
  if (res.status === 404) {
    fail(`no release ${tag} in ${repo}. The engines for this tree have not been built: ` +
      `run engines.yml first (Actions > engines > Run workflow, or push the engine change), then fetch again.` +
      (process.env.GH_TOKEN || process.env.GITHUB_TOKEN ? '' : ' (If the repository is private, set GH_TOKEN.)'));
  }
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? ' (check GH_TOKEN / GITHUB_TOKEN: unset, invalid, or rate-limited)' : '';
    fail(`${api}: HTTP ${res.status}${hint} ${await res.text()}`);
  }
  const release = await res.json();
  const found = (release.assets ?? []).find((a) => a.name === asset);
  if (!found) fail(`release ${tag} has no ${asset} (an interrupted engines.yml run?): run engines.yml again`);

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'engines-'));
  try {
    // The asset's API url with octet-stream answers with a redirect to the file;
    // fetch drops Authorization on that cross-origin redirect.
    const dl = await fetch(found.url, { headers: headers('application/octet-stream') });
    if (!dl.ok) fail(`download ${asset}: HTTP ${dl.status}`);
    const zip = path.join(tmp, asset);
    writeFileSync(zip, Buffer.from(await dl.arrayBuffer()));
    console.log(`fetch: ${asset}, ${(found.size / 1048576).toFixed(1)} MB`);

    const out = path.join(tmp, 'out');
    mkdirSync(out);
    unzip(zip, out);
    for (const need of ['spim.node', 'engine/rars.jar', 'engine/classes/RarsProbe.class', 'engine/runtime/release']) {
      if (!existsSync(path.join(out, need))) fail(`${asset} has no ${need}`);
    }

    mkdirSync(path.dirname(addon), { recursive: true });
    rmSync(addon, { force: true });
    cpSync(path.join(out, 'spim.node'), addon);
    rmSync(engineDir, { recursive: true, force: true });
    try {
      renameSync(path.join(out, 'engine'), engineDir);
    } catch {
      cpSync(path.join(out, 'engine'), engineDir, { recursive: true }); // another drive (Windows temp vs workspace)
    }
    const manifest = existsSync(path.join(out, 'engines.txt')) ? readFileSync(path.join(out, 'engines.txt'), 'utf8') : '';
    writeFileSync(stamp, `tag=${tag}\n` + manifest.split(/\r?\n/).filter((l) => l && !l.startsWith('tag=')).map((l) => `${l}\n`).join(''));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`fetch: ok: electron/native/build/Release/spim.node, electron/engine/ (${tag})`);
}

main().catch((e) => {
  console.error(`fetch: FAIL: ${e instanceof Failure ? e.message : (e?.stack ?? String(e))}`);
  process.exitCode = 1;
});
