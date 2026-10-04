/* The window's only way out.  CommonJS because a sandboxed preload cannot be
   an ES module.  Results come back as { ok, value } or { ok: false, error }
   and are unwrapped here, so the page sees ordinary promises.  An engine's
   own failure (a RISC-V engine's reply with ok: false and a `code`) is a
   value, not an error: the window reads its code (docs/engine-protocol.md 2).

   One preload for both ISAs' windows: each window uses what its engine
   answers (src/renderer/app/api.ts for MIPS, src/isa/riscv/renderer/api.ts
   for RISC-V).  The sim:* channels are the active engine's (src/main/
   engine-mips.ts, engine-riscv.ts); the ISA in use is the page's ?isa=. */
const { contextBridge, ipcRenderer } = require('electron');

const unwrap = (r) => {
  if (r && r.ok === false && r.error && typeof r.error === 'object') {
    const e = new Error(r.error.message);
    e.name = r.error.name;
    throw e;
  }
  return r && r.ok === true && 'value' in r ? r.value : r;
};

contextBridge.exposeInMainWorld('app', {
  isa: () => (new URLSearchParams(location.search).get('isa') === 'riscv' ? 'riscv' : 'mips'),
  selectIsa: (isa, then) => ipcRenderer.invoke('isa:select', isa, then).then(unwrap),
  // MIPS: call(method, ...args); RISC-V: call(cmd, params).  Either way the arguments go as a list.
  call: (method, ...args) => ipcRenderer.invoke('sim:call', method, args).then(unwrap),
  stop: () => ipcRenderer.invoke('sim:stop').then(unwrap),
  check: (source, options) => ipcRenderer.invoke('sim:check', source, options).then(unwrap),
  engineState: () => ipcRenderer.invoke('sim:state'),
  onConsole: (listener) => ipcRenderer.on('sim:console', (_e, text) => listener(text)),
  onProgress: (listener) => ipcRenderer.on('sim:progress', (_e, p) => listener(p)),
  onInput: (listener) => ipcRenderer.on('sim:input', (_e, pc) => listener(pc)),
  // MIPS: (message, detail); RISC-V: (message, cause, restarted).
  onCrashed: (listener) => ipcRenderer.on('sim:crashed', (_e, ...args) => listener(...args)),
  onEngineState: (listener) => ipcRenderer.on('sim:state', (_e, state, detail) => listener(state, detail)),
  openFile: () => ipcRenderer.invoke('file:open').then(unwrap),
  saveFile: (file) => ipcRenderer.invoke('file:save', file).then(unwrap),
  openExample: (name) => ipcRenderer.invoke('example:open', name).then(unwrap),
  openHandler: () => ipcRenderer.invoke('file:openHandler').then(unwrap),
  about: () => ipcRenderer.invoke('about:info'),
  license: (i) => ipcRenderer.invoke('about:license', i).then(unwrap),
  openCredits: () => ipcRenderer.invoke('about:openCredits').then(unwrap),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  setOverlay: (patch) => ipcRenderer.invoke('win:overlay', patch),
  setTheme: (theme) => ipcRenderer.invoke('win:theme', theme),
});
