// RARS headless probe: one JSON object per line on stdin, one per line on stdout.
// Uses RARS (unmodified) as a library. See docs/engine-protocol.md for the command set.

import rars.*;
import rars.riscv.hardware.*;
import rars.simulator.BackStepper;
import rars.simulator.Simulator;
import rars.simulator.SimulatorNotice;
import rars.util.SystemIO;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class RarsProbe {
    /** Engine protocol version; see docs/engine-protocol.md for what bumps it. */
    static final int PROTOCOL = 2;

    static String err(String code, String message) {
        return "\"ok\":false,\"code\":\"" + code + "\",\"error\":" + Json.str(message);
    }

    /** Echo the request id back with its JSON type intact (number, string or null). */
    static String idJson(Object id) {
        if (id == null) return "null";
        if (id instanceof String) return Json.str((String) id);
        if (id instanceof Number || id instanceof Boolean) return String.valueOf(id);
        return "null";
    }
    // ---- protocol channel: the real fd 1, never touched by RARS ----
    static final PrintStream proto = new PrintStream(new FileOutputStream(FileDescriptor.out), false, StandardCharsets.UTF_8);


    // -Dprobe.trace=<file>: what the engine saw of its end (read when an engine is left behind).
    static void trace(String what) {
        String f = System.getProperty("probe.trace");
        if (f == null) return;
        try (java.io.FileWriter w = new java.io.FileWriter(f, StandardCharsets.UTF_8, true)) {
            w.write(System.currentTimeMillis() + " pid " + ProcessHandle.current().pid() + " " + System.getProperty("studio.engine", "?") + ": " + what + "\n");
        } catch (IOException e) { /* nothing to say it with */ }
    }

    static synchronized void send(String json) {
        proto.print(json);
        proto.print('\n');
        proto.flush();
    }

    // ---- console input fed by "input" commands; reports when the program blocks on it ----
    static final class ConsoleIn extends InputStream {
        private final ArrayDeque<Byte> buf = new ArrayDeque<>();
        private boolean cancelled = false;
        volatile boolean waiting = false;
        /** Set when Stop cancelled a wait: RARS then finishes the ecall with its default input. */
        volatile boolean waitCancelled = false;

        synchronized void feed(byte[] b) { for (byte x : b) buf.add(x); notifyAll(); }
        synchronized void cancel() { cancelled = true; notifyAll(); }
        synchronized void uncancel() { cancelled = false; }
        synchronized void clear() { buf.clear(); cancelled = false; }

        @Override public synchronized int read() throws IOException {
            byte[] one = new byte[1];
            return read(one, 0, 1) <= 0 ? -1 : (one[0] & 0xff);
        }

        @Override public synchronized int read(byte[] b, int off, int len) throws IOException {
            if (len == 0) return 0;
            if (buf.isEmpty() && !cancelled) {
                waiting = true;
                send("{\"ev\":\"input_wanted\",\"pc\":" + RegisterFile.getProgramCounter() + "}");
                while (buf.isEmpty() && !cancelled) {
                    try { wait(); } catch (InterruptedException e) { throw new InterruptedIOException(); }
                }
                waiting = false;
            }
            if (cancelled) {
                cancelled = false;
                waitCancelled = true;
                // RARS will complete this ecall with "0"/"" once we throw. Make sure what it writes is
                // recorded so finish() can undo exactly this ecall, even in a run with backstep off.
                if (!V1_STOP_INPUT && Globals.program != null && Globals.program.getBackStepper() != null)
                    Globals.program.getBackStepper().setEnabled(true);
                throw new InterruptedIOException("stopped while waiting for input");
            }
            int n = 0;
            while (n < len && !buf.isEmpty()) b[off + n++] = buf.poll();
            return n;
        }
        @Override public synchronized int available() { return buf.size(); }
        @Override public void close() { /* RARS closes stdio on reset; keep ours open */ }
    }

    // ---- console output: each flush becomes an "out" event ----
    static final class ConsoleOut extends OutputStream {
        private final String stream;
        private final ByteArrayOutputStream pending = new ByteArrayOutputStream();
        ConsoleOut(String stream) { this.stream = stream; }
        @Override public synchronized void write(int b) { pending.write(b); }
        @Override public synchronized void write(byte[] b, int off, int len) { pending.write(b, off, len); }
        @Override public synchronized void flush() {
            if (pending.size() == 0) return;
            String s = pending.toString(StandardCharsets.UTF_8);
            pending.reset();
            send("{\"ev\":\"" + stream + "\",\"text\":" + Json.str(s) + "}");
        }
        @Override public void close() { flush(); }
    }

    // ---- System.err: whose words are they? ----
    // RARS gives the program's fd 2 whatever System.err is (SystemIO.setupStdio, at every assemble and
    // program end), and the program runs on RARS's simulator thread ("RISCV", Simulator.simulate):
    // what that thread writes is the program's, an "err" event for the Console.  Anything else on
    // System.err -- java.util.logging (java.util.prefs' "Created user preferences directory", which
    // opened the Console at a start), a library's warning, a stack trace -- is not the student's:
    // it goes to the real fd 2, which the app keeps in a log file and never shows.  The student hears
    // of errors only through the protocol's answers on fd 1.
    static final String SIM_THREAD = "RISCV";
    static final class ErrRouter extends OutputStream {
        private final OutputStream program = new ConsoleOut("err");
        private final OutputStream log = new FileOutputStream(FileDescriptor.err);
        private OutputStream to() { return SIM_THREAD.equals(Thread.currentThread().getName()) ? program : log; }
        @Override public synchronized void write(int b) throws IOException { to().write(b); }
        @Override public synchronized void write(byte[] b, int off, int len) throws IOException { to().write(b, off, len); }
        @Override public synchronized void flush() throws IOException { program.flush(); log.flush(); }
        @Override public void close() throws IOException { flush(); }
    }

    // RARS closes System.out when a program terminates (SystemIO.resetFiles); keep ours usable.
    static final class NonClosingPrintStream extends PrintStream {
        NonClosingPrintStream(OutputStream o) { super(o, true, StandardCharsets.UTF_8); }
        @Override public void close() { flush(); }
    }

    static final ConsoleIn consoleIn = new ConsoleIn();
    static volatile boolean busy = false;
    static volatile boolean terminated = true;
    // Breakpoints are kept as source lines and re-resolved to addresses after every assemble.
    static List<Integer> bpLines = new ArrayList<>();
    static int[] breakpoints = new int[0];
    static Map<Integer, Integer> bpAddr = new LinkedHashMap<>();   // line -> address (absent: no code there)

    // Negative-control switches: restore the protocol-1 behaviour.
    static final boolean V1_STOP_INPUT = Boolean.getBoolean("probe.v1StopInput");
    static final boolean V1_BREAKPOINTS = Boolean.getBoolean("probe.v1Breakpoints");

    static void resolveBreakpoints() {
        Map<Integer, Integer> m = new LinkedHashMap<>();
        if (Globals.program != null && Globals.program.getMachineList() != null) {
            for (int line : bpLines) {
                for (ProgramStatement st : Globals.program.getMachineList()) {
                    if (st.getSourceLine() == line) { m.put(line, st.getAddress()); break; }  // first instruction of the line
                }
            }
        }
        bpAddr = m;
        breakpoints = m.values().stream().mapToInt(Integer::intValue).toArray();
    }

    static String breakpointsJson() {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < bpLines.size(); i++) {
            int line = bpLines.get(i);
            Integer a = bpAddr.get(line);
            sb.append(i == 0 ? "" : ",").append("{\"line\":").append(line).append(",\"addr\":").append(a == null ? "null" : a.toString()).append('}');
        }
        return sb.append(']').toString();
    }

    public static void main(String[] args) throws Exception {
        // Every path in RARS that falls back to the process stdio now hits our console streams.
        System.setIn(consoleIn);
        System.setOut(new NonClosingPrintStream(new ConsoleOut("out")));
        System.setErr(new NonClosingPrintStream(new ErrRouter()));

        Globals.initialize();
        // Unblock a program waiting for console input when Stop is requested.
        Simulator.getInstance().addStopListener(s -> consoleIn.cancel());
        // Same completion path the GUI uses: Simulator posts SIMULATOR_STOP to its observers.
        Simulator.getInstance().addObserver((o, arg) -> {
            if (arg instanceof SimulatorNotice && ((SimulatorNotice) arg).getAction() == SimulatorNotice.SIMULATOR_STOP)
                finish((SimulatorNotice) arg);
        });
        // Three ways out when whoever started us is gone without a word (an app killed outright: Task
        // Manager, a crash), whichever comes first -- an engine left behind piles up on a shared lab PC:
        //   1. here: the parent's own end (-Dparent.pid=<pid>, ProcessHandle, java.base);
        //   2. the end of stdin, below;
        //   3. on Windows, outside this program: the job object libuv puts a Node/Electron
        //      process's children in, killed when the parent's handle to it closes.
        // On Windows 2 is not certain (a copy of the pipe's write end held anywhere and no end of
        // file ever comes) and 3 not for a child started detached, so 1 does not rely on either.
        // halt, not exit: nothing (a shutdown hook) may keep an orphan alive.  Switches that
        // take each way alone:
        // -Dprobe.noParentWatch=true turns 1 off, -Dprobe.ignoreEof=true 2, a detached start 3;
        // -Dprobe.stuckShutdownHook=true adds a shutdown hook that never ends (halt must not wait).
        if (Boolean.getBoolean("probe.stuckShutdownHook"))
            Runtime.getRuntime().addShutdownHook(new Thread(() -> { try { Thread.sleep(Long.MAX_VALUE); } catch (InterruptedException e) { /* ends */ } }));
        String parent = System.getProperty("parent.pid");
        if (parent != null && !Boolean.getBoolean("probe.noParentWatch")) {
            try {
                java.util.Optional<ProcessHandle> ph = ProcessHandle.of(Long.parseLong(parent));
                trace("watching parent " + parent + (ph.isPresent() ? "" : ": already gone"));
                if (ph.isEmpty()) Runtime.getRuntime().halt(0);
                ph.get().onExit().thenRun(() -> { trace("parent " + parent + " exited: leaving"); Runtime.getRuntime().halt(0); });
            } catch (NumberFormatException e) { /* no such pid: nothing to watch */ }
        }
        send("{\"ev\":\"ready\",\"protocol\":" + PROTOCOL + ",\"rars\":" + Json.str(Globals.version) + "}");

        BufferedReader in = new BufferedReader(new InputStreamReader(new FileInputStream(FileDescriptor.in), StandardCharsets.UTF_8));
        String line;
        while ((line = in.readLine()) != null) {
            if (line.isBlank()) continue;
            Map<String, Object> req;
            try { req = Json.parse(line); } catch (RuntimeException e) { send("{\"id\":null," + err("bad_json", String.valueOf(e.getMessage())) + "}"); continue; }
            String id = idJson(req.get("id"));
            try {
                Object cmd = req.get("cmd");
                String body = cmd instanceof String ? handle((String) cmd, req) : err("bad_request", "missing or non-string cmd");
                if (body != null) send("{\"id\":" + id + "," + body + "}");
            } catch (ClassCastException | NullPointerException e) {
                send("{\"id\":" + id + "," + err("bad_request", "missing or mistyped parameter: " + e.getMessage()) + "}");
            } catch (Exception e) {
                send("{\"id\":" + id + "," + err("internal", e.toString()) + "}");
            }
            if ("quit".equals(req.get("cmd"))) { System.exit(0); }
        }
        // stdin ended: whoever started us is gone, so we go too (way 2 above).
        // -Dprobe.ignoreEof=true stays instead.
        trace("end of stdin" + (Boolean.getBoolean("probe.ignoreEof") ? ", ignored" : ": leaving"));
        if (Boolean.getBoolean("probe.ignoreEof")) Thread.sleep(Long.MAX_VALUE);
        System.exit(0);
    }

    static String handle(String cmd, Map<String, Object> req) throws Exception {
        switch (cmd) {
            case "ping": return "\"ok\":true";
            case "input": consoleIn.feed(((String) req.get("text")).getBytes(StandardCharsets.UTF_8)); return "\"ok\":true,\"waiting\":" + consoleIn.waiting;
            case "stop":
                // RARS keeps a stale thread reference after a run ends; only stop a live run.
                if (busy) { stopRequested = true; Simulator.getInstance().stopExecution(); }
                return "\"ok\":true,\"was_running\":" + busy;
            case "status": return "\"ok\":true,\"busy\":" + busy + ",\"waiting\":" + consoleIn.waiting + ",\"terminated\":" + terminated;
            case "quit": return "\"ok\":true";
        }
        if (busy) return err("busy", "a step or run is in progress");
        switch (cmd) {
            case "assemble": return assemble((String) req.get("source"));
            case "regs": return "\"ok\":true," + regsJson();
            case "mem": return mem(Json.num(req.get("addr")), Json.num(req.get("len")));
            case "bp": {
                List<?> l = (List<?>) req.get("lines");
                TreeSet<Integer> lines = new TreeSet<>();
                for (Object o : l) lines.add(Json.num(o));
                bpLines = new ArrayList<>(lines);
                resolveBreakpoints();
                return "\"ok\":true,\"breakpoints\":" + breakpointsJson();
            }
            case "backstep": return backstep();
            case "step": case "run": {
                // RARS records undo entries for every instruction while the back-stepper is engaged.
                if (Globals.program != null && Globals.program.getBackStepper() != null)
                    Globals.program.getBackStepper().setEnabled(!Boolean.FALSE.equals(req.get("backstep")));
                if (terminated) return err("not_runnable", "assemble first, or the program has finished");
                int max = "step".equals(cmd) ? 1 : (req.containsKey("max") ? Json.num(req.get("max")) : -1);
                pending = new Pending(idJson(req.get("id")), "step".equals(cmd), !Boolean.FALSE.equals(req.get("backstep")));
                consoleIn.uncancel();
                stopRequested = false;
                busy = true;
                Simulator.getInstance().startSimulation(pending.pcBefore, max, breakpoints);
                return null; // reply is sent by finish() on the simulator thread
            }
        }
        return err("unknown_cmd", "unknown cmd " + cmd);
    }

    static String assemble(String source) {
        RISCVprogram p = new RISCVprogram();
        Globals.program = p;
        terminated = true;
        undo = 0;
        exitedAt = null;
        StringBuilder sb = new StringBuilder();
        try {
            p.fromString(source);
            p.tokenize();
            ArrayList<RISCVprogram> list = new ArrayList<>();
            list.add(p);
            ErrorList warnings = p.assemble(list, true, false);
            History.enlarge();
            RegisterFile.resetRegisters();
            FloatingPointRegisterFile.resetRegisters();
            ControlAndStatusRegisterFile.resetRegisters();
            InterruptController.reset();
            RegisterFile.initializeProgramCounter(false);
            Globals.exitCode = 0;
            // Fresh stdio table: drops any half-read console line the previous run left behind.
            if (!Boolean.getBoolean("probe.skipStdioReset")) { // the switch exists only as a negative control
                consoleIn.clear();
                SystemIO.swapData(new SystemIO.Data(true));
            }
            terminated = false;
            sb.append("\"ok\":true,\"warnings\":").append(errorsJson(warnings));
            sb.append(",\"text\":[");
            boolean first = true;
            for (ProgramStatement s : p.getMachineList()) {
                if (!first) sb.append(',');
                first = false;
                sb.append(stmtJson(s));
            }
            sb.append("],\"symbols\":[");
            first = true;
            for (int g = 0; g < 2; g++) {
                rars.assembler.SymbolTable table = g == 0 ? p.getLocalSymbolTable() : Globals.symbolTable;
                for (rars.assembler.Symbol sym : table.getAllSymbols()) {
                    if (!first) sb.append(',');
                    first = false;
                    sb.append("{\"name\":").append(Json.str(sym.getName())).append(",\"addr\":").append(sym.getAddress())
                      .append(",\"segment\":\"").append(sym.getType() ? "data" : "text").append("\",\"global\":").append(g == 1).append('}');
                }
            }
            if (!V1_BREAKPOINTS || bpAddr.isEmpty()) resolveBreakpoints();
            sb.append("],\"breakpoints\":").append(breakpointsJson());
            sb.append(",\"pc\":").append(RegisterFile.getProgramCounter());
        } catch (AssemblyException e) {
            sb.setLength(0);
            sb.append(err("assemble_error", "assembly failed")).append(",\"errors\":").append(errorsJson(e.errors()));
        }
        return sb.toString();
    }

    static final class Pending {
        final Object id;
        final boolean isStep;
        final int pcBefore = RegisterFile.getProgramCounter();
        final long instret0 = ControlAndStatusRegisterFile.getValueNoNotify("instret");
        final long t0 = System.nanoTime();
        final boolean backstep;
        Pending(Object id, boolean isStep, boolean backstep) { this.id = id; this.isStep = isStep; this.backstep = backstep; }
    }
    static volatile Pending pending;
    // RARS's SimThread.setStop() sets `stop` before `constructReturnReason`: a run that sees
    // `stop` in between ends with a null reason (measured: 9 of 200 stops).  RARS is not
    // ours to fix; the wrapper knows it asked for a stop, and says STOP.
    static volatile boolean stopRequested = false;

    static void finish(SimulatorNotice n) {
        Pending pd = pending;
        pending = null;
        if (pd == null) return;
        System.out.flush();
        StringBuilder sb = new StringBuilder("{\"id\":" + pd.id + ",\"ok\":true");
        Simulator.Reason r = n.getReason();
        if (r == null && stopRequested && !n.getDone() && !Boolean.getBoolean("probe.rawStopReason")) r = Simulator.Reason.STOP;
        sb.append(",\"reason\":\"").append(r).append('"');
        SimulationException e = n.getException();
        if (n.getDone()) {
            terminated = true;
            sb.append(",\"exit\":").append(Globals.exitCode);
        }
        if (consoleIn.waitCancelled) {
            // Stop arrived while the program waited for input. RARS has already completed the ecall
            // with its default input; undo it so no input the student never typed reaches the program.
            consoleIn.waitCancelled = false;
            boolean undone = false;
            if (!V1_STOP_INPUT && r == Simulator.Reason.STOP && Globals.program.getBackStepper() != null
                    && !Globals.program.getBackStepper().empty()) {
                undone = History.undoLast();
            }
            sb.append(",\"input_cancelled\":true,\"undone\":").append(undone);
        }
        if (Globals.program != null && Globals.program.getBackStepper() != null)
            Globals.program.getBackStepper().setEnabled(pd.backstep);
        long retired = ControlAndStatusRegisterFile.getValueNoNotify("instret") - pd.instret0;
        count(pd, r, retired);
        if (e != null) {
            ErrorMessage m = e.error();
            sb.append(",\"cause\":").append(e.cause())
              .append(",\"message\":").append(Json.str(m == null ? String.valueOf(e) : m.getMessage()))
              .append(",\"line\":").append(m == null ? 0 : m.getLine());
        }
        sb.append(",\"steps\":").append(retired).append(",\"ns\":").append(System.nanoTime() - pd.t0);
        sb.append(",\"undo\":").append(undo);
        if (pd.isStep) {
            try {
                ProgramStatement s = Globals.memory.getStatementNoNotify(pd.pcBefore);
                sb.append(",\"executed\":").append(s == null ? "null" : stmtJson(s));
            } catch (AddressErrorException ae) {
                sb.append(",\"executed\":null");
            }
        }
        sb.append(',').append(regsJson()).append('}');
        busy = false;
        send(sb.toString());
    }

    // ---- step back: RARS's back-stepper, one instruction at a time ----
    // RARS keeps its undo records as changes (a register, a word of memory, PC, a CSR), not as
    // instructions, in a ring of Globals.maximumBacksteps (2000).  Its backStep() pops the records of
    // one ProgramStatement; that goes wrong in two ways (RARS 1.6, measured):
    //   - every instruction ends with three records of the cycle, instret and time CSRs, filed under
    //     the instruction before the new PC.  After a taken branch or a jump that is not the branch,
    //     so undoing it takes two backStep()s, the first of which leaves PC on the target's
    //     predecessor;
    //   - four or more records an instruction leave room for about 500 instructions.
    // So the engine undoes the records itself (History, by reflection into the back-stepper: RARS
    // is not changed), one instruction per `backstep`: the CSR trio, then the instruction's own
    // records down to the trio of the instruction before it.  It gives the back-stepper room for
    // HISTORY_RECORDS records, and counts the instructions recorded, at most UNDO_LIMIT.
    // If reflection fails (another RARS), RARS's own backStep() is used, as before.
    static final int UNDO_LIMIT = 1000;
    static final int HISTORY_RECORDS = 16384;
    static int undo = 0;
    // The ecall that ended the program (Exit, Exit2).  RARS records nothing for it: undoing it
    // is PC back on it, and the program no longer finished.
    static Integer exitedAt = null;

    static final class History {
        static java.lang.reflect.Field backSteps, size, top, capacity, array, action, pc, param1, param2;
        static java.lang.reflect.Constructor<?> make;
        static boolean ok;
        static {
            try {
                backSteps = BackStepper.class.getDeclaredField("backSteps");
                Class<?> stack = backSteps.getType();
                size = stack.getDeclaredField("size");
                top = stack.getDeclaredField("top");
                capacity = stack.getDeclaredField("capacity");
                array = stack.getDeclaredField("stack");
                make = stack.getDeclaredConstructor(BackStepper.class, int.class);
                Class<?> step = array.getType().getComponentType();
                action = step.getDeclaredField("action");
                pc = step.getDeclaredField("pc");
                param1 = step.getDeclaredField("param1");
                param2 = step.getDeclaredField("param2");
                for (java.lang.reflect.AccessibleObject a : new java.lang.reflect.AccessibleObject[]{
                        backSteps, size, top, capacity, array, make, action, pc, param1, param2}) a.setAccessible(true);
                ok = true;
            } catch (ReflectiveOperationException | RuntimeException e) {
                System.err.println("RarsProbe: step back falls back to RARS's backStep(): " + e);
                ok = false;
            }
        }

        static BackStepper stepper() { return Globals.program == null ? null : Globals.program.getBackStepper(); }

        // A new program's back-stepper, with room for HISTORY_RECORDS records.
        static void enlarge() {
            BackStepper bs = stepper();
            if (!ok || bs == null) return;
            try { backSteps.set(bs, make.newInstance(bs, HISTORY_RECORDS)); }
            catch (ReflectiveOperationException | RuntimeException e) { System.err.println("RarsProbe: " + e); }
        }

        static void clear() {
            BackStepper bs = stepper();
            if (!ok || bs == null) return;
            try { Object s = backSteps.get(bs); size.setInt(s, 0); top.setInt(s, -1); }
            catch (ReflectiveOperationException e) { System.err.println("RarsProbe: " + e); }
        }

        // The record I below the top (0: the top).
        static Object at(Object s, int i) throws ReflectiveOperationException {
            int cap = capacity.getInt(s);
            return java.lang.reflect.Array.get(array.get(s), ((top.getInt(s) - i) % cap + cap) % cap);
        }

        static boolean trio(Object step) throws ReflectiveOperationException {
            return "CONTROL_AND_STATUS_REGISTER_BACKDOOR".equals(String.valueOf(action.get(step)));
        }

        // How many instructions the records hold whole: each is its own records (one at least)
        // and, if it retired, the trio after them.  The oldest may have lost records to the ring.
        static int instructions() {
            BackStepper bs = stepper();
            if (bs == null) return 0;
            if (!ok) return bs.empty() ? 0 : UNDO_LIMIT;
            try {
                Object s = backSteps.get(bs);
                int n = size.getInt(s), i = 0, count = 0;
                while (i < n) {
                    for (int k = 0; k < 3 && i < n && trio(at(s, i)); k++) i++;
                    if (i >= n) break;
                    while (i < n && !trio(at(s, i))) i++;
                    count++;
                }
                if (n == capacity.getInt(s) && count > 0) count--;
                return count;
            } catch (ReflectiveOperationException e) {
                return 0;
            }
        }

        // Undoes the last instruction's records; false if there are none.
        static boolean undoLast() {
            BackStepper bs = stepper();
            if (bs == null || bs.empty()) return false;
            if (!ok) {
                bs.setEnabled(true);
                bs.backStep();
                return true;
            }
            boolean engaged = bs.enabled();
            bs.setEnabled(false);  // the restores below must not be recorded
            try {
                Object s = backSteps.get(bs);
                for (int k = 0; k < 3 && size.getInt(s) > 0 && trio(at(s, 0)); k++) apply(pop(s));
                int at = -1;
                while (size.getInt(s) > 0 && !trio(at(s, 0))) {
                    Object step = pop(s);
                    at = pc.getInt(step);
                    apply(step);
                }
                if (at != -1) RegisterFile.initializeProgramCounter(at);
                return true;
            } catch (ReflectiveOperationException e) {
                System.err.println("RarsProbe: " + e);
                return false;
            } finally {
                bs.setEnabled(engaged);
            }
        }

        static Object pop(Object s) throws ReflectiveOperationException {
            Object step = at(s, 0);
            int n = size.getInt(s), cap = capacity.getInt(s);
            size.setInt(s, n - 1);
            top.setInt(s, n == 1 ? -1 : (top.getInt(s) + cap - 1) % cap);
            return step;
        }

        // What RARS's BackStepper.backStep() does with one record.
        static void apply(Object step) throws ReflectiveOperationException {
            int p1 = param1.getInt(step);
            long p2 = param2.getLong(step);
            try {
                switch (String.valueOf(action.get(step))) {
                    case "MEMORY_RESTORE_RAW_WORD": Globals.memory.setRawWord(p1, (int) p2); break;
                    case "MEMORY_RESTORE_DOUBLE_WORD": Globals.memory.setDoubleWord(p1, p2); break;
                    case "MEMORY_RESTORE_WORD": Globals.memory.setWord(p1, (int) p2); break;
                    case "MEMORY_RESTORE_HALF": Globals.memory.setHalf(p1, (int) p2); break;
                    case "MEMORY_RESTORE_BYTE": Globals.memory.setByte(p1, (int) p2); break;
                    case "REGISTER_RESTORE": RegisterFile.updateRegister(p1, p2); break;
                    case "FLOATING_POINT_REGISTER_RESTORE": FloatingPointRegisterFile.updateRegisterLong(p1, p2); break;
                    case "CONTROL_AND_STATUS_REGISTER_RESTORE": ControlAndStatusRegisterFile.updateRegister(p1, p2); break;
                    case "CONTROL_AND_STATUS_REGISTER_BACKDOOR": ControlAndStatusRegisterFile.updateRegisterBackdoor(p1, p2); break;
                    case "PC_RESTORE": RegisterFile.initializeProgramCounter(p1); break;
                    default: break;  // DO_NOTHING
                }
            } catch (AddressErrorException e) {
                // the original write did not fail, so neither does putting the old value back
            }
        }
    }

    static void count(Pending pd, Simulator.Reason r, long retired) {
        if (!pd.backstep) {
            // Instructions ran without records: what is recorded no longer leads up to here.
            if (retired > 0 || r == Simulator.Reason.NORMAL_TERMINATION || r == Simulator.Reason.EXCEPTION) {
                undo = 0;
                History.clear();
            }
        } else {
            undo += (int) Math.min(retired, UNDO_LIMIT);
            // The instruction that raised an exception is not retired, but RARS records what it
            // wrote (ucause, uepc, utval); undoing that puts PC back on it.
            if (r == Simulator.Reason.EXCEPTION) undo += 1;
        }
        exitedAt = null;
        if (r == Simulator.Reason.NORMAL_TERMINATION && pd.backstep) {
            exitedAt = RegisterFile.getProgramCounter() - rars.riscv.Instruction.INSTRUCTION_LENGTH;
            undo += 1;
        }
        undo = undoable();
    }

    // At most UNDO_LIMIT, at most what the records hold.
    static int undoable() {
        return Math.max(0, Math.min(Math.min(undo, UNDO_LIMIT), History.instructions() + (exitedAt != null ? 1 : 0)));
    }

    static String backstep() {
        if (Globals.program == null || undoable() <= 0) return err("nothing_to_undo", "no recorded step to undo");
        if (exitedAt != null && terminated) {
            RegisterFile.initializeProgramCounter(exitedAt);  // not recorded: nothing to undo later
        } else if (!History.undoLast()) {
            undo = 0;
            return err("nothing_to_undo", "no recorded step to undo");
        }
        exitedAt = null;
        undo -= 1;
        undo = undoable();
        terminated = false;
        return "\"ok\":true,\"undo\":" + undo + "," + regsJson();
    }

    static String regsJson() {
        StringBuilder sb = new StringBuilder("\"pc\":").append(RegisterFile.getProgramCounter()).append(",\"x\":[");
        for (int i = 0; i < 32; i++) sb.append(i == 0 ? "" : ",").append(RegisterFile.getValue(i));
        sb.append("],\"f\":[");
        for (int i = 0; i < 32; i++) sb.append(i == 0 ? "" : ",").append(FloatingPointRegisterFile.getValue(i));
        // f[] is RARS's single-precision view (NaN unless NaN-boxed); fbits is the raw 64-bit register.
        sb.append("],\"fbits\":[");
        for (int i = 0; i < 32; i++)
            sb.append(i == 0 ? "\"" : ",\"").append(String.format("%016x", FloatingPointRegisterFile.getValueLong(i))).append('"');
        return sb.append(']').toString();
    }

    static final char[] HEX = "0123456789abcdef".toCharArray();

    static String mem(int addr, int len) {
        StringBuilder hex = new StringBuilder(len * 2);
        try {
            for (int i = 0; i < len; i++) {   // not a < addr + len: that overflows for a range ending at 0x80000000
                int a = addr + i;
                int b = Globals.memory.getByte(a);
                hex.append(HEX[(b >> 4) & 0xf]).append(HEX[b & 0xf]);
            }
        } catch (AddressErrorException e) {
            return err("address", e.getMessage()) + ",\"partial\":\"" + hex + "\"";
        }
        return "\"ok\":true,\"addr\":" + addr + ",\"hex\":\"" + hex + "\"";
    }

    static String stmtJson(ProgramStatement s) {
        return "{\"addr\":" + s.getAddress() + ",\"code\":" + s.getBinaryStatement()
                + ",\"basic\":" + Json.str(s.getPrintableBasicAssemblyStatement())
                + ",\"line\":" + s.getSourceLine() + ",\"src\":" + Json.str(s.getSource()) + "}";
    }

    static String errorsJson(ErrorList list) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (ErrorMessage m : list.getErrorMessages()) {
            if (!first) sb.append(',');
            first = false;
            sb.append("{\"line\":").append(m.getLine()).append(",\"col\":").append(m.getPosition())
              .append(",\"warning\":").append(m.isWarning())
              .append(",\"message\":").append(Json.str(m.getMessage())).append('}');
        }
        return sb.append(']').toString();
    }

    // ---- minimal JSON: flat objects of strings, numbers, booleans and number arrays ----
    static final class Json {
        static String str(String s) {
            if (s == null) return "null";
            StringBuilder sb = new StringBuilder("\"");
            for (char c : s.toCharArray()) {
                switch (c) {
                    case '"': sb.append("\\\""); break;
                    case '\\': sb.append("\\\\"); break;
                    case '\n': sb.append("\\n"); break;
                    case '\r': sb.append("\\r"); break;
                    case '\t': sb.append("\\t"); break;
                    default: if (c < 0x20) sb.append(String.format("\\u%04x", (int) c)); else sb.append(c);
                }
            }
            return sb.append('"').toString();
        }

        static int num(Object o) { return (int) ((Number) o).longValue(); }

        static Map<String, Object> parse(String s) {
            int[] i = {0};
            Object v = value(s, i);
            if (!(v instanceof Map)) throw new RuntimeException("expected object");
            @SuppressWarnings("unchecked") Map<String, Object> m = (Map<String, Object>) v;
            return m;
        }

        private static void ws(String s, int[] i) { while (i[0] < s.length() && Character.isWhitespace(s.charAt(i[0]))) i[0]++; }

        private static Object value(String s, int[] i) {
            ws(s, i);
            char c = s.charAt(i[0]);
            if (c == '{') {
                Map<String, Object> m = new HashMap<>();
                i[0]++; ws(s, i);
                if (s.charAt(i[0]) == '}') { i[0]++; return m; }
                while (true) {
                    ws(s, i);
                    String k = (String) value(s, i);
                    ws(s, i); i[0]++; // ':'
                    m.put(k, value(s, i));
                    ws(s, i);
                    if (s.charAt(i[0]++) == '}') return m;
                }
            }
            if (c == '[') {
                List<Object> l = new ArrayList<>();
                i[0]++; ws(s, i);
                if (s.charAt(i[0]) == ']') { i[0]++; return l; }
                while (true) {
                    l.add(value(s, i));
                    ws(s, i);
                    if (s.charAt(i[0]++) == ']') return l;
                }
            }
            if (c == '"') {
                StringBuilder sb = new StringBuilder();
                i[0]++;
                while (true) {
                    char d = s.charAt(i[0]++);
                    if (d == '"') return sb.toString();
                    if (d != '\\') { sb.append(d); continue; }
                    char e = s.charAt(i[0]++);
                    switch (e) {
                        case 'n': sb.append('\n'); break;
                        case 't': sb.append('\t'); break;
                        case 'r': sb.append('\r'); break;
                        case 'b': sb.append('\b'); break;
                        case 'f': sb.append('\f'); break;
                        case 'u': sb.append((char) Integer.parseInt(s.substring(i[0], i[0] + 4), 16)); i[0] += 4; break;
                        default: sb.append(e);
                    }
                }
            }
            if (s.startsWith("true", i[0])) { i[0] += 4; return Boolean.TRUE; }
            if (s.startsWith("false", i[0])) { i[0] += 5; return Boolean.FALSE; }
            if (s.startsWith("null", i[0])) { i[0] += 4; return null; }
            int st = i[0];
            while (i[0] < s.length() && "+-0123456789.eE".indexOf(s.charAt(i[0])) >= 0) i[0]++;
            String n = s.substring(st, i[0]);
            if (n.isEmpty()) throw new RuntimeException("unexpected '" + c + "' at " + st);
            return n.contains(".") || n.contains("e") || n.contains("E") ? (Object) Double.parseDouble(n) : (Object) Long.parseLong(n);
        }
    }
}
