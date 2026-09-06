# Agent instructions — Nebula

Every AI agent working on this repository follows this document. Read it fully
before touching a file.

New to the project entirely? Read **[HANDOVER.md](HANDOVER.md)** first — it fits
in one context window and explains the codebase. This file is the *rules*.

---

## Before you start — mandatory preflight

```bash
npm run preflight
```

It prints the version, the current phase from `memory.json`, the last entries in
`Log.md`, every file changed since the last release, and whether the tracking
files have kept up.

**Then state, in your response:**

> Working on vX.Y.Z. Last session: [what]. Files changed: [summary]. I will now [plan].

Only after that, edit anything.

**Why this exists:** whichever CLI is open works alone, and nothing carries
between sessions except this repository. The tracking files *are* the handover.
Skipping preflight means the next agent — possibly you, next week — starts blind.

---

## While you work

| Command | When |
|---|---|
| `npm run dev` | Hot-reload dev app **on its own profile** (`.dev-profile`) |
| `npm test` | Unit tests — after every logic change |
| `npm run build && npm run smoke` | Electron smoke — after anything touching `electron/`, the preload bridge, or boot |
| `npm run pack:win` | Local installer + portable exe |
| `npm run site` | Rebuild the local docs site |

**Never** run `npm run reset -- --installed`. Everything else targets
`.dev-profile` and cannot reach the user's real notes.

---

## Finishing — the checklist

Every session that changed code ends with **all** of these:

- [ ] `npm test` passes
- [ ] `npm run build && npm run smoke` passes (skip only if nothing under `electron/`, `src/` or `tests/` changed)
- [ ] **`Log.md`** — what was asked and what was done, under `## [YYYY-MM-DD HH:MM] vX.Y.Z - by <agent>`
- [ ] **`tests.md`** — which tests were added or changed and what they prove
- [ ] **`memory.json`** — version, `currentPhase`, `next`, `history[]`
- [ ] **`Prompt.md`** — the "current state" section, if the product changed
- [ ] **`README.md`** — if structure, scripts or workflow changed
- [ ] **`HANDOVER.md`** — if a new trap or a new command appeared
- [ ] `npm run push` when the user says **push** — never on your own initiative

`npm run push` re-checks the tracking files and refuses to release quietly if
code moved and `Log.md` / `tests.md` / `memory.json` did not.

---

## Releasing

Releases are user-initiated. When the user says **"push"**:

```bash
npm run push                 # patch;  -- minor | major | 0.5.2 | --notes "…"
```

The chain: tests → smoke → build → doc freshness → version bump → `Log.md` →
commit → tag → push → GitHub Actions builds Windows + macOS and publishes one
Release → local docs site rebuilt → `nebula-web` mirror updated → USB drive
mirrored if plugged in.

Details and platform limits: **[docs/RELEASE.md](docs/RELEASE.md)**.

---

## Things that will bite you

These are all real, all found the hard way. Each one is silent — the app builds,
installs and runs while being wrong.

| Trap | Rule |
|---|---|
| `win.signAndEditExecutable: false` | Never set it. It disables **rcedit** as well as signing, so the exe keeps Electron's icon and version info — which is what put the Electron logo on the taskbar and shortcuts. |
| `electron-updater` bundling | Stays in `dependencies` **and** in `rollupOptions.external` in `vite.config.js`. Bundle it and updates silently stop working. |
| `latest.yml` | Only generated because `build.publish` is configured. Remove that block and every installed copy stops seeing releases, with no error anywhere. CI asserts the file exists. |
| Seeding | `NoteStore` may seed only when the vault was read successfully *and* came back empty. "The list is empty" is not enough — that is how a permission error used to overwrite someone's notes. |
| Profiles | Electron derives `userData` from the package name, so **installed, portable and dev all resolve to the same directory** unless `electron/user-data.js` intervenes. A portable exe built into `release/` was autosaving into the installed app's notes. Never add a fourth way to launch without adding it there and to `tests/user-data.test.js`. |
| `quitAndInstall(false, …)` | Opens the NSIS wizard and waits for clicks. Must be `true` — the user already consented by pressing the button. |
| `evenodd` subtraction | Two overlapping circles do not subtract; the cutter's outside is odd too and fills. Draw a lune as one closed arc path. |
| `npx asar extract-file` | Writes into the **current directory**. Run it in a temp folder — it once overwrote this repo's `package.json`. |
| Version numbers in prose | Never type one. `package.json` is the source; `scripts/versions.js` stamps README, Prompt, memory and the site, and `npm run push` refuses to commit if they disagree. They had drifted three versions apart. |
| Unstyled controls | A `<button>` with no `color`/`background` is the browser's grey-on-black default, which passes unnoticed on a light theme and is broken on a dark one. Probe the running app for `rgb(0, 0, 0)` / `rgb(240, 240, 240)` after any theme work. |
| The icon | Built from vector geometry at each shipped size by `build/make-icon.ps1`. Do not let electron-builder derive the `.ico` from one large PNG — three resamplings later, 16px is mush. |

---

## File map

| File | Purpose |
|---|---|
| `memory.json` | Shared state — read first, every session |
| `Log.md` | What was asked and what was done, per release |
| `tests.md` | Test log and bug backlog |
| `Prompt.md` | Master prompt to rebuild the project from nothing |
| `HANDOVER.md` | Guide for a CLI agent arriving cold |
| `AGENTS.md` | This file — the rules |
| `README.md` | The whole project, for a human |
| `docs/RELEASE.md` | The push ritual, platform limits |
| `docs/UPDATING.md` | What a user sees; where notes live; restoring a backup |
| `scripts/preflight.js` | Pre-session review |
| `scripts/release.js` | The push ritual |
| `scripts/build-site.js` | Local docs site + mind maps |
| `scripts/publish-site.js` | Pushes that site to `nebula-web` |
| `scripts/sync-flash.js` | Mirrors the project to the USB drive |
| `site/index.html` | Generated — never edit by hand |
