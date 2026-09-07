# Handover — Nebula

For a CLI agent arriving with no context. Written to fit one context window and
get you productive immediately. The *rules* are in [AGENTS.md](AGENTS.md); this
is the *map*.

---

## 1. First 60 seconds

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
| Stack | Electron 33 · Vite 6 · vanilla ES modules · Vitest · playwright-core |
| Renderer | `src/` — no framework, no build magic beyond Vite |
| Main | `electron/main.js` + `electron/preload.js` — the only place with disk access |
| Storage | `<userData>/storage/notes/<id>.json`, mirrored from `localStorage` |
| Tests | `npm test` (61 unit) · `npm run smoke` (22 Electron checks against the real app) |

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
  find.js            Ctrl+F; paints matches, never edits the note
  export.js          a note as Markdown or one standalone HTML file
  import.js          a .md/.html file back into a note, sanitised
  history.js         the editor's own undo/redo; every scripted edit pushes
  app-menu.js        File/Edit/View/Window/Help; also the palette's source
  palette.js         Ctrl+K, and the keyboard-shortcut sheet
  note-actions.js    the per-note menu and the archive/trash drawers
  lists.js           repairs what execCommand's list commands leave behind
  inline-format.js   Enter/Backspace out of an inline wrapper
  equation.js        KaTeX, rendered from data-tex on every load
  ai-panel.js        webview tabs (deliberately isolated from everything else)
  updater.js         the update card
  about.js          version, build channel, folders
  dialog.js  icons.js  theme.js  seed-notes.js
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
| `npm run pack:test` | **`Nebula Test.exe`** in the project root — double-click, own icon, own notes |
| `npm run pack:win` | `release/Nebula-Setup-*.exe` + `Nebula-portable-*.exe` |
| `npm run icons` | Regenerate `build/icon.png` from `build/source-mark.png` (Windows) |
| `npm run site` | Rebuild `site/index.html` (docs + mind maps) |
| `npm run push` | The release ritual — **only when the user says "push"** |
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
15. **A toolbar control that takes focus loses the selection.** The mousedown
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

---

## 7. Where things live at runtime

**Four ways to launch, four separate vaults** (`electron/user-data.js`):

| Launched as | Channel | Notes live in |
|---|---|---|
| **Installed** — `%LOCALAPPDATA%\Programs\Nebula`, `/Applications/Nebula.app` | `installed` | `%APPDATA%\nebula` · `~/Library/Application Support/nebula` |
| **Test** — `Nebula Test.exe`, built by `npm run pack:test` | `test` | `<repo>\Nebula-data` |
| **Portable** — `Nebula-portable-*.exe` from a release | `portable` | `<folder of the exe>\Nebula-data` |
| **Dev** — `npm run dev` | `dev` | `<repo>\.dev-profile` (via `NEBULA_USER_DATA`) |

Inside any of them: `storage\notes\<id>.json`, `storage\meta.json`, `backups\`.

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
