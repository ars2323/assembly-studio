/* The window's colours before the page has loaded: the background Electron
   paints, and the caption buttons' patch and symbols (titleBarOverlay).
   They are app.css's --bg, --surface and --caption-symbol: keep them equal
   (the page sends the patch again once it is up, logic/overlay.ts). */

export const WINDOW_COLOURS = {
  background: '#f5f7fa',  // --bg
  titlebar: '#ffffff',    // --surface
  symbol: '#00205b',      // --caption-symbol
};
