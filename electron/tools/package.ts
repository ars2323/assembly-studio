/* Packages the app with electron-builder, for one brand (electron/brands/<id>/).

     node tools/package.ts [--brand generic|hallym]          Windows: the NSIS installer (on Windows)
     node tools/package.ts [--brand …] --dir                 this platform, unpacked only (a check)

   The brand defaults to $STUDIO_BRAND, else generic.  It gives the names
   (window, Start menu, install folder, uninstall entry), the appId, the icon
   and the installer's pictures; only its assets go into the package.

   1. Stages build/package/app/: the main process and the simulator process
      bundled by esbuild (STUDIO_BUNDLE defined: src/main/paths.ts,
      src/sim/transport.ts and native/index.ts then look next to the
      bundle), the window (both ISAs' scripts, app.css and riscv.css), the
      addon, the default exception handler, both ISAs' examples, and the
      notices.  No node_modules: everything is bundled.
   2. The RISC-V engine, which goes into the package's resources as it is
      (resources/engine/, outside app.asar: java reads real files):
        runtime/   a Java runtime made by jlink (java.base, java.prefs, java.desktop)
        rars.jar   RARS built from its pinned commit (probe/setup.sh: rars-src.jar)
        classes/   the engine around it (probe/src/RarsProbe.java)
      electron/engine/ when it holds all three (engines/fetch.mjs unpacks
      them there); else staged in build/package/engine/ from the JDK this
      runs with (its jlink), $RARS_HOME/rars-src.jar and probe/build/classes.
   3. Runs electron-builder on it.

   The addon must already be built for Electron (npm run build:electron, or
   engines/fetch.mjs).

   Installed per user (%LOCALAPPDATA%\Programs\<brand.name>), no elevation,
   no file association, no desktop shortcut.  The two brands have their own
   appId and folder, so both can be installed on one PC. */

import { build as electronBuild, type Configuration } from 'electron-builder';
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { brandId, useBrand } from './brand.ts';
import { nodeOptions, rendererOptions, writeThirdParty } from './build-ui.ts';

const root = path.join(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const electronVersion = JSON.parse(readFileSync(path.join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const stage = path.join(root, 'build/package/app');
const engineStage = path.join(root, 'build/package/engine');
const at = (...p: string[]) => path.join(stage, ...p);
const dirOnly = process.argv.includes('--dir');
const brandArg = process.argv.indexOf('--brand');
const BRAND = brandId(brandArg >= 0 ? process.argv[brandArg + 1] : undefined);
useBrand(BRAND); // before the imports below read src/brand.ts
const { brand } = await import('../src/brand.ts');
const { LICENSE_SOURCES } = await import('../src/main/paths.ts');
const brandDir = path.join(root, 'brands', BRAND, 'packaging');
const brandFile = (name: string) => (existsSync(path.join(brandDir, name)) ? path.join(brandDir, name) : undefined);

async function stageApp(): Promise<void> {
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  const define = { 'process.env.STUDIO_BUNDLE': '"1"', 'process.env.STUDIO_VERSION': JSON.stringify(pkg.version) };
  // The installer's script, with the brand's name in it.
  const nsh = readFileSync(path.join(root, 'packaging/installer.nsh'), 'utf8').replaceAll('@NAME@', brand.name).replaceAll('@NPMNAME@', brand.exe.toLowerCase());
  mkdirSync(path.join(root, 'build/package'), { recursive: true });
  writeFileSync(path.join(root, 'build/package/installer.nsh'), nsh);
  const main = await esbuild.build({ ...nodeOptions('src/main/main.ts', at('main.js')), define });
  const worker = await esbuild.build({ ...nodeOptions('src/sim/worker.ts', at('worker.js')), define });
  const ui = await esbuild.build({ ...rendererOptions, outdir: at('renderer/app'), sourcemap: false });
  await writeThirdParty([ui.metafile!, main.metafile!, worker.metafile!]);

  // isa.js finds the scripts and riscv.css next to the page.
  const html = readFileSync(path.join(root, 'src/renderer/app/index.html'), 'utf8');
  const packagedHtml = html.replace('data-bundles="../../../build/renderer/" data-riscv-css="../../isa/riscv/renderer/riscv.css"',
    'data-bundles="" data-riscv-css="riscv.css"');
  if (packagedHtml === html) throw new Error('index.html: the script tag to rewrite was not found');
  writeFileSync(at('renderer/app/index.html'), packagedHtml);
  cpSync(path.join(root, 'src/renderer/app/isa.js'), at('renderer/app/isa.js'));
  cpSync(path.join(root, 'src/renderer/app/app.css'), at('renderer/app/app.css'));
  cpSync(path.join(root, 'src/isa/riscv/renderer/riscv.css'), at('renderer/app/riscv.css'));
  cpSync(path.join(root, 'src/renderer/assets'), at('renderer/assets'), { recursive: true });
  cpSync(path.join(root, 'src/main/preload.cjs'), at('preload.cjs'));
  cpSync(path.join(root, '../CPU/exceptions.s'), at('exceptions.s'));
  cpSync(path.join(root, 'src/examples'), at('examples'), { recursive: true });
  cpSync(path.join(root, 'src/isa/riscv/examples'), at('riscv-examples'), { recursive: true });
  const addon = path.join(root, 'native/build/Release/spim.node');
  if (!existsSync(addon)) throw new Error('no native/build/Release/spim.node: npm run build:electron first');
  cpSync(addon, at('spim.node'));
  for (const [name, source] of Object.entries(LICENSE_SOURCES)) cpSync(path.join(root, source), at('licenses', name));

  writeFileSync(at('package.json'), JSON.stringify({
    // An npm name (no blanks, lower case); the install folder is still
    // called brand.name: the staged installer.nsh sets it.
    name: brand.exe.toLowerCase(), productName: brand.name, version: pkg.version,
    description: 'MIPS and RISC-V simulator (SPIM 9.1.24, RARS 1.6)',
    author: brand.author, license: 'BSD-3-Clause', type: 'module', main: 'main.js',
  }, null, 1));
}

// The Java modules the jlink runtime carries: the ones RARS and the engine
// need (java.desktop cannot be left out without changing RARS).
const JAVA_MODULES = ['java.base', 'java.prefs', 'java.desktop'];

// The folder that becomes resources/engine/ (see 2. above).
function engineDir(): string {
  const fetched = path.join(root, 'engine');
  if (['runtime', 'rars.jar', 'classes'].every((p) => existsSync(path.join(fetched, p)))) return fetched;
  rmSync(engineStage, { recursive: true, force: true });
  mkdirSync(engineStage, { recursive: true });
  const home = process.env.JAVA_HOME;
  const jlink = home ? path.join(home, 'bin', process.platform === 'win32' ? 'jlink.exe' : 'jlink') : 'jlink';
  execFileSync(jlink, ['--add-modules', JAVA_MODULES.join(','), '--strip-debug', '--no-man-pages', '--no-header-files',
    '--compress=zip-9', '--output', path.join(engineStage, 'runtime')], { stdio: 'inherit' });
  const rarsHome = process.env.RARS_HOME ?? path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), '.cache'), 'assembly-studio', 'rars');
  const jar = path.join(rarsHome, 'rars-src.jar');
  if (!existsSync(jar)) throw new Error(`no ${jar}: run probe/setup.sh`);
  cpSync(jar, path.join(engineStage, 'rars.jar'));
  const classes = path.join(root, '../probe/build/classes');
  if (!existsSync(path.join(classes, 'RarsProbe.class'))) throw new Error(`no ${classes}/RarsProbe.class: run probe/run.sh build`);
  cpSync(classes, path.join(engineStage, 'classes'), { recursive: true });
  return engineStage;
}

export const config: Configuration = {
  appId: brand.appId,
  productName: brand.name,
  executableName: brand.exe,
  electronVersion,
  directories: { app: stage, output: path.join(root, 'dist'), buildResources: brandDir },
  // Only the staged files: everything the program uses is in its bundles
  // (electron-builder would otherwise add the repository's dependencies).
  files: ['**/*', '!node_modules/**'],
  publish: null,
  asar: true,
  asarUnpack: ['spim.node'],
  // The RISC-V engine, outside app.asar: resources/engine (src/main/paths.ts engine()).
  // (Set by the run below: staging it may run jlink.)
  extraResources: [],
  electronLanguages: ['ko', 'en-US'], // Chromium's UI strings: Korean, and its fallback
  npmRebuild: false,
  nodeGypRebuild: false,
  // BSD: the notice goes with the binary, next to the executable as well as in About.
  extraFiles: [{ from: path.join(root, '../LICENSE'), to: 'LICENSE.txt' }, { from: path.join(root, '../NOTICE'), to: 'NOTICE.txt' }],
  win: {
    target: ['nsis'],
    icon: brandFile('icons/app.ico') ?? brandFile('icons/app-256.png'),
    signAndEditExecutable: true,
  },
  nsis: {
    // Two screens, in Korean: the progress, then "설치가 완료되었습니다" with
    // "지금 실행하기" (packaging/installer.nsh).  Per user, with no choice of
    // folder or of "for all users" (either would need an administrator);
    // /S installs silently.
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: false,
    installerLanguages: ['ko_KR'],
    language: '1042',
    shortcutName: brand.name,
    createDesktopShortcut: false,
    createStartMenuShortcut: true,
    deleteAppDataOnUninstall: false,
    runAfterFinish: true, // the finish page's "지금 실행하기", ticked
    installerSidebar: brandFile('installerSidebar.bmp'),
    uninstallerSidebar: brandFile('uninstallerSidebar.bmp'),
    include: path.join(root, 'build/package/installer.nsh'),
    artifactName: `${brand.exe}-\${version}-win-x64-setup.\${ext}`,
    uninstallDisplayName: `${brand.name} \${version}`,
  },
  linux: { target: ['dir'], icon: brandFile('icons/app-256.png'), category: 'Education' },
};

if (import.meta.main) {
  await stageApp();
  config.extraResources = [{ from: engineDir(), to: 'engine' }];
  await electronBuild({ config, dir: dirOnly, publish: 'never' });
}
