; "Open with Nebula" (0.9.4), for the Windows installer (package.json: nsis.include).
;
; The owner: "an Open with Nebula entry ... for a docx, a doc, an odt and the
; other files - and when Nebula is the default, the file wears a violet icon".
;
; Nebula is OFFERED for these files; it never makes itself their default. The
; installer's own "fileAssociations" would write Nebula over whatever opens a
; .docx today, so it is not used on Windows. Written here instead:
;
;   Nebula.Document                      what a file is when Nebula opens it:
;                                        its name, its icon (the violet sheet,
;                                        resources\doc.ico) and how to open it
;   .docx\OpenWithProgids (and the rest) "Nebula" among the programs of
;                                        Open with, for each kind of file
;   Applications\Nebula.exe              the same for "Choose another app"
;
; A reader who then picks Nebula and "Always" gets the violet icon on those
; files; nobody else's choice is touched. Uninstalling takes all of it away.
;
; SHCTX is the current user for a per-user install and the machine for an
; all-users one. ASCII only.

!macro NebulaOffer EXT
  WriteRegStr SHCTX "Software\Classes\${EXT}\OpenWithProgids" "Nebula.Document" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" "${EXT}" ""
!macroend

!macro NebulaWithdraw EXT
  DeleteRegValue SHCTX "Software\Classes\${EXT}\OpenWithProgids" "Nebula.Document"
!macroend

!macro customInstall
  WriteRegStr SHCTX "Software\Classes\Nebula.Document" "" "Nebula document"
  WriteRegStr SHCTX "Software\Classes\Nebula.Document" "FriendlyTypeName" "Nebula document"
  WriteRegStr SHCTX "Software\Classes\Nebula.Document\DefaultIcon" "" "$INSTDIR\resources\doc.ico"
  WriteRegStr SHCTX "Software\Classes\Nebula.Document\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "Nebula"
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\DefaultIcon" "" "$INSTDIR\resources\doc.ico"
  WriteRegStr SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  !insertmacro NebulaOffer ".docx"
  !insertmacro NebulaOffer ".doc"
  !insertmacro NebulaOffer ".odt"
  !insertmacro NebulaOffer ".rtf"
  ; Explorer reads its list of programs again.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  !insertmacro NebulaWithdraw ".docx"
  !insertmacro NebulaWithdraw ".doc"
  !insertmacro NebulaWithdraw ".odt"
  !insertmacro NebulaWithdraw ".rtf"
  DeleteRegKey SHCTX "Software\Classes\Nebula.Document"
  DeleteRegKey SHCTX "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
