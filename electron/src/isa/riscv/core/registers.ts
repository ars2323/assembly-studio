/* RISC-V register names: the number (x0..x31, f0..f31) and the ABI name
   (zero, ra, sp, ...), which the course uses side by side.  Pure. */

export const ABI_NAMES = [
  'zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2',
  's0', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5',
  'a6', 'a7', 's2', 's3', 's4', 's5', 's6', 's7',
  's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6',
] as const;

export const FP_ABI_NAMES = [
  'ft0', 'ft1', 'ft2', 'ft3', 'ft4', 'ft5', 'ft6', 'ft7',
  'fs0', 'fs1', 'fa0', 'fa1', 'fa2', 'fa3', 'fa4', 'fa5',
  'fa6', 'fa7', 'fs2', 'fs3', 'fs4', 'fs5', 'fs6', 'fs7',
  'fs8', 'fs9', 'fs10', 'fs11', 'ft8', 'ft9', 'ft10', 'ft11',
] as const;

/** "a0"; x8 is "s0" (its other name, fp, is in abiAliases). */
export const abiName = (n: number): string => ABI_NAMES[n];
export const abiAliases = (n: number): string[] => (n === 8 ? ['s0', 'fp'] : [ABI_NAMES[n]]);
export const numberName = (n: number): string => `x${n}`;
/** What the register panel and the Inspector print: "x10 (a0)". */
export const bothNames = (n: number): string => `x${n} (${n === 8 ? 's0/fp' : ABI_NAMES[n]})`;

/* The groups of the register panel, by the RISC-V calling convention
   (RISC-V ABIs Specification, "Integer Register Convention").  Not the MIPS
   panel's Return values / Arguments / Temporaries / Saved: in RISC-V the
   return values are a0 and a1, which are also the first arguments, and the
   temporaries and saved registers are each split in two ranges. */
export interface RegisterGroup { title: string; numbers: number[] }
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const REGISTER_GROUPS: RegisterGroup[] = [
  { title: 'Constant', numbers: [0] },                                  // zero
  { title: 'Return address', numbers: [1] },                            // ra
  { title: 'Pointers', numbers: [2, 3, 4] },                            // sp gp tp
  { title: 'Arguments · return values', numbers: range(10, 17) },       // a0-a7 (a0, a1 also return values)
  { title: 'Temporaries', numbers: [...range(5, 7), ...range(28, 31)] }, // t0-t2, t3-t6
  { title: 'Saved', numbers: [8, 9, ...range(18, 27)] },                // s0/fp, s1, s2-s11
];

/** "x10", "a0", "fp", "f3", "fa0" -> its number and file; null if no such register. */
export function findRegister(spelling: string): { file: 'x' | 'f'; number: number } | null {
  const s = spelling.trim().toLowerCase();
  let m = /^x(\d{1,2})$/.exec(s);
  if (m && Number(m[1]) < 32) return { file: 'x', number: Number(m[1]) };
  m = /^f(\d{1,2})$/.exec(s);
  if (m && Number(m[1]) < 32) return { file: 'f', number: Number(m[1]) };
  if (s === 'fp') return { file: 'x', number: 8 };
  const x = (ABI_NAMES as readonly string[]).indexOf(s);
  if (x >= 0) return { file: 'x', number: x };
  const f = (FP_ABI_NAMES as readonly string[]).indexOf(s);
  if (f >= 0) return { file: 'f', number: f };
  return null;
}
