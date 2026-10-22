# Handover — Nebula

For a CLI agent arriving with no context. Written to fit one context window and
get you productive immediately. The *rules* are in [AGENTS.md](AGENTS.md); this
is the *map*.

---

## 1. First 60 seconds

Latest audit and explicit verification limits: [ProjectNotes.md](ProjectNotes.md).
Rich-paste async work is cancelled by `reset()` on note switches/history restore.
Image selection is excluded from history snapshots; rehydration must finish
before history captures its restored present, or repeated undo can lose redo.
Imported frames are removed; Embed is rebuilt from a validated URL and a fixed
sandbox. Always keep the open-link fallback because sites may refuse framing.
`node tests/e2e/rich-paste.mjs` runs the focused subset, also in normal smoke.

A typed line after a heading is a bare `<div>`, not a `<p>`: block commands go
through `blockFromNode` (blocks.js), which must keep handling it. An imported
`.nebula.json` goes through `sanitizeNote`, never straight into the vault.

Mac: no custom after-pack signing hook exists. `identity: null` and the explicit
win32 auto-update gate mean manual replacement. GitHub release text comes from
`scripts/release-body.js`; do not restore old blanket backup/safety claims.

```bash
npm install
npm run preflight     # version, phase, what the last session did, what changed
```

Then say aloud what you read and what you plan to do. Only then edit.

---

## 2. What this is

**Nebula** — an Electron note app for Windows and macOS. Calm, file-based,
one note per JSON file on disk. Published at
**[hero-999-dev/nebula](https://github.com/hero-999-dev/nebula)**, installs from
GitHub Releases, and updates itself in place on Windows.

| | |
|---|---|
| Stack | Electron 44 (Chromium 152, Node 24) · Vite 6 · vanilla ES modules · Vitest · playwright-core |
| Renderer | `src/` — no framework, no build magic beyond Vite |
| Main | `electron/main.js` + `electron/preload.js` — the only place with disk access |
| Storage | `<userData>/storage/notes/<id>/<id>.json` (a folder per note, its pictures and videos beside it), mirrored from `localStorage`; `storage/folders.json` holds the list's folders |
| Tests | `npm test` (1522 unit) · `npm run smoke` (1200 Electron checks against the real app) |

It is a deliberate rewrite of `../Nebula Demo/` (v0.5.7, feature-complete but
sprawling), pairing that project's plumbing with `../Ember/`'s visual language.
Demo features are meant to be ported back **one at a time** through the hooks in
§5 — not copied wholesale.

---

## 3. The shape of the code

```
electron/
  main.js            window, IPC, vault, snapshots, path guard, AUMID
  preload.js         the ONLY bridge: window.nebula.{storage,updates,paths,reveal}
  updater.js         auto (Windows installer) / manual (mac, portable, dev)
  version-compare.js pure semver compare, unit-tested
src/js/
  main.js            boot: disk → store → editor → panels
  notes.js           NoteStore — the single source of note state
  disk-store.js      localStorage ↔ disk mirror; returns the vault status
  storage.js         loadJson/saveJson + the saveHook the mirror installs
  bus.js             note-changed / note-opened
  editor.js          contenteditable + debounced autosave
  toolbar.js  dock.js  slash-menu.js  shapes.js  codeblock.js  highlight.js
  side-toggle.js     folds the note list away; remembers the choice
  i18n.js            four languages; translates the interface as it is drawn
  context-menu.js    the right-click menu (spelling, pictures); electron/context-menu.js feeds it
  toggles.js         toggle lists · mentions.js @ note mentions and #word labels
  label-filter.js    "Filter by label": note labels and labels in the text, apart
  image-crop.js      ✂ crop frame over a picture (page chrome, never in the note)
  dividers.js        a click picks a divider
  find.js            Ctrl+F; paints matches, never edits the note
  export.js          a note as Markdown or one standalone HTML file
  import.js          a .md/.html file back into a note, sanitised
  rich-paste.js      safe link Paste as choices and floating pasted images
  history.js         the editor's own undo/redo; every scripted edit pushes;
                     absorb() folds in a change nobody made (a page title)
  note-markup.js     the note vs the screen: ONE list of on-screen state; the
                     save, every undo step, export and print serialise through it
  migrate.js         brings an opened note up to this version (on every open)
  backup-purge.js    (electron/) a note deleted from the Trash leaves every backup
  heal.js            the same, for every note in the vault, once per version,
                     after a pre-heal backup, guarded so no word can change
  app-menu.js        File/Edit/View/Window/Help; also the palette's source
  palette.js         Ctrl+K, and the keyboard-shortcut sheet
  note-actions.js    the per-note menu and the archive/trash drawers
  folders.js         FolderStore (folders.json) and how the list groups notes
  page-zoom.js       a note's page zoom (CSS zoom); editorZoom() for drags
  page-mode.js       a note's page width (NW, NN, A3–A5, B3–B5): the printed
                     line on screen, and the paper for print and PDF
  note-list.js       the list with folders; dragging a note into a folder or
                     between two (note.order, on updatedAt's scale)
  lists.js           repairs what execCommand's list commands leave behind
  inline-format.js   Enter/Backspace out of an inline wrapper
  inline-family.js   exact inline selection boundaries and clean typing markers
  equation.js        KaTeX, rendered from data-tex on every load
  ai-panel.js        webview tabs (deliberately isolated from everything else)
  updater.js         the update card
  about.js          version, build channel, folders
  dialog.js  icons.js  theme.js  seed-notes.js

0.9.4:
electron/
  note-media.js      a note is a folder: notes/<id>/<id>.json + its pictures and
                     videos as files; taken out and put back at storage:read/write;
                     nebula-media://note/<id>/<file>
  black-holes.js     encrypted notes (AES-256-GCM): storage/blackholes/<hole>/<note>.bh,
                     key wrapped by a 6-digit PIN (scrypt) and safeStorage, optionally
                     by a passkey, and by a recovery key
  app-lock.js        the lock on opening: <profile>/app-lock.json, an scrypt verifier —
                     a gate, not encryption; main refuses notes while it is shut
  app-logo.js        the logo's colours: PNGs from the renderer -> .ico under
                     <profile>/logo; the window's icon and this build's shortcuts
  open-with.js  open-file.js   "Open with Nebula" for .docx/.doc/.odt/.rtf
src/js/
  settings.js  settings-panel.js   Settings (nebula:settings): a new note's font,
                     size and page; hide the AI panel / the black holes; the lock; the logo
  app-lock.js        the lock screen and its part of Settings
  black-holes.js     the black holes' section of the sidebar and their dialogs
  logo.js  logo-editor.js          the logo drawn as SVG, its themes and its editor
  theme-custom.js  theme-editor.js "Your own theme": five colours, named profiles
  table.js  table-grid.js  table-size.js   tables: cells, colour, merge, fill, resize
  columns.js         a divider pulled sideways splits the part above it into columns
  image-place.js     where a picture in the text stands: left/centre/right, in a row
                     (--row, --beside), in a line of words; the drag and its mark
  drop-mark.js  block-drag.js      the mark a dragged block lands at; cards, videos
                     and code blocks dragged by their title line
  gap-caret.js       a click between, under or beside blocks finds or makes a line
  auto-arrows.js     --> and <-- typed become arrows
  file-video.js  held-media.js     a video file in the note's folder, and its player
  guide-i18n.js  guide-de.js  guide-pl.js  guide-tr.js   the guide in four languages
  paste-clean.js     pasted words in the note's dress; keepSize for "Paste original format"
```

**Data flows one way:** a keystroke edits the store, the store writes
`localStorage`, the save hook mirrors changed notes to disk, the bus tells
everyone else. Nothing reads the DOM to find out what a note contains.

---

## 4. Commands

| Command | What it does |
|---|---|
| `npm run preflight` | **Start here.** State of the project. |
| `npm run dev` | Dev app on `<repo>/.dev-profile` — cannot see the installed app's notes |
| `npm test` | Unit tests |
| `npm run build && npm run smoke` | Drives the real Electron app on throwaway profiles |
| `npm run rebuild` | Local only (its files are gitignored): rewrites a real article in the app and scores it; reports in `test-results/rebuild/` |
| `npm run old-notes` | The long-note trials on COPIES of this machine's own vaults (Nebula Test only — never the installed app); nothing is written back, files are hash-checked |
| `npm run check:browsers` | The Firefox/ESR the sign-in windows claim against Mozilla's list, Electron's Chromium against Chrome's; `npm run push` stops on a stale Firefox |
| `npm run pack:test` | **`Nebula Test.exe`** in the project root — double-click, own icon, own notes |
| `npm run pack:win` | `release/Nebula-Setup-*.exe` + `Nebula-portable-*.exe` |
| `npm run icons` | Regenerate `build/icon.png` from `build/source-mark.png` (Windows) |
| `npm run site` | Rebuild `site/index.html` (docs + mind maps) |
| `npm run push` | Release finished work automatically under the owner's standing instruction in AGENTS.md |
| `npm run precheck:ci` | Push HEAD to a `precheck/*` branch, wait for GitHub's Windows + macOS build of it (no publish), delete the branch. `npm run push` does this before every tag |
| `npm run sync-flash` | Mirror the repo to the USB drive if it is plugged in |
| `npm run reset` | Wipe the **dev** notes (backs them up first) |

---

## 5. Extension points (wired, mostly unused)

| Hook | Use it for |
|---|---|
| `bus.js` | `note-changed`, `note-opened` — a new view subscribes instead of polling |
| `disk-store.js` | Per-note JSON mirror; add a new key by extending `mirror()` |
| `storage.js` `setSaveHook` | Any store that must reach disk |
| `window.nebula` in `preload.js` | The only door to the main process. Add a namespace, never a raw path parameter |

Porting a Demo feature: read its module in `../Nebula Demo/src/js/`, keep the
logic, drop its per-feature store, and hang it off `NoteStore` + the bus.

---

## 6. Traps

Every one of these is silent — the app builds, installs and runs while wrong.

1. **`win.signAndEditExecutable: false`** also disables rcedit, so the exe keeps
   Electron's icon and version info. That is what put an Electron logo on the
   taskbar and on both shortcuts. Never set it.
2. **`electron-updater`** must stay in `dependencies` *and* in
   `rollupOptions.external` (`vite.config.js`). Bundled, updates stop working
   with no error. CI asserts it is inside `app.asar`.
3. **`latest.yml`** exists only because `build.publish` is configured. Remove
   that block and every installed copy stops seeing releases. CI asserts it.
4. **Seeding** requires a vault that was read *successfully* and came back
   *empty*. `storage:list` separates ENOENT (a real first run) from any other
   error. Collapsing them once seeded sample notes over a live vault.
   The corollary bit later: an existing vault therefore never sees a new
   starter note, in any release. `NoteStore.ensureGuide` is the only sanctioned
   way round it — it ADDS the guide once per `GUIDE_VERSION`, never edits or
   removes anything, and is gated on the same `disk.ok`. Do not relax the
   seeding rule to solve that problem.
5. **Profiles.** Electron derives `userData` from the package name, so an
   installed, a portable and a dev launch all resolve to `%APPDATA%\nebula`
   unless something intervenes. `electron/user-data.js` is that something, and
   `scripts/paths.js` is the same answer for the scripts. A portable exe built
   into `release/` was writing to the installed app's vault until this landed.
6. **`quitAndInstall(true, true)`** — the first argument must be `true`, or the
   NSIS wizard opens and waits for clicks after the app has already quit.
7. **`npx asar extract-file`** writes into the current directory. Run it in a
   temp folder.
8. **SVG subtraction.** `fill-rule="evenodd"` over two overlapping circles fills
   the cutter's outside too. A crescent is one closed path: big arc out, small
   arc back.
9. **The `hidden` attribute is only a UA rule** (`display: none`). Any author
   rule that sets `display` beats it, silently - `.shape-bar { display: flex }`
   meant `bar.hidden = true` did nothing and the shape bar stayed on screen.
   `app.css` now carries `[hidden] { display: none !important }`. A test that
   asserts `el.hidden` cannot see this; assert the computed `display`.
10. **A CSS class cannot move a node between stacking contexts.** `.shape.behind`
   could never be behind the text while every shape lived on one overlay above
   it. There are two layers now, and "send behind" moves the node between them.
11. **Quotes inside a `style=""` attribute end it.** Font stacks contain
   `"Segoe UI"`, so building a row as `style="font-family:${stack}"` left it
   with no font at all. Assign `el.style.fontFamily` as a property.
12. **An Electron `<webview>` with `display: none` is detached from its guest**
   and reloads when it comes back — which logs the user out of whatever they
   just signed into. Never hide one with `hidden`/`display`. Stack them and
   switch `visibility` (see `.ai-view` in editor.css).
13. **Chromium's undo only knows edits Chromium made.** Replacing an element
   that `execCommand` just inserted desynchronises the stack and Ctrl+Z leaves
   duplicated text. Scripted edits to note content must go through a real edit
   command (`insertHTML`, `styleWithCSS` + `fontName`) or they are not undoable.
14. **A search must never mark up the note.** Wrapping hits would dirty it,
   autosave it and land on the undo stack; `find.js` paints ranges with the CSS
   Custom Highlight API instead.
15. **A block is not always a direct child of the editor.** Applying a colour
   or a font around one wraps it in a `<div>`, so any "what is next to the
   caret" lookup has to search inside the neighbour, not just test it.
16. **Near-white text on a dark ground fringes warm** under Windows subpixel
   antialiasing — it reads as a colour nobody set. `-webkit-font-smoothing:
   antialiased` on the body is the fix; do not go looking for the colour.
17. **Anything written into a note's markup is frozen in old notes** — and the
   place to fix that is `src/js/migrate.js`, which runs on every note open and,
   since 0.9.1, over the whole vault once per `MARKUP_VERSION` (`heal.js`, after
   a `pre-heal-<version>` backup). Never add another one-off top-up at a call
   site: a shape saved overflowing was never re-measured, an empty shape never
   got its `<br>`, and only the code block's ✕ had a top-up at all. Controls
   drawn into a note (a shape's outline and grips) are REBUILT to this
   version's form, never topped up "if missing" — a wrong one stayed wrong.
   Every fix whose bug could have written something into a note adds an
   exhibit to the residue museum, `tests/heal.test.js` (owner, 2026-09-27).
18. **An inline span must never be allowed to wrap a block.** `text-decoration`
   does not propagate into a block child, so `<span class="u-single"><p>..</p>`
   underlines nothing — and the span becomes the editor's direct child, which
   is what "the block the caret is in" resolves to. Wrap one span per block.
19. **Chromium paints no CSS background into a page's margin band.** It is the
   view's base colour, so an export shows the window's `backgroundColor` there
   and no print stylesheet can reach it. `@page { margin: 0 }` and draw the
   margins as padding.
20. **A shortcut that is not in the table falls through to Chromium**, which
   has its own idea of the markup — Ctrl+U left a native `<u>` the app's own
   "None" could not strip.
21. **Reproduce against the note that reported it, not one that looks like
   it.** The code-block delete bug survived two "fixes" because both were
   verified against markup I wrote to resemble the user's. The real note keeps
   a block and the line under it inside ONE wrapper; read the vault
   (`Nebula-data/storage/notes/*.json`) and load that.
22. **"The block the caret is in" is not the editor's direct child.** A colour
   or a font wraps a run in a `<div>`, so any neighbour lookup must find the
   nearest real block and then step OUTWARD a level at a time.
23. **`app.getVersion()` answers with ELECTRON's version** when Electron was
   pointed at a directory with no package.json — which is every dev run and
   every smoke launch. `APP_VERSION` in `electron/main.js` falls back properly.
24. **A width transition outlives a fixed wait.** Measuring geometry right
   after toggling the sidebar reads a frame of the animation. Wait for the
   width to be both stable AND at its target: an ease curve crawls at each end,
   so two consecutive frames round to the same pixel mid-flight.
25. **A page's margin band cannot be painted.** Chromium fills it from a
   document background colour cached outside the print stylesheet — CSS under
   print media, `BrowserWindow.setBackgroundColor` and a theme switch were all
   measured and all failed. Use `@page { margin: 0 }` and pad the content.
26. **`cmd()` must not focus the editor when the caret is already inside it.**
   A shape's text is a nested editable within the editor, so `editorEl.focus()`
   moves focus off it and throws the selection away.
27. **`.shape-text` takes no pointer events unless the shape is `.editing`,**
   so `e.target` on a double-click reports the shape. Hit-test with geometry.
28. **`styleWithCSS` is document-wide and sticky.** `applyFont` turns it on;
   anything using execCommand afterwards emits spans instead of tags unless it
   resets the flag.
29. **A block with no children has no line box** — no height, and no caret to
   click into. `migrateBlankLines` puts a `<br>` in.
30. **`preferCSSPageSize: true` or the page box is rounded.** Without it
   Chromium leaves a sub-point strip of the document background along the top
   of every printed page, outside the clip region, unreachable by CSS.
31. **`execCommand('insertText', '\n')` is discarded by Chromium.** Insert a
   newline as a text node, and double it at the end of a block — a trailing
   newline has no line box.
32. **`::marker` is right-aligned in `list-style-position: outside`,** so a
   bullet and a number begin at different x however well the TEXT lines up.
   Draw markers as `::before` in a fixed column.
33. **Padding on an inline changes the layout of the line.** A highlight needs
   a matching negative margin or every following word moves.
34. **The PDF is printed from a hidden window, not the live one**
   (`withPrintWindow` in electron/main.js, `toPrintDocument` in export.js). A
   page's margin band takes a document background colour captured at load, so
   only a document that is white from the start can have real page margins.
35. **Chromium takes a non-editable island with Backspace.** Guard every
   delete key against removing a `.shape-layer`.
36. **A box inset is not a parallel line on a diagonal.** Clip a shape's fill
   to its own inner polygon, or the diamond looks heavy and the triangle thin.
37. **`memory.currentPhase` is what the docs site prints as "Right now".**
   `npm run push` fails if it does not name the version being released.
38. **Guard deletions in `beforeinput`, never in `keydown`.**
   `getTargetRanges()` is what the browser is about to remove; working it out
   from the caret misses empty spans between the caret and a non-editable
   island, and Chromium takes such an island on the SECOND Backspace.
39. **`intersectsNode` cannot see a void element** beside a boundary — an
   `<hr>` next to a collapsed range does not "intersect" it. Read the boundary.
40. **A toolbar mark must read the DOM at the caret, never
   `queryCommandState`.** That reports the TYPING state, which carries across a
   boundary, and a caret at offset 0 sits outside the span holding the line's
   formatting — step into the child beside it first.
41. **A declared 1.6px border is rounded to a whole pixel; an SVG stroke is
   not.** Declaring the same number on both gives two different lines.
42. **Build the thing by hand before believing a fix.** Driving the real app
   with a pointer, in the order a person works, found in one pass what three
   rounds of reading the report did not — and a clean-start trace passed while
   the real sequence still failed.
43. **Never set `min-height` on the element that scrolls.** It stops
   overflowing, so it stops scrolling and its scrollTop goes to zero.
44. **`execCommand` list commands leave the list inside the caret's block.**
   `normalizeLists` lifts it out of any wrapper that is not an `<li>`.
45. **A control that needs a selection cannot be switched OFF at a bare
   caret.** Formatting carries across Enter, so the new line inherits it and
   there is nothing to select — handle the collapsed case explicitly.
46. **Assert that a label RENDERS, not that it exists.** The shape names sat in
   the markup at zero width for several releases while every check passed.
47. **Anything written into a note's markup is frozen in old notes.** The
   code block's ✕ is created with the block, so blocks written before it existed
   never got one — `paintAllCode` tops the header up on every load. Any new
   in-note control needs the same treatment.
48. **The save writes `serializeNote(editor)`, never `innerHTML`.** Until
   0.9.1 whatever was on screen at an autosave was frozen into the note (the
   owner's Ideas note held a picture "selected" for good). A new class that
   only means "on screen now" goes into `note-markup.js`'s list, or it will be
   saved into notes and exported to other computers.
49. **Opening a note is not editing it.** `editor.adopt()` makes the repaired
   note the baseline and `store.heal()` writes it without touching `updatedAt`.
   A change nobody made (a link's page title arriving) goes through
   `history.absorb()`, not an input event: an input event after an undo is a
   new edit and throws the redo steps away.
50. **The trials must also run on notes an older version wrote.** Notes this
   version writes cannot hold old residue, which is why the trials missed what
   the owner kept hitting. `tests/e2e/old-note.mjs` (in smoke) holds those
   structures by hand; `npm run old-notes` runs the trials on copies of the
   notes in Nebula Test's vault (never the installed app's, trap 55).
51. **Enter copies every attribute of a line onto the line it splits off** —
   its `data-anchor` too, so one arrow anchor ended up on nine paragraphs.
   Anything identifying (an anchor, an id) must be dropped from the new line
   (`dropCopiedAnchor`), and an empty line needs a `<br>` to hold a caret
   even when it is an empty span (`ensureLineBox`): at the "end" of an empty
   block the caret moves on to the next line, and so does the typing.
52. **Deleted is deleted.** A note deleted from the Trash leaves every backup
   too (`electron/backup-purge.js`, on `storage:delete`), and 0.9.1 took the
   notes deleted before it out of the backups once (`meta.json`
   `deletedNotesPurged`). Anything new that copies notes — a backup kind, a
   test profile, an export cache, a sync — must drop a note when it is
   deleted, or it reopens the hole the owner called a security hole. Test
   profiles are swept by `tests/e2e/profiles.mjs`.
53. **Never call `setUserAgent` on a webview in the middle of a navigation.**
   It restarts the navigation; switching on a redirect restarted it at the
   address that redirects, forever. Change a request's identity with
   `webRequest.onBeforeSendHeaders`, and the page's only on `did-navigate`.
54. **Chromium copies computed style into the clipboard,** even from Nebula
   itself: `color`, `scrollbar-color` and the font land inline on every copied
   element and freeze the source theme's ink. Pasted HTML goes through
   `paste-clean.js`.
55. **Never the installed app.** `C:\Program Files\Nebula` and its notes and backups (`%APPDATA%\nebula`)
   are the owner's private notes: no agent, script or test opens, reads, copies,
   screenshots or updates them (owner, 2026-09-28). 0.9.1's old-notes check read them;
   it reads Nebula Test's vault only now. The owner updates the installed app from inside it.
56. **A save used to write the whole vault.** `NoteStore.save()` stringified
   every note, the mirror parsed that and stringified each note again, and
   localStorage got a copy — 0.4 s per autosave with two long articles in the
   vault ("the app is incredibly slow"). Pass the changed ids
   (`save([id])`); with the disk mirror on, localStorage does not hold notes
   (its boot copy is removed at the first save, or an emptied vault would
   resurrect deleted notes from it).
57. **The interface is translated as it is drawn** (i18n.js). Write UI text in
   English as always; add the string to `STRINGS` (or a pattern) and it follows
   the language. Anything inside `#editor` is the note and is never touched —
   a word changed there would be saved. A placeholder drawn inside the note by
   CSS takes a custom property (`--t-caption`), not the attribute.
58. **A right-click goes to the main process first.** Taking `contextmenu` in
   the page (preventDefault) stops Electron's `context-menu` event, and with it
   the spellchecker's suggestions. The page listens to `ui:context-menu`
   (context-menu.js) and draws the menu there.
59. **Two agents in one repo.** The Lea shadow replayed this session's prompt
   in this repo and edited the same files (2026-09-29); it is fenced now
   (Optimizing CLI `shadow/guard.js`). If files change under you, check
   `shadow/shadow.log` before assuming anything.
60. **`npm run kill` closes only this project's builds.** It used to
   `taskkill /IM Nebula.exe /F` - the installed app included, with the owner's
   unsaved notes. It now matches each process's executable path against the
   project folder; `node scripts/kill-nebula.js --dry-run` lists the targets.
16. **A `clip-path` cuts the border off too.** A clipped shape cannot have a
   `border`; draw it as two layers (outline behind, fill inset) and remember
   that CSS cannot read an element's inline `background`.
17. **A toolbar control that takes focus loses the selection.** The mousedown
   preventDefault skips `input` and `select` so they can be used, and focusing
   them clears the document selection — so the action finds nothing and returns
   in silence. Anything driven from a field must go through `withSelection`.
16. **An imported file is hostile.** A note is loaded with `innerHTML` and
   mirrored to disk, so `import.js` must sanitise before anything reaches the
   store: scripts, styles, frames, handlers, `javascript:` URLs, unknown classes.
17. **The editor's undo is `history.js`, not Chromium's.** Anything that edits
   note content by script must call `history.push()` FIRST. Chromium's stack
   cannot see scripted DOM edits, so `execCommand('undo')` rolls back the wrong
   thing; and do not reach for `insertHTML` to get around it - it rewrites the
   spaces around the selection as `&nbsp;`.
16. **`renderList` redraws the archive and trash counts.** Any early return in
   it must redraw them too - trashing the last note is exactly when they change.
17. **A colour written into a note is frozen.** `execCommand('foreColor')` puts
   a hex literal in the markup, and the app has three themes — a value picked
   against one background is unreadable on the other two. Colours are classes
   (`c-*`, `h-*`) resolved through `tokens.css`, and a highlight sets its own
   ink so the pair can never be chosen badly.
18. **A sign-in window's page script goes in before its first page, and
   nothing waits on it for ever.** `Page.addScriptToEvaluateOnNewDocument` on a
   window that has loaded nothing may not answer until a page loads; waiting
   for the answer left Mistral's window blank. Loading `about:blank` first to
   get an answer is worse: the script then misses the next page, Google sees
   Chromium under a Firefox name and refuses the address ("Try again" worked
   only because the second page had the script). Register it, load at once
   (a short cap on the wait). An OAuth "Sign in with Google" address is loaded
   as it is — its client, return address and state are the sign-in.
19. **The address a sign-in hands back to works once.** It carries a one-time
   code. A sign-in window that follows the redirect while the tab is sent there
   too makes two requests with one code, and the second is refused ("Unauthorized
   request", or a sign-in that works only after a few tries). Stop the redirect in
   the window and let the tab alone take it; if the window already arrived, let it
   finish and reload the tab — never load the same address twice.
20. **No stand-ins in a service's own tab.** The passkey page script replaces
   PublicKeyCredential and hides window.chrome — right for Google's sign-in, fatal
   for a captcha (DeepSeek refused every answer). It runs only where Google's
   pages are shown, and only on Google hosts. A regex inside a template literal
   needs doubled backslashes, or `\.` arrives as `.`.
21. **A click in a <webview> never reaches the app's document.** A menu that
   closes on an outside mousedown stays open over the page. The host sees only a
   captured `focus` on the WEBVIEW element (not focusin); main.js turns that into
   a click outside.
22. **Tell Google a current browser.** A fixed, years-old Firefox in the user
   agent is refused as an unsupported browser. `currentFirefox` counts from a
   known release by the four-week cycle; update its anchor if Mozilla changes
   the cadence.
24. **The page can be zoomed (CSS `zoom` on #editor).** Pointer positions and
   getBoundingClientRect are screen pixels; `left`, `top`, `width` in the page
   are page pixels. Any new drag or measurement inside the page divides by
   `editorZoom()` (page-zoom.js), or at 150 % it runs half as far again.
23. **Electron 44 changed four things this app relies on (0.9.3).** The
   clipboard is W3C ClipboardItems (`writeImage`/`readImage`/`write({image})`
   are gone — `writeImageToClipboard` in context-menu.js); `app.commandLine`
   lower-cases arguments, so `disable-blink-features=WebAuth` also goes into
   every window's, webview's and popup's `disableBlinkFeatures`; file dialogs
   open in Downloads unless given a folder (`lastFolder` in main.js); a click
   in a <webview> reaches the app only as the window's `blur`. Electron no
   longer downloads itself on `npm install`: `npx install-electron --no`.
61. **An attached file is neither a picture nor a video (0.9.6).** A file
   dropped on a note is copied into its folder as `att-<time>-<hex>.<ext>`
   (`addAttachment`, note-media.js; `addFile` in black-holes.js). `isPicture`
   and `isVideoName` refuse that prefix whatever the ending — an attached
   `.png` is a card, never an `<img>` — and `isKeptFile` keeps both kinds out
   of the backup sweep. *Open* hands the file's own program a copy in
   `userData/opened` (`electron/opened-files.js`), laid out as
   `note/<id>/<stem>/` and `hole/<hid>/<id>/<stem>/` so each copy goes with
   what it came from: at start and quit, with its note when deleted, with its
   black hole when that is locked, removed or deleted (a sealed file opened is
   in the clear — it must not outlive the lock), with its card when × takes
   it out (`media:forget-file`). A card opens only the open note's own file
   (`ownsAttachUrl`), and a copy that finishes after its note was deleted
   is dropped (`copyInto`); a folder with no note file holding only copied-in
   files is swept at start (`abandonedFolder`). Ownership is the card's rule,
   not the IPC's: the bridge trusts the main window, which can read every note anyway.
62. **`ELECTRON_RUN_AS_NODE=1` in the shell.** A terminal opened from another
   Electron app (Test Orchestra's chats) inherits it, and then `electron.exe`
   is plain Node: smoke dies with "Process failed to launch!", `electron
   --version` prints a Node version. Run `env -u ELECTRON_RUN_AS_NODE npm run
   smoke` there.
63. **The main window loads whatever it is sent to, with the whole bridge.**
   preload.js gives `window.nebula` to any page in the main window, and a
   plain link in a non-editable part of a note (a note from another copy keeps
   them) navigated it. `will-navigate` keeps the window on its own page
   (`electron/navigation.js` `staysOnPage`); the window-open handler and the
   `openExternal` permission hand the system only http, https and mailto
   (`externalUrl`) — `ms-settings:`, `ms-msdt:`, `file:` and shares run
   things. A new way to open a link goes through `externalUrl` (hunt B21).
64. **A session with no permission handler grants everything.** Each
   partition (`persist:embed`, `persist:ai-<id>`, the PDF preview) is its own
   session; the list set on `defaultSession` alone let a page embedded in a
   note use the microphone and read the clipboard. `app.on('session-created')`
   gives every session `electron/permissions.js` `allowed`; a new partition
   needs nothing more, a new permission goes in `WEB_PAGE` or `CHAT` (B22).
   An embed ASKS for `ASK_EMBED` (microphone/camera, notifications): the
   answer lives in `pageAnswers`, in memory, for one page load (B25). A session
   with no permission CHECK handler answers every check "granted" — the embed
   session has one; a new permission an embed may ask for needs both handlers.
65. **An embed with `allowpopups` and no window-open handler** turns every
   `window.open` into a bare app window — one page opened fifteen in two
   seconds. Embeds deny always; `popupGate` gives the browser a link only just
   after a real press in that page (B23).
66. **Lowercase is not one unit per letter.** The window lowers in en-US on
   any machine, where `İ`.toLowerCase() is two units: Find's offsets broke and
   "istanbul" never found "İstanbul". Every search compares through
   `src/js/fold.js` `fold()` (İ/ı → i, then lower), never `toLowerCase` or
   `toLocaleLowerCase` alone (B19).
67. **`.slice(0, n)` cuts an emoji in half.** A name cut to length kept a lone
   surrogate, saved as "�" in file names, settings and note markup. Cut
   names by characters: `Array.from(s).slice(0, n).join('')` (B20, B24);
   `migrate.js` `dropHalfCharacters` repairs card names already saved.
68. **A native dialog does not speak the app's language by itself.** The
   renderer's `i18n.js` never reaches `dialog.*` in the main process. Every
   dialog text goes through `electron/dialog-words.js` `words(en, lang, vars)`
   with `await appLanguage()` (English when the window is gone or does not
   answer in 250 ms); a new dialog string needs its de/pl/tr row there, or
   `tests/dialog-words.test.js` fails (B26).
69. **A copy that leaves the app is marked as from the Internet.** Open and
   Save a copy write `Zone.Identifier` (ZoneId=3) on the finished copy
   (`electron/mark-of-the-web.js`, Windows only, best effort), so Windows and
   Office treat it like a download. Mark after `attachedTo`, never inside it:
   that function also stages a sealed file for adoption into another note,
   and a mark there would travel into stored note media (B27). macOS
   quarantine is not done.
70. **The map engine speaks before it is returned.** `createGalaxyMap` calls
   `onDimension(null)` from its first `refresh()`, while `galaxy-ui.js` is
   still waiting for `map` to be set; anything in that callback must use
   `map?.`. A throw there once failed the whole boot (no theme, no notes), so
   `main.js` wraps `initGalaxy` in a try/catch: the map is a view, never a
   way in. A lock must reach the map synchronously (`black-holes.js`
   `onLocked`), not through the list's 250 ms debounce (1.0.0).
71. **The minimap shortens the note list.** It takes 150 px of the sidebar,
   so an e2e drag between rows that are not both on screen is cut short by
   Playwright, not by the app. Scroll the rows into view first
   (`tests/e2e/v093.mjs`, the dragged-order check).
72. **Reduced motion is the Windows default for many people.** With
   "Animation effects" off, Windows asks every app for reduced motion, and the
   map froze both its clocks, so nothing on it ever turned and the owner saw a
   dead map. The clocks run at 0.4 pace instead (`galaxy-map.js` `frame()`);
   a unit test stubs `matchMedia` to keep it so. Text drawn over a black hole
   must use its own colour: paper-coloured initials vanished on the dark
   horizon (1.0.0).
73. **A map body has a kind and a role.** `kind` is how it is drawn
   (sun/planet/moon/hole), `role` what it is (project/folder/note/label). In
   map v2 a folder is a planet and a folder's note a moon, so never decide
   "is this a note" from `kind` — use `role` (`noteOfBody`, `roleOf`). The
   pull-in into a hole must never be 0 ms, reduced motion included: the owner
   could not see it happen. Every map that can go into a hole needs a way out
   (the minimap has no Back button: its right-click menu has one).
74. **Never let an agent revert a file.** Several CLIs edit this tree at once
   and 1.0.0 lives only in the working tree. A `git checkout`/`restore` of
   one file (2026-10-21, Mistral) erased unreleased work; it came back only
   because `dist/` still held a build. Briefs say: edit by exact replacement,
   never revert. Black holes are drawn in `#holes-scroll`, not `#note-list`
   (their own scroll since 1.0.0) — e2e selectors must look there.

---

## 7. Where things live at runtime

<!-- agent-note: gpt6astra tarafından eklendi -->

### Recovery rules added after the interrupted editor repair

- Editor and title buffers retain their originating note ID. Archive/trash can
  change the active note before a debounce fires; never save through active.
- Disk mirroring advances its acknowledged state only after a successful bridge
  response. Failed writes/deletes stay pending and `flushDisk()` must reject if
  retry fails. An unreadable file disables the entire mirror, preserving cache.
- Native close, quit and update use the preload lifecycle save handshake.
  A timeout or failed save keeps the window open; update also requires backup.
- Inline-family changes split DOM boundaries, never find selected text by value.
  Strip temporary typing markers from the serialized clone, not the live caret.
- Preserve the lowest shape's canvas extent on `.shape-layer` after movement
  begins, never on `#editor`; release the reserve when its last shape is deleted.
- The smoke suite imports `tests/e2e/recovery.mjs`. Run that file alone after
  building for focused save/close/drag checks. Optional `NEBULA_REPRO_NOTE`
  reads a real note into a throwaway profile and verifies the source is unchanged.
- Documentation comments prefixed `agent-note:` are repository-only:
  `publicDocSource()` strips them before the public site is rendered.
- A delete range inside `.shape-text` also intersects its ancestor overlay.
  Handle that nested editing host before the overlay deletion guard.
- Old root overlays interspersed with prose prevent native Backspace joins.
  `normalizeProse()` moves root/empty overlays ahead of prose and wraps loose
  inline runs, without relocating nonempty nested shapes to new coordinates.
- Unwrap invalid block-containing spans BEFORE normalizing prose. Keep underline
  on text runs inside colour wrappers, or its ink comes from the outer wrapper.
- A divider's blank paragraph may be nested. Never climb to the editor's direct
  child when testing whether that individual line is empty.
- `tests/e2e/reported.mjs` is part of smoke. Optional `NEBULA_REPORT_NOTES`
  takes a JSON array of two file paths and uses temporary copies only.

**Four ways to launch, four separate vaults** (`electron/user-data.js`):

| Launched as | Channel | Notes live in |
|---|---|---|
| **Installed** — `%LOCALAPPDATA%\Programs\Nebula`, `/Applications/Nebula.app` | `installed` | `%APPDATA%\nebula` · `~/Library/Application Support/nebula` |
| **Test** — `Nebula Test.exe`, built by `npm run pack:test` | `test` | `<repo>\Nebula-data` |
| **Portable** — `Nebula-portable-*.exe` from a release | `portable` | `<folder of the exe>\Nebula-data` |
| **Dev** — `npm run dev` | `dev` | `<repo>\.dev-profile` (via `NEBULA_USER_DATA`) |

Inside any of them: `storage\notes\<id>\<id>.json`, `storage\meta.json`, `storage\folders.json`, `backups\`.

Electron derives `userData` from the package name, so **all four would be the
same directory** if nothing intervened — and for a while the portable build in
`release/` really was autosaving into the installed app's notes. `resolveUserData`
is the one place that decides; `tests/user-data.test.js` proves they never
collide, and `canSelfUpdate` is why only the installed build ever replaces itself.

The test build is the one to hand someone who says "how do I open the dev
version": no terminal, its own name and icon, and `build-test.json` gives it a
separate `appId` so Windows does not merge its taskbar button with the real app.

The app shows which one it is on: click the version in the sidebar footer.

Double-click files in the repo root: `Nebula Test.exe` (test build),
`Open Nebula.bat` and `Fresh Nebula.bat` (**dev** app on `.dev-profile`),
`Open portable build.bat` (the packed portable exe on its own vault).

---

### 0.9.5: what to know before touching it

- **A mark never leaves its block** (`src/js/inline-family.js` BLOCKS). Underline, colour and highlight are applied by lifting two bookmarks to the block the words are in, splitting every wrapper on the way. Anything that holds words and is not in that list is split too: a picture's caption was not, and a highlight cut the picture in two. A new kind of block that holds words goes into the list.
- **A caption takes plain words** (`rich-paste.js`, the paste handler's first branch): a text node, not `insertText`, which writes the look of the words it replaces into the new ones.
- **The taskbar button is not the window's icon** (`electron/app-logo.js` `taskbarDetails`, `main.js` `tellTaskbar`). Windows draws it from the Start-menu shortcut that carries the window's app ID; only a window whose ID no shortcut carries is drawn from its relaunch icon, and that icon is remembered per ID. Hence `<app id>.logo.<hash>` while a logo of the user's is on, and the app's own ID otherwise. A pin that starts this copy wins: the window keeps the pin's ID.
- **Open:** on the owner's computer the installed copy's own Start-menu shortcut draws a blank sheet (see Log.md, 0.9.5). Not explained.

### 0.9.4: what to know before touching it

- **A note is a folder.** `storage/notes/<id>/<id>.json`, pictures and videos
  beside it. The renderer still works with data URLs for pictures; main takes
  them out at `storage:write` and puts them back at `storage:read`
  (`electron/note-media.js`). Tests that count note files count folders.
- **Two locks, two jobs.** The lock on opening (`electron/app-lock.js`) only
  keeps the window shut: main answers no `storage:*`, `holes:*` or `media:*`
  call while it is. A black hole is what encrypts. Do not describe the first
  as protection of the files.
- **The guide has four languages.** A change to the English text
  (`src/js/seed-notes.js`) is not finished until `guide-de/pl/tr.js` follow
  (`node scripts/guide-blocks.js --check`) and the four signatures are in
  `GUIDE_SIGNATURES` (`--signatures`); the previous set is kept under a name of
  its own so an unedited guide in a vault is still recognised.
- **Words in the interface are translated by their English text** (`i18n.js`
  `STRINGS`, `PATTERNS`). The app's name is never declined in any language.
- **Pasting.** `cleanPastedHtml` drops a source's font, colour and ground;
  `keepSize` (Paste original format) keeps its size. A copy from a note of
  Nebula's goes through `cleanNebulaHtml` and keeps a chosen font.
- **A font that is not on this computer is not added to the font list**; the
  bar names the font words are drawn in (`shownFont` in `toolbar.js`).
- **A toggle is `div.blk-toggle > title + .toggle-body`.** A frame without its
  title is taken apart by `healToggles` (after every edit and when a note opens).
- **Pictures in a row** carry `--row` (how many share the line) and `--beside`
  (what the others take); `tidyRows` writes both.
- **Shortcut icons.** The logo's colours reach this build's shortcuts through
  `shell.writeShortcutLink`, two at a time off the main thread's hot path
  (`pointShortcuts`). The program file's own icon is never changed.
- **End-to-end suites** for all of this: `tests/e2e/v094.mjs`, `layout.mjs`,
  `table.mjs`, `table-edges.mjs`, `note-folders.mjs`, `black-holes.mjs`,
  `settings.mjs`, `open-with.mjs`, `ai-sleep.mjs`. `settings.mjs`, `table.mjs`
  and `table-edges.mjs` are run by hand (`node tests/e2e/<name>.mjs` after a build).

## 8. Read next

| File | For |
|---|---|
| [AGENTS.md](AGENTS.md) | The rules, the checklist, the release ritual |
| [README.md](README.md) | The project as a whole |
| [Prompt.md](Prompt.md) | Rebuilding it from nothing |
| [tests.md](tests.md) | What is tested and why |
| [Log.md](Log.md) | What happened, per release |
| [docs/RELEASE.md](docs/RELEASE.md) | Publishing, and the macOS signing limit |
| [docs/UPDATING.md](docs/UPDATING.md) | What a user sees; restoring a backup |
| `site/index.html` | All of the above in one page, with mind maps |

## Current browser and canvas work

### Black-hole security audit follow-up

- A retry must preserve the note's requested storage destination. `flushDisk`
  derives it from the pending JSON; defaulting to the ordinary vault exposed
  encrypted notes after a failed save. Main rejects hole-marked ordinary writes,
  and the browser-cache fallback refuses encrypted notes.
- Old plain files still carrying `hole` are withheld at boot and re-sealed after
  authenticated unlock by `pendingSeals` in `disk-store.js`. The plaintext file
  and backups are removed only after encryption succeeds. Main preserves media
  during that unlock so recovery does not sweep attachments from the newer edit.
  A previously stripped marker can be reconciled only when its exact note ID
  also exists in the opened sealed hole; newer `updatedAt` content wins, then
  the plain file and backups go after successful sealing. No matching sealed
  ID means the origin cannot be inferred safely. This is a storage migration,
  not an HTML migration; changing MARKUP_VERSION cannot repair it.
- Locking must invalidate pending authentication even when no key is open yet.
  File operations must check the original key's identity after asynchronous I/O;
  never seal with a buffer that lock has zeroed. A retained opened copy is not
  authorization to reopen a locked hole. Trash also clears opened copies.
- New PIN wrappers require OS secure storage. Legacy `os:false` wrappers remain
  readable and are rewrapped on a valid PIN unlock when secure storage returns;
  `needsProtection` warns until then. Accessible local backups with the old
  wrapper are updated after each authenticated unlock; failed updates are
  reported and retried at the next unlock. A paused video response holds a Windows
  file handle: note/hole deletion returns `in-use` before shredding. Opened
  copies retained by another program are retried on window focus and every
  30 seconds after their hole locks or their note is deleted.
- Owner acceptance checks: [docs/BLACKHOLE-TESTS.md](docs/BLACKHOLE-TESTS.md).
- A Blackhole label formerly lived in clear `hole.json` metadata and backup
  metadata. `nameBox` now holds the OS-protected label; reading old metadata
  migrates it and listing/unlocking protects accessible local backups. A
  transferred OS-bound label is displayed generically until renamed there.
- Do not announce an ordinary note's move into a Blackhole on `setHole` alone.
  `moveIn` waits for `flushNote` to finish encryption and plain/backup purge.
  A failed move restores the original note. `pendingSeals` withholds older
  marked plaintext until authenticated repair. Active writes/imports must
  block Trash and deletion; a fully buffered video may have no open stream.
- Trash deletion must arm on the first click for an empty Blackhole too. The
  second click asks for authentication; entering a PIN is not the final action.
  The dialog's explicit “Delete for good?” press performs deletion.
- Large media deletion uses `shredAsync` in `electron/note-media.js`, including
  Blackhole removal, ordinary note folders, backup purges and opened copies.
  Await cleanup before reporting success. A lock can run during each await:
  check that the original key still owns an unlock before returning plaintext,
  and refuse writes/imports while a note is being removed. The older sync
  helpers still serve startup cleanup; keep their blocks bounded in memory.
- Local consultation and evidence: `test-results/orchestra/security-2026-10-17/`.
  OS authentication is mocked in race tests; physical Windows Hello and macOS
  keychain/Touch ID require testing on their respective systems.

Google redirects in built-in AI webviews are handed to the default browser at the provider root URL. Authentication continues there; cookies are not transferred to Electron. `electron/ai-browser-auth.js` handles redirects and popups, and `src/js/ai-services.js` owns provider URLs. Bookmark title requests are bounded and credential-free in `electron/link-metadata.js`; `src/js/link-preview.js` binds cards after import/history restore. Labels persist as a normalized note array and in native JSON exports. Shape anchors use unrotated geometry plus rotation through `shape-anchor.js`.

Local-only progress and private report references: `test-results/CODEX-DEVIR.md`. Keep owner note text/images out of this public repository. Latest validation checkpoint is in tests.md; do not treat an in-progress entry as a release.

**A smoke check failed in a push?** Re-run only its suite: `env -u ELECTRON_RUN_AS_NODE node tests/e2e/only.mjs <suite-file-name>…`. Once it passes, `npm run push -- … --no-smoke` skips the local 1,100-check run; GitHub's precheck still runs smoke on the commit.
