/* What a brand (electron/brands/<id>/brand.ts) gives the app: its names, its
   marks, and the parts only some brands have.  The brand in use is
   src/brand.ts, written by tools/brand.ts (STUDIO_BRAND, default generic);
   its assets are copied to src/renderer/assets/brand/. */

export interface Brand {
  id: 'generic' | 'hallym';
  name: string;          // window, title bar, About, Start menu, install folder
  exe: string;           // executable, temp folder (no blanks)
  appId: string;         // Windows AppUserModelId, electron-builder appId
  wordmark: string;      // under the mark on the first screen
  about: string;         // About's one line about the program
  author: string;        // who made it: About ("Made by …"), the package's author
  mark: string;          // under src/renderer/assets/ (asset()): on the dark theme
  markOnLight: string;   // the same, on the light theme
  characters: boolean;   // brand/characters/<pose>.png exist (tutorial, notices)
  hmx: boolean;          // Export executable image (.hmx, for Hallym Circuit Studio)
}
