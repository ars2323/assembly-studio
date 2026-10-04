// N-API front end for the SPIM core in ../../CPU (untouched).
//
// It plays the part QtSpim/spim_support.cpp plays in the Qt build: it defines
// the globals and callbacks the core expects from a front end, and it drives
// the core.  Only bytes cross into C++: source text, the exception handler,
// argv and the environment all arrive as bytes from Node, which is where
// paths are opened and encodings decided (docs/PORTING.md).  No path and no
// encoding logic lives here.
//
// assemble(), run() and the breakpoint setters change the machine; the rest
// only read it.

#include <napi.h>

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#ifndef _MSC_VER
#include <unistd.h>  // _exit
#endif

#include <algorithm>
#include <string>
#include <vector>

#include "backstep.h"

// The core's headers have no include guards; each is included once, in the
// order QtSpim/edu/edu_loader.cpp uses.
#include "spim.h"
#include "string-stream.h"
#include "spim-utils.h"
#include "inst.h"
#include "reg.h"
#include "mem.h"
#include "sym-tbl.h"
#include "scanner.h"
#include "parser.h"
#include "data.h"

// The scanner's in-memory input (flex, generated with -Pyy).  scanner.h does
// not declare these; the signatures are flex 2.6's.
struct yy_buffer_state;
typedef struct yy_buffer_state *YY_BUFFER_STATE;
YY_BUFFER_STATE yy_scan_bytes(const char *bytes, int len);
void yy_delete_buffer(YY_BUFFER_STATE buffer);

// The process environment, which initialize_run_stack() copies onto the
// simulated stack.  MSVC spells it _environ, as CPU/spim-utils.cpp knows.
#ifdef _MSC_VER
#define environ _environ
#else
extern char **environ;
#endif

// ------------------------------------------------------------ front end

bool bare_machine;
bool accept_pseudo_insts;
bool delayed_branches;
bool delayed_loads;
bool quiet;
char *exception_file_name = 0;
bool mapped_io;
int spim_return_value;

port message_out;
port console_out;
port console_in;

static std::vector<std::string> errors;  // error() and run_error(), in order

// While set, message_out is collected here (print_symbols() and
// list_breakpoints() write nowhere else).
static std::string *messageCapture = NULL;

// What the program printed and nobody has taken yet (consoleOutput()), as
// bytes.  The worker takes it after every slice of a run.
static std::string consoleBytes;

static void consoleWrite(const std::string &bytes) { consoleBytes += bytes; }

static std::string formatted(const char *fmt, va_list args) {
  char buf[10000];  // QtSpim's BIG_BUF_SIZE
  vsnprintf(buf, sizeof(buf), fmt, args);
  return buf;
}

void error(char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  errors.push_back(formatted(fmt, args));
  va_end(args);
}

// QtSpim reports these and returns; so does this front end.
void run_error(char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  errors.push_back(formatted(fmt, args));
  va_end(args);
}

// The core assumes this does not return (terminal spim exits).  It ends
// the simulator process, which is its own (src/sim/worker.ts): the host sees
// the exit code and reads the message from stderr.  _exit, not abort():
// abort() leaves a core dump (apport on Ubuntu, Windows Error Reporting)
// every time a student's program reaches, say, an .err directive.
const int FATAL_EXIT_CODE = 70;  // EX_SOFTWARE; src/sim/host.ts knows it
void fatal_error(char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  fprintf(stderr, "SPIM core fatal error: %s", formatted(fmt, args).c_str());
  va_end(args);
  fflush(stderr);
  _exit(FATAL_EXIT_CODE);
}

void write_output(port fp, char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  if (fp.i == console_out.i) {
    consoleWrite(formatted(fmt, args));
  } else if (messageCapture != NULL && fp.i == message_out.i) {
    messageCapture->append(formatted(fmt, args));
  }
  va_end(args);
}
// Console input.  The read syscalls (5, 6, 7, 8, 12) call read_input() in
// the middle of executing the syscall instruction, from inside run(): there
// is no waiting there.  With input queued (provideInput()), read_input()
// takes one line of it, as QtSpim's does.  With none, it writes nothing,
// notes where the syscall was and what it is about to overwrite ($v0, $f0),
// and asks the core to stop after this instruction; run() then puts those
// back and answers "input" -- the machine as it was just before the
// syscall, which runs again once input has been provided.
// (docs/PORTING.md 10, "콘솔 입력".)
static std::string inputBytes;
static bool inputWanted = false;
static mem_addr inputPC;
static reg_word inputV0;
static double inputF0;

int console_input_available() { return inputBytes.empty() ? 0 : 1; }
char get_console_char() {
  if (inputBytes.empty()) return 0;
  char c = inputBytes[0];
  inputBytes.erase(0, 1);
  return c;
}
void put_console_char(char c) { consoleWrite(std::string(1, c)); }
void read_input(char *str, int n) {
  if (inputBytes.empty()) {
    if (!inputWanted) {
      inputWanted = true;
      inputPC = PC;
      inputV0 = R[REG_V0];
      inputF0 = FPR[0];
    }
    force_break = true;  // run_spim() stops before the next instruction
    return;
  }
  int i = 0;
  while (i < n - 1 && !inputBytes.empty()) {
    char c = get_console_char();
    str[i++] = c;
    if (c == '\n') break;
  }
  if (n > 0) str[i] = '\0';
}

// ------------------------------------------------------------ loading

// read_assembly_file() in CPU/spim-utils.cpp, line for line, except that the
// scanner reads BYTES from a flex memory buffer instead of a FILE* on a path.
// initialize_scanner() still runs first, for the state it resets (line
// number, current line, EOF marker); the buffer then replaces the one it set
// up.  NAME is only what the core prints in its messages.
//
// The whole file sits in one buffer, so flex never refills it.  With a
// FILE* it does, every 16 KB, and moves the pending text to the buffer's
// start; the scanner's current_line pointer (CPU/scanner.l) then shows
// other bytes, and the source comment of an instruction near that point
// comes out garbled.  QtSpim shows five such lines for tt.core.s; this
// front end shows the right ones.  docs/PORTING.md, "Source line display".
//
// The one addition, as in QtSpim/edu/edu_loader.cpp: print_symbols() before
// flush_local_labels(), while the file's local labels are still in the
// table.  It writes the listing to *SYMBOLS and changes nothing.
static void readAssemblyBytes(const std::string &bytes, const std::string &name,
                              std::string *symbols) {
  initialize_scanner(stdin);
  YY_BUFFER_STATE buffer = yy_scan_bytes(bytes.data(), (int)bytes.size());
  std::string display(name);
  initialize_parser(&display[0]);

  while (!yyparse())
    ;

  yy_delete_buffer(buffer);
  if (symbols != NULL) {
    messageCapture = symbols;
    print_symbols();
    messageCapture = NULL;
  }
  flush_local_labels(!parse_error_occurred);
  end_of_assembly_file();
}

// initialize_world(handler, false) in CPU/spim-utils.cpp, with the handler
// read from bytes.  The core's own function is called with no handler, which
// does everything but the load; the load and the "main" label that follow it
// there are repeated here.  Its closing initialize_scanner(stdin) is repeated
// too; its delete_all_breakpoints() is static to the core, and the handler
// load adds no breakpoints for it to delete.
// Where the user data segment's first datum goes, as initialize_world()
// leaves it (before the handler, whose user data belongs to the program too).
static mem_addr userDataStart;

static void initializeWorld(const std::string &handler) {
  initialize_world(NULL, false);
  userDataStart = current_data_pc();  // the user segment: initialize_world() leaves data there

  // No handler: nothing to read (flex cannot scan an empty buffer, and
  // QtSpim with "Load exception handler" unticked reads no file either).
  if (!handler.empty()) {
    bool old_bare = bare_machine;
    bool old_accept = accept_pseudo_insts;
    bare_machine = false;
    accept_pseudo_insts = true;
    readAssemblyBytes(handler, "exceptions.s", NULL);
    bare_machine = old_bare;
    accept_pseudo_insts = old_accept;
  }

  if (!bare_machine) {
    char main_label[] = "main";
    (void)make_label_global(main_label);
    (void)record_label(main_label, 0, 0);
  }
  initialize_scanner(stdin);
}

// Run parameters: argv (argv[0] included) and the environment the program
// sees.  Node always supplies them; nothing here has a default.
static std::string commandLine;
static std::vector<std::string> environment;

// initialize_stack(command line) with ENVIRONMENT in place of the process's
// own: initialize_run_stack() copies `environ` onto the simulated stack.
static void initializeStack() {
  std::vector<char *> envp;
  for (size_t i = 0; i < environment.size(); i++) {
    envp.push_back(&environment[i][0]);
  }
  envp.push_back(NULL);
  char **saved = environ;
  environ = envp.data();
  initialize_stack(commandLine.c_str());
  environ = saved;
}

// Where the run stands: finished (ended or failed; the next run starts
// over, as QtSpim's does) and the breakpoint it last stopped at, which the
// next run steps over first (QtSpim's Continue).
static bool finished = false;
static mem_addr stoppedAt = 0;

static void forgetHistory();  // step back's records (below)

// ------------------------------------------------------------ helpers

static std::string bytesOf(const Napi::Value &value) {
  Napi::Uint8Array array = value.As<Napi::Uint8Array>();
  return std::string((const char *)array.Data(), array.ByteLength());
}

static bool isBytes(const Napi::Value &value) {
  return value.IsTypedArray() &&
         value.As<Napi::TypedArray>().TypedArrayType() == napi_uint8_array;
}

static Napi::String stringOf(Napi::Env env, const std::string &bytes) {
  return Napi::String::New(env, bytes);  // the core's text is UTF-8 by now
}

static bool flagOf(Napi::Value options, const char *name, bool otherwise) {
  if (!options.IsObject()) return otherwise;
  Napi::Value v = options.As<Napi::Object>().Get(name);
  return v.IsBoolean() ? v.As<Napi::Boolean>().Value() : otherwise;
}

static Napi::Value throwType(Napi::Env env, const char *usage) {
  Napi::TypeError::New(env, usage).ThrowAsJavaScriptException();
  return env.Null();
}

// ------------------------------------------------------------ bindings

// assemble(source, handler, argv, env, fileName[, options])
//   source, handler  Uint8Array (bytes; UTF-8 by Node's doing); an empty
//                    handler loads none, as QtSpim with the box unticked
//   argv, env        Uint8Array[] (each one string's bytes)
//   fileName         Uint8Array, for the core's messages only
//   options          { acceptPseudo, delayedBranches, delayedLoads, mappedIo,
//                    quiet }: QtSpim's Settings, each defaulting to QtSpim's
//                    default.  The bare machine is never on (QtSpim/menu.cpp
//                    sim_Settings, "EDU": this course does not use it).
// -> { ok, errors: string[], symbols: string, data: { start, end } }
//   data  the user data segment the assembler filled: from where its first
//         datum went to where the next would go (a trailing .space
//         included).  For the executable image (src/sim/image.ts).
//
// What QtSpim's load does: reinitialize (world + handler), build the stack,
// read the file.
static Napi::Value Assemble(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  const char *usage = "assemble(source, handler, argv[], env[], fileName)";
  if (info.Length() < 5 || !isBytes(info[0]) || !isBytes(info[1]) ||
      !info[2].IsArray() || !info[3].IsArray() || !isBytes(info[4])) {
    return throwType(env, usage);
  }
  Napi::Array argv = info[2].As<Napi::Array>();
  Napi::Array envv = info[3].As<Napi::Array>();
  commandLine.clear();
  for (uint32_t i = 0; i < argv.Length(); i++) {
    if (!isBytes(argv.Get(i))) return throwType(env, usage);
    if (i > 0) commandLine += ' ';
    commandLine += bytesOf(argv.Get(i));
  }
  environment.clear();
  for (uint32_t i = 0; i < envv.Length(); i++) {
    if (!isBytes(envv.Get(i))) return throwType(env, usage);
    environment.push_back(bytesOf(envv.Get(i)));
  }

  // QtSpim's defaults (QtSpim/state.cpp), or what the options say.
  Napi::Value options = info.Length() > 5 ? info[5] : env.Undefined();
  bare_machine = false;
  accept_pseudo_insts = flagOf(options, "acceptPseudo", true);
  delayed_branches = flagOf(options, "delayedBranches", false);
  delayed_loads = flagOf(options, "delayedLoads", false);
  mapped_io = flagOf(options, "mappedIo", false);
  quiet = flagOf(options, "quiet", false);

  errors.clear();
  consoleBytes.clear();
  inputBytes.clear();
  inputWanted = false;
  finished = false;
  stoppedAt = 0;
  forgetHistory();
  initializeWorld(bytesOf(info[1]));  // also deletes every breakpoint
  size_t handler_errors = errors.size();
  initializeStack();
  std::string symbols;
  readAssemblyBytes(bytesOf(info[0]), bytesOf(info[4]), &symbols);
  // The next datum's address in the user segment.  current_data_pc() answers
  // for the segment the last .data / .kdata chose (the handler ends in
  // .kdata), so choose the user's; nothing reads the choice after the file
  // has been read, and the next assemble starts it over.
  user_kernel_data_segment(false);
  mem_addr userDataEnd = current_data_pc();

  Napi::Array list = Napi::Array::New(env, errors.size());
  for (size_t i = 0; i < errors.size(); i++) list[i] = stringOf(env, errors[i]);
  Napi::Object result = Napi::Object::New(env);
  result["ok"] = !parse_error_occurred && handler_errors == 0;
  result["errors"] = list;
  result["symbols"] = stringOf(env, symbols);
  Napi::Object data = Napi::Object::New(env);
  data["start"] = Napi::Number::New(env, userDataStart);
  data["end"] = Napi::Number::New(env, userDataEnd);
  result["data"] = data;
  return result;
}

// One run of the core, as QtSpim's Run and Single Step do it: at most
// STEPS instructions, and why it stopped (Run() below lists the reasons).
// errors() keeps what the core reported.
static const char *runCore(int steps) {
  bool stepOver = stoppedAt != 0 && stoppedAt == PC && inst_is_breakpoint(PC);
  stoppedAt = 0;
  force_break = false;
  bool continuable = false;
  bool atBreakpoint = run_program(PC, steps, false, stepOver, &continuable);

  if (inputWanted) {
    // Undo the syscall that found no input: it runs again later.
    PC = inputPC;
    R[REG_V0] = inputV0;
    FPR[0] = inputF0;
    inputWanted = false;
    force_break = false;
    return "input";
  }
  if (!continuable) {
    finished = true;
    return errors.empty() ? "exit" : "error";
  }
  if (atBreakpoint) {
    stoppedAt = PC;
    return "breakpoint";
  }
  return "limit";
}

static bool is(const char *reason, const char *what) { return strcmp(reason, what) == 0; }

// ------------------------------------------------------------ step back
//
// The core keeps no history, so this front end does.  Before an
// instruction runs, a record takes what it can change: every register
// (general, HI, LO, PC, the coprocessors' -- CP0 and the FPU -- all
// copied, it is cheap) and the old bytes of the memory it may write
// (backstep.h storeSpan(): the stores, and the read syscalls' buffers).
// backstep() puts the last record back.  The last HISTORY_LIMIT records
// are kept (backstep::Ring).
//
// Step and the slow run record every instruction (run(n, "each")).
//
// A fast Run does not: run_spim() has no hook between two instructions,
// and running it one instruction at a time changes what a run does (the
// interrupts and the memory-mapped console are checked once per call) as
// well as costing time.  Instead each slice (run(n, "slice")) starts with
// a snapshot of the machine -- registers, the data, stack and kernel data
// segments, the queued input -- and when the run stops, the end of it is
// run again from a snapshot, the last HISTORY_LIMIT instructions one at a
// time with records (rebuild()).  The machine must then come out exactly
// as the run left it (but for CP0 Count, which follows the wall clock);
// if it does not -- a program driven by the timer or by interrupts -- the
// run's end is put back as it was and there is no history.  What the
// program printed is printed once: the second run's output is dropped.
//
// Not recorded, so not undone: console output already printed and input
// already read (a step back over a read syscall restores its registers and
// buffer; the line stays read), and the memory-mapped console's device
// state.  With delayed loads on there is no history at all: the core keeps
// a load in flight in run_spim()'s own statics.
static const size_t HISTORY_LIMIT = 1000;

// Everything an instruction can change in the registers.
struct RegisterFile {
  reg_word r[R_LENGTH];
  reg_word hi, lo;
  mem_addr pc, npc;
  reg_word ccr[4][32], cpr[4][32];
  int fwr[FGR_LENGTH];
};

static void saveRegisters(RegisterFile &f) {
  memcpy(f.r, R, sizeof f.r);
  f.hi = HI;
  f.lo = LO;
  f.pc = PC;
  f.npc = nPC;
  memcpy(f.ccr, CCR, sizeof f.ccr);
  memcpy(f.cpr, CPR, sizeof f.cpr);
  memcpy(f.fwr, FWR, sizeof f.fwr);
}

static void loadRegisters(const RegisterFile &f) {
  memcpy(R, f.r, sizeof f.r);
  HI = f.hi;
  LO = f.lo;
  PC = f.pc;
  nPC = f.npc;
  memcpy(CCR, f.ccr, sizeof f.ccr);
  memcpy(CPR, f.cpr, sizeof f.cpr);
  memcpy(FWR, f.fwr, sizeof f.fwr);
}

// Equal but for CP0 Count, which the core bumps by the wall clock.
static bool sameRegisters(const RegisterFile &a, const RegisterFile &b) {
  RegisterFile x = b;
  x.cpr[0][CP0_Count_Reg] = a.cpr[0][CP0_Count_Reg];
  return memcmp(&a, &x, sizeof a) == 0;
}

// Old bytes of memory.  `had[i]` is 0 where the byte was not mapped yet (a
// store below the stack grows it): put back as 0, the new memory's value.
// A text word (self-modifying code) is kept as its encoding.
struct Patch {
  mem_addr addr;
  bool text;
  std::string old;
  std::string had;
};

struct Record {
  RegisterFile regs;
  std::vector<Patch> patches;
  bool io;  // a syscall that printed or read: its output and input stay
};

static backstep::Ring<Record> history(HISTORY_LIMIT);

static bool inText(mem_addr addr);
static bool readable(mem_addr addr, uint32_t bytes);

static bool inTextRange(mem_addr addr) {
  return (addr >= TEXT_BOT && addr < text_top) || (addr >= K_TEXT_BOT && addr < k_text_top);
}

// The instruction word at ADDR, the student's under a breakpoint.
static bool wordAt(mem_addr addr, uint32_t *word) {
  if (!inText(addr)) return false;
  bool breakpoint = inst_is_breakpoint(addr);
  if (breakpoint) delete_breakpoint(addr);
  instruction *inst = read_mem_inst(addr);
  if (inst != NULL) *word = (uint32_t)(ENCODING(inst) != 0 ? ENCODING(inst) : inst_encode(inst));
  if (breakpoint) add_breakpoint(addr);
  return inst != NULL;
}

static void savePatch(Record &rec, mem_addr addr, uint32_t size) {
  if (inTextRange(addr)) {
    for (mem_addr w = addr & ~3u; w < addr + size && inTextRange(w); w += 4) {
      uint32_t word = 0;
      bool there = wordAt(w, &word);
      rec.patches.push_back({w, true, std::string((const char *)&word, 4), std::string(1, there ? 1 : 0)});
    }
    return;
  }
  Patch p{addr, false, std::string(size, '\0'), std::string(size, '\0')};
  for (uint32_t i = 0; i < size; i++) {
    if (readable(addr + i, 1)) {
      p.old[i] = (char)read_mem_byte(addr + i);
      p.had[i] = 1;
    }
  }
  rec.patches.push_back(std::move(p));
}

static void restorePatch(const Patch &p) {
  if (p.text) {
    uint32_t old, now = 0;
    memcpy(&old, p.old.data(), 4);
    if (p.had[0] && inText(p.addr) && !inst_is_breakpoint(p.addr) && wordAt(p.addr, &now) && now != old) {
      set_mem_word(p.addr, old);  // the core's own path for a store into text
    }
    return;
  }
  for (uint32_t i = 0; i < p.old.size(); i++) {
    if (readable(p.addr + i, 1)) set_mem_byte(p.addr + i, p.had[i] ? (uint8_t)p.old[i] : 0);
  }
}

// Takes what the instruction at PC can change: before it runs.
static void record(Record &rec) {
  saveRegisters(rec.regs);
  rec.patches.clear();
  rec.io = false;
  // The instruction at PC; with delayed branches also the one after it,
  // which a branch runs in the same step; with an interrupt pending, the
  // handler's first instruction, which then runs instead.  Saving bytes an
  // instruction does not write costs nothing: putting them back changes
  // nothing.
  mem_addr at[3];
  int n = 0;
  at[n++] = PC;
  if (delayed_branches) at[n++] = PC + BYTES_PER_WORD;
  if ((CP0_Status & CP0_Status_IE) && !(CP0_Status & CP0_Status_EXL) &&
      ((CP0_Cause & CP0_Cause_IP) & (CP0_Status & CP0_Status_IM))) {
    at[n++] = EXCEPTION_ADDR;
  }
  for (int k = 0; k < n; k++) {
    uint32_t word;
    if (!wordAt(at[k], &word)) continue;
    backstep::Span span;
    if (backstep::storeSpan(word, (const int32_t *)R, &span)) savePatch(rec, span.addr, span.size);
    if (k == 0) rec.io = backstep::isIoSyscall(word, (const int32_t *)R);
  }
}

static bool historyPossible() { return !delayed_loads; }

// One instruction, recorded.  Nothing is recorded for what did not run: a
// breakpoint reached (its instruction runs at the next step) or a read
// syscall that found no input.
static const char *recordedStep() {
  if (!historyPossible()) {
    history.clear();
    return runCore(1);
  }
  Record &rec = history.next();
  mem_addr before = PC;
  record(rec);
  const char *reason = runCore(1);
  bool ran = !is(reason, "input") && !(is(reason, "breakpoint") && PC == before);
  if (ran) history.commit();
  return reason;
}

// ---- the end of a fast run, again

struct Snapshot {
  bool valid = false;
  RegisterFile regs;
  mem_addr dataTop = 0, stackBot = 0, kDataTop = 0;
  std::string data, stack, kdata, input;
  std::vector<instruction *> text, ktext;  // to see a program that rewrote its code
  mem_addr stoppedAt = 0;
  bool finished = false;
  bool historyCurrent = false;  // `history` leads up to this machine
  long steps = 0;               // the slice from here ran this many (to its limit)
};

static Snapshot sliceA, sliceB, runEnd;
static Snapshot *current = &sliceA;   // the last slice's start
static Snapshot *previous = &sliceB;  // the slice before it, when that one ran to its limit
static bool tailPending = false;      // the last slice ran to its limit; its end has no history yet

static void take(Snapshot &s) {
  s.valid = true;
  saveRegisters(s.regs);
  s.dataTop = data_top;
  s.stackBot = stack_bot;
  s.kDataTop = k_data_top;
  s.data.assign((const char *)data_seg_b, data_top - DATA_BOT);
  s.stack.assign((const char *)stack_seg_b, STACK_TOP - stack_bot);
  s.kdata.assign((const char *)k_data_seg_b, k_data_top - K_DATA_BOT);
  s.input = inputBytes;
  s.text.assign(text_seg, text_seg + (text_top - TEXT_BOT) / BYTES_PER_WORD);
  s.ktext.assign(k_text_seg, k_text_seg + (k_text_top - K_TEXT_BOT) / BYTES_PER_WORD);
  s.stoppedAt = stoppedAt;
  s.finished = finished;
}

static bool sameText(const Snapshot &s) {
  return s.text.size() == (text_top - TEXT_BOT) / BYTES_PER_WORD &&
         s.ktext.size() == (k_text_top - K_TEXT_BOT) / BYTES_PER_WORD &&
         std::equal(s.text.begin(), s.text.end(), text_seg) &&
         std::equal(s.ktext.begin(), s.ktext.end(), k_text_seg);
}

// The machine back as S has it.  The data segment's top comes down (the
// core's sbrk grows it again from there) or goes up; a stack that grew
// since keeps its size, the part S did not have zeroed, as new stack is.
static bool put(const Snapshot &s) {
  if (!s.valid || k_data_top != s.kDataTop || !sameText(s)) return false;
  if (data_top < s.dataTop) expand_data(s.dataTop - data_top);
  if (stack_bot > s.stackBot) expand_stack(stack_bot - s.stackBot);
  if (data_top < s.dataTop || stack_bot > s.stackBot) return false;
  loadRegisters(s.regs);
  data_top = s.dataTop;
  memcpy(data_seg_b, s.data.data(), s.data.size());
  memset(stack_seg_b, 0, s.stackBot - stack_bot);
  memcpy(stack_seg_b + (s.stackBot - stack_bot), s.stack.data(), s.stack.size());
  memcpy(k_data_seg_b, s.kdata.data(), s.kdata.size());
  inputBytes = s.input;
  stoppedAt = s.stoppedAt;
  finished = s.finished;
  inputWanted = false;
  force_break = false;
  errors.clear();
  return true;
}

static bool matches(const Snapshot &s) {
  RegisterFile now;
  saveRegisters(now);
  return sameRegisters(s.regs, now) && data_top == s.dataTop && stack_bot == s.stackBot &&
         k_data_top == s.kDataTop && memcmp(data_seg_b, s.data.data(), s.data.size()) == 0 &&
         memcmp(stack_seg_b, s.stack.data(), s.stack.size()) == 0 &&
         memcmp(k_data_seg_b, s.kdata.data(), s.kdata.size()) == 0 && inputBytes == s.input &&
         stoppedAt == s.stoppedAt && finished == s.finished && sameText(s);
}

static const int PROBE_CHUNK = 64;  // the first pass finds the stop to within this many

// Runs the end of the run again from a snapshot, recording its last
// HISTORY_LIMIT instructions.  END is why the run stopped; KNOWN how many
// instructions the last slice ran when it ran to its limit (-1: it stopped
// on the way, somewhere this finds).  Whether it came out the same is
// rebuild()'s to check.
static bool replay(const char *end, long known) {
  const long N = (long)HISTORY_LIMIT;
  long k = known;
  if (k < 0) {
    // Where in the slice it stopped, to within PROBE_CHUNK, running fast.
    if (!put(*current)) return false;
    k = 0;
    for (;;) {
      const char *r = runCore(PROBE_CHUNK);
      if (!is(r, "limit")) break;
      k += PROBE_CHUNK;
      if (k > current->steps) return false;
    }
  }
  // From where, and how far fast, so that the steps recorded cover the
  // last N.
  const Snapshot *from = current;
  long fast = 0;
  bool keep = false;
  if (k >= N) fast = k - N;
  else if (current->historyCurrent) keep = true;
  else if (previous->valid) {
    from = previous;
    fast = std::max(0L, previous->steps + k - N);
  }
  if (!put(*from)) return false;
  if (!keep) history.clear();
  if (fast > 0 && !is(runCore((int)fast), "limit")) return false;
  long before = from == previous ? previous->steps : 0;
  if (known >= 0) {
    for (long i = before + known - fast; i > 0; i--) {
      if (!is(recordedStep(), "limit")) return false;
    }
    return is(end, "limit");
  }
  for (long i = before + k + PROBE_CHUNK + 1 - fast; i > 0; i--) {
    const char *r = recordedStep();
    if (!is(r, "limit")) return is(r, end);
  }
  return false;
}

// After a fast run stopped: its last instructions recorded, the machine as
// the run left it either way.
static void rebuild(const char *end, long known) {
  if (!sameText(*current) || (previous->valid && !sameText(*previous))) {
    history.clear();  // the program rewrote its code: its end cannot be run again
    return;
  }
  take(runEnd);
  std::string console = consoleBytes;
  std::vector<std::string> said = errors;
  bool same = replay(end, known) && matches(runEnd);
  if (same) {
    CP0_Count = runEnd.regs.cpr[0][CP0_Count_Reg];
  } else {
    history.clear();
    if (!put(runEnd)) {
      // Only if the replay rewrote the program's code; the registers at
      // least are the run's.
      loadRegisters(runEnd.regs);
    }
    finished = runEnd.finished;
    stoppedAt = runEnd.stoppedAt;
  }
  consoleBytes = console;
  errors = said;
  inputWanted = false;
  force_break = false;
}

static void forgetSlices() {
  tailPending = false;
  sliceA.valid = sliceB.valid = false;
}

static void forgetHistory() {
  history.clear();
  forgetSlices();
}

// A fast run's slice: a snapshot, then the core at full speed.
static const char *runSlice(int steps) {
  if (!historyPossible() || mapped_io) {
    // Delayed loads: no history.  The memory-mapped console's device
    // state cannot be put back, so its end cannot be run again.
    history.clear();
    forgetSlices();
    return runCore(steps);
  }
  std::swap(current, previous);
  previous->valid = previous->valid && tailPending;
  take(*current);
  current->historyCurrent = !tailPending;
  current->steps = steps;
  tailPending = false;
  const char *reason = runCore(steps);
  if (is(reason, "limit")) {
    tailPending = true;
    history.clear();  // older than this slice: no longer the last steps
    return reason;
  }
  rebuild(reason, -1);
  return reason;
}

// After a run stopped between two slices (the user's stop).
static void settleHistory() {
  if (!tailPending) return;
  tailPending = false;
  rebuild("limit", current->steps);
}

// run(steps[, history]) -> why it stopped:
//   "exit"        the program ended (syscall exit)
//   "error"       the core reported a run-time error and cannot go on
//   "breakpoint"  PC is at a breakpoint, not yet executed
//   "input"       PC is at a read syscall that found no input; provideInput()
//                 and run again
//   "limit"       `steps` instructions ran; more to run
// A user's stop is not here: it happens between runs (src/sim/worker.ts).
//
// history  "off" (the default): no record, and the history is dropped;
//          "each": every instruction recorded (Step);
//          "slice": a slice of a fast Run, its end recorded when it stops
//          (settleHistory() after a stop between two slices).
//
// The first run after a load, or after the program ended, sets PC to the
// start address and rebuilds the stack (SpimView::initializePCAndStack()).
static Napi::Value Run(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  const char *usage = "run(steps[, 'off' | 'each' | 'slice'])";
  if (info.Length() < 1 || !info[0].IsNumber()) return throwType(env, usage);
  int steps = info[0].As<Napi::Number>().Int32Value();
  std::string mode = info.Length() > 1 && info[1].IsString() ? info[1].As<Napi::String>().Utf8Value() : "off";
  if (mode != "off" && mode != "each" && mode != "slice") return throwType(env, usage);
  if (PC == 0 || finished) {
    PC = starting_address();
    initializeStack();
    finished = false;
    history.clear();
    forgetSlices();
  }
  errors.clear();
  if (mode == "slice") return Napi::String::New(env, runSlice(steps));
  forgetSlices();
  const char *reason = "limit";
  if (mode == "off") {
    history.clear();
    reason = runCore(steps);
  } else {
    for (int i = 0; i < steps; i++) {
      reason = recordedStep();
      if (!is(reason, "limit")) break;
    }
  }
  return Napi::String::New(env, reason);
}

// settleHistory(): after a fast run was stopped between two slices, its
// last instructions recorded (and the machine as the run left it).
static Napi::Value SettleHistory(const Napi::CallbackInfo &info) {
  settleHistory();
  return info.Env().Undefined();
}

// backstep() -> { undone, io }: the last recorded instruction undone --
// registers and memory as they were before it.  `io`: it was a syscall
// that printed or read, whose output and input stay.
static Napi::Value Backstep(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  settleHistory();
  Napi::Object result = Napi::Object::New(env);
  if (history.empty()) {
    result["undone"] = false;
    result["io"] = false;
    return result;
  }
  const Record &rec = history.last();
  for (auto p = rec.patches.rbegin(); p != rec.patches.rend(); ++p) restorePatch(*p);
  loadRegisters(rec.regs);
  result["undone"] = true;
  result["io"] = rec.io;
  history.pop();
  forgetSlices();
  finished = false;
  inputWanted = false;
  force_break = false;
  errors.clear();
  // Back on a breakpoint's instruction: the next run or step runs it (as
  // after stopping there) instead of stopping again.
  stoppedAt = inText(PC) && inst_is_breakpoint(PC) ? PC : 0;
  return result;
}

// history() -> { depth, limit, possible }: how many instructions step back
// can undo now, at most `limit`; `possible` is false with delayed loads.
static Napi::Value History(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object result = Napi::Object::New(env);
  result["depth"] = Napi::Number::New(env, (double)(tailPending ? 0 : history.size()));
  result["limit"] = Napi::Number::New(env, (double)HISTORY_LIMIT);
  result["possible"] = historyPossible();
  return result;
}

// storeSpans(word, registers[32]) -> [{ addr, size }]: what the
// instruction `word` may write with these registers (backstep.h), for the
// tests.
static Napi::Value StoreSpans(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsArray()) return throwType(env, "storeSpans(word, registers[32])");
  Napi::Array regs = info[1].As<Napi::Array>();
  int32_t r[32] = {0};
  for (uint32_t i = 0; i < 32 && i < regs.Length(); i++) r[i] = (int32_t)regs.Get(i).As<Napi::Number>().Int64Value();
  backstep::Span span;
  Napi::Array out = Napi::Array::New(env);
  if (backstep::storeSpan(info[0].As<Napi::Number>().Uint32Value(), r, &span)) {
    Napi::Object o = Napi::Object::New(env);
    o["addr"] = Napi::Number::New(env, span.addr);
    o["size"] = Napi::Number::New(env, span.size);
    out[0u] = o;
  }
  return out;
}

// provideInput(bytes): queue console input (a line typed ends with '\n').
static Napi::Value ProvideInput(const Napi::CallbackInfo &info) {
  if (info.Length() < 1 || !isBytes(info[0])) return throwType(info.Env(), "provideInput(bytes)");
  inputBytes += bytesOf(info[0]);
  return info.Env().Undefined();
}

// consoleOutput() -> Uint8Array: what the program printed since the last
// call.  Bytes: Node decodes them, across calls.
static Napi::Value ConsoleOutput(const Napi::CallbackInfo &info) {
  Napi::Uint8Array out = Napi::Uint8Array::New(info.Env(), consoleBytes.size());
  memcpy(out.Data(), consoleBytes.data(), consoleBytes.size());
  consoleBytes.clear();
  return out;
}

// Whether ADDR is a word in a text segment.  Outside them the core's
// instruction reads and writes raise an exception, which writes CP0 (Cause,
// BadVAddr): a breakpoint that could not be set must not change what the
// student sees, so such addresses never reach the core.
static bool inText(mem_addr addr) {
  return (addr & 3) == 0 && ((addr >= TEXT_BOT && addr < text_top) ||
                             (addr >= K_TEXT_BOT && addr < k_text_top));
}

// setBreakpoint(addr) / clearBreakpoint(addr) -> whether there is one there
// now / whether one was removed.  The core's add_breakpoint() puts a break
// instruction in the instruction's place and keeps the instruction; asked
// twice it would complain, so a second set is simply true.
static Napi::Value SetBreakpoint(const Napi::CallbackInfo &info) {
  mem_addr addr = info[0].As<Napi::Number>().Uint32Value();
  errors.clear();
  if (!inText(addr)) {
    char format[] = "No instruction to breakpoint at address 0x%08x\n";
    error(format, addr);  // the core's words for an empty text word
    return Napi::Boolean::New(info.Env(), false);
  }
  if (!inst_is_breakpoint(addr)) add_breakpoint(addr);
  return Napi::Boolean::New(info.Env(), inst_is_breakpoint(addr));
}

static Napi::Value ClearBreakpoint(const Napi::CallbackInfo &info) {
  mem_addr addr = info[0].As<Napi::Number>().Uint32Value();
  bool there = inText(addr) && inst_is_breakpoint(addr);
  if (there) delete_breakpoint(addr);
  if (stoppedAt == addr) stoppedAt = 0;
  return Napi::Boolean::New(info.Env(), there);
}

// breakpoints() -> the core's list_breakpoints() text, as it writes it.
static Napi::Value Breakpoints(const Napi::CallbackInfo &info) {
  std::string listing;
  messageCapture = &listing;
  list_breakpoints();
  messageCapture = NULL;
  return stringOf(info.Env(), listing);
}

// errors() -> what the core reported during the last assemble(), run() or
// setBreakpoint().
static Napi::Value Errors(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array list = Napi::Array::New(env, errors.size());
  for (size_t i = 0; i < errors.size(); i++) list[i] = stringOf(env, errors[i]);
  return list;
}

static void pushSegment(Napi::Env env, Napi::Array &out, mem_addr from,
                        mem_addr to) {
  str_stream ss;
  ss_init(&ss);
  for (mem_addr addr = from; addr < to; addr += BYTES_PER_WORD) {
    // Under a breakpoint the stored instruction is the core's break; the
    // student's instruction is lifted out for the look, as format_an_inst()
    // itself does.
    bool breakpoint = inst_is_breakpoint(addr);
    if (breakpoint) delete_breakpoint(addr);
    instruction *inst = read_mem_inst(addr);
    if (inst != NULL) {
      ss_clear(&ss);
      format_an_inst(&ss, inst, addr);
    }
    if (breakpoint) add_breakpoint(addr);
    if (inst == NULL) continue;
    std::string line = ss_to_string(&ss);
    if (!line.empty() && line.back() == '\n') line.pop_back();
    Napi::Object entry = Napi::Object::New(env);
    entry["addr"] = Napi::Number::New(env, addr);
    entry["word"] = Napi::Number::New(env, (uint32)ENCODING(inst));
    entry["line"] = stringOf(env, line);
    entry["breakpoint"] = Napi::Boolean::New(env, breakpoint);
    out[out.Length()] = entry;
  }
  free(ss.buf);
}

// textSegment() -> [{ addr, word, line, breakpoint }], user text then kernel
// text.
// `line` is the core's format_an_inst() for the stored instruction:
// "[0x00400014]\t0x0c100009  jal 0x00400024 [main]   ; 188: jal main".
static Napi::Value TextSegment(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array out = Napi::Array::New(env);
  pushSegment(env, out, TEXT_BOT, text_top);
  pushSegment(env, out, K_TEXT_BOT, k_text_top);
  return out;
}

// registers() -> { pc, hi, lo, epc, cause, badVAddr, status, general[32],
//                  fp[32] }  -- fp: the FP registers' raw 32-bit words ($f0..)
static Napi::Value Registers(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array general = Napi::Array::New(env, R_LENGTH);
  for (uint32_t i = 0; i < R_LENGTH; i++) {
    general[i] = Napi::Number::New(env, (uint32)R[i]);
  }
  Napi::Object result = Napi::Object::New(env);
  result["pc"] = Napi::Number::New(env, PC);
  result["hi"] = Napi::Number::New(env, (uint32)HI);
  result["lo"] = Napi::Number::New(env, (uint32)LO);
  result["epc"] = Napi::Number::New(env, (uint32)CP0_EPC);
  result["cause"] = Napi::Number::New(env, (uint32)CP0_Cause);
  result["badVAddr"] = Napi::Number::New(env, (uint32)CP0_BadVAddr);
  result["status"] = Napi::Number::New(env, (uint32)CP0_Status);
  result["general"] = general;
  Napi::Array fp = Napi::Array::New(env, 32);
  for (uint32_t i = 0; i < 32; i++) fp[i] = Napi::Number::New(env, (uint32)FWR[i]);
  result["fp"] = fp;
  return result;
}

// registerNames() -> the core's int_reg_names ("r0", "at", ... "s8", "ra").
static Napi::Value RegisterNames(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Array names = Napi::Array::New(env, 32);
  for (uint32_t i = 0; i < 32; i++) names[i] = stringOf(env, int_reg_names[i]);
  return names;
}

// segments() -> the bounds of the five segments, [bot, top) each.
static Napi::Value Segments(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  Napi::Object s = Napi::Object::New(env);
  s["textBot"] = Napi::Number::New(env, TEXT_BOT);
  s["textTop"] = Napi::Number::New(env, text_top);
  s["dataBot"] = Napi::Number::New(env, DATA_BOT);
  s["dataTop"] = Napi::Number::New(env, data_top);
  s["stackBot"] = Napi::Number::New(env, stack_bot);
  s["stackTop"] = Napi::Number::New(env, STACK_TOP);
  s["kTextBot"] = Napi::Number::New(env, K_TEXT_BOT);
  s["kTextTop"] = Napi::Number::New(env, k_text_top);
  s["kDataBot"] = Napi::Number::New(env, K_DATA_BOT);
  s["kDataTop"] = Napi::Number::New(env, k_data_top);
  return s;
}

// True when [addr, addr + bytes) lies inside one data segment.  Outside
// them read_mem_*() raises a bad-address exception, which writes CP0.
static bool readable(mem_addr addr, uint32_t bytes) {
  uint64_t end = (uint64_t)addr + bytes;
  return (addr >= DATA_BOT && end <= data_top) ||
         (addr >= stack_bot && end <= STACK_TOP) ||
         (addr >= K_DATA_BOT && end <= k_data_top);
}

static bool addressAndCount(const Napi::CallbackInfo &info, uint32_t unit,
                            mem_addr *addr, uint32_t *count) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    throwType(env, "(addr, count)");
    return false;
  }
  *addr = info[0].As<Napi::Number>().Uint32Value();
  *count = info[1].As<Napi::Number>().Uint32Value();
  if ((*addr % unit) != 0 || !readable(*addr, *count * unit)) {
    Napi::RangeError::New(env, "not inside a data, stack or kernel data segment")
        .ThrowAsJavaScriptException();
    return false;
  }
  return true;
}

// readWords(addr, count) -> number[] (read_mem_word, unsigned)
static Napi::Value ReadWords(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  mem_addr addr;
  uint32_t count;
  if (!addressAndCount(info, BYTES_PER_WORD, &addr, &count)) return env.Null();
  Napi::Array out = Napi::Array::New(env, count);
  for (uint32_t i = 0; i < count; i++) {
    out[i] = Napi::Number::New(env, (uint32)read_mem_word(addr + 4 * i));
  }
  return out;
}

// readBytes(addr, count) -> Uint8Array (read_mem_byte), in memory order
static Napi::Value ReadBytes(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  mem_addr addr;
  uint32_t count;
  if (!addressAndCount(info, 1, &addr, &count)) return env.Null();
  Napi::Uint8Array out = Napi::Uint8Array::New(env, count);
  for (uint32_t i = 0; i < count; i++) out[i] = (uint8_t)read_mem_byte(addr + i);
  return out;
}

// disassemble(word, addr) -> the core's inst_decode() + format_an_inst() of
// a bare word: "[0x00400000]\t0x8fa40000  lw $4, 0($29)".
static Napi::Value Disassemble(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsNumber()) {
    return throwType(env, "disassemble(word, addr)");
  }
  int32 word = (int32)info[0].As<Napi::Number>().Uint32Value();
  mem_addr addr = info[1].As<Napi::Number>().Uint32Value();

  instruction *inst = inst_decode(word);
  str_stream ss;
  ss_init(&ss);
  format_an_inst(&ss, inst, addr);
  std::string text = ss_to_string(&ss);
  free(ss.buf);
  free_inst(inst);
  if (!text.empty() && text.back() == '\n') text.pop_back();
  return stringOf(env, text);
}

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  message_out.i = 1;  // as QtSpim/main.cpp; write_output tells them apart
  console_out.i = 2;
  exports["assemble"] = Napi::Function::New(env, Assemble);
  exports["run"] = Napi::Function::New(env, Run);
  exports["settleHistory"] = Napi::Function::New(env, SettleHistory);
  exports["backstep"] = Napi::Function::New(env, Backstep);
  exports["history"] = Napi::Function::New(env, History);
  exports["storeSpans"] = Napi::Function::New(env, StoreSpans);
  exports["consoleOutput"] = Napi::Function::New(env, ConsoleOutput);
  exports["provideInput"] = Napi::Function::New(env, ProvideInput);
  exports["setBreakpoint"] = Napi::Function::New(env, SetBreakpoint);
  exports["clearBreakpoint"] = Napi::Function::New(env, ClearBreakpoint);
  exports["breakpoints"] = Napi::Function::New(env, Breakpoints);
  exports["errors"] = Napi::Function::New(env, Errors);
  exports["textSegment"] = Napi::Function::New(env, TextSegment);
  exports["registers"] = Napi::Function::New(env, Registers);
  exports["registerNames"] = Napi::Function::New(env, RegisterNames);
  exports["segments"] = Napi::Function::New(env, Segments);
  exports["readWords"] = Napi::Function::New(env, ReadWords);
  exports["readBytes"] = Napi::Function::New(env, ReadBytes);
  exports["disassemble"] = Napi::Function::New(env, Disassemble);
  return exports;
}

NODE_API_MODULE(spim, Init)
