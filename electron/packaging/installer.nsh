; The installer's script.  tools/package.ts writes it to build/package/ with
; @NAME@ and @NPMNAME@ replaced by the brand's names (electron/brands/<id>/brand.ts).
;
; The per-user install folder: %LOCALAPPDATA%\Programs\@NAME@.  This include is
; read before the templates that use APP_FILENAME, so the folder carries the
; program's name rather than the package's npm name.
!undef APP_FILENAME
!define APP_FILENAME "@NAME@"

; The assisted installer's pages (tools/package.ts: oneClick false), from 2.4.0:
; the progress, then the finish page.  No page asks "for all users or only for
; me" -- only for this user, as before (all users would need an administrator):
; this answers it before it is shown, in the installer and the uninstaller.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; The finish page: says it is done, and offers to start the program (ticked).
; /S shows no page, so a silent install starts nothing.
!macro customFinishPage
  ; As the template's own StartApp does (its macro declares a variable that
  ; installSection.nsh declares again): the shortcut, as the user, not elevated.
  Function StudioStartApp
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  FunctionEnd
  !define MUI_FINISHPAGE_TITLE "Installation complete"
  !define MUI_FINISHPAGE_TEXT "@NAME@ has been installed.$\r$\n$\r$\nFrom now on, open it from @NAME@ in the Start menu."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Run @NAME@ now"
  !define MUI_FINISHPAGE_RUN_FUNCTION "StudioStartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

; The progress pages' words, and the uninstaller's (the installer is in
; English only).  MUI_PAGE_HEADER_* apply to the next page inserted: each
; macro below comes just before its page.
!macro customPageAfterChangeDir
  !define MUI_PAGE_HEADER_TEXT "Installing"
  !define MUI_PAGE_HEADER_SUBTEXT "Please wait. You can run it as soon as it is done."
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW StudioProgressColour
  Function StudioProgressColour
    !insertmacro StudioProgressBar
  FunctionEnd
!macroend

; The progress bar in the app's near-black (#1A1A1A) on a pale track, not Windows'
; green: the control takes colours only without its visual style, so that is
; taken off it first (SetWindowTheme), then PBM_SETBARCOLOR and
; PBM_SETBKCOLOR (COLORREF: 0x00BBGGRR).  1004 is the progress bar's id on
; the instfiles page.
!macro StudioProgressBar
  FindWindow $0 "#32770" "" $HWNDPARENT
  GetDlgItem $0 $0 1004
  System::Call 'uxtheme::SetWindowTheme(p r0, w "", w "")'
  SendMessage $0 0x409 0 0x1A1A1A
  SendMessage $0 0x2001 0 0xE8E8E8
!macroend

; The uninstaller, like the installer: its progress, then its finish page --
; no welcome page (this macro takes its place and inserts none).
!macro customUnWelcomePage
  !define MUI_PAGE_HEADER_TEXT "Uninstalling"
  !define MUI_PAGE_HEADER_SUBTEXT "Please wait."
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW un.StudioProgressColour
  Function un.StudioProgressColour
    !insertmacro StudioProgressBar
  FunctionEnd
!macroend
!macro customUninstallPage
  !define MUI_FINISHPAGE_TITLE "Uninstall complete"
  !define MUI_FINISHPAGE_TEXT "@NAME@ has been removed.$\r$\n$\r$\nThe .s files you saved are left as they are."
!macroend

; electron-builder's installer keeps a copy of itself (the whole installer,
; over 100 MB) in %LOCALAPPDATA%\<name>-updater: the old side of an update's
; differential download (src/main/updater.ts), which then fetches only the
; blocks that changed.  It is kept while the program is installed, and removed
; with the program -- but not when the uninstaller runs for an update: the
; update's installer runs from pending\ in that same folder, and puts its own
; copy there afterwards.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$LOCALAPPDATA\@NPMNAME@-updater"
  ${endIf}
!macroend
