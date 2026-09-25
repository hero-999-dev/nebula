# Prompt.md — rebuild Nebula from nothing

One prompt that recreates this project in a fresh AI session. Paste the block
below. The "current state" section at the end is what changes each release —
keep it accurate.

---

## The prompt

```text
Build "Nebula": a calm, file-based desktop note app for Windows and macOS.

## Product

One window. A sidebar of notes, a title, and an editor. Everything else is in
service of writing in that editor. It is deliberately NOT a feature pile — the
reference build it descends from (Notion + Obsidian + Excel + Xmind + Anki +
Discord in one app) proved that shape works but is exhausting to maintain, so
this rewrite keeps the plumbing and re-earns each feature one at a time.

Look: serif content, sans chrome, one accent. Three themes and only three —
**Main**, a violet dark theme that is the app's own identity and the default;
**Dark**, warm paper-and-ink inverted; **Light**, the same warm palette upright.
The app icon is the Main accent, so the thing in the taskbar and the thing on
screen are obviously the same product.

### The editor is the product

- A **six-button pad** on the header line docks the editing bar top / right /
  bottom / left (press the active side again for full width), toggles the AI
  panel, and hides the bar entirely. The layout survives a restart.
- A **two-row toolbar**: undo/redo · bulleted, numbered and to-do lists ·
  outline format (paragraph, H1-H3, quote, code) · indent ± (also Tab and
  Shift+Tab) · save (Ctrl+S) · print (Ctrl+P) · cut/copy/paste · shapes ‖
  a font menu (each face previewed in its own type) · size (any number, not a
  fixed list) · text colour (Ctrl+T) · highlight (Ctrl+H) · B I U with underline
  styles (single, double, bold, wavy, dashed) · strikethrough · inline code
  (Ctrl+E) · equation (Ctrl+Q, typeset with KaTeX and framed like inline code) ·
  four alignments. The font button and the size box show what the caret is
  actually in; fonts and sizes apply to selected text only.
- **Right-click a selection** for a compact mini toolbar.
- **`/` opens a block menu** — headings, lists, to-do, quote, code, divider,
  shapes, plus Embed, Bookmark, URL and Mention link blocks.
- **Rich paste** — pasting a web link opens four Paste as choices; pasted or
  dropped images float over the note and can be dragged, resized, sent behind
  text or brought back to the front.
- **Code blocks** are markdown-style, with a language picker and syntax colours
  for JS, TS, Python, Java, C, C++, C#, Dart (Flutter), Ruby, HTML, CSS, JSON,
  SQL, Bash and Markdown.
- **Lists you can leave**: Enter or Backspace on an empty item ends the list;
  the to-do button toggles a line both ways.
- **Shapes float over the whole note** — rectangles, ellipses, diamonds. They
  drag anywhere, resize from a corner, recolour from dots, hold editable text,
  and sit above or behind the text without reflowing it.
- An **AI panel** of embedded chat webviews (Claude, Gemini, ChatGPT, Mistral,
  DeepSeek, Copilot, Perplexity, plus any URL the user adds), resizable, with a
  side-scrolling tab strip. It is deliberately isolated: it touches no note data.

### Non-negotiables

1. **One store.** `NoteStore` is the only source of note state. Every surface
   derives from it. No per-feature stores that can drift apart.
2. **Data first, DOM second.** Saved content is never produced by serializing
   the page. The editor reads its own buffer.
3. **Files are real.** One JSON file per note under `<userData>/storage/notes/`,
   written atomically (temp file, then rename). `localStorage` is a cache that
   the disk mirror refills at boot.
4. **The app never destroys notes to recover from confusion.** Sample notes are
   seeded only when the vault was read *successfully* and came back *empty*. A
   read error disables the disk mirror, shows a red bar offering to open the
   folder, and seeds nothing.
5. **No `window.prompt` / `confirm` / `alert`.** They throw in Electron. In-app
   dialogs only.
6. **The user always knows where they are.** Clicking the version opens About:
   version, build channel (installed / portable / dev), and the application,
   notes, backups and profile folders — each one opens on click.

## Distribution

- Public GitHub repository. Windows: NSIS installer (per-user, no admin) plus a
  portable exe. macOS: universal DMG and ZIP.
- **The installed Windows app updates itself.** `electron-updater` against
  GitHub Releases; check on launch and every six hours; nothing downloads or
  installs without a button press; the install is silent and the app relaunches.
- macOS and the portable exe cannot update in place (Squirrel.Mac needs an Apple
  signature; a portable exe has no installer). They detect the new version
  through the GitHub API and open the download page. Same UI, one contract.
- **An update must never touch notes.** They live in the user's profile, not
  beside the app; uninstalling leaves them; and the whole vault is copied to
  `backups/pre-update-<version>-<time>` immediately before installing.
- Releases are user-initiated: one command runs tests, the Electron smoke test
  and the build, bumps the version, writes the changelog, tags and pushes; CI
  builds both platforms and publishes one Release.

## Engineering rules

- Electron 33 + Vite 6 + vanilla ES modules. Vitest for units, playwright-core
  driving the real Electron app for smoke.
- The renderer reaches the main process through one `contextBridge` namespace.
  It passes keys, never paths — the main process resolves them and rejects
  anything outside the vault (including sibling-prefix escapes).
- Development runs on its own Electron profile so it can never open, or delete,
  the installed app's notes.
- Every silent failure gets an assertion in CI rather than a comment.

## Working method

The repository carries its own memory, because whichever CLI agent is open works
alone: `memory.json` (state), `Log.md` (what was asked, what was done),
`tests.md` (what is tested and why), `Prompt.md` (this file), `HANDOVER.md`
(a cold-start guide), `AGENTS.md` (the rules). A preflight command prints all of
it. A session that changes code updates them; the release command refuses to
publish quietly if they went stale.

Also produce a single-file local documentation site that renders those documents
and hand-drawn SVG mind maps of the architecture, and mirror it to a public web
page on every release.
```

---

## Current implementation state (v0.8.9)

**Working:** the whole editor described above — dock pad, two-row toolbar,
mini toolbar, slash menu that restyles only the caret's block (including a bare `<div>` line), code blocks with syntax colours (Rust included), a per-note Only view lock, arrows that snap onto shapes and pictures, F12 window snapshots, free-floating shapes with a live angle, arrows that can point at a shape, link, image or text line, pasted images that sit in the text (or float, from the image bar), four-way link paste with embeds in a webview (a YouTube/Vimeo link embeds its player), a Nebula note file (`.nebula.json`, sanitised on import; a raw vault note file also imports) that round-trips the note, deletable arrows, AI panel with tabs, a Chrome user agent, and Sign in in browser,
the Main/Dark/Light/White theme picker, and one
starter note - `Welcome to Nebula Guide`, the same page in every build, with a
working sample for every code language.

**Identity:** the icon is drawn from vector geometry at every size that ships
(16 → 256 in a real multi-size `.ico`), not downscaled from one large bitmap,
because Windows draws the title bar at 16px and a resampled mark looks it.

**Storage:** per-note JSON under `<userData>/storage/notes/`, atomic writes,
path-guarded IPC, daily vault snapshots (newest 7), `storage/meta.json` version
stamp, and a dev profile at `<repo>/.dev-profile` that development cannot escape.

**Distribution:** public at `hero-999-dev/nebula`; NSIS installer + portable exe
+ universal macOS DMG/ZIP on every `v*` tag; in-app updates with silent install
on Windows and notify-and-download elsewhere; `npm run push` is the whole
release ritual.

<!-- agent-note: gpt6astra tarafından eklendi -->

**Recovery:** title and body buffers are bound to their note ID, not whichever
note becomes active during a delayed save. Saved means disk writes were
acknowledged; failures remain retryable. Native close and update wait for the
renderer flush, and installation also requires a successful backup. A partially
unreadable vault disables disk mirroring rather than creating sample notes.

**Editor boundaries:** inline-family changes split exact DOM selection
boundaries, including repeated words and legacy underline tags. Menus are
positioned against the viewport for every toolbar dock. Dragging the lowest
shape preserves canvas extent on the shape layer, never on the scrolling editor.
Markdown export preserves nested prose and code blank lines/long fences.

**Reported legacy notes:** move root overlays out of the text-merge path and
wrap loose prose into real paragraphs, after unwrapping invalid block-containing
spans. Keep underline on actual text runs so it inherits their ink. Shape-text
deletions are nested edits, not deletion of the overlay. Divider handling starts
at the nearest paragraph, even inside a formatting wrapper, consumes a blank gap
before arming the divider, and places the caret at the surviving text line.

**Code blocks:** the Markdown-style edit hint is larger and is hidden whenever
the block has source, including immediately after the first typed character.
Source text has a clear inset from the code panel edge.

**Rich paste:** Bookmark/URL/Mention do not fetch remote content; Embed is an
  explicitly chosen sandboxed iframe (`allow-scripts`, no same-origin or top
  navigation permission, no referrer) with a permanent external-link fallback.
  Third-party framing restrictions still apply. The four slash commands open
  the same picker. Cards replace the selection, split prose and can be deleted.
  PNG/JPEG/GIF/WebP images are note-bound across asynchronous decoding; corrupt
  images are rejected. Image geometry survives sanitized HTML import, selection
  does not create undo entries, and the lowest image reserves canvas height
  while dragged. Data images grow the note size; no unlimited-size guarantee.

**Release documentation:** GitHub bodies are generated by `scripts/release-body.js`
  from the actual changelog plus download and Mac upgrade instructions. Mac
  updates remain manual; signing alone would not change the Windows-only updater
  gate. CI checks universal slices and artifacts, not a hands-on Mac upgrade.

**Quality:** 370 unit tests, 231 Electron smoke checks against the real app
(including "an unreadable vault seeds nothing", the divider-gap sequence and
code-hint input, verified by breaking the guards on purpose and watching the
suite go red).

**Not built yet, by choice:** graph map, mind map, sheets, flashcards, forums,
calendar, projects, command palette, full-text search, i18n. All of these exist
in `../Nebula Demo/` and are meant to be ported one at a time through the
`bus.js` / `disk-store.js` / `storage.js` hooks.

**Known limits:** no one-click auto-update on macOS (no Apple Developer
certificate); the portable exe cannot update itself; the UI is English only.
