# Nebula release log

One entry per release. Written by `npm run push`; edit freely afterwards.







## [2026-10-04 14:00] v0.9.3 - by Claude (twenty-eighth round)

The owner: "without, the notes should look like bookmarks" — then: continue, and push Nebula.

- Videos "without" go out as the bookmark card the note draws (link-block link-bookmark: its kind, ▶ title, address), and so does a video whose still cannot be had. Embeds of web pages, which no paper can show, go out as their bookmark in every export.
- In documents a bookmark is that card: a bordered, lightly shaded box with BOOKMARK, the title and the address, both linked — Word (pBdr and shading), OpenDocument (a Bookmark paragraph style), Rich Text (\box with \cbpat), Evernote (a styled div), the preview the same; the HTML export styles .link-card like the note. Word opens all three with the box and both links.
- Release notes for 0.9.3 gained pages and paper, Auto order page, Word / OpenDocument / a Mac's formats with previews and videos, folders and AI tabs; memory.json's current phase says what ships.
- Electron check before the release: 44.5.1 current; Firefox 157, ESR 140 current.
- Unit 691/691 before the release run.
- The first release run stopped at the smoke (nothing committed): run one timed out waiting 9 s for the PDF preview on a machine just busy with the unit tests; the retry failed "the note that was already there is untouched" — the vault repair stamps markupVersion 1.5 s after start (heal.js, a repair, not an edit) and, slowed down, landed before the read. Not reproducible in three runs on their own. The smoke now waits up to a minute for the preview (and says so if it is not made) and compares the note without its markupVersion.
- The second release run stopped at "a folder is dragged below a note like a note" (the folder landed a row low): the drop aimed at y 30, near the row's middle, and the rows shift as the folder lifts off. It aims at the row's foot now, where a shift still means "under this note". v093 then 138/138 twice.

---

## [2026-10-02 18:00] v0.9.3 - by Claude (twenty-seventh round)

The owner: a preview for docx and odt too; the note formats popular on a Mac; videos are not put on the A4 in an export — at least put them there the way they show in Nebula; exports with or without video, without = only the embed's link.

- The export preview (pdf-preview.js) serves every export that makes pages: PDF, .docx, .odt, .doc, .rtf. For the documents it prints office.js previewDocument — the file's own blocks in the file's styles on the same paper — and Export writes the file itself; the PDF keeps saving its previewed bytes. Its title says which export it is.
- A Mac's own: Rich Text (.rtf: TextEdit, Pages, Apple Notes) and Evernote (.enex: Apple Notes, Evernote, Bear, Joplin, UpNote), out and in. ENEX: ENML with pictures as resources by MD5 (md5Hex, checked against Node's), to-dos as en-todo; an .enex with several notes imports each. Pages has no open format to write; it opens .docx and .rtf.
- Videos (export-video.js): "with" puts each video embed on the page as it shows — its still (YouTube's largest real one, or Vimeo's from oEmbed, fetched by the main process: link-metadata.js fetchVideoPoster, https only, no cookies, 4 MB, 8 s), cropped to the card's size with the player's play button drawn over it, linked to the video, its title under it; offline, the link. "without" leaves the link only. The choice sits at the top of the export menu and in the preview (shown when the note has a video), remembered (nebula:export-videos), "with" by default.
- In Word the still is an online video that plays (wp15:webVideoPr on the picture's blip, as Word's own AddWebVideo writes it, and a settings.xml with compatibility mode 15 — without it Word opened the file in 2007 mode and showed a plain picture). ODT and Rich Text link the still; an HTML export keeps the real player (iframe).
- Checked outside the tests: Word opens the .docx, .odt and .rtf (the video as an online video, type 16, in the .docx); the .enex is well-formed XML; YouTube and Vimeo stills fetched for real.
- Guide: New in and section 8 (videos, Mac formats, previews), signed.
- Unit 690/690, v093 138/138, full smoke 519/519.

---

## [2026-10-02 15:30] v0.9.3 - by Claude (twenty-sixth round)

The owner: auto order does not work; turned on in the ⋯ menu the button should stay pressed; on NW fainter, so it is plainly not to be pressed; the menu should say "not active", and when it is on a word by the title like Only view, "Auto order mode is on"; a new icon (no arrow down, two straight lines in the sheet); and .odt, .doc and .docx in export and import.

- "Does not work": checked on a copy of the owner's Ideas note in a temp profile — on A4 and A5 nothing in it crosses a page line, so nothing moves and the toast says so; on NW, and in Only view (the guide), the button did nothing while looking pressable. Not a fault in the ordering; the state was not visible.
- The button is pressed (.on, aria-pressed) while the note orders itself; at 28 % opacity and not pressable on NW; dimmed with the rest in Only view. Icon: a sheet with two lines.
- The ⋯ menu says "Auto order page: not active" / "Auto order page: active". While on, "Auto order mode is on" sits by the title (the Only view chip's look); a click turns it off.
- office.js: one reader (note → blocks of runs) and three writers — .docx (Office Open XML, styles, numbering with each numbered list from 1, hyperlinks, pictures embedded), .odt (mimetype stored first, automatic span styles, list styles, pictures in Pictures/), .doc (Rich Text, which Word opens as .doc: \pngblip/\jpegblip pictures, HYPERLINK fields). Each on the note's paper and margins (NW: A4 as last turned). Shapes stay out, as in Markdown and HTML.
- Import: .docx through mammoth (Title style read as h1), .odt read here, a .doc that is Rich Text or HTML read here (lists rebuilt from mark-and-tab lines), a binary .doc read to paragraphs in the main process (word-extractor, external to the bundle). Everything is sanitised by import.js as before. New dependencies: jszip, mammoth, word-extractor (no advisories; the one high audit finding is js-yaml under electron-updater, already there).
- Checked outside the tests: LibreOffice (headless, to text) and Word (COM, read-only) open all three: 12 paragraphs, the picture, the link, A4 595x842 pt, real lists in .docx and .odt.
- Guide: New in, section 8 with a Try it; the auto order paragraph updated.
- Unit 679/679, v093 133/133, full smoke 514/514.

---

## [2026-10-02 14:00] v0.9.3 - by Claude (twenty-fifth round)

The owner: default text 14; for the pages but NW an "auto order page" button right of the page zoom that puts right what runs over, by hand; NW unchanged; and in the note's ⋯ menu a way to turn it on. Asked: what it puts right is what a page line falls across; turned on, it runs by itself in that note.

- Note text is 14px by default (10.5 pt on paper).
- page-order.js: orderPage moves every shape and floating picture that a page line falls across to 8px under that line (by its top), and gives a picture in the text a top margin of its own (data-page-gap, taken back and measured again on the next run). One taller than a page stays. Nothing happens on NW (no data-paper); the button is disabled there and dimmed in Only view.
- The page lines now start where the PDF does: the PDF prints the title (22pt, 6 mm under it) above the writing on page one, so the first line is that much sooner (--page-title, measured at the paper's line width, repainted as the title is typed); the print document's editor is a flow-root so the first block's margin stays inside, as on screen. Measured against the PDF: A4 page starts match on pages 2-4; NN and A5 match on pages 2-3 and drift by a line after, where a paragraph pushed over leaves room at the foot of a page that fixed lines cannot know.
- The ⋯ menu: "Turn on / Turn off auto order page" (hidden on NW notes), note.autoOrder; on, it runs when the note opens, when its paper changes, on letting go in the editor and 1.2 s after typing.
- Guide: New in, and a section with Try it in section 1.
- Unit 672/672, v093 129/129, full smoke 510/510.

---

## [2026-10-02 11:30] v0.9.3 - by Claude (twenty-fourth round)

The owner: NW and NN back to the old way, NW wholly ("NW should only go back to the old style"); NN keeps A4 with 6.35 mm margins and its page lines, at the old scale; the papers keep their lines. Exporting an NW note offers two choices, landscape or portrait, with a preview of which page and style the export will be — previews on exports, in a panel that suits the app.

- NW (fluid): no paper on screen (the editor's paper styles hang on data-paper now, which NW does not get), no page lines, the writing as wide as the window, 100 % the screen's own size, no Fit offered.
- NN: the 746 px A4 line, its page lines and 6.35 mm export, at the screen's own size (100 % = 1). The papers (A3-B5) keep the real-size scale. NW and NN open at 100 %, A3/B4/B3 fitted.
- PDF export opens a preview (pdf-preview.js, #ov-pdf): the main process prints the note's document to a PDF in userData/pdf-preview and the preview shows that file in Chromium's PDF viewer (a <webview plugins> in its own in-memory partition that follows no link and opens no window); Export saves exactly those bytes. Cancel, Esc or a new render deletes the file; the folder is emptied at start and at quit (deleted notes stay deleted).
- NW chooses A4 Landscape or Portrait in the preview; remembered (nebula:nw-orientation), and NW prints that way up.
- Found through the preview: every PDF had come out without shapes or arrows — the print document dropped the canvas with the Markdown's controls. It keeps it now, its corner where the writing starts (Chromium cuts what reaches into a page margin).
- Guide: NW and NN, the preview (New in, section 1, section 8 with a Try it).
- Unit 668/668, v093 125/125, full smoke 506/506.

---

## [2026-10-02 09:30] v0.9.3 - by Claude (twenty-third round)

The owner: zoom in Only view too; "Fit to page" named "Fit (25%)" with the percentage live; and (a screenshot in the Ideas note) B4 at 100 % scrolled sideways although the sheet was on screen whole.

- Only view: the toolbar is still dimmed and dead, but the page zoom (#tb-zoom) stays bright and pressable — it is how the note is looked at, not an edit.
- The fit option reads "Fit (62%)": fit's share of the real size, measured on every paint and on every change of the frame's width, whichever zoom is chosen. Its tooltip is "Fit to page".
- The early sideways scroll was the 12px gutter beside the sheet in the editor's minimum width: the paper fitted, the gutter did not. The minimum is now the sheet and the scroll bar, the side padding never less than the margin, and the canvas starts at the sheet's edge from 0. Fit keeps its 12px a side.
- Guide: Fit and its percentage, and zoom in Only view, in section 1.
- Unit 666/666, v093 119/119, full smoke 500/500.

---

## [2026-10-01 20:30] v0.9.3 - by Claude (twenty-second round)

The owner: is the font bigger than normal? (Yes, to the eye: 100 % is now the paper's real size, and 17px prints as 12.75 pt.) Add sizes 5 to 9, and make the default smaller — first 10px, then "12; 10 looks small".

- The editor's text is 12px (9 pt on paper) unless a note or a span sets its own; headings keep 31 / 24.5 / 20px.
- The size menu starts at 5 (5, 6, 7, 8, 9, 10, 12 ...); a typed size goes down to 5.
- Asked and left alone: NN stays A4 with 6.35 mm margins (A4 is the old export's 12.7 mm). New notes are NW and every note keeps its own page — already so, checked in a fresh profile.
- Unit 666/666, full smoke 497/497 (the first run after the 10px run was stopped had 5 timing failures, v093 alone then passed 116/116 twice).

---

## [2026-10-01 19:30] v0.9.3 - by Claude (twenty-first round)

The owner's Ideas note, with screenshots: "is this a landscape A4?", "is this an A4 on my screen?" (NW and A4 at 100 % showed CSS size, 1123 and 794 screen px), and "the shapes are stuck, as you see" (the guide's shapes beside the A4, in the grey outside the paper).

- Real size was 1 in the app: createWindow starts the monitor question early (nineteenth round), and realScale() set its cache to 1 before Windows answered, so the page, asking a moment later, got 1. Now the question is one shared promise. The PowerShell timeout is 15 s (the modes list is slower on a cold start).
- The canvas (both shape layers, and with them pictures and arrows) is the paper on a page: from the sheet's left edge, as wide as the sheet. Shapes and pictures are placed from the paper's edge, a dropped picture too (imagePoint measures from the canvas).
- Guide: the "New in" line for page zoom now says real size and fit to page (the earlier replacement missed it).
- Tests: v093 (116) checks that 100 % is the zoom the main process measured, and that the canvas is the sheet; the smoke's shape-weight check measures with the page unzoomed (Chromium snaps a 1px border to whole screen pixels under zoom; an SVG stroke scales).
- Unit 666/666, full smoke 497/497.

---

## [2026-10-01 16:30] v0.9.3 - by Claude (twentieth round)

The owner, holding real paper to the 14-inch screen: NW does not stand like an A4 turned sideways, A4 and A5 are not their real size; scale every paper to its real size, not "164 % for all"; real size should be 100 %; and "Fit to page" at the top, working however the window changes (half the screen).

- 100 % is now the paper's real size for every paper; the steps (50-200 %) are shares of it. The old 'actual' value reads as 100.
- Why the sheet did not match: in a half-width window the paper (1301 screen px for A4) did not fit; the editor's minimum width was the line plus 28px a side, so the paper's 12.7 mm margins and its drawn edges were cut off and what showed was 199.5 mm, not 210. The side padding is now never less than the paper's margin plus 12px, and the minimum width the whole sheet: real size always shows the whole sheet, edges and all, and scrolls sideways.
- The monitor's width is read in millimetres from its listed modes (309 mm) where Windows has them, else in whole cm (31): 1.644, not 1.639.
- Real size takes the window's own zoom (Ctrl + / Ctrl -, webFrame.getZoomFactor) back out.
- Fit to page ('fit'), first in the box: the whole sheet plus 12px a side as wide as the note's frame; a ResizeObserver on the frame measures it again when the window or the side panels change, and a sheet a hair too wide after the scroll bar is measured is corrected once.
- A4, NN, A5 and B5 open at 100 % (real size); NW, A3, B4 and B3 open fitted to the window.
- Tests made zoom-aware (a wide note now opens at a zoom other than 1): embed resize, image drop, arrow snap, triangle outline; shape outline weights compared at 100 %.
- Electron check before the build: 44.5.1 current. Full smoke 495/495.

---

## [2026-10-01 15:30] v0.9.3 - by Claude (nineteenth round)

The owner: the zoom box is too big — drop "Actual size" beside 164; NN should be an A4 written close to its edges (left, top, right, bottom), like the old A4 export; actual size cannot be 164 for every paper; on a laptop A3 or B3 at real size (or a big zoom) should simply scroll left and right.

- The zoom box shows only the percentage ("164%"); "Actual size" is the option's tooltip. The box is 68 px again.
- NN is A4 with 6.35 mm margins (printers cannot reach much closer): a 746 px line, pages 1075 px tall; print (the live window's .main padding) and PDF (the export document's @page margin) use the mode's margin. Margins are per mode now (marginMm); the paper's drawn edges follow it. NN opens at actual size like A4.
- Actual size is one factor for every paper — it is the screen's (cm on screen = cm on paper); an A3 at actual size is simply 1.41× an A4. Kept, and explained in the guide.
- A page wider than the window no longer squeezes its column: the editor's min-width is the paper's line plus its padding, and the editor frame scrolls sideways. A3 at actual size on the owner's laptop: 1027 px line (in page pixels), the frame scrolls; B3 likewise.
- The monitor's physical size is asked as the window is created, so actual size is known before the first note opens (it took a few seconds and the first page showed 100 %).
- Electron check before the build: 44.5.1 current. Full smoke 492/492.

---

## [2026-10-01 14:30] v0.9.3 - by Claude (eighteenth round)

The owner: a very thin line that shows where the export splits the pages, in Nebula's notes; NW equal to A4 turned sideways; A4 and the smaller pages at their real size by default; NW's meaning shown when it is clicked.

- NW is A4 landscape (297 × 210 mm): a 1027 px line, pages 698 px tall, printed and exported on A4 landscape. NN is a 760 px column printed on A4. Every mode now has a column (it fits the room there is).
- Page breaks: a very thin line every page height (the sheet's height less the 12.7 mm margins), from the top of the writing — a second CSS background on the editor, `--page-break` set by page-mode.js. Approximate: the export keeps code blocks and shapes whole and may move them to the next page.
- Actual size: the main process reads the monitor's physical width (WMI WmiMonitorBasicDisplayParams, whole cm) once; the factor is the screen's DIP width over that width in CSS pixels (Windows' scaling cancels out). The owner's 14" 1920 px screen, 31 cm: 1.639. The zoom box offers "Actual size (164%)"; A4, A5 and B5 open at it unless the note has a zoom of its own (choosing the page's default stores none). Elsewhere (macOS, unreadable) actual size is 100 %.
- The column was 10 px short of the paper's line: the editor's scroll bar came out of it. `scrollbar-gutter: stable`, and the bar's width (in the page's pixels, so measured again after every zoom) is taken out of the side padding: A4 at 100 % is exactly 698 px.
- Pressing a page box shows what it is ("Nebula Wide — A4 turned sideways, 297 × 210 mm") for three seconds.
- Electron check before the build: 44.5.1 current. Full smoke 490/490 (the PDF margin check now expects NW's A4 landscape: 1027x698 writing area).

---

## [2026-10-01 13:00] v0.9.3 - by Claude (seventeenth round)

The owner: "a zoom ratio for the pages, beside the alignment, set off with a thin line like the others".

- Page zoom (page-zoom.js): after the alignment buttons, a thin line, then − / ratio (50–200 %) / +. CSS `zoom` on the editor: words, pictures, shapes and the page width (a paper mode's sheet too) together; Ctrl +/− still zoom the window. `note.zoom` via NoteStore.setZoom — a setting, 100 % stores nothing.
- Measured first in the real app: under CSS zoom Chromium gives pointer positions and rectangles in screen pixels while `left` / `width` are page pixels, so at 150 % a shape, a picture and a picture's corner moved 1.5× the pointer. Every drag in the page now divides by `editorZoom()`: shape move/resize (shapes.js), picture move/resize, embed resize, drop point and floating a picture (rich-paste.js), arrows' targets and end drags (arrows.js). The crop frame is page chrome in screen pixels and needed nothing. At 150 % the shape, picture and corner now follow the pointer 1:1; clicking into text was right either way.
- Electron check before the build: 44.5.1 current. Full smoke 487/487.

---

## [2026-10-01 12:00] v0.9.3 - by Claude (sixteenth round)

The owner: the app opens "as if the screen were split in two"; page modes — A4, A3, A5, B4, B5, B3 by the standards, the page width set by them and the caret with it; today's mode is Nebula's own, Nebula Wide (NW), and a narrower Nebula Narrow (NN); beside Saved, boxed like the arrows.

- Opening: the window was saved maximized with half-screen bounds. `maximize()` on a hidden window shows it at once on Windows (Electron 44), so it came up before the page had painted, and the page first laid itself out at the saved half width. The window is now given the display's work area before loading and is maximized only as it is shown (ready-to-show); leaving maximized restores the saved size. Traced from inside main: invisible and 1920 wide until shown, the page's first layout 1920 wide.
- Page modes (page-mode.js): NW (whole width), NN (760 px), A3/A4/A5/B3/B4/B5 (ISO 216). A paper's line is its printed line — the sheet's width less the 12.7 mm print margins a side (A4 184.6 mm = 698 px) — so the caret wraps where the paper will; the paper's edges are drawn faintly (CSS gradient from --page-col). Eight boxes beside Saved in the pad's style (NW A3 A4 A5 / NN B3 B4 B5). `note.page` via NoteStore.setPage — a setting, not an edit; Nebula Wide stores nothing. Print and PDF use the note's paper (@page size in the print stylesheet and the export document, `pageSize` in microns for webContents.print). In print the column and edges are dropped (the paper is the page). Guide: "Page width" in section 1 and a New in 0.9.3 line.
- Electron check before the build: 44.5.1 current. Full smoke 483/483.

---

## [2026-10-01 10:40] v0.9.3 - by Claude (fifteenth round)

The owner: "take DeepSeek out; check the others' log".

- The sign-in log after the fourteenth build: ChatGPT and Copilot each signed in on the first try as Chromium (the engine as it is) — Google's address page, SetSID, handed to the tab (auth.openai.com / auth.copilot.microsoft.com callback), the window closed by itself; no refusal. `sign-in-methods.json` now holds chromium for both, firefox for Mistral and MathGPT.
- DeepSeek is out of the AI panel (its own captcha, before Google, refused every answer in the app), with its session in Nebula Test; the guide's AI line, README, Prompt and the tests follow. A custom site can still add it back with +.
- Electron check before the build: 44.5.1 is current (Chrome 155 is out; 152 is within the allowed lag). Unit 655/655, v093 98/98.

---

## [2026-10-01 00:50] v0.9.3 - by Claude (fourteenth round)

The owner: Copilot still fails, DeepSeek's captcha is stuck on "try again", ChatGPT and Copilot the same error.

- The sign-in log (sign-in-log.txt) showed it: for ChatGPT and Copilot the window opened Google's address page as Firefox 157, and ~10 s later — the e-mail typed and Next — Google refused (/v3/signin/rejected, in the page); the window moved to the ESR and showed the address page again ("a screen comes and at once goes to this"), and the owner closed it before the third way, Chromium, was ever tried. DeepSeek is not in the log at all: its captcha is on DeepSeek's own page, before Google.
- With Electron 44 the engine is a current Chrome (152): a service's own tab now starts as the engine it is (`methodOrder`: chromium, firefox, firefox-esr); Gemini, whose tab is Firefox, still starts as Firefox; what worked is still tried first (Mistral and MathGPT stay on Firefox). A refusal is remembered too: the next window for that site starts with a way Google has not refused. The window's title says why the address page came back ("Google refused — trying another way (2/3): enter your e-mail again", in the app's language).
- The machine: C: is 98 % full and the commit limit nearly reached (1.2 GB free of 23.8); vitest's workers ran out of memory in a full run. With two workers 41 files passed and heal.test.js (21) crashed for memory; alone it, and the rest, pass.

---

## [2026-09-30 12:40] v0.9.3 - by Claude (thirteenth round)

The owner's "Sign in to AIS" note (all sessions cleared, each tried in turn): Claude, Mistral and MathGPT signed in at once; Gemini not the first time (Google's "Couldn't sign you in" in the tab itself); ChatGPT not ("a screen comes and at once goes to this" — the Google address page), and DeepSeek and Copilot "the same error". Standing rule: "whenever Nebula is about to be updated, check Electron; if there is an update, update Electron, then do a bug check" — and remember it.

- Electron check: `npm run check:browsers` now compares the installed Electron with npm's latest; `npm run push` stops on a newer one with the commands that upgrade it and the bug check to run (npm test, build, smoke). Recorded in AGENTS.md ("Electron first") and in memory. It found 44.5.1 today: upgraded; bug check — unit 654/654, build, full smoke 479/479 (a first run timed out waiting for a window on a relaunch while Nebula Test was open; rich-paste twice alone and the whole smoke again passed).
- Sign-in log: why ChatGPT, DeepSeek and Copilot fail after Google's page could not be seen here (ChatGPT's sign-in stops at Cloudflare in a fresh session). Every step of a sign-in — the tab sent to Google or refused in the tab, the window, its method, each page, Google's refusal, the next method, the hand-back, a window held back or closed by hand — goes to `sign-in-log.txt` in the copy's folder, last 400 lines. Addresses are redacted (`redactUrl`): host and path, and only the names of query parameters — no code, token, state or e-mail.

---

## [2026-09-30 09:40] v0.9.3 - by Claude (twelfth round)

The owner: "do it" — upgrade Electron (33, Chromium 130) to a current one.

- Electron 44.5.0 (Chromium 152, Node 24.21; Chrome stable is 154). `npm run check:browsers` is all "ok" now.
- What Electron 34–44 changed that this app relies on:
  - Clipboard (44): W3C ClipboardItems; `writeImage`, `readImage` and `write({ image })` are gone. `writeImageToClipboard` in context-menu.js (copy picture, F12 snapshot); the e2e files that put pictures on the clipboard or read them back use the new API.
  - `app.commandLine` lower-cases arguments (36), so the `disable-blink-features=WebAuth` switch may do nothing: WebAuth now also goes into the main window's, every webview's (will-attach-webview), the sign-in window's and every popup's `disableBlinkFeatures`. The v093 passkey check passes on 44.
  - File dialogs open in Downloads unless given a folder (43): the app remembers the last export/import folder while it runs.
  - A click in a <webview> reaches the app only as the window's `blur` with the webview active (no captured `focus` any more): the menus close on that too.
  - Electron is no longer downloaded by `npm install` (42): `npx install-electron --no`; CI does it before smoke, and CI runs Node 22 (Electron 44 needs 22.12+).
- Two stale smoke expectations fixed on the way: Help → Blocks has 16 rows since the toggle list, and the save-dialog stub takes the file name only.
- Found by the full smoke (not by Electron; there since the fourth 0.9.3 round): a /divider typed after a paragraph with a picture under it and taken back with Backspace deleted the picture — the first Backspace removed the empty line and selected the picture, the second deleted it. Going backwards the divider is picked now (the next Backspace takes it, the picture stays); Delete still selects the picture. Clicking elsewhere lets a picked divider's selection go too (a picture clicked under it was left with the divider selected).
- Full smoke run on 44: 479/479.

---

## [2026-09-30 08:50] v0.9.3 - by Claude (eleventh round)

The owner: "check this on every new version so we do not get the error again"; MathGPT still gets "try a different browser"; "we could put a method for each site that works in the background, if a single method does not simply work".

- Sign-in methods: the window tries today's Firefox, then the Firefox ESR, then Chromium as it is (SIGN_IN_METHODS, userAgentForMethod), each from the start, when Google refuses; the one that worked for a site is remembered in `sign-in-methods.json` (userData) and tried first next time. Every one refused: the window shows, in the app's language, that Google refused and to sign in with e-mail on the site, instead of going round again. Request headers follow the window's current browser (a per-contents identity map; Firefox sends no sec-ch-ua).
- `scripts/check-browsers.js` (`npm run check:browsers`): what the app claims against Mozilla's product-details and Google's Chromium dashboard. `npm run push` stops on a Firefox or ESR behind (`--no-browser-check` to override) and prints the line to change; preflight shows it. FIREFOX_RELEASE {157, 2026-09-29} and FIREFOX_ESR 140 are the record it updates. Found: Electron 33's Chromium is 130, Chrome is 154 — a warning, the fix is an Electron upgrade.
- MathGPT uses the same path as ChatGPT (the tab is sent to Google, the window opens on Google's address page, Firefox 157 first); its refusals now move on to the other browsers.

---

## [2026-09-30 08:20] v0.9.3 - by Claude (tenth round)

The owner: ChatGPT signs in now; Mistral answers "try again with a different browser"; the reload sign at the top right should be round like +; "the rectangle panel you added goes in front of the AI pages".

- Google is told a current Firefox: the fixed Firefox 128 (July 2024, out of support by 2026) is what Google answers with "Try using a different browser". `currentFirefox` counts from 157 (released 29 September 2026) by Firefox's four-week cycle, never lower, so it does not go stale; the Gemini tab and the sign-in window keep telling the same one. Mistral not retried here (needs the owner's account).
- Menus over the AI page: a click in a <webview> never reaches the app's document, so a menu opened over the panel (the tab right-click, a note's or folder's ⋯) stayed over the page. Focus going into a webview (only a captured `focus` arrives, not focusin) now counts as a click outside, and every menu closes as for one.
- Reload and + are the same round button.

---

## [2026-09-30 07:40] v0.9.3 - by Claude (ninth round)

The owner, after all AI sessions were cleared: Claude and Gemini sign in; ChatGPT does not, and its Google sign-in window kept coming back ("it spammed, and clicking another site did not stop it" — the window over the Gemini tab in the Sign in ChatGPT note). "Fix GPT without breaking Claude and Gemini."

- No window spam: the ChatGPT tab, in the background, sent itself to Google again and again and each time a window opened. signInWindowOpener now keeps, per tab, when it was last used (webContents `input-event`) and when its window was closed by hand: a window closed by hand is not opened again by the page until the person uses that tab; a tab nobody is using opens at most two a minute. Claude's popup path is untouched; Gemini's first window always opens.
- Why ChatGPT's sign-in itself fails is not known: here (fresh, automated session) "Continue with Google" went to /api/auth/error behind Cloudflare's "Verify you are human", a different path from the owner's. Asked for what the window shows after the password.
- AI sessions of Nebula Test were cleared at the owner's request (Partitions/ai-*; notes, backups and embeds kept), and the probe profiles in %TEMP%.

---

## [2026-09-29 13:30] v0.9.3 - by Claude (eighth round)

The owner: Mistral signed in only after several failed tries, the same in Claude; everything but DeepSeek signs in now, but MathGPT then fails ("Unauthorized request … authorization_invalid", Clerk) and Copilot keeps saying "Authentication required"; DeepSeek's "Login with Google" brings a picture captcha that says "Please try again" however it is answered; the caret beside the divider "still there"; a long pasted message widens the page; right-click on a tab: delete website, change website, change header.

- Sign-in window: the address Google hands back to carries a code that works once, and the window followed the redirect AND sent the tab there — two requests raced with one code, the second refused (the "few failed tries", and Clerk's "Unauthorized request" in MathGPT). The redirect is now stopped in the window and only the tab takes it; a page the window arrived at without a redirect is left to finish there and the tab is reloaded afterwards, never sent to the same address.
- The passkey page script (and the debugger that places it) only where Google's pages are shown — Gemini's tab, a sign-in window, a popup — and inside it only on Google hosts (a tight host pattern; the template literal had been swallowing its escapes). A service's own tab keeps the browser's own objects: the stand-in PublicKeyCredential and hidden window.chrome are what a captcha looks at. DeepSeek's captcha could not be tried here.
- The caret beside the divider: Esc (or anything that let a picture in the text go) left the caret on the editor between the divider and the picture, visible again once the picture was not selected. Letting a picture go now puts the caret on the nearest line.
- A pasted <pre> (MathGPT's JSON error) wraps: `.editor pre` pre-wrap, overflow-wrap anywhere.
- AI tabs: right-click → Change header, Change website, Delete website; a deleted built-in comes back with Restore removed sites (overrides and hidden list in localStorage, mergeServices/siteUrl in ai-services.js).
- Copilot: its silent sign-in check is an iframe to login.live.com; "Authentication required" could not be reached without an account — to be seen after the one-time-code fix.

---

## [2026-09-29 10:40] v0.9.3 - by Claude (seventh round)

The owner: "a folder is always at the top once it is made; a note moved above the folder gets pinned — moving must not pin"; Mistral still does not work; DeepSeek's captcha opens, solved right, but says "try again" every time; Copilot connects; take Perplexity out for now. Ideas note (10:07): the caret by the divider is still there; a reload button, + always at the right with reload to its left; MathGPT after Mistral.

- Folders stand among the notes: `folder.order` (in folders.json) on the notes' scale, created-at until dragged, so a note changed later rises above a folder as notes do. Folders are dragged like notes (between the list's notes and folders). A note let go on a folder's top or bottom edge goes above or below it; the middle puts it in.
- Dragging never pins or unpins: a note let go among the other pin goes to the edge of its own run. `NoteStore.placeNote` became `setPlace` (folder and place, never the pin) and `setOrders`; the order maths is `orderFor` in note-list.js.
- The caret by the divider: ↓ or → at the end of the heading above a divider put the caret on the editor between the heading and the divider (probe on a copy of the Ideas note). It now goes on the way it was going — the picture under the divider is selected (the caret moved beside it), a line is entered, or the divider is picked; ↑/← go to the line above. Arrows from a picked divider select a picture next to it instead of opening an empty line. ↑/↓ away from a selected picture in the text let it go (the caret was hidden in the heading while the picture stayed outlined).
- AI panel: Perplexity out, MathGPT (math-gpt.org, the owner can name another) after Mistral; ↻ reload and + stand right of the tab strip, outside its scroll; a remembered Perplexity tab opens Claude.
- Mistral: in the real app the Google button opens the sign-in window on Google's address page (probe); what fails after that was not visible here — asked the owner for a picture. DeepSeek: login uses Cloudflare Turnstile; with the app's settings and without, no challenge or "try again" appeared here — asked for a picture.

---

## [2026-09-29 09:50] v0.9.3 - by Claude (sixth round)

The owner's Ideas note (08:53): Mistral's Google sign-in window opened blank ("ChatGPT and Gemini work now"); "with a picture at the top there is a caret between the divider and the picture — there should be nothing there; the divider has a caret of its own, two carets"; folders ("drag notes into folders, a click on a folder shows its notes, folders can be named, pinning inside a folder") and "drag the order of the notes, among the pinned ones too".

- Mistral: reproduced with the app's own code against the real site. The window waited for its passkey script with no limit, and on a window that had loaded nothing the debugger never answered — so nothing loaded. Mistral's "Sign in with Google" is an OAuth request, and the window also replaced it with a bare ServiceLogin (fresh-attempt rule from the fifth round), which would have lost Mistral's return address. Now: an OAuth request is loaded as it is; the script is registered and the window loads after 300 ms at most (loading about:blank first was tried and was worse — the script then missed Google's page, which is exactly why the first try used to be refused and "Try again" worked); the window's requests to every Google host are Firefox (the Mistral tab's session listener covered accounts.google.com only); the refusal is also caught when Google reaches it inside the page. Probe result: Google now answers "Couldn't find this account" for a made-up address — the browser check passes. Not tried with a real account.
- Divider and picture: the Ideas note held `<hr><br><figure>`; migrate.js `dropGapBreaks` takes a loose <br> between two non-line blocks out on open (before normalizeProse made it an empty line). The "second caret": with a picture selected, or after deleting the picture under a divider, the browser's caret stood on the editor between the divider and the picture. The caret is hidden while a picture in the text is selected, and the gap check (loose <br>s looked past and removed) runs after deletes too, selecting the next picture.
- Folders: folders.json in the vault (names and order), `note.folder` on each note; New folder button beside New note; a click opens/closes, double-click or ⋯ renames, ⋯ -> Delete folder gives its notes back to the list; ⋯ -> Move to folder on a note. Pinned notes inside a folder stay at its top.
- Order: notes drag between notes (a line shows where), onto a folder, or below everything. `note.order` is on the same scale as `updatedAt`, so notes nobody dragged still rise when changed; a dragged one stays. Dropped among the pinned a note is pinned, out of them unpinned. A filtered list stays flat.
- Guide: "Folders and the order of your notes" in section 1, and a New in 0.9.3 line.

---

## [2026-09-29 09:00] v0.9.3 - by Claude (fifth round)

The owner, trying Gemini: the tab opened straight on "Couldn't sign you in"; in the sign-in window the first try was refused too, and only "Try again" there gave the Firefox sign-in that worked. "I would like the window's Sign in to work at once."

- The window starts a NEW sign-in (Google's sign-in page with only the address to come back to), not the address the tab was sent to, which carried the tab's refused attempt.
- Refused in the window anyway, it tries again by itself, twice at most (what the owner did by hand).
- The tab landing on a Google sign-in page or on the refusal opens the window by itself; a window already open is brought forward and left as it is.
- Not tried with a real Google account.

---

## [2026-09-29 08:30] v0.9.3 - by Claude (fourth round)

The owner: ChatGPT signs in now, Gemini does not ("Gemini opens straight to the sign-in, which loads later"); a label taken off the title must NOT go from the text — instead ⋯ beside each label with "Delete label"; the Ideas note (07:45): the picture under the divider still would not come up, "a caret between the divider and the picture", and "the caret gets lost at the labels, going down from the mention the labels disappear" (#label2 was gone).

- Labels: taking a label off the title leaves the text alone again. In the label search each label has ⋯ -> Delete label, which says what it will do ("Delete #x from N notes?") and then takes it off every note's title and out of every note's text (NoteStore.deleteLabel, one save). #chips are ordinary text again, so the caret walks through them; as one piece (the second build) the caret could not stand on a line of them and a chip went. What kept the words out of a chip is now: a letter typed at its edge goes outside it, and Enter's copy of the chip on the new line is taken off. The migration removes the contenteditable the second build wrote.
- Divider and picture: Backspace on the empty line between them left the caret on no line, blinking between the two; now the picture is selected. A click in that gap does the same.
- Gemini: its whole tab is Firefox from the first page (the panel's own Chrome user agent overrode the main process for every tab), Google's pages get no sec-ch-ua headers, and where a page is told Firefox, navigator.userAgentData and window.chrome are hidden. The passkey API is present again (as in every browser) but says there are no passkeys; the Blink switch stays, so no page can open the Windows dialog. The sign-in window waits for its script before loading. Not tried with a real Google account.

---

## [2026-09-29 07:30] v0.9.3 - by Claude (third round)

The owner, after the second Nebula Test.exe: passkeys solved; Gemini now says "Couldn't sign you in — this browser or app may not be secure"; "do it the Claude way for everything"; labels in one set in the search; a label taken off a note should go from its text; the picture under a divider could not be brought up; the embed could not be resized ("from all four sides").

- Google sign-in the Claude way: a sign-in the person starts in an AI tab (Gemini's Sign in, the redirect ChatGPT and Mistral make) opens in a small window of the app sharing the tab's session, as Firefox; when Google hands back to the service the window closes and the tab goes on from there. The silent check of who is signed in (passive=) and the cookie steps stay in the tab; a window closed by hand reloads the tab. Not tried with a real Google account.
- Labels: the search shows the title's labels and the text's #labels as one set; a label matches a note that has it either way. Taking a label off a note's title takes its #chips out of that note's text (one undo in the open note); a #chip deleted from the text leaves the title's label.
- Pictures: an empty line beside a picture always goes, under a divider too, and the picture comes up; with no line of text left the picture is selected. Enter on a selected picture in the text opens a line under it (Shift+Enter over it), Alt+Up/Down moves it past the line above or below. A picture an undo had taken out of the note no longer swallows the next Delete.
- Embeds: eight handles, four sides and four corners, shown on hover; a new embed has them at once (the first build added its one grip only when a note was opened again - the owner's embed had none).
- Probe care: an earlier probe here called navigator.credentials.get for real and opened a Windows passkey dialog on the owner's screen; no probe calls WebAuthn any more.

---

## [2026-09-29 06:30] v0.9.3 - by Claude (second round)

The owner tried the first Nebula Test.exe and wrote back in the chat and in the Ideas note (04:56).

- Languages: the four are always open, in the version's line right of it, small (the owner's drawing); folded, the rail shows EN / DE / PL / TR one under another. The spelling check and its suggestions follow the chosen language only (English only when it has no dictionary).
- Labels: a #word in the text is a label of the text and no longer goes into the note's own labels. "Filter by label" under the filter box opens a search box and two groups, Note labels and In the text; the button names the label picked and its × clears it. A tag chip is one piece (contenteditable=false): Enter after it carried it to the next line and every tag typed below went inside the one above - the owner's note held #label6 inside #label5 inside #label4. Old notes: migrate.repairTagChips takes them apart, words kept (museum exhibit). The six labels the first build had put on the Ideas note's title from its #tags were taken off in Nebula Test's vault.
- Passkeys: the Windows "Choose a passkey" window still came up in Gemini - the page script did not reach every page in time. Blink's WebAuth is now switched off for the whole app (--disable-blink-features=WebAuth): no page, frame or popup has the API, from the first load.
- The owner's note, three editing bugs, reproduced on a copy of the note and fixed: Backspace after a <br> at the start of a list item lifted the item out (and the next one armed the divider above) - the break is removed now; the first 0.9.3 build's "select the picture first" caught a LETTER at the start of a line under a picture ("R" could not be deleted) and an empty line under a picture - now only a caret at the very edge of its line counts, an empty line beside a picture simply goes and the words move up; after emptying a line between two pictures the caret could end up on the editor itself or in a caption - it is put back on a line.
- Toggle lists: a divider, /todo, /code and the to-do button inside a toggle stayed outside it or took the whole toggle; now everything stays in the body (checked: headings, both lists, to-do, quote, code, divider, a toggle in a toggle, the outline menu). Enter on an empty item one level in brings it back out (Chromium left a list inside a list).
- New from the note: crop a picture (✂ on its bar: drag the frame, Enter crops, Esc cancels, one undo restores; image-crop.js), and resize an embed by its bottom-right corner (width and --embed-h kept on the card; a video keeps its shape).

---

## [2026-09-29 04:10] v0.9.3 - by Claude

From the owner's "Ideas & Bugs" note in Nebula Test (and, in the chat, "when the languages are closed the language should sit above v0.9.2"). Not released: Nebula Test.exe for the owner to try; tests and the push only when the owner says push.

- Slow app / double-click stuck: every autosave wrote EVERY note again - the whole vault stringified, parsed, stringified per note, and copied into localStorage (12 MB in Nebula Test, with the two rebuilt articles): a 0.4 s freeze each time (measured on a copy of the vault: 2 long tasks of 411/417 ms per 80 keys; now none). A save names the notes it is for (NoteStore.save(changed)); the mirror serialises only those; with the notes on disk, localStorage no longer carries a copy (the boot copy is dropped at the first save, so an emptied vault cannot resurrect deleted notes from it). The sidebar line reads the first 40 KB of a note, pictures taken out, not the whole note.
- Four languages: English, Deutsch, Polski, Türkçe (i18n.js). Closed, the picker is one line with the language in use right above the version; open, the four in a row like the themes. The English text is the key; a MutationObserver translates the interface as it is drawn; the note, the title, note names, labels and the AI pages are never touched. The palette and the / menu find commands by their translated names too; the collapsed rail shows the translated theme and drawer words (attr() stayed English).
- Right-click: a misspelt word gets its suggestions (one Ctrl+Z takes a correction back) and Add to dictionary; a picture gets Copy image, its caption and Delete image; selected words still get the formatting bar. The main process forwards Chromium's spellchecker facts (electron/context-menu.js); the page draws the menu (context-menu.js). Spelling is checked in the app's language, English and Windows' preferred languages.
- Tab in a list moves the item under the one above it (Shift+Tab back), not the wrapper round the heading and the list (the owner's "all of them moved"). Outside lists Tab indents the line itself. Old notes: the indent the old Tab put on such a wrapper is removed (migrate.dropWrapperIndents, MARKUP_VERSION 0.9.3, museum exhibit).
- A click picks a divider (dividers.js): outlined, Backspace/Delete removes it, other keys carry on in the line below; the caret no longer appears "from an odd place".
- A picture in the text: Backspace at the start of the line under it (or Delete at the end of the line above) silently deleted it with the join; now the first press selects it. Double-click opens its caption. Ctrl+C/Ctrl+X copy the picture itself (PNG through the main process).
- Toggle lists (toggles.js): toolbar button beside the to-do and /toggle; Enter in the title goes into the body, Enter on an empty last line leaves it, Backspace at the start of the title turns it back into lines; the open state is kept with the note; a list inside a toggle stays inside it.
- @ mentions another note (a chip that opens it and follows renames), #word + space/Enter adds a label chip and the note's label, and label chips over the note list filter it (mentions.js).
- A font for each note: the font and size picked last in a note (note.font) are what its new, empty lines are written in; text already written keeps its font; Serif (default)/17 clears it.
- AI tabs are not offered passkeys (NO_PASSKEYS before every page via the DevTools protocol): the Windows "Choose a passkey" window came up before an address was typed in Google, ChatGPT and Mistral. Browser sign-in handing the session back to the app is not possible for these sites (0.9.0 tried it; cookies do not come back).
- Windows Firewall question: Nebula opens no server; Chromium's WebRTC (AI tabs, embeds) waited for peers' UDP on every card and announced itself over mDNS. WebRTC now goes through a relay only (disable_non_proxied_udp, mDNS off) - measured: no UDP host candidates. Not reproducible on demand, since Windows asks once per program path.
- Guide: "New in 0.9.3" and each feature in its section (GUIDE_VERSION 0.9.3, signature ba8043ce); release notes for 0.9.3.
- `npm run kill` (the first step of pack:test, pack:win and reset) ran `taskkill /IM Nebula.exe /F`, which force-closed the INSTALLED Nebula too, unsaved notes and all - against the never-the-installed-app rule. It now closes only processes whose executable is inside this project (`--dry-run` shows which).
- Also found this session: the Lea shadow replay of this very prompt was editing this repo at the same time (it reverted its own edits when it noticed); the rig is fenced now, in the Optimizing CLI project.

---

## [2026-09-28 07:59] v0.9.2 - by Claude

Google sign-in in the app, Theme color, pasted words in the note's font, B/I/U follow the shortcuts, centred bullets, leaving a list keeps the font, the picture bar follows its picture, a clearer note menu.

* (no commits since the last release)

---

## [2026-09-28 06:59] v0.9.2 - by Claude

From the owner's Bug Finding note and snapshots; the owner tested Nebula Test.exe and said push (new rule: changes, then the owner tests, then all tests and the push).

- AI tabs: 0.9.0 sent Google sign-in to the system browser, which never brought the session back and left Gemini blank (it passes accounts.google.com just to check who is signed in). Sign-in now stays in the tab's own session: Google's pages get a Firefox request header and, once one has arrived, a Firefox identity; "Continue with Google" opens a small window of the app in the same session. Switching the identity during a navigation restarts it — on a redirect that looped; the smoke check caught it, and the switch happens only after a page arrives. The "Open in browser" button is gone.
- B, I and U follow Ctrl+B and Ctrl+I with a bare caret before any word is typed (a pending mark, read from the typing state at the moment of the switch).
- Bullets stand in the middle of the text line: the marker uses the item's own line box and is scaled, not given its own smaller font.
- "Theme color (default)" heads the text colour list and also takes off fixed colours that pasted text carried (black on black in the Dark theme).
- Pasted HTML takes the note's font, size and colour (paste-clean.js); from Nebula itself, the colour, scrollbar and font Chromium writes into every copied element go too.
- Leaving a list or a run of to-dos with Enter keeps the font the lines were written in (lists.carryLine).
- The picture's bar hides while the picture is scrolled out of the note; selecting a picture brings it into view first (the page rebuild caught a caption lost to a bar hidden under a just-pasted picture).
- The ⋯ menu: Pin to top, Only view mode or Edit mode (no checkbox), Edit labels, Archive this note, Move to trash last.
- AGENTS.md: release only when the owner says push.

---

## [2026-09-27 20:52] v0.9.1 - by Claude

Old notes heal too, and deleted is deleted: one serializer keeps on-screen state out of notes, opened notes are repaired without being dated, every note is repaired once per version after a backup, a note deleted from the Trash leaves every backup, and the editing bugs found in the owner's notes are fixed.

* (no commits since the last release)

---

## [2026-09-27 04:46] v0.9.1 - by Claude

The owner: a bug fixed in the app keeps living inside the notes it already touched, on every computer; continuing an old note keeps the bug, only a new note is clean — "this must be solved". The same request was written in the owner's own Ideas note.

Measured first: the long-note trials on copies of the owner's notes with 0.9.0 failed in most places (installed Ideas 0/19, a second note 9/19), where the guide and the rebuilt articles passed everything — the trials had only ever run on notes the current version wrote. Causes found and fixed:

- The save wrote the editor's markup as it stood, so on-screen state was frozen into notes (a picture "selected" for good in the Ideas note). One list of on-screen state now serves the save, every undo step, export and print (note-markup.js).
- Repairs on open only added what was missing, so a control an older version drew wrongly stayed wrong. A shape's outline and grips are rebuilt to this version's form; saved on-screen state and empty canvases go on open.
- Repairs on open lived on screen only and were saved later as an EDIT, so looking at an old note moved it to the top as "just now". The repaired note is now the baseline and is written back as a repair, date and order unchanged (editor.adopt, store.heal).
- A note nobody opened kept the old markup for search, the sidebar, exports and other computers. On the first start of a version that changed the markup, every note is repaired while idle, after a pre-heal-<version> backup, only if its words, pictures, links, shapes, code and equations come out the same (heal.js).
- A link's page title arriving was an input event, so after an undo it threw the redo steps away; it is absorbed into the current state now. An embed is not named after an error page any more ("Service unavailable" in the Ideas note).
- Enter then Backspace in text set in a font left the line built differently (two spans, a no-break space), and the next Backspace ate a space; the halves are joined again. /todo and /code typed on a line of their own right above a picture landed inside the list below it; they take that line's place now.
- "/h3" (or /h2, a list) on a new line in text set in a font made an empty heading and the words typed next went into the paragraph under it — the owner's "Heading 3 sometimes does nothing". The line was an empty span once the command was taken out, with no line box to hold a caret; a converted empty line now gets its <br> inside the font it kept.
- Enter copied a line's arrow anchor onto the new line (one anchor on nine paragraphs in the Ideas note), and dragging an arrow stamped anchors on every block. The new line lets go of the copy, and on open an anchor no arrow uses goes.
- Backspace at the start of a block joined only its first line (up to a <br>) to the line above and left the rest outside, a list item's other lines among them; the whole block is joined now, its words kept in their font.
- The guide said "PicturesNebula" since 0.8.9.

Deleted is deleted (owner: "a note I deleted must not be recoverable — that is a security hole"). A note deleted from the Trash now leaves every backup too, overwritten first (electron/backup-purge.js), and the first start of 0.9.1 takes the notes deleted earlier out of the backups once, refusing if the vault is empty or unreadable. Found and removed with the owner's approval: 28 deleted notes in Nebula Test's backups, an old vault copy on the flash with 22 notes deleted on this computer, the flash's test-results, Codex's work folder with exports of the two report notes, and 165 temp test profiles (two with copies of the owner's notes). Tests now clear what killed runs leave behind.

New: a hand-written old note in smoke's long-note trials, and npm run old-notes, which runs the trials on copies of this machine's own vaults. AGENTS.md: a fix whose bug could have written into a note also repairs the notes already written and adds a museum exhibit. The flash mirror no longer copies test-results (the owner had excluded it on 2026-09-25; the release's own sync kept copying it).

---

## [2026-09-27 03:58] v0.9.0 - by Claude

Labels, four image corners, bookmark titles and Google sign-in in the browser; shape text, arrows, undo, Backspace and locked-note fixes from the two report notes.

* (no commits since the last release)

---

## [2026-09-27 02:00] v0.9.0 - by Codex, finished by Claude

Owner requested fixes from two local reports and browser sign-in handoff. Labels beside the title with a searchable row-menu picker and native export/import; four image resize corners; bookmark page titles and accurate embed errors; Google sign-in hands off to the default browser. Selection Backspace, locked canvas objects, shape undo, text fitting, rotation controls and shape-outline arrow attachment corrected. Large-note sidebar text extraction avoids parsing base64 payloads.

506 unit tests and 22 focused Electron checks passed. The earlier broad smoke sidebar failure was traced to a CSS transition stuck at time zero in an occluded Windows test window; the layout test now completes the real transition before measuring both collapsed and expanded width. Full Electron smoke passed: 354/354 checks. Report copies were tested in temporary profiles; original files remained byte-identical. Google redirect routing is tested with a local HTTP redirect and a mocked OS browser call; successful provider authentication is not claimed. Browser cookies do not transfer back into embedded AI tabs.

Finished by Claude after the Codex session hit its limit: the release run had stopped in the rebuild's long-note trials ("Application exited", followed by ^C) as that session was killed, not a crash in the app. The new modules (labels, link preview, link metadata, browser sign-in, shape anchor) were rewritten from compressed one-liners into the codebase's style with no change in behaviour. The guide's "New in 0.9.0" list now holds only 0.9.0 features (0.8.9 moved to "Recently"), and the release notes follow the file's own format.

The first full release run then failed the long-note trials in both rebuilt articles, which is a real 0.9.0 bug: a YouTube embed's webview first reports just "YouTube" as its title, and the new title code wrote that over the title saved in the note and marked the note edited. That extra edit moved undo by a step and dropped redo. A card now takes a fetched title only while it still shows its address, a webview's title counts only once the page has finished loading, and a title already in the note is never replaced; an address an older version wrote in another format still counts as no title. Nothing was committed by the failed runs.

---

## [2026-09-26 00:15] v0.8.9 - by Claude

Only view, arrows that snap on, F12 window snapshot, diamond/triangle outlines, a fuller guide with dividers; long-note trials and the undo, Backspace, underline and block fixes they found.

* (no commits since the last release)

---

## [2026-09-25 19:30] v0.8.9 - by Claude

The owner's list for the guide, shapes, arrows and a snapshot key.

* **Only view.** A note's ⋯ menu has an *Only view* checkbox; the 🔒 badge by the title shows it and unlocks it with a click. The note still reads, scrolls, selects, copies, opens links with Ctrl+click and plays its videos. `contenteditable` alone was not enough — code, shape text and captions are editable islands, and the app's own Enter/Backspace/drag handlers edit by script — so the lock is in the capture phase (input, keys, paste, cut, drop, the handles of shapes, pictures and arrows), in the toolbar's actions and in undo/redo. The guide seeds, and refreshes, locked.
* **Arrows snap on,** XMind-style: an end brought inside an object or within 28px of its edge is outlined and snaps to its side while still being dragged; letting go joins them. Before, it had to be dropped within 18px of the target's centre. Objects win over text, and with the pointer over several, the one painted on top; a text line only holds an end from inside.
* **Shapes.** Selected, the diamond and the triangle outline their own edges instead of a box ring; the diamond's turn and resize handles sit at the bottom corners like every other shape's.
* **F12** saves a picture of the window as a PNG in Pictures\\Nebula and copies it; a toast says where. Caught in the main process on every web contents, so it works with the focus inside an embed too.
* **The guide** now covers every part of the app (the window, the note list and ⋯ menu, Only view, find, palette, undo, the / menu, quotes and dividers, all four ways of pasting a link, import/export/print), and its order is the owner's: Where your notes live is 9, Code blocks 10 and last, Markdown the first sample. From now on new features go in above Code blocks.
* The guide has a divider before every section heading, and it is regenerated with every build: `pack:test` writes this build's guide, locked, into Nebula Test's vault, and the new smoke module `tests/e2e/guide.mjs` (8 checks) opens it in the app — locked, a divider before each section and never two in a row, Where your notes live and Code blocks last with Markdown first, every sample coloured, every equation typeset, the shapes clear of the text at three widths, no page error.
* New smoke module `tests/e2e/view-snap.mjs` (22 checks).

---




## [2026-09-25 07:51] v0.8.8 - by Claude

Pictures and shapes on one canvas, sharper videos, Rust, and the link menu by keyboard.

* (no commits since the last release)

---

## [2026-09-25 06:30] v0.8.8 - by Claude

The owner's findings on the 0.8.7 test build, and pictures and shapes on one canvas. 0.8.7 was never released; its notes (Rust, link menu keys) ship with this.

* **Undo order.** Moving a picture and then typing were one undo step: the first key of a typing run did not close the scripted change before it. `history.typed` now commits at the start of a run, for every scripted edit (drag, resize, image bar, shape bar).
* **"Saving…" stuck.** Every input set it; the flush after an input that changed nothing (selecting an image, clicking an arrow) returned without setting "Saved".
* **Videos.** The card was 560px wide, and YouTube chose its 640×480 thumbnail and a low stream for that size — soft, pixelated. The card now fills the column up to 960px (the 1280×720 thumbnail), the player comes first and is black while loading, the link is one quiet line under it, and the preview-blocked hint is gone for videos.
* **One canvas.** Floating pictures now live on the shapes' two layers (over and under the text), so a picture and a shape stack in one order and can be dragged over each other; ▴ puts the picked one on top. Old notes' image layers are merged on open, with images after the shapes, as they painted. The image bar has three placements — behind, above, in the text — the current one lit, instead of the ⇄ toggle. Found while testing and fixed: selecting a picture left a selected shape's bar open (the image handler stops its mousedown), and an arrow tied to a picture did not follow a drag.
* New smoke module `tests/e2e/canvas.mjs` (22 checks, real pointer): the merge on open, stacking both ways, dragging each over the other, one selection at a time, an arrow following a picture, undo/redo order around a drag, resize and its undo, behind/above/in the text, switching notes, the save indicator, Delete and its undo, a restart, the video card's layout. 9 of them fail on 0.8.7.

---



## [2026-09-25 05:00] v0.8.7 - by Claude

Two features the owner asked for.

* **Rust** code blocks. The highlighter builds one regex per language with a capturing group per rule, so Rust's rules use none of their own: raw strings (`r"…"`, `r#"…"#`, `r##"…"##`) are spelled out instead of matched with a backreference; a char literal must close after one character or escape, which is what separates `'x'` from the lifetime in `&'a str`; attributes, macros (`println!`), suffixed numbers and primitive types are coloured.
* **The link menu by keyboard.** After pasting a URL the address box has focus; ↓ lights the first choice (Embed), ← → move between them and wrap, Enter applies, ↑ returns to the address, Esc closes the menu and puts the caret back. The lit choice is outlined and the hint names the keys.
* The guide (0.8.7) has both: "New in 0.8.7", the keys under Links, and a Rust sample under Code blocks.

---




## [2026-09-25 03:54] v0.8.6 - by Claude

Pasted images sit in the text, an arrow menu, and a guide that keeps up.

* Keep the page-rebuild test local
* Rebuild test: keep the rebuilt page in Nebula Test's vault
* Tests: build the login-URL fixture through the URL API

---

## [2026-09-25 04:30] v0.8.6 - by Claude

From the owner's screen recording of the rebuilt article opened in Nebula Test at full screen.

* Images were placed by pixel position, so at a window width other than the one they were placed at, the text rewrapped under them: pictures lay over paragraphs and the blank lines made to clear them became gaps. A pasted image now goes into the text on the caret's line and flows with it; ⇄ on the image bar floats it (or puts a floating one back). A dropped image still floats where it is dropped.
* A caption on an in-text image hung over the next paragraph: the floating-caption rule had the same specificity and came later in the file. Two classes now.
* Arrows were at the end of the shape list without icons, so their names fell into the icon column and read "S…", "E…", "C…". They have their own menu beside the shapes, with pictures.
* A working video player no longer carries the "preview blocked" hint.
* **The guide:** owner's rule from now on — every release adds its features (not fixes) to "Welcome to Nebula Guide". It gained "New in 0.8.6", sections for links/pictures/videos and for moving a note, arrows and rotation under Shapes, and four themes. Its demo shapes stand in a row on a stage above the H1 instead of over the opening paragraphs. An existing vault's guide was never refreshed before; `ensureGuide` now replaces a guide whose text still matches a shipped signature (`GUIDE_SIGNATURES`) and leaves one the user wrote in alone.
* The local page-rebuild test missed the scattering because it measured only at the width it wrote at. It now measures at three widths and counts blank-line runs; it also rewrites a second article. `tests/e2e/rebuild-findings.mjs` pins the arrow menu and an in-text image at two widths.

---




## [2026-09-25 02:06] v0.8.5 - by Claude

Links on words, image captions, YouTube players, and a page-rebuild test that scores 100%.

* (no commits since the last release)

---

## [2026-09-25 01:45] v0.8.5 - by Claude

A new kind of test: rewrite a real web page in Nebula with Nebula's tools, score it, and hold every release to the last one's score.

* `npm run rebuild` (tests/e2e/rebuild-page.mjs, local only) writes a real web article into a new note the way a person would: title as Heading 1, subtitle in italics, section headings as Heading 2, text typed with Ctrl+B/I, quotes and dividers from the slash menu, each image pasted and dragged into place, each YouTube link pasted and chosen as Embed. It scores the saved file per feature and writes a report, the rebuilt note (`note.nebula.json`) and screens to `test-results/rebuild/<version>/` (gitignored: the article is not ours to publish). `npm run push` runs it after smoke and stops if any metric went down.
* 0.8.4 scored 65.2%. What it found: Enter could not leave a quote, so the rest of the note became quotes; italic switched off at a line end came back after Enter; a YouTube embed loaded the whole watch page (reported by the owner at the same time). All three fixed; the player also needed a Referer, or YouTube shows error 153. The first 0.8.5 run scored 90%; the remaining gap was links on words and captions, which Nebula had no tool for.
* Then the two gaps the report named were built: **links on words** (select words and paste a URL, or the toolbar link button; Ctrl+click opens; an empty address unlinks) and **image captions** (Aa on the image bar; the caption belongs to the image; Enter returns to the text — blurring alone had left the caret in the caption and every later key went nowhere). The rerun then found `/divider` nesting the rule inside an empty `<div>` line and the next heading with it; the slash menu now uses the toolbar's top-level divider. **Score: 100%.**
* `tests/e2e/rebuild-findings.mjs` (in smoke) pins those faults offline. Note-open clicks in the e2e modules stopped using Playwright's rAF-based wait, which timed out under load.
* Not pushed. Waiting for the owner to try `Nebula Test.exe`.

---





## [2026-09-25 00:02] v0.8.4 - by Claude

Slash commands on every typed line, the angle readout leaves on release, arrows can be deleted, safe Nebula note import.

* (no commits since the last release)

---

## [2026-09-24 22:40] v0.8.4 - by Claude

Tested the 0.8.3 test build against the Ideas note and fixed what did not hold.

* The 0.8.3 work was done in the flash copy (E:) and pushed by the release script without the owner's approval; the C: source was still on 0.8.2, so the owner tested an 0.8.2 exe. C: was fast-forwarded from GitHub. The v0.8.3 Release was set back to draft so installed copies do not update.
* Slash heading, list and quote commands did nothing on a line typed after a heading: Enter makes a bare `<div>` and `blockFromNode` only knew `p`/`li`/headings. It now returns a bare div line and wraps loose editor text in a `<p>`. The outline select uses the same path.
* The rotation readout stayed on the shape after release and was saved into the note. It is counter-rotated to read level, removed on mouseup, and stripped from saved notes on open.
* A selected arrow could not be deleted (the key came from `#editor`, which the handler excluded; Delete removed text instead). Capture-phase handler, and the selected arrow is highlighted.
* Importing a `.nebula.json` only removed `<script>`; an `onerror` ran in the app. `sanitizeNote` removes handlers, frames, script URLs and SVG animation while keeping shapes, arrows, embeds and data images. A raw vault note file (all that 0.8.2 can give) now imports as a note.
* The export dialog showed a Markdown filter for a Nebula note.
* Not pushed. Waiting for the owner to try `Nebula Test.exe`.

---




## [2026-09-24 17:54] v0.8.3 - by release-script

Slash stays on one line; arrows, embed webview, Nebula note transfer.

* (no commits since the last release)

---

## [2026-09-24 06:55] v0.8.3 - by Cursor

The Ideas note: slash commands, the title bar, arrows, embeds, and moving a note.

* A slash heading or list changes only the line under the caret. A divider nested in a list or heading is lifted out when the note opens.
* Backspace in the middle of a line, including on a slash, deletes that character instead of arming the divider above.
* Headings have no extra left padding. The Windows caption overlay is 37px tall so its colour matches the bar and the bottom rule is not drawn through the buttons.
* Rotating a shape shows the angle. Straight, elbow and curved arrows can be dragged and their ends can attach to a shape, link, image or text block.
* Embed uses a webview with its own partition, so a page that refuses an iframe can still load. Chat sign-in that still rejects the embedded browser can be opened with Sign in in browser.
* Export and import a Nebula note (`.nebula.json`) so the installed vault's note can be opened in Nebula Test without losing shapes or images.
* Not pushed. Waiting for the owner to try `Nebula Test.exe`.

---

## [2026-09-23 17:34] v0.8.2 - by Claude

Publish the v0.8.1 audit: fix the Mac CI lipo check

* (no commits since the last release)

---

## [2026-09-23 17:18] v0.8.1 - by Claude

Audit rich paste, strengthen regressions and clarify Mac upgrades

* (no commits since the last release)

---

## [2026-09-23 17:30] v0.8.2 - by Claude

v0.8.1 was tagged and pushed, but the new macOS CI assertion called
`lipo -verify_arch <arch> <file>`; lipo wants the file first, so build-mac
failed and no release was published. Fixed the argument order and moved the
0.8.1 release notes to 0.8.2 so 0.8.0 users see them. No app code changed.
The rich-paste restart check waited for "Saved" on requestAnimationFrame,
which stalls in an uncomposited window (full-run-only timeout); it now polls
every 50ms like recovery.mjs.

## [2026-09-23 08:20] v0.8.1 - by Codex, finished by Claude

Codex hit its usage limit at `npm run push`; nothing had been committed. Claude
reviewed the uncommitted diff, re-ran `npm test` (370/370) and the full
`npm run build && npm run smoke` (231/231; the earlier TimeoutError no longer
reproduces), then released.

User asked to audit Luna's work, verify features/remaining bugs, extend regular
tests, update project memory and explain GitHub/macOS upgrades more clearly.

- Fixed inert link deletion, Embed behaving like a bookmark, block insertion
  ignoring selection, stale image decoding after note switches, corrupt-image
  placeholders, aspect ratio/drag extent, selection polluting undo, rehydration
  disrupting undo/redo, lost imported image geometry, and inline Backspace
  jumping over preceding prose.
- Added sandboxed previews with an external-link fallback; non-embed links
  remain network-free. Supported raster images survive HTML geometry import;
  Markdown images return as images. Document exports omit live frames/controls.
- Added 19 regular unit and 14 Electron checks, including actual embedded
  content, real pointer drag, deletion/undo/redo and image restart persistence.
- Added generated release bodies, Mac unit/artifact/universal-architecture CI
  checks and save/backup/replace/verify/security guidance. Corrected old claims
  about Mac automatic updates, nonexistent signing hooks and snapshots.
- Updated ProjectNotes, README, Prompt, HANDOVER, tests and memory. Temporary
  test profiles only; user notes were not edited. A hands-on Mac upgrade remains
  unverified on this Windows host; external sites may still refuse an iframe.





## [2026-09-23 02:43] v0.8.0 - by release-script

Links, images and steadier caret editing

* (no commits since the last release)

---

## [2026-09-23 01:04] v0.7.7 - by release-script

The remaining Untitled editor edges

* (no commits since the last release)

---

## [2026-09-22 23:55] v0.7.6 - by Codex

Fix editing in the two Untitled report notes

* (no commits since the last release)

---

## [2026-09-22 18:25] v0.7.6 - by Codex

<!-- agent-note: gpt6astra tarafından eklendi -->

Asked to start with the problems written in the current Untitled 1 and 2 notes.
Read both originals and reproduced their structures on temporary profiles.

- Legacy overlays no longer block native prose joins; loose marked text receives
  a real paragraph, preserving its words and formatting.
- Underline decoration now lives at the actual text run, so coloured text and
  its line share ink. Wavy underline no longer forces the accent colour.
- The overlay deletion guard allows edits inside shape text; Backspace and undo
  work without deleting the shape.
- Divider handling uses the nearest paragraph, not a whole outer wrapper:
  remove the blank line, select the divider, then delete it on the next press.
- Shifted the code language box left and added an 8px text inset, retaining its
  dropdown arrow background.
- Added eight unit and sixteen Electron regressions, including both highlighted
  line starts. Both original report files stayed byte-identical. The bottom
  square drag already worked in this reproduction and was left unchanged.

---


## [2026-09-22 17:33] v0.7.5 - by Codex

Safer saving, precise formatting and stable shape dragging

* (no commits since the last release)

---

## [2026-09-22 17:20] v0.7.5 - by Codex

<!-- agent-note: gpt6astra tarafından eklendi -->

Recovered the interrupted Astra request from history and completed the existing
editor/save changes without resetting the worktree or the user's note vaults.

- Saves now wait for disk acknowledgement; failed writes remain retryable and
  cannot silently show Saved. Closing and installing an update flush title and
  body first, keep the app open on failure, and require the pre-update backup.
- Pending buffers retain their original note ID through archive, trash and
  switching. A partially unreadable vault stays protected against seeding.
- Inline formatting uses exact DOM boundaries, including repeated words and
  native underline wrappers; docked menus stay clickable inside the viewport.
- Markdown export keeps wrapped/raw text and code blank lines; longer code
  fences round-trip, unsafe imported URL schemes are rejected, and code-block
  editing uses the real caret boundary and undo history.
- Reproduced the lowest shape sticking at the bottom while dragging. Preserve
  canvas extent on its non-scrolling layer; release that space after the last
  shape is deleted.
- Added unit and real Electron recovery coverage. The original reported note
  was copied only into a temporary test profile and remained byte-identical.
- Development attribution stays in these source comments and is removed from
  the generated public site. Existing unrelated USB-mirror changes are preserved.

Validation: 338 unit tests; 187 standard Electron checks. See tests.md for the
failure-before/fix-after measurements and the optional real-note reproduction.

---
































## [2026-09-10 12:41] v0.7.4 - by claude

the note, copied by hand

* (no commits since the last release)

---

## [2026-09-10 03:02] v0.7.3 - by claude

built the note by hand

* (no commits since the last release)

---

## [2026-09-10 02:00] v0.7.2 - by claude

the indicator, read from two screenshots

* Site: the generated page for v0.7.1

---

## [2026-09-10 00:43] v0.7.1 - by claude

what is actually about to be deleted

* (no commits since the last release)

---

## [2026-09-09 23:32] v0.7.0 - by claude

a blank line that is really blank

* (no commits since the last release)

---

## [2026-09-09 22:48] v0.6.10 - by claude

a blank line that is really blank

* (no commits since the last release)

---

## [2026-09-09 21:34] v0.6.9 - by claude

printed as a document, and shapes you can turn

* (no commits since the last release)

---

## [2026-09-09 18:25] v0.6.8 - by claude

the page edge, and lists that line up

* (no commits since the last release)

---

## [2026-09-09 17:06] v0.6.7 - by claude

switches that switch off

* (no commits since the last release)

---

## [2026-09-09 16:53] v0.6.6 - by claude

switches that switch off

* (no commits since the last release)

---

## [2026-09-09 16:35] v0.6.5 - by claude

switches that switch off

* (no commits since the last release)

---

## [2026-09-09 14:26] v0.6.4 - by claude

reproduced against the note that reported it

* Collapsed rail: drop the dead count rule beside the label
* Release: never sit on an interactive credential prompt

---

## [2026-09-09 03:37] v0.6.3 - by claude

what the old notes were still holding

* (no commits since the last release)

---

## [2026-09-08 15:22] v0.6.2 - by claude

Code blocks wrapped in a colour can be removed, underline needs a selection again, the size field has a working caret, shapes show a caret and grow to fit, and the pink fringe on menu text is gone.

* (no commits since the last release)

---

## [2026-09-08 13:28] v0.6.1 - by claude

The second bug report: a title can no longer be lost by pressing New note, code blocks in older notes are deletable, the diamond and triangle have outlines again, and printing goes through Chromium rather than the platform.

* Close running Nebula before the release gates, not after the tag

---

## [2026-09-08 00:05] v0.6.0 - by claude

Export a note as Markdown, HTML or a real PDF, import one back, and fourteen fixes from the bug report — including a code block you can finally delete and a size box that actually changes the text you selected.

* (no commits since the last release)

---

## [2026-09-07 20:30] v0.5.0 - by claude

The editor gets its own undo stack, notes gain pin, archive and trash, and the app draws File, Edit, View, Window and Help beside an enlarged logo with a Ctrl+K command palette.

* (no commits since the last release)

---

## [2026-09-07 16:20] v0.4.4 - by claude

Ctrl+Z no longer duplicates text, Ctrl+F finds inside a note, the sidebar filter searches whole notes, buried shapes are selectable again, the collapsed rail keeps everything, plus a White theme and a Chrome user agent for the AI views.

* (no commits since the last release)

---

## [2026-09-07 14:43] v0.4.3 - by claude

Colours are stored as names, so a note reads correctly on all three themes; AI tabs no longer reload and log you out; shapes drag from anywhere; the note list folds away.

* Refresh the test exe even if it is reopened mid-build

---

## [2026-09-07 06:31] v0.4.2 - by claude

One starter note: Welcome to Nebula Guide covers every feature on a single page, with a working code sample for all fifteen languages — and an existing vault is given a copy.

* (no commits since the last release)

---

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
