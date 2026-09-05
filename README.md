# Nebula

Calm notes with a real editor. Windows and macOS desktop app.

**v0.3.0 — Editor v3.** Downloads: **[Releases](https://github.com/hero-999-dev/nebula/releases/latest)**

- **Look & feel:** Ember palette (Paper / Ember dark, clay accent, serif editor)
- **Stack:** Electron 33 + Vite 6, modular `src/js/`, event bus, per-note JSON on disk
- **Editor v3:**
  - **6-button pad** on the header line — dock the editing bar **top / right /
    bottom / left** (press again for full), toggle the **AI panel**,
    **hide/show** the editing bar
  - **Double-rail frame** around the editor (two parallel lines on every side)
  - **Two-row toolbar** — undo/redo · bulleted/numbered/to-do · outline format
    (P/H1–H3/quote/code) · indent ± (also Tab/Shift+Tab) · save (Ctrl+S) ·
    print (Ctrl+P) · cut/copy/paste · shapes ‖ font · size · text color (Ctrl+T)
    · highlight (Ctrl+H) · **B I U** (▾ underline styles) · strikethrough ·
    code (Ctrl+E) · equation (Ctrl+Q) · 4 align modes
  - **Right-click a selection** → compact mini toolbar
  - **`/` slash menu** — Notion-style blocks
  - **Markdown code blocks** with a language picker and syntax colors
    (JS/TS/Python/HTML/CSS/JSON/SQL/Bash/MD)
  - **Shapes float freely** over the whole note (send behind / above text)
  - **AI panel** — Claude/Gemini/ChatGPT/Mistral/DeepSeek/Copilot/Perplexity
    tabs, custom sites, resizable
  - **6 seed notes**, one per feature, so every function can be checked by hand
- **Siblings:** `../Nebula Demo/` — full feature reference · `../Ember/` — design reference

---

## Install

| You have | Get |
|---|---|
| **Windows** | `Nebula-Setup-X.Y.Z.exe` from [Releases](https://github.com/hero-999-dev/nebula/releases/latest). Installs per user, no admin. **Updates itself.** |
| **Windows, no install** | `Nebula-portable-X.Y.Z.exe`. Runs from a folder or USB stick. Does not auto-update. |
| **macOS** | `Nebula-X.Y.Z-mac.dmg`. Drag to Applications; first launch **right-click → Open** (the build is unsigned). |

## Updates

The installed Windows app tells you when a new version is out and updates in
place when you press **Update** → **Restart and install**. macOS and the
portable build point you at the download page instead — Apple will not let an
unsigned app replace itself.

**An update never touches your notes.** They live in your user profile
(`%APPDATA%\nebula`), not next to the app, and Nebula copies the whole vault
into `backups/pre-update-…` immediately before installing. Uninstalling leaves
them too. Full detail: **[docs/UPDATING.md](docs/UPDATING.md)**.

---

## Develop

```bash
npm install
npm run dev        # dev app on its OWN profile — see below
npm test           # unit tests
npm run build      # renderer + main
npm run pack:win   # release/Nebula-Setup-*.exe + Nebula-portable-*.exe
npm run icons      # rebuild build/icon.png from the source mark (Windows)
```

### The dev app and the installed app are separate

Electron derives its profile from the package name, so a dev run and the
installed Nebula would share `%APPDATA%\nebula` — and `npm run reset` would
delete the notes of the app you actually use. `npm run dev` therefore sets
`NEBULA_USER_DATA` to `<repo>/.dev-profile` (see `scripts/paths.js`), and every
reset targets that profile:

```bash
npm run fresh          # reset the DEV notes -> rebuild -> launch
npm run reset          # just reset the dev notes (keeps AI logins)
npm run reset -- --all # also drop AI logins + old dated backups
npm run kill           # close a running Nebula (frees the exe for packing)
```

Resetting always copies what it removes to `backups/reset-<timestamp>` first.
Touching the installed app's profile requires `npm run reset -- --installed --yes`.

Or double-click **`Fresh Nebula.bat`**.

Browser `vite preview` shows a demo banner (in-memory only).

## Release

```bash
npm run push        # test -> build -> bump -> tag -> push -> GitHub builds and publishes
```

Full ritual, platform limits and the two CI assertions that keep updates
working: **[docs/RELEASE.md](docs/RELEASE.md)**.

## Extensibility (wired, not built yet)

| Hook | Purpose |
|------|---------|
| `bus.js` | `note-changed`, `note-opened` — future modules subscribe |
| `disk-store.js` | Per-note JSON mirror; returns a vault status the store trusts |
| `storage.js` | `saveHook` for more keys when features land |

Features from Demo (graph, cards, palette, i18n…) plug in incrementally without
restructuring.
