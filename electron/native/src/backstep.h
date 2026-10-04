// Step back, the parts that need no machine: which memory an instruction
// may write, and the bounded history of undo records.  addon.cc puts them to
// work on the SPIM core; nothing here knows the core (no CPU/ header), so
// tests reach these through the addon's storeSpans() alone.

#ifndef STUDIO_BACKSTEP_H
#define STUDIO_BACKSTEP_H

#include <stddef.h>
#include <stdint.h>

#include <vector>

namespace backstep {

// A run of bytes an instruction may write.
struct Span {
  uint32_t addr;
  uint32_t size;
};

// SPIM's syscall numbers (CPU/spim-syscall.h) that matter here.  Prefixed:
// Windows' headers already define SYS_OPEN and the like as macros.
enum {
  SPIMSYS_PRINT_INT = 1, SPIMSYS_PRINT_FLOAT = 2, SPIMSYS_PRINT_DOUBLE = 3, SPIMSYS_PRINT_STRING = 4,
  SPIMSYS_READ_INT = 5, SPIMSYS_READ_FLOAT = 6, SPIMSYS_READ_DOUBLE = 7, SPIMSYS_READ_STRING = 8,
  SPIMSYS_SBRK = 9, SPIMSYS_EXIT = 10, SPIMSYS_PRINT_CHAR = 11, SPIMSYS_READ_CHAR = 12,
  SPIMSYS_OPEN = 13, SPIMSYS_READ = 14, SPIMSYS_WRITE = 15, SPIMSYS_CLOSE = 16, SPIMSYS_EXIT2 = 17,
};

// Register numbers in R[].
enum { REG_V0_ = 2, REG_A0_ = 4, REG_A1_ = 5, REG_A2_ = 6 };

// More than this is not saved for one syscall's buffer (read_string,
// read): a step back then restores the registers but not those bytes.
const uint32_t MAX_SPAN = 1 << 20;

inline bool isSyscall(uint32_t word) { return (word >> 26) == 0 && (word & 0x3f) == 0x0c; }

// Whether WORD, with the registers R as they are before it runs, is a
// syscall that reads or writes the console or a file.
inline bool isIoSyscall(uint32_t word, const int32_t *R) {
  if (!isSyscall(word)) return false;
  switch (R[REG_V0_]) {
    case SPIMSYS_PRINT_INT: case SPIMSYS_PRINT_FLOAT: case SPIMSYS_PRINT_DOUBLE: case SPIMSYS_PRINT_STRING:
    case SPIMSYS_READ_INT: case SPIMSYS_READ_FLOAT: case SPIMSYS_READ_DOUBLE: case SPIMSYS_READ_STRING:
    case SPIMSYS_PRINT_CHAR: case SPIMSYS_READ_CHAR:
    case SPIMSYS_OPEN: case SPIMSYS_READ: case SPIMSYS_WRITE: case SPIMSYS_CLOSE:
      return true;
  }
  return false;
}

// The memory the instruction WORD may write when it runs with the
// registers R (R[0..31], as they are before it runs): at most one span,
// written to OUT.  Returns whether there is one.
//
//   sb 1, sh 2, sw / sc / swc1 4, sdc1 8 bytes at R[base] + offset;
//   swl / swr: the aligned word they write part of;
//   syscall read_string ($a0, $a1 bytes) and read ($a1, $a2 bytes).
// sbrk writes no byte that was there before (it adds zeroed memory).
// Coprocessor 2's stores raise an exception and write nothing.  An
// unaligned or unmapped address writes nothing either (the core raises an
// exception), but saying a span costs nothing: putting back bytes that did
// not change changes nothing.
inline bool storeSpan(uint32_t word, const int32_t *R, Span *out) {
  uint32_t op = word >> 26;
  uint32_t base = (word >> 21) & 31;
  uint32_t ea = (uint32_t)R[base] + (uint32_t)(int32_t)(int16_t)(word & 0xffff);
  switch (op) {
    case 0x28: *out = {ea, 1}; return true;           // sb
    case 0x29: *out = {ea, 2}; return true;           // sh
    case 0x2b:                                        // sw
    case 0x38:                                        // sc
    case 0x39: *out = {ea, 4}; return true;           // swc1
    case 0x3d: *out = {ea, 8}; return true;           // sdc1
    case 0x2a:                                        // swl
    case 0x2e: *out = {ea & ~3u, 4}; return true;     // swr
  }
  if (isSyscall(word)) {
    uint32_t addr = 0, size = 0;
    if (R[REG_V0_] == SPIMSYS_READ_STRING) { addr = (uint32_t)R[REG_A0_]; size = (uint32_t)R[REG_A1_]; }
    else if (R[REG_V0_] == SPIMSYS_READ) { addr = (uint32_t)R[REG_A1_]; size = (uint32_t)R[REG_A2_]; }
    if (R[REG_V0_] == SPIMSYS_READ_STRING || R[REG_V0_] == SPIMSYS_READ) {
      if ((int32_t)size <= 0 || size > MAX_SPAN) return false;
      *out = {addr, size};
      return true;
    }
  }
  return false;
}

// The last CAPACITY records, oldest first; pushing onto a full ring drops
// the oldest.  Slots are reused, so a record's buffers keep their memory.
template <typename T>
class Ring {
 public:
  explicit Ring(size_t capacity) : capacity_(capacity) {}
  size_t size() const { return size_; }
  size_t capacity() const { return capacity_; }
  bool empty() const { return size_ == 0; }
  void clear() { size_ = 0; }
  // The slot the next record goes in; it counts only once commit() is called.
  // (On a full ring that is the oldest record's slot.)
  T &next() {
    if (slots_.empty()) slots_.resize(capacity_);
    return slots_[index(size_)];
  }
  void commit() {
    if (size_ < capacity_) size_ += 1;
    else start_ = (start_ + 1) % capacity_;
  }
  T &last() { return slots_[index(size_ - 1)]; }
  void pop() { if (size_ > 0) size_ -= 1; }

 private:
  size_t index(size_t i) const { return (start_ + i) % capacity_; }
  size_t capacity_;
  size_t start_ = 0;
  size_t size_ = 0;
  std::vector<T> slots_;
};

}  // namespace backstep

#endif
