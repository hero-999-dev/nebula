# Tests

What is tested, what each test proves, and what is knowingly untested.

| | |
|---|---|
| **Unit** | 61 passing — `npm test` (Vitest, jsdom) |
| **Electron smoke** | 22 passing — `npm run build && npm run smoke` (playwright-core, real app, throwaway profiles) |
| **Failing** | 0 |
| **CI** | `.github/workflows/test.yml` on push/PR · smoke + packaging assertions in `release.yml` |

Unit tests cover pure logic. The smoke test covers what jsdom structurally
cannot see: the preload bridge, the main process, the filesystem, and boot.

---

## Suites

| File | Tests | Proves |
|---|---|---|
| `tests/notes.test.js` | 8 | `NoteStore` seeds once (not once per note), creates/switches/updates, refuses to delete the last note, filters title + body |
| `tests/editor.test.js` | 30 | Toolbar actions, outline formats, indent, lists, underline styles, code blocks, shapes, slash menu |
| `tests/disk-store.test.js` | 6 | Rapid saves serialize per file, every mirrored file is valid JSON, deleting a note deletes *its* file, unchanged notes are skipped, boot loads from disk and survives one corrupt file, browser mode never throws |
| `tests/seed-guard.test.js` | 10 | The distinction between an empty vault and an unreadable one |
| `tests/version-compare.test.js` | 7 | `0.3.10 > 0.3.9`, `v` prefixes, pre-releases, unparseable tags refuse rather than guess |
| `tests/e2e/smoke.mjs` | 22 | The real app, three launches |

---

## The smoke test, check by check

Launch 1 — a fresh, healthy vault:

1. Window opens with the app shell · 2. window title · 3-5. the preload bridge
exposes `storage`, `updates`, `paths` + `reveal` · 6. the sidebar mark is the
crescent (two paths), not the ring the old `evenodd` geometry produced ·
7. a fresh vault seeds six notes · 8. they reach disk · 9. `storage/meta.json`
is stamped · 10. path-traversal reads are rejected through the real IPC handler
· 11. the updater reports a mode without crashing · 12-13. `paths` reports the
build channel and honours `NEBULA_USER_DATA` · 14. About lists all six rows ·
15. toolbar, slash menu, shapes and AI panel are wired · 16-17. opening the
code-blocks note renders a highlighted block.

Launch 2 — the same profile again:

18. the same six notes, not a second seeding · 19. the note files are byte-identical.

Launch 3 — a vault that cannot be read (`storage/notes` created as a *file*, so
`readdir` fails with ENOTDIR — a real error that is not ENOENT):

20. the red storage-error banner appears · 21. **nothing is seeded** ·
22. the vault is left exactly as it was.

---

## Log

### [2026-09-06] v0.3.8 — a portable build was writing to the installed app's notes

**Added `tests/user-data.test.js` (5 tests). Unit suite 61 → 66.**

The user double-clicked `Fresh Nebula.bat` expecting the development app and
asked whether that was what it opened. It was not: the file built and launched
the **portable** exe, and the portable exe was running on `%APPDATA%\nebula` —
the installed app's vault. Asked directly, it said so:

```
channel   portable
userData  C:\Users\<user>\AppData\Roaming\nebula
```

Electron derives `userData` from the package name, so an installed, a portable
and a dev launch all resolve to the same directory unless something intervenes.
`NEBULA_USER_DATA` covered dev; nothing covered portable. `electron/user-data.js`
now decides for all three, and a portable build keeps its notes in `Nebula-data`
beside its own exe — which is what "portable" should have meant anyway.

The tests pin the property that matters: the three launches never resolve to the
same directory, the override always wins, and an empty override is ignored
rather than resolving to nowhere.

**Verified against the real vault.** The six installed notes were hashed, the
repacked portable exe was launched and asked for its paths, then the notes were
hashed again: `identical: True`, and `release\Nebula-data\storage\notes` had six
files of its own.

### [2026-09-06] v0.3.7 — three themes, a vector icon, and one version

**Smoke 22 → 24.** The check that asserted the sidebar mark's path count is
gone — the mark itself is gone, because the window title bar shows the icon two
pixels above it. In its place: the theme picker offers exactly `main, dark,
light`, `main` is what a fresh profile gets, and switching to light actually
repaints (`body` becomes `rgb(246, 241, 231)`) and switching back restores.
Asserting the attribute alone would pass on a theme whose tokens never load.

**A bug the light theme had been hiding.** Making a dark theme the default
exposed that `.note-row` is a `<button>` that was never given a colour, a
background, a width or an alignment — every note row was the browser's default
grey pill with black text, and on cream that looked deliberate. Found by asking
the running app for computed styles rather than by looking at a screenshot:

```
button.note-row   color rgb(0, 0, 0)   background rgb(240, 240, 240)
```

The same probe now returns `[]` for every `button, select, input, textarea`
whose colour or background is still a UA default. `color-scheme` is set per
theme as well, so scrollbars, carets and focus rings follow.

**Version drift is now a check, not a habit.** `package.json` said 0.3.6, the
committed docs site 0.3.5, README and Prompt 0.3.4. `scripts/versions.js`
stamps every surface from `package.json` and compares them; `npm run push`
refuses to commit when they disagree, preflight prints the table, and CI runs
`npm run check:versions`. The release also builds the site *before* the commit,
so the committed page and the published page are the same file.

**The .ico had no images in it.** The first run wrote a 200-byte file: a header
and nine entries pointing at nothing, because PowerShell unrolled the byte
array and `BinaryWriter.Write` silently took a different overload. `Write-Ico`
now compares the file size against the sum of its parts and throws.

### [2026-09-06] v0.3.5 — Electron smoke suite, About, icon

**Added `tests/e2e/smoke.mjs` (22 checks).** First Electron-level coverage in
this repo. It exists because three of the four bugs found in the previous two
sessions were invisible to unit tests: `window.prompt` behaviour, a preload
bridge, and an installer that opened a wizard instead of installing.

**Verified the seed guard by breaking it.** `storage:list` was temporarily
patched to return `{ok:true, files:[]}` on every error — the pre-v0.3.0
behaviour — and the suite went red on exactly the two checks that should:

```
x unreadable vault shows the storage error banner
x unreadable vault seeds nothing - 6 notes
20/22 checks passed
```

The guard was restored and the suite returned to 22/22. A test that has never
been seen to fail is a claim, not a check.

**Two smoke checks were wrong on first run and are worth recording:**
`paths point at the throwaway profile` compared a value with itself — always
true, and it would have passed even if the profile override had been ignored.
It now asserts `userData === profile` and `storage === profile/storage`. And
`a seeded code block rendered` assumed the code-blocks note was open at boot;
the welcome note is. The check now opens the note first, which is also a real
test of note switching.

**Unit suite unchanged at 61.** The About panel and the icon fix are Electron-
and packaging-level; covering them in jsdom would test a mock.

**Two things only a screenshot caught.** The About modal rendered at 420 px
instead of 580: `.modal-wide` and `.modal` are both single-class selectors, and
`editor.css` loads after `app.css`, so source order won — the selector is now
`.modal.modal-wide`. And the published docs page was always one release behind,
because `npm run push` built the site *before* the version bump. Neither is
visible to any assertion we have; both were found by looking at the output.

### [2026-09-06] v0.3.4 — sidebar mark

No new tests; the fix is geometry. Verified by rendering the mark at 18, 22, 44
and 120 px in a headless browser and looking at it, before and after. Smoke
check 6 now guards it: the crescent is one closed path plus a sparkle, so a
regression to the two-circle form changes the path count.

### [2026-09-05] v0.3.0 — the vault status contract

**Added `tests/seed-guard.test.js` (10 tests).** Before this, "the note list is
empty" was the only signal `NoteStore` had, and `storage:list` turned every
failure into an empty list — so a permission error looked exactly like a first
run and the app wrote six sample notes over a vault it could not read.

The tests pin the distinction: a genuinely empty vault seeds; a vault with notes
does not; a failed listing seeds nothing, disables the mirror and **writes
nothing to disk**; a throwing listing behaves the same; an I/O error while
reading a listed note disables the mirror and does not overwrite `localStorage`
with a partial vault; a file that vanished between listing and reading is
survivable; notes that exist only in `localStorage` are pushed to disk rather
than reseeded; a browser preview still seeds, because there is nothing to lose.

**Added `tests/version-compare.test.js` (7 tests).** The manual update path
decides whether to nag from a GitHub tag name alone. `0.3.10` vs `0.3.9` sorts
correctly, `v` prefixes are ignored, a pre-release sorts below its release, and
an unparseable tag returns null rather than a wrong answer.

**Unit suite 44 → 61.**

---

## Bug backlog

| ID | What | Found by | Severity | Status |
|---|---|---|---|---|
| N-001 | Dev and installed apps shared `%APPDATA%\nebula`; `npm run reset` deleted the real notes | claude (audit) | **High** | Fixed v0.3.0 — `.dev-profile` |
| N-002 | An unreadable vault seeded six sample notes over it | claude (audit) | **High** | Fixed v0.3.0 — vault status contract |
| N-003 | No snapshot before an update installed | claude (audit) | Medium | Fixed v0.3.0 — `backups/pre-update-*` |
| N-004 | `quitAndInstall(false, …)` opened the NSIS wizard and waited for clicks | claude (live update test) | **High** | Fixed v0.3.2 — silent install |
| N-005 | macOS CI job packaged before building; every release failed | claude (first release) | Medium | Fixed — `npm run build` added to the job |
| N-006 | Sidebar mark rendered as a ring; `evenodd` cannot subtract a circle that extends outside | user (screenshot) | Low | Fixed v0.3.4 — single arc path |
| N-007 | Taskbar and shortcut icons were Electron's; `signAndEditExecutable: false` disables rcedit | user ("logo yok bulamıyorum") | Medium | Fixed v0.3.5 |

## Knowingly untested

- **macOS end to end.** No Mac available. The DMG builds in CI; the manual
  update path is unit-tested through `version-compare`, but nobody has watched
  the banner appear on a Mac.
- **The AI panel webviews.** They load third-party sites; asserting on them
  would test Anthropic's and Google's markup, not ours.
- **Long editing sessions.** No fuzz or property testing over the editor's
  contenteditable handling.
- **Update rollback.** There is no downgrade path; the backup is the answer.
