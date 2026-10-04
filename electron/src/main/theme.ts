/* The window's colours before the page has loaded: the background Electron
   paints, and the caption buttons' patch and symbols (titleBarOverlay).
   They are app.css's --bg, --surface and --caption-symbol: keep them equal
   (the page sends the patch again once it is up, logic/overlay.ts). */

export const WINDOW_COLOURS = {
  background: '#0d0d0d',  // --bg
  titlebar: '#141414',    // --surface
  symbol: '#e6e6e6',      // --caption-symbol
};
/** The light theme's --bg: the window's background once the page has chosen it. */
export const LIGHT_BACKGROUND = '#f4f5f7';
