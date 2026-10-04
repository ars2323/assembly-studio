/* The licenses of the npm packages that end up in the app: every package
   esbuild bundled (from its metafile), plus node-addon-api, whose headers
   are compiled into the addon.  Written as one text file that About shows
   and the package carries (src/main/paths.ts, LICENSES).

   A package nested under another's node_modules (a version of its own) is
   one of its own here.  A package that ships no license file (lazy-val,
   under electron-updater) is said by its package.json to be MIT: the MIT
   text with its author's name stands in for the file. */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Metafile } from 'esbuild';

const root = path.join(import.meta.dirname, '..');
const COMPILED_IN = ['node-addon-api'];

// The package a bundled file is from, as its folder under node_modules
// ('electron-updater/node_modules/semver' for a nested one).
function packageOf(input: string): string | null {
  const m = /node_modules\/((?:(?:@[^/]+\/)?[^/]+\/node_modules\/)*(?:@[^/]+\/)?[^/]+)\//.exec(input.replace(/\\/g, '/'));
  return m ? m[1] : null;
}

const MIT = (holder: string) => `MIT License

Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

export function thirdPartyText(metafiles: Metafile[]): string {
  const names = new Set<string>(COMPILED_IN);
  for (const meta of metafiles) for (const input of Object.keys(meta.inputs)) {
    const p = packageOf(input);
    if (p) names.add(p);
  }
  const parts = [...names].sort().map((name) => {
    const dir = path.join(root, 'node_modules', name);
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying)(\.(md|txt))?$/i.test(f));
    const author = typeof pkg.author === 'string' ? pkg.author : pkg.author?.name;
    if (!file && !(pkg.license === 'MIT' && author)) throw new Error(`${name}: no license file in ${dir}`);
    const text = file ? readFileSync(path.join(dir, file), 'utf8').trim() : MIT(author);
    return `${'='.repeat(78)}\n${pkg.name} ${pkg.version} — ${pkg.license}\n${'='.repeat(78)}\n\n${text}\n`;
  });
  return `npm packages in this program: bundled into its JavaScript, or (node-addon-api)\ncompiled into its native addon.  ${names.size} packages.\n\n${parts.join('\n')}`;
}

