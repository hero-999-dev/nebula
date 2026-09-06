# Nebula

Calm notes with a real editor. An Electron desktop app for **Windows and macOS**
that keeps every note as a plain JSON file in your own profile, and updates
itself without ever touching them.

**Version v0.3.7** ·
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
  font · size, any number you type · text colour (`Ctrl+T`) · highlight
  (`Ctrl+H`) · **B I U** with five underline styles · strikethrough · inline
  code (`Ctrl+E`) · equation (`Ctrl+Q`) · four alignments. The font and size
  boxes show what the caret is actually in.
- **Right-click a selection** for a compact mini toolbar.
- **`/` opens a block menu** — headings, lists, to-do, quote, code, divider,
  shapes.
- **Code blocks** are markdown-style with a language picker and syntax colours
  for JS, TS, Python, HTML, CSS, JSON, SQL, Bash and Markdown.
- **Shapes float over the whole note.** Rectangles, ellipses and diamonds drag
  anywhere, resize from a corner, recolour from dots and hold editable text —
  above or behind the words, which never reflow.
- **An AI panel** of embedded chat webviews (Claude, Gemini, ChatGPT, Mistral,
  DeepSeek, Copilot, Perplexity, plus any site you add), resizable, with a
  side-scrolling tab strip. It touches no note data, by design.
- **Six seed notes** on first run, one per feature, so everything can be
  checked by hand.

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

1. **Separate profiles.** `npm run dev` runs on `<repo>/.dev-profile`, so
   development cannot open — or delete — the notes you actually keep.
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
npm test            # 61 unit tests
npm run build && npm run smoke   # 24 checks against the real Electron app
npm run check:versions           # every surface agrees with package.json
npm run pack:win    # release/Nebula-Setup-*.exe + Nebula-portable-*.exe
npm run site        # rebuild site/index.html (docs + mind maps)
npm run icons       # rebuild build/icon.png + icon.ico from vector (Windows)
```

### The dev app and the installed app are separate

Electron derives its profile from the package name, so without an override a
dev run and the installed Nebula would share `%APPDATA%\nebula` — and
`npm run reset` would delete the notes you use. `scripts/paths.js` is the single
answer to "which profile am I touching":

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
