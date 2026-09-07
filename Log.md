# Nebula release log

One entry per release. Written by `npm run push`; edit freely afterwards.












## [2026-09-07 05:45] v0.4.1 - by claude

Eight fixes from the test build: lists you can leave, a to-do you can undo, a font menu that works, equations in a frame, and shapes that really go behind the text.

* (no commits since the last release)

---

## [2026-09-07 00:04] v0.4.0 - by claude

Editor pass: lists that stop cutting each other, an escapable inline format, real typeset equations, six more languages, sharper icons.

* Editor: lists, inline formats, equations, languages, icons, menus
* README: 69 unit tests

---

## [2026-09-06 16:33] v0.3.9 - by claude

A test build you can double-click, with its own name, icon and notes.

* Add a test build you can double-click
* README: 66 unit tests, and the vault separation covers portable too

---

## [2026-09-06 16:10] v0.3.8 - by claude

Portable builds keep their own notes; the repo's double-click files open the dev app, not a packed build.

* A portable build was writing to the installed app's notes
* README: three themes, not two, and the current check counts

---

## [2026-09-06 15:32] v0.3.7 - by claude

Main violet theme, a crisp icon at every size, and the version now agrees everywhere.

* Three themes, a vector icon, and one version number
* publish-site: follow the renamed gate directory

---

## [2026-09-06 14:18] v0.3.6 - by claude

About panel readability, and the docs site now carries the version it was released with.

* About: give the modal its real width, and wrap paths at separators
* release: build the docs site after the version bump, and let the clone push

---

## [2026-09-06 14:06] v0.3.5 - by claude

The app is findable again: real icon on the exe, shortcuts and taskbar, plus an About panel that names every folder it uses.

* Findability and self-documentation

---

## [2026-09-06 09:31] v0.3.4 - by claude

Sidebar logo was rendering as a ring instead of a crescent.

* Sidebar mark: draw the crescent as one closed path

---

## [2026-09-06 01:06] v0.3.3 - by claude

No app changes; this release exists so the silent-install path can be verified from an installed 0.3.2.

* (no commits since the last release)

---

## [2026-09-06 01:00] v0.3.2 - by claude

Update installs silently: the previous build opened the NSIS wizard and waited for clicks instead of just installing.

* updater: install silently
* release: do not shell out to node, and space Log.md entries

---

## [2026-09-06 00:53] v0.3.1 - by claude

Verifying the update path end to end: this release exists so an installed 0.3.0 can update to it.

* (no commits since the last release)

---

## [2026-09-06 01:00] v0.3.0 - by claude

First public release. Nebula moves from a locally-built portable exe to a
published app that keeps itself up to date.

### Added
* **GitHub releases** — `.github/workflows/release.yml` builds the Windows
  installer + portable exe and the macOS universal DMG/ZIP on every `v*` tag and
  publishes one Release. `.github/workflows/test.yml` runs tests on push/PR.
* **In-app updates** — `electron/updater.js` in two modes behind one renderer
  contract: `auto` (packaged Windows installer, via `electron-updater`) and
  `manual` (macOS, portable exe, dev — GitHub API check, opens the download
  page). Nothing downloads or installs without a button press.
* **Update card** — `src/js/updater.js` plus the panel in `index.html`;
  available / downloading / ready / manual / error, with a version line and a
  **Check for updates** button in the sidebar.
* **`npm run push`** — `scripts/release.js`: test, build, bump, `Log.md`,
  commit, tag, push, then mirror to the USB drive.
* **`npm run sync-flash`** — `scripts/sync-flash.js`: finds the drive by volume
  label (never a hard-coded letter) and mirrors the project, treating robocopy
  exits under 8 as success.
* **App icon** — `build/make-icon.ps1` crops the black frame off
  `crescent-purple-star.png` and masks the rounded corners to real transparency;
  `build/icon.png` is now 1024². The sidebar mark matches it.

### Fixed — three ways a note could have been lost
* **Dev and installed apps shared one profile.** Both resolved to
  `%APPDATA%\nebula`, so `npm run dev` / `npm run reset` / `Fresh Nebula.bat`
  operated on the installed app's notes. `npm run dev` now runs on
  `<repo>/.dev-profile` (`scripts/paths.js`), and `reset` needs
  `--installed --yes` to go near the real profile.
* **An unreadable vault looked like a first run.** `storage:list` turned every
  error into an empty list, and `NoteStore` seeded six sample notes whenever the
  list was empty. `storage:list` now separates ENOENT from a real failure,
  `initDiskStorage()` returns `{bridge, ok, empty}`, and seeding requires a
  vault that was read successfully *and* came back empty. On failure the disk
  mirror is switched off entirely and a red bar offers to open the folder.
* **No snapshot before an update.** `snapshotStorage({label})` now writes
  `backups/pre-update-<version>-<time>` immediately before `quitAndInstall`.
  Only dated backups rotate; labelled ones stay.

### Also
* NSIS installer added as the primary Windows target (portable cannot
  auto-update); `deleteAppDataOnUninstall: false` so even uninstalling keeps
  notes. Portable and installer artifacts are now versioned.
* `storage/meta.json` records the schema and the app version that last opened
  the vault.
* `electron-updater` is a real runtime dependency, marked `external` in
  `vite.config.js`; CI asserts both `latest.yml` and its presence in the asar,
  because either failing is silent.
* Docs: `docs/UPDATING.md` (what users see, where notes live, restoring a
  backup) and `docs/RELEASE.md` (the push ritual, platform limits).

### Tests
* `npm test` — **61 pass** (was 44): new `tests/seed-guard.test.js` (10) covering
  empty vs unreadable vaults, partial read failures, the localStorage-only
  upgrade path and the browser preview; new `tests/version-compare.test.js` (7)
  covering `0.3.10 > 0.3.9`, `v` prefixes, pre-releases and unparseable tags.
* Verified by hand: `npm run pack:win` produces `latest.yml` naming the
  installer, `app-update.yml` pointing at `hero-999-dev/nebula`,
  `electron-updater` inside `app.asar`, and the packaged app boots on a throwaway
  profile and seeds its six notes.

---
