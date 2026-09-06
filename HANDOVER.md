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
5. **Profiles.** Electron derives `userData` from the package name; without
   `NEBULA_USER_DATA` the dev app and the installed app share `%APPDATA%\nebula`.
   `scripts/paths.js` is the single answer to "which profile am I touching".
6. **`quitAndInstall(true, true)`** — the first argument must be `true`, or the
   NSIS wizard opens and waits for clicks after the app has already quit.
7. **`npx asar extract-file`** writes into the current directory. Run it in a
   temp folder.
8. **SVG subtraction.** `fill-rule="evenodd"` over two overlapping circles fills
   the cutter's outside too. A crescent is one closed path: big arc out, small
   arc back.

---

## 7. Where things live at runtime

| | Windows | macOS |
|---|---|---|
| Application | `%LOCALAPPDATA%\Programs\Nebula` | `/Applications/Nebula.app` |
| Profile | `%APPDATA%\nebula` | `~/Library/Application Support/nebula` |
| Notes | `<profile>\storage\notes\<id>.json` | same |
| Backups | `<profile>\backups\` | same |
| Dev profile | `<repo>\.dev-profile` | same |

The app shows all of these itself: click the version in the sidebar footer.

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
