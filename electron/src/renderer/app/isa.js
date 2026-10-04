/* Loads the window for the page's ISA (index.html?isa=mips|riscv, set by
   src/main/main.ts; no query: mips): its script, app-<isa>.js
   (tools/build-ui.ts), and for RISC-V its stylesheet over app.css -- the
   script once the stylesheet is in, so the window is laid out with it.
   A file of its own because the page's Content-Security-Policy allows no
   inline script.  Where the files are is on this script's tag: the source
   tree's paths, or the package's (tools/package.ts rewrites them). */
(() => {
  const me = document.currentScript;
  const isa = new URLSearchParams(location.search).get('isa') === 'riscv' ? 'riscv' : 'mips';
  document.documentElement.dataset.isa = isa;
  const script = () => {
    const s = document.createElement('script');
    s.src = `${me.dataset.bundles}app-${isa}.js`;
    document.body.append(s);
  };
  if (isa === 'riscv') {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = me.dataset.riscvCss;
    css.addEventListener('load', script, { once: true });
    css.addEventListener('error', script, { once: true });
    document.head.append(css);
  } else {
    script();
  }
})();
