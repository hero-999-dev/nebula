# Nebula

Calm notes with a real editor. An Electron desktop app for **Windows and macOS**
that keeps every note as a plain JSON file in your own profile, and updates
itself without ever touching them.

**Version v0.7.0** ·
**[Download](https://github.com/hero-999-dev/nebula/releases/latest)** ·
[Documentation site](https://hero-999-dev.github.io/nebula-web/)

---

## What it is

One window: a list of notes, a title, an editor. Everything else is in service
of that editor.

It is a deliberate rewrite. The project it descends from — `../Nebula Demo/`,
v0.5.7 — blends Notion, Obsidian, Excel, Xmind, Anki and Discord into one app
and proves the shape works, at the cost of 221 tests and a surface nobody can
hold in their head. Nebula keeps that project's plumbing and
[Ember](../Ember/)'s visual language, and re-earns each feature one at a time.

So this README describes a small app on purpose. What is here is finished.

### The editor

- **A six-button pad** on the header line docks the editing bar **top, right,
  bottom or left** — press the active side again for full width — toggles the
  AI panel, and hides the bar entirely. The layout survives a restart.
- **A two-row toolbar**: undo/redo · bulleted, numbered and to-do lists ·
  outline format (paragraph, H1–H3, quote, code) · indent ± (also Tab and
  Shift+Tab) · save (`Ctrl+S`) · print (`Ctrl+P`) · cut/copy/paste · shapes ‖
  a **font menu** whose fifteen faces are each shown in their own type · size,
  any number you type · text colour (`Ctrl+T`) · highlight (`Ctrl+H`) ·
  **B I U** with five underline styles · strikethrough · inline code
  (`Ctrl+E`) · **equations** typeset with KaTeX (`Ctrl+Q`) · four alignments.
  The font button and the size box show what the caret is actually in; with
  nothing selected, a font applies to the whole line.
- **Colours are stored as names, not values**, so a note written on one theme
  stays readable on the other two — and a highlight always sets its own ink.
- **Ctrl+F finds text in the note**, painted rather than marked up, so a search
  never edits what it searches. The sidebar filter searches every note's whole
  body, not just its first lines.
- **The note list folds away** behind the three lines beside "Nebula" - the rail
  still carries the notes, New note and the themes.
- **Four themes**: Main (violet), Dark, Light, and White - a plain sheet, for
  seeing a note as it will print on A4.
- **Its own undo stack.** Ctrl+Z covers everything the app does, shapes and
  list repair included - not just what the browser happens to know about.
- **Pin, archive and trash** from the ⋯ on any note; the trash is a way back, so
  even the guide can be deleted and re-added from Help.
- **File / Edit / View / Window / Help** beside the logo, plus a **Ctrl+K
  command palette** built from those same menus.
- **Export a note** as Markdown, as one self-contained HTML file, or as a real
  PDF written by the browser's own engine - not a picture of the window. Import
  a `.md` or `.html` file back as a new note.
- **Right-click a selection** for a compact mini toolbar.
- **`/` opens a block menu** — headings, lists, to-do, quote, code, divider,
  shapes.
- **Code blocks** are markdown-style with a language picker and syntax colours
  for JS, TS, Python, Java, C, C++, C#, Dart (Flutter), Ruby, HTML, CSS, JSON,
  SQL, Bash and Markdown — every one of them with a sample in the guide.
- **Shapes float over the whole note.** Rectangles, ellipses and diamonds drag
  anywhere, resize from a corner, recolour from dots and hold editable text —
  above or behind the words, which never reflow.
- **An AI panel** of embedded chat webviews (Claude, Gemini, ChatGPT, Mistral,
  DeepSeek, Copilot, Perplexity, plus any site you add), resizable, with a
  side-scrolling tab strip. Each service keeps its own persistent session and a
  tab switch never reloads it, so a login survives. It touches no note data, by
  design.
- **Lists you can leave.** Enter or Backspace on an empty item ends the list
  rather than adding another one or merging into the line above, and the to-do
  button toggles a line both ways.
- **One starter note, the same in every build.** `Welcome to Nebula Guide` is
  the whole product on one page: eight sections, each with something to try, and
  a working code sample for all fifteen languages. A vault that predates it is
  given a copy — added, never overwriting anything already there.
- **Three themes**, picked from a segmented control that shows which one is on:
  **Main**, a violet dark theme that is the app's own identity and the default;
  **Dark**, warm paper-and-ink inverted; **Light**, the same warm palette
  upright. Serif content, sans chrome, one accent each.

The app icon is drawn from vector geometry at every size it ships — 16 through
256 in a real multi-size `.ico` — so the title bar and the taskbar are as sharp
as the app itself, and they are the Main accent, so the thing in your taskbar
and the thing on your screen are obviously the same product.

---

## Install

| You have | Get |
|---|---|
| **Windows** | `Nebula-Setup-X.Y.Z.exe`. Per-user install, no admin. **Updates itself.** |
| **Windows, no install** | `Nebula-portable-X.Y.Z.exe`. Runs from a folder or USB stick; does not auto-update. |
| **macOS** | `Nebula-X.Y.Z-mac.dmg`. Drag to Applications; first launch **right-click → Open** (the build is unsigned). |

All from the [Releases page](https://github.com/hero-999-dev/nebula/releases/latest).

**Can't find it after installing?** It is at `%LOCALAPPDATA%\Programs\Nebula`,
with shortcuts on the Desktop and in the Start Menu. The app answers this
itself: click the version at the bottom of the sidebar to open **About**, which
lists the application, notes, backups and profile folders and opens any of them.

---

## Updates, and why your notes are safe

The installed Windows app checks on launch and every six hours. When there is a
new version it says so; you press **Update**, it downloads, you press **Restart
and install**, and it installs silently and reopens. Nothing downloads or
installs on its own.

macOS and the portable build cannot replace themselves — Squirrel.Mac requires
an Apple Developer signature and a portable exe has no installer — so they
detect the new version and open the download page instead. Same UI either way.

**An update never touches a note.** Five independent layers stand in the way of
losing one:

1. **Separate vaults.** Installed, portable and development each keep their own
   notes, so neither a build you are testing nor a portable copy on a USB stick
   can open — or delete — the notes you actually keep.
2. **The seed guard.** Sample notes are written only when the vault was read
   *successfully* and came back *empty*. An unreadable vault disables the disk
   mirror entirely, shows a red bar, and offers to open the folder.
3. **A pre-update snapshot** into `backups/pre-update-<version>-<time>`, taken
   the moment before the installer runs, and never rotated away.
4. **A daily snapshot** into `backups/YYYY-MM-DD`, newest seven kept.
5. **The files themselves** — plain JSON in your profile, not beside the app.
   Uninstalling leaves them.

Full detail, including how to restore from a backup:
**[docs/UPDATING.md](docs/UPDATING.md)**.

---

## Architecture

```
electron/
  main.js             window, IPC, vault, snapshots, path guard, AppUserModelId
  preload.js          the only bridge — window.nebula.{storage,updates,paths,reveal}
  updater.js          auto (Windows installer) / manual (macOS, portable, dev)
  version-compare.js  pure semver comparison
src/js/
  main.js             boot: vault status -> store -> editor -> panels
  notes.js            NoteStore — the single source of note state
  disk-store.js       localStorage <-> disk mirror; returns the vault status
  storage.js          loadJson/saveJson + the saveHook the mirror installs
  bus.js              note-changed / note-opened
  editor.js           contenteditable + debounced autosave
  toolbar.js dock.js slash-menu.js shapes.js codeblock.js highlight.js
  ai-panel.js         webview tabs, isolated from note data
  updater.js about.js dialog.js icons.js theme.js seed-notes.js
```

Three rules the code is held to:

- **One store.** Every surface derives from `NoteStore`. No per-feature stores
  that can drift apart.
- **Data first, DOM second.** Saved content is never produced by serializing the
  page; the editor reads its own buffer.
- **The renderer passes keys, not paths.** The main process decides what a name
  means and rejects anything outside the vault, sibling-prefix escapes included.

The mind maps on the [documentation site](https://hero-999-dev.github.io/nebula-web/)
draw all of this — including which features only make sense in pairs, and what
happens between a keystroke and a file.

---

## Develop

```bash
npm install
npm run preflight   # START HERE — version, phase, what changed, what is stale
npm run dev         # dev app on its OWN profile
npm test            # 303 unit tests
npm run build && npm run smoke   # 153 checks against the real Electron app
npm run check:versions           # every surface agrees with package.json
npm run pack:win    # release/Nebula-Setup-*.exe + Nebula-portable-*.exe
npm run site        # rebuild site/index.html (docs + mind maps)
npm run icons       # rebuild build/icon.png + icon.ico from vector (Windows)
```

### Nebula Test.exe — the one to double-click

```bash
npm run pack:test
```

Builds **`Nebula Test.exe`** into the project root. Double-click it: same code,
but its own name in the title bar and Alt-Tab, its own blue-violet icon, its own
taskbar button, and its own notes in `Nebula-data` beside it. It cannot be
mistaken for — or write into — the installed Nebula, and it never updates itself.

Rebuild it after a change and double-click again. For a live-reload loop instead,
use `npm run dev`.

### Four ways to launch, four separate vaults

| Launched as | Notes live in |
|---|---|
| **Installed** — from Releases, into `%LOCALAPPDATA%\Programs\Nebula` | `%APPDATA%\nebula` |
| **Test** — `Nebula Test.exe` in the project root | `<repo>\Nebula-data` |
| **Portable** — `Nebula-portable-*.exe` from a release | `<folder of the exe>\Nebula-data` |
| **Dev** — `npm run dev` | `<repo>\.dev-profile` |

Electron derives its profile from the package name, so all four would be the
same directory if nothing intervened — and a portable build sitting in this
repo's `release/` folder really was autosaving into the installed app's notes.
`electron/user-data.js` decides; `tests/user-data.test.js` proves they never
collide. The app tells you which one it is on: click the version in the sidebar.

Double-click, from the repo root:

| File | What it opens |
|---|---|
| `Nebula Test.exe` | the **test build** — no terminal, own icon, own notes |
| `Open Nebula.bat` | the **dev** app, hot reload, on `.dev-profile` |
| `Fresh Nebula.bat` | resets `.dev-profile`, then the dev app |
| `Open portable build.bat` | the packed portable exe, on its own vault |

None of them touch the installed app's notes.

```bash
npm run fresh          # reset the DEV notes -> rebuild -> launch
npm run reset          # reset the dev notes (keeps AI logins)
npm run reset -- --all # also drop AI logins and old dated backups
npm run kill           # close a running Nebula (frees the exe for packing)
```

Every reset copies what it removes to `backups/reset-<timestamp>` first.
Touching the installed profile needs `npm run reset -- --installed --yes`.

Opening `vite preview` in a plain browser gives a demo banner: in-memory only.

---

## Release

```bash
npm run push        # patch;  -- minor | major | 0.5.2 | --notes "…"
```

Tests → smoke → build → doc freshness → version bump → `Log.md` → commit → tag
→ push. GitHub Actions builds Windows and macOS and publishes one Release; the
docs site is rebuilt and mirrored to `nebula-web`; the USB drive is synced if it
is plugged in.

Ritual, platform limits and the CI assertions that keep updates working:
**[docs/RELEASE.md](docs/RELEASE.md)**.

---

## Working on this project

The repository carries its own memory, because whichever CLI agent is open works
alone and nothing carries between sessions:

| File | What it holds |
|---|---|
| [AGENTS.md](AGENTS.md) | The rules: preflight, the finishing checklist, the traps |
| [HANDOVER.md](HANDOVER.md) | A cold-start guide for an agent that has never seen this |
| [memory.json](memory.json) | Version, phase, paths, invariants, history |
| [Log.md](Log.md) | What was asked and what was done, per release |
| [tests.md](tests.md) | What is tested, what it proves, what is knowingly not |
| [Prompt.md](Prompt.md) | One prompt that rebuilds the project from nothing |
| `site/index.html` | All of the above in one offline page, with mind maps |

`npm run preflight` prints the state of it. `npm run push` refuses to release
quietly if code moved and those files did not.

---

## Extensibility (wired, mostly unused)

| Hook | Purpose |
|---|---|
| `bus.js` | `note-changed`, `note-opened` — a new view subscribes instead of polling |
| `disk-store.js` | Per-note JSON mirror; returns a vault status the store trusts |
| `storage.js` `setSaveHook` | Any store that must reach disk |
| `window.nebula` | The only door to the main process — add a namespace, never a raw path |

Demo's graph, flashcards, palette, search and i18n plug in through these without
restructuring.
