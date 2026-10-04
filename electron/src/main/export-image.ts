/* Export executable image (.asx, ../docs/asx-format.md), for both ISAs'
   windows: the engine (engine-mips.ts, engine-riscv.ts) reads the image of
   the program last assembled in its second process -- the machine on screen
   is not touched -- and this writes it where the student says. */

import { dialog, type BrowserWindow } from 'electron';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { brand } from '../brand.ts';
import { asxTime, formatAsx, ImageError, type MachineImage } from '../core/asx.ts';
import { encodeTextFile, NEW_FILE_FORMAT, type TextFileFormat } from '../node/text-file.ts';
import { version } from './paths.ts';

// What the window asks an export for: the program it last assembled, as it was then.
export interface ImageJob {
  source: string;
  options?: unknown;                  // MIPS: the assemble options it was assembled with
  name: string;                       // the file's name then ("untitled.s" if never saved)
  path: string | null;                // where it was; the .asx is offered next to it
  format: TextFileFormat | null;      // how that file is written (null: a new file's)
  assembled: number;                  // when, in ms since the epoch
}

export type ImageReply = { path: string; name: string } | { error: string } | null;

// The image of job.source (read: what the engine holds after assembling it),
// then the save dialog, then the file.  The hash is of the source as its
// file holds it (its encoding, BOM and line ends): for a file saved when it
// was assembled, the file's own SHA-256.  `crashed`: the engine's own crash
// error class, said so to the student.
export async function exportImage(win: BrowserWindow, job: ImageJob, read: () => Promise<MachineImage>,
                                  crashed: new (...a: never[]) => Error): Promise<ImageReply> {
  let machine: MachineImage;
  try {
    machine = await read();
  } catch (e) {
    if (e instanceof ImageError) return { error: e.message };
    if (e instanceof crashed) return { error: 'The simulator stopped while making the executable image' };
    throw e;
  }
  const encoded = encodeTextFile(job.source, job.format ?? NEW_FILE_FORMAT);
  const bytes = encoded.ok ? encoded.bytes : new TextEncoder().encode(job.source);
  const text = formatAsx({
    ...machine, source: job.name, sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    producedBy: `${brand.name} ${version}`, assembled: asxTime(new Date(job.assembled)),
  });
  const name = `${job.name.replace(/\.(s|asm)$/i, '')}.asx`;
  const r = await dialog.showSaveDialog(win, {
    title: 'Export executable image (.asx)', defaultPath: job.path ? path.join(path.dirname(job.path), name) : name,
    filters: [{ name: 'Executable image (*.asx)', extensions: ['asx'] }],
  });
  if (r.canceled || !r.filePath) return null;
  writeFileSync(r.filePath, text);
  return { path: r.filePath, name: path.basename(r.filePath) };
}
