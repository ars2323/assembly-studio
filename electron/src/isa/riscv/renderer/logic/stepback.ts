/* Whether a step back undid an ecall that printed or read (RARS's
   syscall numbers, in a7): the Console keeps its output, and the input it
   read stays read.  Pure. */

const ECALL = 0x00000073;
// Print int/float/double/string/char, read int/float/double/string/char,
// print hex/binary/unsigned; the file calls (close, lseek, read, write, open).
const IO_CALLS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 34, 35, 36, 57, 62, 63, 64, 1024]);

export const isIoEcall = (word: number, a7: number): boolean => (word >>> 0) === ECALL && IO_CALLS.has(a7);
