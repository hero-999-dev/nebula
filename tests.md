# Tests

What is tested, what each test proves, and what is knowingly untested.

| | |
|---|---|
| **Unit** | 138 passing — `npm test` (Vitest, jsdom) |
| **Electron smoke** | 50 passing — `npm run build && npm run smoke` (playwright-core, real app, throwaway profiles) |
| **Failing** | 0 |
| **CI** | `.github/workflows/test.yml` on push/PR · smoke + packaging assertions in `release.yml` |

Unit tests cover pure logic. The smoke test covers what jsdom structurally
cannot see: the preload bridge, the main process, the filesystem, and boot.

---

## Suites

| File | Tests | Proves |
|---|---|---|
| `tests/notes.test.js` | 13 | `NoteStore` seeds once (not once per note), creates/switches/updates, refuses to delete the last note, filters title + body, and adds the guide to an older vault exactly once without touching what is there |
| `tests/editor.test.js` | 39 | Toolbar actions, outline formats, indent, underline styles, code blocks, shapes, slash menu, icons, the font stacks, and the guide note's completeness |
| `tests/lists.test.js` | 23 | The tree Chromium's list commands actually leave behind, and leaving a list from an empty item |
| `tests/inline-format.test.js` | 18 | Enter and Backspace out of an inline wrapper |
| `tests/highlight.test.js` | 14 | Per-language tokens, and that only SQL is case-insensitive |
| `tests/disk-store.test.js` | 6 | Rapid saves serialize per file, every mirrored file is valid JSON, deleting a note deletes *its* file, unchanged notes are skipped, boot loads from disk and survives one corrupt file, browser mode never throws |
| `tests/seed-guard.test.js` | 10 | The distinction between an empty vault and an unreadable one |
| `tests/user-data.test.js` | 8 | Which vault each build channel gets, and which one may replace itself |
| `tests/version-compare.test.js` | 7 | `0.3.10 > 0.3.9`, `v` prefixes, pre-releases, unparseable tags refuse rather than guess |
| `tests/e2e/smoke.mjs` | 50 | The real app, six launches |

---

## The smoke test, check by check

**Launch 1 — a fresh, healthy vault (1-20).**
The window opens and is titled · the preload bridge exposes `storage`,
`updates`, `paths` + `reveal` · the theme picker offers main / dark / light,
starts on main, and repaints both ways · a fresh vault seeds exactly one note
and it reaches disk · `storage/meta.json` is stamped · path-traversal reads are
rejected through the real IPC handler · the updater reports a mode without
crashing · `paths` reports the build channel and honours `NEBULA_USER_DATA` ·
About lists all six folders · toolbar, slash menu, shapes and AI panel are
wired · **the guide is the starter note, it carries a sample for every language
the picker offers, and none of them renders flat grey**.

**Launch 2 — the same profile again (21-22).**
The same notes, not a second seeding, and the note files are byte-identical.

**Launch 3 — a scratch profile, driving the editor (23-42).**
A numbered list started under a bulleted one is its sibling, not buried in its
last item · Enter on an empty list item ends the list · Backspace on one leaves
the list instead of merging up · the to-do button toggles a line on and back
off · inline code wraps a selection and Enter at the end of it starts a plain
line · the font menu lists fifteen faces, each drawn in its own type, including
the four the user named, and picking one with only a caret restyles the line and
relabels the button · the equation editor opens, previews as you type, typesets
into the note with a border like inline code, and is still typeset after
switching notes and back · a shape's bar opens on selection and closes when the
note changes · send-behind moves the shape onto the layer *under* the text at
full opacity, bring-above returns it, and ✕ deletes it and really closes the bar
(computed `display`, not just the attribute) · C, C++, C#, Java, Dart and Ruby
are offered in the language list.

**Launches 4 and 5 — a vault that predates the guide (43-46).**
A profile holding one hand-written note file. The guide is added and is what
opens; the note that was already there is byte-identical afterwards; a second
launch adds nothing. This is the path that runs on a machine already using
Nebula, where seeding never fires because the vault is not empty.

**Launch 6 — a vault that cannot be read (47-50)**, `storage/notes` created as a
*file* so `readdir` fails with ENOTDIR — a real error that is not ENOENT:
the red storage-error banner appears · **nothing is seeded and no guide is
added** · the vault is left exactly as it was.

---

## Log

### [2026-09-07] v0.4.2 — one note, and a sample for every language

**Unit 135 -> 138, smoke 44 -> 50.**

**One starter note.** There were six or seven `Test ·` notes for the test build
and a different two-note set for an installed one. Two problems, both reported:
whatever you were looking for was in the note you had not opened, and the two
sets drifted apart. There is now a single `Welcome to Nebula Guide` — welcome,
then eight numbered sections, each with something to try — and **every build
seeds the same one**. `seedFor` and `HELP_NOTES` are gone.

**"I still don't see examples for all the code languages."** Two causes, and
only one of them was the note:

1. **TypeScript and Bash had no sample.** Thirteen of the fifteen languages did.
   The unit test asserted `blocks.length >= 7` and that each language appeared
   once — which fifteen-minus-two satisfies perfectly. It now compares the set
   of samples against `Object.keys(LANGS)`, so a language added without a sample
   fails immediately, and the smoke test does the same against the `<select>`
   the user actually sees.
2. **Seeding only ever happens on an empty vault** — the rule that stops a
   failed read from looking like a first run. Anyone already using Nebula was
   therefore never going to see any of this, in any release. `ensureGuide` fixes
   that: on a vault that was read successfully it ADDS the guide, once per
   `GUIDE_VERSION`, opens it, and touches nothing else. Deleting the guide keeps
   it deleted until the guide itself changes.

Two smoke launches were added for exactly that path: a profile with one
hand-written note file gets the guide added, the guide is what opens, the
existing note file is byte-identical afterwards, and a second launch adds
nothing. The unreadable-vault launch still ends with **0 notes** — `ensureGuide`
is gated on the same `disk.ok` as seeding.

**The guide's own checks:** every sample decodes, highlights, and produces at
least one token in the running app (a language whose rules fail to load paints
nothing and reads as flat grey — which is what the user would see); all five
underline styles appear; every equation carries `data-tex` rather than a frozen
rendering; the behind-shape is on the behind *layer*, not just wearing the class.

### [2026-09-07] v0.4.1 — the eight things 0.4.0 still got wrong

**Unit 114 → 135, smoke 34 → 44.** No new suites; the new checks live where the
behaviour does.

**Two fixes shipped in 0.4.0 never worked, and the tests that "covered" them
passed anyway.**

- The ✕ on the shape bar. `select(null)` sets `hidden` on `#shape-bar` — but
  `hidden` is only `display: none` in the *user-agent* stylesheet, and
  `.shape-bar { display: flex }` is an author rule, so it won. The bar stayed on
  screen with nothing to act on. The old check asserted `bar.hidden`, which was
  `true` the whole time; it was measuring the attribute, not the outcome. It now
  asserts the **computed display**, and `app.css` closes the whole class with
  `[hidden] { display: none !important }` — two elements had already been
  patched one at a time for the same reason.
- "Send behind text" only toggled a class. Everything lived on one overlay with
  `z-index: 3`, so a shape could never get under the text; the visible effect
  was `opacity: 0.9`, which reads as "faded", not "behind". There are now two
  layers, and the button *moves* the shape between them. The check compares the
  computed z-index of the layer against the paragraph's and asserts the shape is
  still fully opaque.

**Leaving a list.** Enter on an empty item added another item; Backspace merged
it up into the line above. `exitListOnEmptyItem` ends the list, splitting it when
the item was in the middle so the items below stay a list, in order. Nested
lists are left to the browser — there the right answer is outdent, not exit.

**The to-do button was one-way**: a mis-click could not be undone. It toggles
now, and keeps the indent level across the change.

**The font picker never worked at all.** It was an `<input list="font-list">`.
A `<datalist>` cannot be styled, so all fifteen faces rendered identically — the
user's "they all come out in one row, always the same". Worse, picking one only
fired `change`, and `execCommand('fontName')` with a collapsed caret has nothing
to apply to, so nothing happened. It is now a real menu, each row set in its own
face, and with only a caret it sets the whole line.

**And a bug the smoke test caught in that very fix:** the preview face was
written as `style="font-family:${stack}"`, but stacks contain double quotes
(`"Segoe UI"`), which end the attribute early. Twelve of the fifteen rows had no
font at all. Assigned as a property now.

```
x the font menu lists faces, each drawn in its own type - 15 fonts   <- before
+ the font menu lists faces, each drawn in its own type - 15 fonts   <- after
```

**Equations** get the same frame as inline code — a rendered formula with no
border dissolves into the sentence and there is nothing to aim at to reopen it.
The button's icon is now plainly √x; the old one crossed two strokes under the
radical, which read as a multiplication sign.

**Starter notes now depend on the build.** The test and dev builds seed the
seven-note per-feature checklist, including a new one for equations, fonts and
escaping a format; an installed or portable copy seeds the welcome note plus a
single help page with no "Check:" lines in it. `seedFor(channel)` decides, and
`NoteStore` takes the set as an argument rather than importing one.

**The six languages added in 0.4.0 had no samples.** C, C++, C#, Java, Dart
(Flutter) and Ruby are now in the code-blocks note, each written to exercise the
tokens its rules claim to know — a broken rule shows up as flat grey text there
rather than in a real note months later.

**Two ritual changes, on the owner's instruction.** `npm run push` now rebuilds
`Nebula Test.exe` after the tag, so the build defects get reported against is
never older than the release. That only works because `scripts/kill-nebula.js`
closes a running `Nebula Test.exe` as well — it covered `Nebula.exe` and the
versioned portable but not the one build most likely to be open, so every
`pack:test` ended in "close it and run this again". And releasing no longer
waits to be asked: see AGENTS.md → Releasing.

### [2026-09-07] v0.4.0 — eight editor defects, and two more found while fixing them

**Unit 69 → 114, smoke 24 → 34.** Three new suites: `lists.test.js` (13),
`inline-format.test.js` (18), `highlight.test.js` (14).

**Lists.** `execCommand('insertOrderedList')` on the line under a bulleted list
does not create a sibling — it buries the `<ol>` inside the last `<li>` of the
`<ul>`, which is why the two lists visibly cut into each other. `lists.js`
hoists it back out, splitting the outer list when the buried one was not last so
the order survives, merges genuinely-adjacent lists of the same kind, and leaves
real nesting alone. The tests are written as the exact HTML Chromium produces.

**Getting out of an inline format.** Moving the caret out of the wrapper before
Enter was not enough — Chromium carries a typing style across the break and
rebuilds the same element. Measured in the real app rather than assumed:

```
<p><span class="inline-code">plain</span></p>
<p><span class="inline-code">after</span></p>    <- what it produced
```

So Enter at the end of a wrapper is now handled outright: the next block is
built here and starts genuinely empty. Backspace at the start of a wrapper
strips the format and keeps the text. Lists are left alone — `<li>` has its own
Enter worth keeping.

**A colouring bug nobody had reported.** Every keyword list was compiled with
the `i` flag, and `combined()` applies `i` to the *whole* alternation if any
rule carries it — so `klass` (`/\b[A-Z]\w*\b/`) matched lowercase identifiers
and painted ordinary variables as class names. Only SQL is genuinely
case-insensitive; the rest are now case-sensitive, and a test pins it.

**Two things only the running app could show:**
- The shape bar never opened from the toolbar at all. `toolbar.js` called the
  imported `addShape` directly instead of the controller's, so the shape was
  added but never selected. It now goes through the controller and arrives
  selected, which is also what the button should have done from the start.
- The first smoke attempt at the Enter fix failed because the test clicked the
  editor after placing the caret, which moved it. `focus()` before setting the
  range, no click.

**Verified by looking:** the colour menu reports `scrollHeight > clientHeight`
as **false** — ten rows, all aligned, no scrollbar. The equation `\frac{a}{b} =
\sqrt{x^2+1}` is typeset in the note and still typeset after switching notes and
back, because it is regenerated from `data-tex`.

### [2026-09-06] v0.3.9 — a test build you can actually click

**Unit suite 66 → 69.** `appChannel` and `canSelfUpdate` are now functions with
tests rather than an `if` chain inside `main.js`, because the test build breaks
the assumption the old chain encoded: it *is* packaged, it *is* on Windows, and
it *is* portable, so "packaged and win32 and not portable" no longer identifies
the app that may replace itself. `canSelfUpdate` returns true for exactly one
channel, and the test asserts the other three are false by name.

**What the build actually is.** `npm run pack:test` produces `Nebula Test.exe`
in the project root: same code, packaged through `build-test.json` with its own
`productName`, `appId`, icon (iris rather than violet) and — being portable —
its own vault at `<repo>\Nebula-data`.

**One thing only a running window revealed.** `BrowserWindow({ title })` is
overwritten the moment the page loads, because `index.html` carries
`<title>Nebula</title>`. The test build's title bar therefore said "Nebula",
which is the single confusion the build exists to prevent. Windows was asked
rather than assumed:

```
ProcessName   MainWindowTitle
Nebula Test   Nebula            <- before
Nebula Test   Nebula Test       <- after page-title-updated is preventDefault'd
```

**Isolation verified against the real vault**, again: the six installed notes
were hashed, `Nebula Test.exe` was launched and asked for its paths
(`channel: test`, `userData: <repo>\Nebula-data`), and the notes were hashed
again — `identical: True`, with six notes of its own in the test vault. Both
apps were then run at once: two windows, two titles, two icons, two taskbar
buttons.

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
