# Nebula release log

One entry per release. Written by `npm run push`; edit freely afterwards.








## [2026-10-12 08:27] v0.9.4 - by Claude (the first build of the tag stopped on the Mac; the tag was moved to the fix)

`npm run push` passed every gate on this computer and pushed v0.9.4. On GitHub the Mac job of the Release workflow, and the Tests workflow on Linux, stopped at two unit tests of "Open with Nebula" (tests/open-file.test.js, written earlier in 0.9.4 and never run off Windows): they named files "C:/Users/me/..." with backslashes, which is an absolute path on Windows only. The publish job needs both builds, so no release was made and no installed copy was offered anything.

Done: the two tests build their paths for the machine they run on. Nothing in the app changed. The fix is one commit on top of the release commit, and the tag v0.9.4 was moved to it (the tag had no release yet) so the workflow builds 0.9.4 from a tree whose tests pass on all three systems.

Unit 1121 of 1121 here; the result on GitHub is in the entry that follows, or in the workflow's page.

## [2026-10-12 08:19] v0.9.4 - by Claude

Two ways to paste, toggle headings, tables, columns, note folders, black holes, a lock on opening, Settings, the guide in four languages, Electron 44.7.

* (no commits since the last release)

---

## [2026-10-12 07:54] v0.9.4 - by Claude (the owner: "push 0.9.4" — what was done before the release ran)

The owner said push. Everything below was done before `npm run push`, which then ran its own gates again.

- Electron 44.5.1 -> 44.7.0 (`npm run check:browsers` had it behind; the same major, no breaking changes to read). A test instance left running by a run that hung at 06:10 held the old files and was closed first.
- The smoke suite had not run since notes became folders and Settings joined the menus. Brought up to both: note files are found in either layout (`tests/e2e/profiles.mjs` `noteFilesIn`, `readNotesIn`, `noteFileOf`, used by smoke, recovery, ideas-note and dense), six menus, 21 blocks in Help -> Blocks, no counters beside Archive and Trash, the three headings found among the six rows "/head" gives now. The sweep of stale test profiles knows the newer suites' folders.
- The toggle check that failed about one run in three ("a click on the arrow still folds it"): the embed above the toggle settles into its "could not load" card a moment after the note opens and the toggle moves down with it; the click was aimed at where the title had been. The check measures the title once it stands still, and again for the second click. Passed 6 runs of 6 afterwards and in the full smoke run; the move itself was reasoned from the note's markup, not measured.
- The long-note trials on copies of Nebula Test's notes (`npm run old-notes`) found nothing to read (they looked for notes/<id>.json); they read note folders now and take a note's pictures along. On one note 10 trials then failed, for three reasons, none of them a loss of words:
  1. A `<br>` after the last words of a line (pasted paragraphs end in one) draws nothing, and Enter then Backspace there take it away; the trials compared markup and called that a change. The comparison leaves such a `<br>` out. A `<br>` that is all a line has, or that follows another, still counts.
  2. A divider made on a new line above empty lines and deleted with Backspace takes those empty lines first. That is the rule the owner asked for ("the empty white row underneath is still there") — the trial could not give the note back there.
  3. An emptied code block leaves the caret on the empty line that was already under it.
  For 2 and 3 the trials now pick a paragraph with words right under it, where the note has one. 42 of 42 afterwards.
- The local page rebuild (not in the repository) read the vault the old way too. It reads note folders, keeps the article's pictures beside its report, keeps what the owner did with the note in Nebula Test (its folder, its place), and no longer puts back a note that is not in the vault any more. Both pages 100 %, as in 0.9.3; 41 trials passed.
- A test took four words of a paragraph the owner had pasted into a note as its sample; neutral words stand there now.
- README, HANDOVER, Prompt and memory.json describe 0.9.4.

Unit 1121 of 1121. Smoke 916 of 916 (the run before the last fix: 915, the toggle click). Old-notes 42 of 42. Rebuild 100 % and 100 %.

## [2026-10-12 06:58] v0.9.4 - by Claude (the note "Buraya bak" again: two ways to paste, a toggle's frame stuck, a picture that would not grow to the right, the font the bar names; not released)

The owner's note "Buraya bak", three new pictures with a line each (06:24-06:32):
1. "Instrument Sans is the same font as Segoe UI; why does it say that up there, it does not change" — the bar read "Instrument Sans" on words pasted from a page, drawn in Segoe UI.
2. "It does not grow to the right any more, and the toggle list is stuck at the top left."
3. "Let us do it like this: paste as Nebula format (the note's format, its font and so on); paste as original format (the same font as in Nebula — the other font setting goes, no font of another source; only the source's font size, and bold, italic, underlined etc. where it has them); the option paste only text goes. Like this for now."

Done:
- Pasting (paste-clean.js `cleanPastedHtml(html, { keepSize })`, `pastedSizePx`; rich-paste.js; context-menu.js): "Paste original format" is the paste as Nebula format plus the SIZE the words were copied in (px, pt, rem, a size word or `<font size>`; 8 to 96; not inside a heading or code). Bold, italic, underline, lists and links are kept by both, as before. No font, colour or ground of the source. This turns round the build of 05:31, which kept the font and not the size. "Paste only text" is gone from the right-click menu; the mode 'text' is gone from the paste handler. A paste is no "font used" any more.
- The bar's font name (toolbar.js `shownFont`): a stack whose first font is not on this computer is named after the first font in it that is — `"Instrument Sans", system-ui, "Segoe UI"` reads "Segoe UI". The app's own fonts keep the app's names. The "Last used font" row is named, and written, the same way.
- The toggle (toggles.js `healToggles`): words selected from a toggle's title down into its body and deleted left the frame alone, a `<div class="blk-toggle">` holding a line break; no key had a rule for it. Such a frame becomes plain lines (an empty line when it holds nothing) — after every edit, before Enter or Backspace in one, and when a note opens. The owner's note opens without it.
- Pictures side by side (image-place.js `tidyRows`, editor.css, export.js): a picture of a row could have its share of the line and no more; beside a narrow one it stopped at half the line with room left at its right. Each now knows what the others take (`--beside`) and may have the room they leave; together never more than the line. The others are told on every move of a resize.
- Guide and What's new in four languages ("two ways to paste"); new signatures, the last ones kept as the thirty-second test build.

Not done: the paragraph pasted earlier in that note with the page's ground and colour is the owner's own example and was left as it is.

Unit 1121 of 1121 (66 files). End to end: v094 111, layout 128, rich-paste 20, table 66, table-edges 151, v093 138, settings 123. v094's check "a click on the arrow still folds it" failed in 2 runs of 5 and passed in 3; it failed once before this round too (05:30 entry) — not looked into, and I cannot say this round did not make it likelier. Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide, black-holes, note-folders. Not tried by hand: a paste from a real browser page. Test build packed. Not pushed.

## [2026-10-12 06:15] v0.9.4 - by Claude ("+ Add a font" no longer stands under the fonts it opened; not released)

The owner: "we press + Add a font, the fonts open, and at the very bottom + Add a font is still there — what is the sense of it showing a second time, after the click?" None: pressed again it only listed the same fonts again.

Done (toolbar.js `paintRows`, editor.css): once the button has listed the computer's fonts it is hidden. It is back as `+ Add “name”` for a name typed into the search that is in no list, and as "+ Add a font" when the menu is opened anew. Where the computer's fonts cannot be read (nothing was listed), it stays.

Unit 1113 of 1113. End to end: v094 110 (+2), settings 123 — the settings suite's first run wrote nothing at all and ended; run again it passed in full, cause not looked for. Test build packed. Not pushed.

## [2026-10-12 06:07] v0.9.4 - by Claude (a font that is not on this computer is not added after all, and the app says so in the owner's words; not released)

The owner, on the build of 05:44, which listed such a font with the stack it came with and said "Added. That font is not on this computer, so its stand-in is shown": first "what is that error?", then, once it was explained: "then let it say: not on this computer, cannot be added."

Done: the entry of 05:45 is taken back. A font that is not on this computer cannot be put into the list — by the + of "Last used font", by its pin, or by a name typed into the search — and the app says "That font is not on this computer, so it cannot be added" (tr: "Bu yazı tipi bu bilgisayarda yok, eklenemez"). `cleanFontStacks`, `readFontStacks` and the `stacks` of `fontRows`/`fontChoices`/`customFontStack` are gone. What the 05:44 build listed (the names under `nebula:font-stacks`) is taken off the list and the pins at the next start, and that key is removed. The "Last used font" row still shows the font and still writes words in it at a press; only the list refuses it.

A slip of mine on the way, caught by the unit tests before the build: the edit of i18n.js took the line 'Pin to the top' out with the two it replaced. Put back.

Unit 1113 of 1113 (66 files). End to end: v094 108, settings 123. Test build packed. Not pushed.

## [2026-10-12 05:45] v0.9.4 - by Claude (the + of the last used font refused "Instrument Sans"; not released)

The owner, on the build of 05:31: "pressing add font, Instrument Sans gives the error 'that font is not in computer'" — the font of the paragraph pasted from the dark page in the note "Buraya bak". True of the font (it is the page's own web font; neither C:\Windows\Fonts nor the user's fonts have it), and no use to the owner, who sees the words in some face and wants that in the list.

Done: a font that is not on this computer is put into the list with the stack it came with (`"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif`), kept in `nebula:font-stacks` (`cleanFontStacks`: only a stack that begins with its own name, nothing that could end a style). In the menu and in Settings' font for new notes it is written with that stack, so words in it look as the pasted ones do: the stand-in the stack names here, the font itself on a computer that has it. The app says so once, when it is added: "Added. That font is not on this computer, so its stand-in is shown". Its × takes the stack away with it. A bare name typed into the search that is not on this computer is still refused — there is nothing to show it in. Nebula does not fetch fonts from the web.

Not changed: the paragraph pasted before 05:31 in that note still wears the page's ground and colour — it is the owner's own example; a new paste of it comes in the font alone.

Unit 1116 of 1116 (66 files). End to end: v094 109, settings 122, rich-paste 20. Test build packed. Not pushed.

## [2026-10-12 05:30] v0.9.4 - by Claude (the note "Buraya bak": the original paste is the font alone, the caret keeps its colour, the font used last; not released)

The owner's note "Buraya bak", two pictures with a line each. (1) "After pasting, the caret's colour changed on one line; on another line it is the original." (2) "When I say keep the copied format I did not say take the background too; I want it copied as its font only (the font's colour and size should fit the main source). And: the font used last should stand over Add font as 'last used font', and this font I copied and pasted should have a + (add font) and the pin beside it when the mouse is on it." The Ideas note has not changed since 02:10.

Done:
- Paste original format (paste-clean.js `cleanPastedHtml(html, { keepFont: true })`, rich-paste.js): the words come in the font they were copied in and nothing else of the source's dress — no colour, no size, no ground, no animation. The face is read from each run of words before the cleaning and put back as one span a line (a span a run where a line has two faces); code keeps its own. I read "the main source" as the note: colour and size are the note's. If the owner meant the page the words came from, this is the one thing to turn round.
- The caret: `.editor { caret-color: var(--ink) }`. Left to itself it took the colour of the words it stood in — on a line pasted from a dark page that page's pale grey.
- The font menu: "Last used font" over "+ Add a font" — the font picked last or brought in by an original paste, kept in `nebula:font-last`. Beside it, under the pointer: a + ("Add to the list") when it is not in the list, and the pin. A font that is not on this computer (a page's own web font) cannot be added, and the app says so.
- Found on the way, and older than this round: a pasted box of two or more paragraphs (`<div><p>..</p><p>..</p></div>`, what most pages hand over) came out of the cleaner EMPTY — lifting the second paragraph took the document's body apart. Nebula format then fell back to the plain text. Fixed, with a test.
- Guide (four languages, new signatures; the last ones kept as the thirty-first test build) and What's new (four languages).

Unit 1113 of 1113 (66 files). End to end: v094 106, rich-paste 20, settings 122, v093 138, layout 127, table 66. Two suites failed checks once and passed on the runs after it, in places this round did not touch: v094's two toggle clicks (1 run of 4) and layout's picture pulled to the left (1 run of 3). Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide, black-holes. Not tried by hand: a paste from a real browser page (the tests write the clipboard themselves). Test build packed. Not pushed.

## [2026-10-12 05:05] v0.9.4 - by Claude (the logo no longer changing in Nebula Test: the shortcuts are gone through gently; not released)

The owner, on the build of 04:50: "it does not change now in Nebula Test; it did before. Leave the program file's icon; only the shortcuts' should change. And keep the shortcut button." (And, on a sentence of mine that could be read two ways: the shortcuts, the taskbar and the Start menu follow the LOGO's theme; only the mark at the top left follows the app's theme. That is what was built; nothing to change there.)

What changed between the build that worked (04:00) and the one that did not (04:50): everyone's desktop and Start menu and the pins of Start were added to the places shortcuts are looked for, and Windows was asked to redraw its icons (`ie4uinit.exe -show`). Measured in the packaged test build on this computer, with its real folders: one change of the logo held the app's own thread for 1034 ms, reading every shortcut in one go. That is the thread Windows asks for the window's new icon straight after `setIcon`; asked while it stands still, it gets no answer. I could not watch the taskbar itself from a test, so this is the likely cause, not a proven one.

Done: `pointShortcuts` (app-logo.js) is asynchronous — the folders are listed without blocking, the shortcuts are read two at a time with the process let go in between, and a newer logo takes over from one still being put on. The main process puts the logo on the window at once, answers the window at once, and gives the shortcuts the logo 600 ms after the last change (5 s after a start). `ie4uinit` is not called any more: the build that worked did not call it. Measured again, the same way: the change is answered in 12-15 ms, and in the four seconds after it the longest wait for the main process was about 100 ms (median 1.5 ms). The button "Put a shortcut on the desktop" stays.

e2e: settings 122/122, black-holes 69/69, v094 97/97 on this build; the other suites as they ran on the build before (the change is in the logo's shortcuts alone). Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide. Not pushed.

## [2026-10-12 04:50] v0.9.4 - by Claude (the logo: themes of its own, "Nebula's own" in the test build only, more shortcuts; not released)

The owner, on the build of 04:00, in the chat.

1. "Nebula's own belongs to the test app only; normal apps must not have it." The test build has a logo of its own (iris) and offers it first as "Nebula's own"; no other build has that chip. In every build "Main" is the logo Nebula comes with (the violet one) — in a normal app that is the build's own logo, and choosing it keeps nothing; in the test build it is one more to put on. The main process says which (`logo:get` → `own`).
2. "A + beside Contrast: users add themes for the logo alone, and name them." Logo themes (logo.js `cleanLogoThemes`, `saveLogoTheme`, `renameLogoTheme`; kept in `nebula:logo-themes`): + asks for a name, offering one, and keeps the colours on the logo under it; each has a ×, asked first; a double-click on its name renames it. A name the editor has already — a fixed theme's, a profile's — is refused.
3. "A change made to a ready one is kept as a new theme." A colour changed while a fixed theme or a profile is on the logo makes a logo theme named after it ("Contrast 2", `nextLogoName`), and the changes after it go into that; a colour changed on a logo theme changes that theme. Nothing the app comes with is written over.
4. "When it is set it should change in the shortcuts, in the program files' logos, on the taskbar where it is pinned, in the Start menu." Shortcuts are looked for in more places now: this user's desktop and everyone's, both Start menus, and what is pinned to the taskbar and to Start (main.js `logoShortcutDirs`); after they change, Windows is told to draw its icons anew (`ie4uinit.exe -show`). The program file's own icon cannot be done: it is built into the file, and rewriting a running program is not something the app does to itself. What is offered instead: "Put a shortcut on the desktop" (app-logo.js `makeShortcut`), which makes one that starts this copy and wears the logo — the sheet says why.
5. "A logo theme does not mean the logo at the top left of the app is that one; that stays with the app's theme." It was so and is so: the mark in the title strip is drawn in the theme's accent. A check holds it now.

The guide: the logo's sentence in section 1, four languages; the signatures before this kept as "thirtieth test build".

e2e: settings 122/122, black-holes 69/69, v094 97/97, v093 138/138, layout 127/127, note-folders 60/60, rich-paste 20/20, table 66/66, table-edges 152/152, ai-sleep 16/16. Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide. Not tried: the packaged app against the real desktop, Start menu and taskbar — the shortcuts were a test's own, in a folder of its own. Not pushed.

## [2026-10-12 04:00] v0.9.4 - by Claude (Contrast as a ready profile; black holes: a PIN always, a passkey beside it, their password to delete one and to take a note out; the logo's colours in Settings; not released)

The owner, on the build of 03:00, in the chat.

1. "Call Black & White Contrast 'Contrast'; those two themes (the other is Matcha) are in Your own theme, as ready profiles, and users can delete them if they like." The owner's own saved profile (read from Nebula Test's settings: #F7F7F7 ground and sidebar, #2B2B2B lines, accent and words) is the ready profile **Contrast** now, beside Matcha (theme-custom.js). A ready profile has a × like any other; a deleted one is remembered (`nebula:theme-ready-removed`) and "Bring back the ready profiles" restores them. A saved copy named "Black & White Contrast" with Contrast's colours is Contrast and is not listed twice.
2. Black holes (electron/black-holes.js, src/js/black-holes.js):
   - "The 6-digit PIN compulsory, the passkey optional, as the app's lock." A new black hole is always made with a PIN; "Also open with a passkey" is a box in the dialog, and "Add a passkey" / "Remove the passkey" are in an open black hole's menu. The passkey is a second copy of the key, wrapped by the operating system alone (as a passkey-only black hole's key was). Opening shows the PIN's box and a "Use the passkey" button; nothing is asked of the system until it is pressed. A black hole of the earlier builds that a passkey alone opens still opens, and "Set a PIN" in its menu makes it a PIN black hole with a passkey beside it. After the recovery key on another computer the passkey's copy is dropped and added anew.
   - "Deleting a black hole must need its password." `delete(id, by)` checks the answer in the main process — PIN, passkey or recovery key — before anything is shredded; the Trash's Delete (after "Delete for good?") opens the question. Moving one to the Trash asks nothing: it comes back from there.
   - "A note put into a black hole can be moved back up among the notes the same way, and that asks for the password too — for the notes that are in one already as well." The rows of an open black hole are dragged (note-list.js); let go among the notes, or on a folder, the note is taken out and placed there. That, and "Take out of the black hole" in the note's menu, ask for the black hole's answer first (`prove`).
3. "The logo in Settings, at the bottom left, and at its right its colours — the colours of Nebula's logo on the desktop; in the style of Your own theme; the star, the moon, the ground and the rest; and the user's themes and the ready ones can be put on the logo, Contrast for one." A fourth group in the Settings sheet (logo-editor.js): the logo large and at 32 and 16 px; themes to put on it (Nebula's own, the four fixed themes, the ready profiles, the saved ones); five slots — Background, Border, Moon, Moon's shade, Star — the colour bar with its code, and the ready colours, all the theme editor's own pieces. The drawing (logo.js) is the shipped icon's geometry from make-icon.ps1, so Nebula's own is the icon on the desktop already. The window draws it at 256, 64, 48, 32, 24 and 16 px; the main process (app-logo.js) checks each picture is a PNG of its size, writes an .ico of them under a name made from the colours (Windows remembers an icon by its file's name) into `<profile>/logo`, and puts it on the window and the taskbar (`setIcon`) and on the shortcuts whose target is this copy of the app — on the desktop, in the Start menu, pinned to the taskbar, two folders deep (`shell.writeShortcutLink`). Back at Nebula's own nothing is kept and the shortcuts point at the program again. Only a packaged app touches real shortcuts. What cannot be done: a program file standing on the desktop itself keeps the icon built into it — the sheet says so.

The guide and What's new: the black holes' paragraph and entry, the ready profiles, the logo in Settings — four languages, 152 blocks; the signatures before this kept as "twenty-ninth test build".

e2e: settings 113/113, black-holes 69/69, v094 97/97 (+1; its three profile checks follow the ready profiles), v093 138/138, layout 127/127, note-folders 60/60, rich-paste 20/20, table 66/66, table-edges 152/152, ai-sleep 16/16. Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide. Not pushed.

## [2026-10-12 03:00] v0.9.4 - by Claude (the lock as the owner wants it; the caret under a divider; the bar's line; pins on hover; "Serif"; not released)

The owner, on the build of 01:40, in the chat and in two notes (the Ideas note, changed 02:10, and a note of their own, "sfdfsfd").

In the chat:
1. "Beside Nebula's own, say in brackets what it is." The first choice of Settings' font and text size reads "Nebula’s own (Serif)" and "Nebula’s own (14)" — the size from `BASE_FONT_SIZE` (toolbar.js), which a test holds to app.css. Found on the way: picking 17 still meant "the app's own size" (the size before 0.9.3; it is 14), and the guide said so in four languages. Both put right.
2. "For the lock the 6-digit PIN must be compulsory; a passkey is added as an option; the person logs in with whichever they like." A lock is a PIN now, always (electron/app-lock.js, rewritten). A passkey is added beside it — a box when the lock is set, "Add a passkey" later, which asks for the PIN first and then for the passkey's own yes — and then either opens the app. "Remove the passkey" takes it away at a press.
3. "Turn the lock off should turn the locking off, not delete the lock; deleting must be called Remove lock." Two things now: off keeps the file (its PIN, hint, passkey and recovery key) with `on: false`, and "Turn the lock on" brings the same lock back with nothing to type; "Remove lock" deletes it. Both, and adding a passkey, ask for the lock's answer first.
4. "When Nebula is locked the passkey is called at once by itself; the person should have to press log in." The lock screen shows the PIN's box and, where a passkey was added, a button "Log in with passkey"; the system is asked nothing until it is pressed. The same in the dialogs of Settings ("Use the passkey").
A lock of the build of 01:40 is still read (v1: `lock: 'pin'`, or `lock: 'hello'` — a passkey with no PIN, which that build allowed): the second opens and is removed by the passkey, and is set anew with a PIN.
Found on review, before it left the machine: "turn the lock on" set the app open, also for a lock that was on and shut — a call the window could make at the lock screen. It leaves such a lock exactly as it is now, and the passkey cannot be taken away while the lock is shut (tests/app-lock.test.js "while the lock is shut").

In the Ideas note:
5. "The divider line at the right does not cover the two icons at the bottom" (a snapshot): the line between the bar's two columns was the second column's left border, so it ended where that column did. Both columns draw it now, one over the other (editor.css).
6. "When I take the mouse to the fonts, the pin at the side": a font's pin is drawn only while the pointer is on that font; a pinned one keeps it.
7. "A bug again, the caret under the divider — look at the picture" (the caret pressed against a divider at the foot of a column) and "when I click where I want, the caret should be there, on that line: that is how we stop the caret getting lost or stuck." Three faults, all in the app's own rules:
   - Backspace on the empty line under a divider, when that line was the last thing of its column (or of the note, or of a toggle): the line was removed and the caret set "after the divider", on no line. On the note itself `settleGap` then moved it; in a column nothing did. That last line stays now and the divider is offered at once; the next Backspace takes it and the caret goes to the end of the line above. Where a card, a code block, a table or another divider comes up under it, the divider is picked (as over a picture) instead of a caret left between the two. `settleGap` also answers for a column.
   - A divider made with the bar left the caret after the `<br>` of the new line, which `neighbourAtEdge` did not read as the start of a line: the first Backspace was left to the browser, which took the divider and kept the line. `placeCaretEnd`/`placeCaretAt` stand before that `<br>`; `neighbourAtEdge` reads a blank line's `<br>` as nothing drawn, going back too.
   - A click on bare ground (gap-caret.js): under a divider that ends a note or a column a line is made; the ground just past a divider's own strip goes to the line on that side; and the empty foot of a column goes to that column's last line — it went to the paragraph under the columns.

In "sfdfsfd":
8. "Although I changed the main font in Settings, the title and the lines below say serif (default); take the word default away from serif." The font is "Serif". The note's title is written in the note's writing font (on screen; main.js `paintTitleFont`). The second line of the owner's note in the serif I could not make happen again — typed lines keep the font here, after Enter and after an empty line, and the suite now types three; if it shows again, the steps are wanted.

The guide (four languages, 152 blocks): the lock's paragraph and its "New in" entry reworded, "Serif" and 14, the title in the note's font; the signatures before this are kept as "twenty-eighth test build". What's new reworded.

e2e: settings 98/98, v094 96/96, v093 138/138, layout 127/127, black-holes 58/58, note-folders 60/60, rich-paste 20/20, table 66/66, table-edges 152/152, ai-sleep 16/16 (all but settings on the build before the last change to electron/app-lock.js, which settings and the unit tests ran after). Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide. Not pushed.

## [2026-10-12 01:40] v0.9.4 - by Claude (the Ideas note again: the bar's dividers at the side, the font menu's length and its pins, Settings beside Help, a lock on opening; not released)

The owner: "let us look at the Ideas for Nebula note again". The note (Nebula Test's vault, changed 2026-10-12 00:56) holds one snapshot — the bar at the right, the font menu open — and two paragraphs.

1. "At the right, make the line longer, the divider line." Last round this was read as the note's margins and I asked whether the bar's short lines were meant; the snapshot shows the bar at the right, so they were. The lines between the bar's groups were 20 px in a column of 46; they run the width of their column now (editor.css `.tb-sep` at a side: `align-self: stretch`). The margins of last round stay as they are.
2. "Make the font block longer — Cascadia is left below." The font menu was held to 520 px like every other menu and its fifteen fonts need about 560, so the list scrolled and the last name was cut. It is as tall as its fonts where the window has the room (toolbar.js `positionMenu`: 760 px for the font menu, the window's height less its margins at most).
3. "A pin beside the fonts, so the ones I like stand at the top." Each row of the font menu has a pin; a press puts the font first in the list (in the order pinned, a thin line under the pinned ones), the next press takes it down again. Kept on this computer (`nebula:fonts-pinned`). `fontRows` takes `pinned`; `togglePinned` is the press.
4. "Settings beside Help at the top; pressing it brings the settings up: a default font, a default note size, a default mode, hiding the AI tabs, hiding the black holes entirely, a PIN or a passkey when the app is opened — as a black hole has."
   - **Settings** is a title of its own after Help that opens a sheet at a press (app-menu.js: a `direct` menu), and a command in the palette. The store is settings.js (`nebula:settings`), the sheet settings-panel.js. A change is kept as it is made.
   - **New notes**: font, text size, page. Read as: "default font", "default note size" the text size, "default mode" the page — the owner's own word for the pages is "modes" (page-mode.js). A new note gets them as its own writing font and page (notes.js `setFont`, `setPage`), so nothing of an existing note changes. Found on the way: in a note with nothing in it the first line is the note itself, and the writing font was only given to a line — so the first words of a new note came out in the app's font. `writingFontAt` now takes the bare first line too.
   - **Hide the AI panel**: the panel shut, its button out of the pad (whose last button then stands as tall as both rows), "Toggle AI panel" out of the View menu and the palette (app-menu.js: an item's `when`). Back shut when turned off.
   - **Hide the black holes**: their section, their button and a note's "Move into a black hole" gone; the open ones are locked first; those in the Trash are not drawn either. Nothing is deleted.
   - **Lock on opening** (electron/app-lock.js, src/js/app-lock.js): a 6-digit PIN with an optional hint, or the passkey; five free tries then a growing wait; a recovery key shown once, which opens the app and takes the lock off. The window asks before it starts anything — nothing is read, no menu is built — and the main process refuses the vault's files, the black holes and the notes' pictures and videos while it is shut (`shut()` in main.js), so the gate is not only a screen. File → Lock Nebula (there only where a lock is set) saves, shuts and loads the window again. It is a lock, not encryption: `app-lock.json` in the profile keeps what the PIN hashes to (scrypt), the notes' files are as they were, and the sheet, the guide and What's new say so — a black hole is what encrypts. Taking the lock off asks for its answer once more.
   - A fault of my own, found by the rich-paste suite before it left the machine: the window's question "is there a lock" also waited for "has this computer a passkey", which on Windows is a PowerShell script — seconds added to every start. The state is told without it now; only Settings asks for it.

The guide: three entries in "New in 0.9.4", a paragraph on Settings in section 1, a sentence on the pins in section 3 — English, Deutsch, Polski, Türkçe (152 blocks each); the signatures of the guide as it was are kept as "twenty-seventh test build". What's new: one item, in the four languages.

Not done, and to ask: "default mode" may have meant something else than the page (the theme, or an AI tab's sleep); "hide the AI tabs" was read as the whole panel, not single tabs. Electron still 44.5.1.

e2e: settings 59/59 (new), v094 96/96, v093 138/138, black-holes 58/58, layout 127/127, table 66/66, table-edges 152/152, note-folders 60/60, ai-sleep 16/16, rich-paste 20/20. Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide (it is run from smoke). Not pushed.

## [2026-10-11 23:30] v0.9.4 - by Claude (the Ideas note, its Bug part: bullets under a divider, the right-hand margin, the code block's button, an embed gone grey; not released)

The owner: "look at the Ideas for Nebula note and put it right". The note (Nebula Test's vault, changed 2026-10-11 22:50) holds five ideas and, under "Bug", three findings with two snapshots.

The five ideas were all built on 2026-10-07 (the entry of 12:50: the video kept through Ctrl+Z, no size limit on videos, the arrow that folds Black holes, /video and its player, keep awake as the default) and are still in the list. Nothing was done to them again.

1. "The divider under Bug gets selected - it happens with a divider, a bullet point and a picture, in that order." The bar's Bulleted list on the empty line between a divider and a picture left the caret on the note itself, beside the new list and on no line: Chromium puts the list inside the line's own wrapper, `normalizeLists` lifts it out, and a node that is moved drops the selection onto its parent. The caret was still drawn in the bullet. Backspace then found no line, read the divider as what it was against and armed it; the next Backspace took the divider away. `normalizeLists` (lists.js) now puts the selection back where it was, in the item. Backspace in the empty bullet makes it a line again, as everywhere else.
2. "On the right side the divider falls short." Read as: the writing began 28 px from the frame at the left and ended 38 px from it at the right, because the scroll bar (10 px) stood between the two - so a divider, and since the last round a table that fills its line, ended short of the frame. On Nebula Wide the scroll bar's room is now always kept (`scrollbar-gutter: stable`) and taken out of the right padding: 28 px at both sides, and the lines no longer move when a note grows long enough to scroll. The paper sizes were like this already. A reading - the other one would be the short lines between the groups of the bar when it stands at the right.
3. "Let the code block go beside the code in a line, up among the icons": the bar's Code block button stands right after Inline code in the second row (index.html); it was at the end of the first, after the arrows.
4. A snapshot of a YouTube embed that is a flat grey box, "why is this such a grey screen": that is what Chromium draws where a page's process is gone (crashed, or ended by the system). Made on purpose with `forcefullyCrashRenderer` it is the same grey; nothing loaded the page again, so it stayed grey until the note was opened anew. An embed whose process is gone is now loaded again (link-preview.js: three times within a minute, each a little later; after that it is left alone). Why the process went on the owner's machine is not known - the note and its six embeds load in a new profile, twice over, with no process gone.

Not changed: the guide (nothing new to describe; signatures as they were). Electron still 44.5.1.

e2e: v094 96/96, table-edges 152/152, table 66/66, layout 127/127, v093 138/138, rich-paste 20/20, note-folders 60/60. Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide. Not pushed.

## [2026-10-11 21:50] v0.9.4 - by Claude (the "urgent bugs" note, second round: four findings; not released)

The owner: "can you look at the urgent bugs part again". The note (Nebula Test's vault, changed 2026-10-11 20:38) held four new findings, each with a snapshot.

1. "there is a bug, none of the three works - I click the caret up there and cannot take it back": a table, a video and a picture, each at the top of a column with an empty line over it. The line took the caret, but Backspace did nothing: columns.js holds Backspace at the very start of a column (it would join the column to what is outside it). Now an empty first line with something under it simply goes (toolbar.js `dropEmptyLine`; the column's guard lets that one case through). The same for the first line of a note, and Delete on an empty line over a table or a video takes the line away, as it did over a picture. The caret goes to the table's first cell, or to the line under the video or the picture.
   - Found on the way: a note opens with the caret on the note itself (editor, 0), and a click on the first line does not move it - to the browser the two places are one. The delete rules read the caret's line and found none; with an empty first line over a picture, Delete took the picture and the line under it in one press. `standInLine` puts such a caret into its line before the rules run.
2. "let the right side of the table be in line with the black line - widen it": the + for a column had room of its own at the table's right (18 px, and 2 more kept back), so a table that took all the room there was ended 20 px short of where the page's dividers end. The + now hangs out in the page's margin (absolutely placed, so the page does not scroll sideways for it); in a column with another at its right it keeps its room. `settle` gives the pixels the rounding leaves over back to the narrowest columns: a table that fills its place ends on the edge to the pixel. A table made before is as wide as it was; its last column's line pulled to the right stops on the edge.
3. "twelve boxes fit, I think - 8x12": the squares a new table is asked for with are 8 x 12 (were 8 x 10), and as wide as the two numbers under them.
4. "in some places I cannot make it smaller any more - what does this making smaller go by, in the rows and in the columns? let us put these right - let it not be a line": a column went down to 24 px, a row only to a line of words with the room over and under it (34 px). One rule now: a row is pulled as low as a column may be narrow, 24 px (`MIN_ROW` = `MIN_COL`), so a cell can be a square. A row of one line gives up the room over and under its words (the row's height is told to the stylesheet as `--row`, table-grid.js `tellHeight`; editor.css clamps the cells' padding by it; a note never holds it - note-markup.js); a row with more lines is pulled no lower than its words need. A height once given stays given (pulled all the way up it is 24 px, not taken off). The page written out and the printed page draw the row as low (export.js).

Not changed: the guide (nothing new to describe; signatures as they were). Electron still 44.5.1.

e2e: table-edges 152/152 (+15), table 66/66, v093 138/138, v094, layout, rich-paste and note-folders without a failure (one run of table.mjs lost four pulls of the mouse while the owner was at the machine - the window lost the focus; run again alone, 66/66). Not pushed.

## [2026-10-10 13:20] v0.9.4 - by Claude (a portable copy offers itself for documents; the description is the name; not released)

The owner, on the test build: "a right-click on a docx and the like - Open with Nebula is not among the suggested ones; and let Nebula's description be Nebula alone".

- What was found (the registry, read only): nothing had told Windows about `Nebula Test.exe` - only the installer writes that (build/installer.nsh), and a portable copy has none. The owner had picked the exe by hand once; Windows then listed it under the exe's FileDescription, which electron-builder takes from package.json's `description` - the long sentence.
- electron/open-with.js (new): a portable copy (win32, packaged, `PORTABLE_EXECUTABLE_FILE`) says it itself when it starts, for this user (HKCU\Software\Classes): `Applications\<exe>` with FriendlyAppName, its command and SupportedTypes, `<Name>Portable.Document`, and itself under `.docx/.doc/.odt/.rtf\OpenWithProgids`. Offered, never the default; names of its own, so the installed Nebula's `Nebula.Document` is not written over. A start that finds it said for the place the copy is in writes nothing (two `reg query`).
- package.json `description` is "Nebula" (the test build: "Nebula Test", build-test.json extraMetadata); the sentence the site shows under the name is `tagline` now (scripts/build-site.js).
- Checked on this PC with the new test build: the exe's FileDescription reads "Nebula Test"; started once, it wrote its keys; `SHAssocEnumHandlers` (what Explorer's Open with asks) lists "Nebula Test" as recommended for .docx, .doc, .odt and .rtf.

Unit 996/996 (+3, tests/open-file.test.js). Not pushed.

## [2026-10-10 12:40] v0.9.4 - by Claude (a row's height is pulled; not released)

The owner, told that only a column's line could be pulled: "let the height of a row be pulled too".

- The line under a row's number (y1, y2...) is pulled to make the row higher or lower (`.tbl-rowgrip` in each `th.tbl-y`, table.js). While it is pulled the row's height stands beside the line in millimetres, as a column's width does over its line.
- The note holds it as `<tr style="height: 84px;">` (table-grid.js `heightOf`, `setHeight`, `MAX_ROW` 800). It is the least the row is drawn: words that need more make the row higher. A row is pulled no lower than its words need, and pulled down to that it has no height of its own again.
- `plainTable` keeps a row's height in pixels and nothing else of a row's dress (so a redraw, an undo step, a copy keep it); import.js `sanitize` keeps it (pixels, up to 800).
- `insertRow` puts a row of its own between the others and `deleteRows` takes the rows themselves out: a height stays with the row it was given to. Before, the rows' elements stayed where they were and only the cells moved.
- The guide (four languages): one sentence. Signatures: the last four are kept as the twenty-sixth test build's; new `'0.9.4': '37ab0948'`, de `fd018e89`, pl `d730d750`, tr `0d370f41`. What's new: half a sentence.

Unit 993/993 (+5); e2e: table-edges 137/137 (+6), table 66/66, layout and v094 without a failure. Not pushed.

## [2026-10-10 03:10] v0.9.4 - by Claude (the owner's "Acil Buglar" note: a table and the room it has, one right-click menu, the size of a new table; not released)

The owner wrote a note in Nebula Test, "Acil Buglar" (urgent bugs), with eight snapshots, on the twenty-fifth test build. What it says, and what was done:

- **"Do you see the bug?"** — a table in a column lay over the video in the column beside it once the AI panel had made the page narrower. **"In NW there should be no widening to the side like this"** — a table of thirteen columns made the whole page scroll sideways. A table now never reaches over the edge of the place it stands on (table.js `fitTable`, `settle`, `roomFor`):
  - a new table, a column added or put in, rows pasted: the columns' own widths take the room there is — each gives of what it has over the narrowest, and a column added where there is no room is as wide as the others on average, so all stay alike;
  - a column's line cannot be pulled wider than the room that is left;
  - the place made narrower under a table (a panel opened, the window pulled, another page size, a column's divider moved — a `ResizeObserver` on the editor and on each table's host): the table is drawn narrower, each column by the same share. That is the screen's alone: `data-w` holds the column's own width while it is drawn narrower, note-markup.js writes it back for the save and for every undo step, a copy carries the own width (`plainTable`), and with room again the table is as wide as it was made.
- **"Let there be the right to put more from left to right"** (under a table of forty columns pulled to the narrowest): the narrowest a column is pulled to is 24 px, not 44 (table-grid.js `MIN_COL`).
- **"While making a table's column smaller and larger, let the mm — the size of the lines — be seen"**: the width of the column being pulled stands over its line in millimetres, as it is drawn and printed (`.tbl-tip`, `millimetres`).
- **"A press on the left corner — why do select-all and Merge come up? They should not."** A click on the corner does nothing now; the corner is only taken to move the table. A right-click on it offers "Delete table", and so does a right-click in a cell. Ctrl+A twice in a cell still selects every cell.
- **"When a table is added there has to be a setting for its size."** The Table button and /table open a small panel first (table-size.js): 8 × 10 squares to point at, two numbers to type (up to 100 × 60), the arrows to change it; Enter alone makes five by five; Escape, a press elsewhere or a letter typed closes it.
- **"Let THIS menu be the main menu, and the others be joined with it"** (four snapshots: the menu in a table, the bare one, the spelling one, and the one over selected words). context-menu.js draws one menu everywhere in a note: the formatting row; on a misspelt word its suggestions, Add to dictionary and Ignore; in a table the table's choices; Cut and Copy (grey with nothing selected; for selected cells, the cells); the three pastes; Select all. A picture keeps its own, a table's numbering its row's or column's alone, a locked note Copy. The menu is as high as the window allows (it was cut at 360 px).
- The guide (four languages): the one menu (two places), the size asked for, the width in millimetres, the corner, the page's edge. Signatures: the last four are kept as the twenty-fifth test build's; new `'0.9.4': 'cc2e6edd'`, de `13e63480`, pl `5a9fada2`, tr `9406a37f`. What's new: one sentence. i18n.js: Rows, Columns, "Drag to move the table".

Unit 988/988 (+4); e2e: table-edges 131/131 (+14), table 66/66, v093 138/138, v094 87/87 (one run failed "a click on the arrow still folds it", a mouse check, and passed twice after — the PC was in use), layout 127/127, rich-paste 20/20, note-folders 60/60. Not pushed.

Not done, said to the owner: rows are as high as their words — there is no line to pull for a row's height; a table printed or exported to PDF on a page narrower than the one it was made on is not fitted there.

## [2026-10-10 01:20] v0.9.4 - by Claude (a new table is 5×5; the table trials and what they found; not released)

The owner, on the twenty-fourth test build: "three by three is small, let it be five by five; and test the table in different scenarios — how could I make it go wrong? — and fix it so that it does not."

- **A new table is five rows of five cells** (table-grid.js `NEW_ROWS`, `NEW_COLS`). Its columns are made no wider than the place it is put on takes — the page, a column, a toggle's body — and no narrower than 72 px (table.js `fitColumns`); on a page with room they are 140 as before.
- **The trials** are tests/e2e/table-edges.mjs (117 checks, a real app): after each thing done, every table of the note is looked over whole — a cell on every place, the numbering matching, nothing of a table outside one, no block in a cell. And in tests/table.test.js a run of 120 × 30 random changes (merge, unmerge, rows and columns in and out, fill, paste, save and open) with the grid checked after each: the grid itself held, nothing found there.
- **Found and put right:**
  - The bar's **to-do** button with the caret in a cell put the whole table into a to-do line (the table was gone). **List** and **numbered list** made a list of the note's first line; **indent** indented a cell; **code block** went to the top of the note. Now: to-do, lists, toggle, indent, outdent and the outline menu do nothing in a cell; a code block, a divider and a table go under the table (toolbar.js; codeblock.js `after`).
  - **Left / centre / right / justify** put a block into the cell. Now they line up the words of the caret's cell, or of the selected cells (table.js `align`, kept as `text-align` on the cell — the one style a cell keeps; kept by a merge's unmerging, a fill, a copy, a file).
  - **Ctrl+A in a cell** selected the whole note, and the next letter wrote over all of it. Now: the cell's words; again, every cell of the table; a third time, the note.
  - **A table copied with the lines around it** (Ctrl+A, Ctrl+C) was pasted with the numbering, the + and the browser's styles on it, and then taken for a drawn table: no row numbers, a column too many. Now a copy from a note holds a table plain (paste-clean.js, table-grid.js `plainTable`), a table is drawn again whenever it does not stand as it was drawn (`isDressed`), and a heading cell, a caption or a button in a table from elsewhere is cleared away.
  - **Paste from the right-click menu or the bar** with the caret in a cell took the focus out of the cell (rich-paste.js: a cell is a field like a caption), and left the menu's choice set for the next Ctrl+V on a line.
  - **Tab with cells selected** left the selection's mark on the cell left behind; **a right-click in selected cells** let all but one go. Now Tab lets them go, and a right-click in them offers "Delete rows" / "Delete columns" for all of them.
  - **A table that is the first thing of a note** had no way to get a line written over it: ↑ from its first row makes one, as ↓ from the last row did.
  - A file brought in keeps a column's width and a cell's alignment (import.js); every other style still goes.
- The guide (four languages): five by five, Ctrl+A, the alignment buttons. Signatures: the last four are kept as the twenty-fourth test build's; new `'0.9.4': '292f1445'`, de `b179ba45`, pl `57b0d7dd`, tr `8643b4c4`. What's new: one sentence.

Unit 984/984 (+8); e2e: table-edges 117/117 (new), table 63/63, rich-paste 20/20, layout 127/127, v093 138/138, v094 87/87. Not pushed.

## [2026-10-09 21:30] v0.9.4 - by Claude (rows and columns are put in between by a right-click, not by a + on the numbering; not released)

The owner, on the twenty-third test build: "let it be a right-click, then add column and add row — not the way you did it."

- The + that stood on the lines beside a number while the pointer was on it (the entry below) is gone: `.tbl-ins`, its styles and its two titles.
- **A right-click in a cell** (context-menu.js `tableItems`, which asks table.js `menu(target)`): Insert row above, Insert row below, Insert column left, Insert column right, then Delete row and Delete column — first in the menu, over the three pastes and Select all; under the formatting row and the pastes when words are selected. The caret goes into the new row or column, beside the cell that was clicked. On a number of the numbering the menu holds that row's or that column's choices alone. For a merged cell, above and below, left and right are its own edges, and deleting takes every row or column it reaches over. A locked note offers none of it.
- table.js `run(act, wrap, { at, to, keep })`: a row or column put in before `at` with the caret kept on `keep`; rows or columns `at`..`to` taken away without anything being selected. One Ctrl+Z each. `insertRow` and `insertColumn` (table-grid.js) are as they were.
- The guide (four languages): the sentence in section 4's "Tables" now says the right-click. Signatures: the last four are kept as the twenty-third test build's; new `'0.9.4': 'b7fc797a'`, de `ab268bc1`, pl `feab1e38`, tr `e81109f4`. What's new and i18n.js: the four choices' words.

Unit 976/976; e2e: table 61/61 (a real right-click in the app), v093 138/138, v094 87/87. Not pushed.

## [2026-10-09 21:00] v0.9.4 - by Claude (a row or a column put in between two; not released)

The owner, on the twenty-second test build: "let there also be adding a row and a column in between."

- With the pointer on a number of a table's numbering, a + stands on the lines at its two sides — over the x numbers, left of the y numbers. A click puts a new column, or a new row, in there, and the caret into its first free cell. It stays a moment after the pointer leaves the number, long enough to be reached (a delayed `visibility`), and is the screen's like the rest (`.tbl-ins`, inside the numbering, never saved). After the last column and under the last row the two + bars do it, as before.
- table-grid.js: `insertRow(table, at)` and `insertColumn(table, at)` — `addRow` and `addColumn` are these at the end. A merged cell that reaches across the line reaches over the new row or column too: it is not cut in two. A new column's width is put in between the others' widths, which stay with their columns.
- table.js `run('ins-row' | 'ins-col', wrap, at)`; one Ctrl+Z takes it back. Not shown in a locked note, nor while cells are being selected, filled, a column pulled or a block moved.
- The guide (four languages): one sentence in section 4's "Tables". Signatures: the last four are kept as the twenty-second test build's; new `'0.9.4': 'ee9f1fe2'`, de `04cd6f67`, pl `5c75bbf4`, tr `68351909`. What's new: one sentence in "Tables". i18n.js: the two marks' titles.

Unit 976/976 (+1); e2e: table 57/57 (+5), layout 127/127. Not pushed.

## [2026-10-09 20:20] v0.9.4 - by Claude (tables; not released)

The owner, on the twenty-first test build: "now let there be tables. A simple table; we can make it wider to the right and left; over the boxes a numbering as in Excel, but as x1 and y1 — at the left and on top; with the highlight colours we colour the back of the selected part of a table; the selected part can be merged and unmerged — the merge choice comes up at the lower right; in Excel one pulls from the lower right corner to carry on and copy: here the same, pulled from the lower left; a + along the bottom makes the table longer and one at the right makes it wider; and tables move as pictures do."

- **What a note holds** is a plain table and nothing else: `<div class="blk-table" data-block-type="table" contenteditable="false"><table><colgroup><col style="width: 140px">…</colgroup><tbody><tr><td contenteditable="true" class="h-yellow" colspan="2">…</td>…`. Each cell is a place of its own to write in, as a caption is. A cell's colour is a highlight class on the cell, so it follows the theme; a merged cell is one cell with a colspan and a rowspan; a column's width is on its `<col>`.
- **src/js/table-grid.js (new)** — the table as a grid, with no screen: where each cell stands (`gridOf`), a block of places grown round merged cells (`rectOf`), the rows written out again from the grid (`layout`), merge and unmerge (what the merged cells held is kept, a line each), a row or a column added and deleted, the fill (`fillTarget`, `fillCells`, `seriesAt`: one cell is copied with its colour; 1, 2 goes on with 3, 4; "Day 1" with "Day 2"; several cells repeat), and cells as rows of words with tabs (`toTsv`, `fromTsv`, `putRows`).
- **src/js/table.js (new)** — the screen and the hands. Drawn when a note is shown and never saved (everything carries `tbl-ui`; note-markup.js takes it out, with the classes `sel`, `act`, `fill` of the cells): the numbering x1… over the columns and y1… beside the rows (the numbers are drawn by the stylesheet from `data-n`, so the note's text and Find hold no words of the app's), the line at the right of each x that is pulled for the column's width (no narrower than 44 px), the corner that takes the table (block-drag.js: `.blk-table` in `DRAG_BLOCK`, `.tbl-corner` a grip) and selects all of it on a click, a + under the table for a row and one at its right for a column, the square at the selection's lower left, and at its lower right the choices: Merge, Unmerge, and — for whole rows, columns or the whole table selected as such — Delete row(s), Delete column(s), Delete table.
- Cells are selected by pulling the mouse from one to another, by Shift and a click, or by the numbering; the caret waits in the first of them. A highlight colour (toolbar.js `applyHilite` asks `hiliteCells` first) then colours their backs, and with only a caret in a cell that cell's; the same colour again takes it off. Words selected inside one cell are highlighted as words.
- Keys: Tab and Shift+Tab step from cell to cell (Tab in the last one makes a row), the arrows cross a cell's edge into its neighbour and out of the table (under the last row a line is made if there is none), Enter is a new line in the cell, Delete or Backspace empties the selected cells, Esc lets go of them. Ctrl+C and Ctrl+X take selected cells as rows of words with tabs (and a small HTML table for other programs); rows of words pasted in a cell go one cell each from there and the table grows for them; plain words are typed into the cell. A cell takes words only: nothing is dropped into one, and a pasted picture does not land in one.
- `/table` in the slash menu and a Table button on the bar (index.html, icons.js `table`); `/` is not offered inside a cell. A table goes after the caret's line, in place of it when it is empty, in a column or a toggle's body too, with a line under it.
- **Other parts of the app that had to know**: gap-caret.js (`NO_CARET`: a click beside or under a table finds a line), toolbar.js (a cell's keys and deletes are its own; Backspace under a table does not take it), inline-family.js (`td` is the block a mark's edges are lifted to — without it, highlighting words in a cell cut the row and the table in two; a cell's own colour is not handed down to its words), history.js (the caret goes back into its cell after a step), migrate.js (`migrateBlankLines` would have emptied a table with nothing written in it: a table is no line), import.js (`blk-table` is a class a file may carry), blocks.js, slash-menu.js, arrows.js, rich-paste.js, columns.js, dividers.js, export.js (`.tbl-ui` never reaches a file).
- **One fault found on the way and its cause**: every block of a note is a layer of its own (`.editor > * { z-index: 2 }`, the shapes' rule), and the block after is drawn over whatever reaches out of one. With cells selected down to the last row, the choices hang under the table — over the next line, which took the click meant for them and let the selection go. The block that holds the choices rises (`:has(.tbl-chip)`).
- **Out of the note**: Markdown — a table, its first row heading it; HTML and PDF — a table with its columns' widths and its colours; Word, OpenDocument and Rich Text — row by row, cells with " | " between them, as they wrote any table before (a real table there is not made yet).
- The guide (all four languages): a bullet in "New in 0.9.4", section 4 is now "Lists, to-dos, quotes, dividers and tables" with a part "Tables" (two new blocks and a heading: 151 blocks). Signatures: the last four are kept as the twentieth test build's; new `'0.9.4': '14a368ab'`, de `b93092a5`, pl `b35d7af0`, tr `2c0a44eb`. What's new: "Tables", in four languages. i18n.js: the choices' and the buttons' words.
- Left as it is, to be said: the fill square is at the lower LEFT, as asked (Excel's is at the lower right, where Merge stands here). A row or a column is added at the end only — none is put in between two. A table wider than the page reaches over its edge: the columns are made narrower by hand.

Unit 975/975 (+27, tests/table.test.js); e2e: table 52/52 (new), layout 127/127, v093 138/138, v094 87/87, note-folders 60/60, rich-paste 20/20, guide 8/8. No full smoke, rebuild or old-notes; not pushed.

## [2026-10-09 12:40] v0.9.4 - by Claude (a click between, under or beside cards, videos and code blocks finds a line or makes one; not released)

The owner, on the twentieth test build: "under the videos the cursor disappears, sometimes I cannot click — in general this happens with every new feature we add. By the way, ChatGPT signed in at the first try."

- Seen in the app, on a note of four videos: a click in the gap between two videos one under the other, or under a video that is the last thing in the note, put the caret on the first line of the note or on a line well below — out of sight — and what was typed went there. A card, a video and a code block take no caret; such a click is a click on the note itself, and Chromium, with nothing to stand on there, chose a line far away. It was so for every block of the kind, and before this build too: each new kind of block brought it again.
- **Settled once for all of them** (src/js/gap-caret.js, new; main.js `initGapCaret`): a press on the note itself, or on a column itself, that has one of these blocks (`NO_CARET`: `.link-block, .blk-code`) over it, under it or level with it is answered by the app (`placeForClick`). A line right over or under the place takes the caret, as near the click as its words go. With none — two such blocks one under the other, one as the last thing or the first — a line is made in the gap with the caret in it; one Ctrl+Z takes it away. Beside a block, its upper half is "over it", its lower half "under it". A locked note gets nothing.
- Pictures are left as they were: a click beside a picture in the text selects it and Enter opens a line under it. A new kind of block that takes no caret has only to be named in `NO_CARET`.
- block-drag.js: a press becomes a pull after 8 pixels, not 5 — an unsteady click on a video's picture stays the click that plays it.
- ChatGPT's first sign-in (the open question since 2026-09-30): the owner says it went through at the first try. Closed; nothing was changed for it in this version.

Unit 948/948; e2e: layout 127/127, v093 138/138, v094 87/87, note-folders 60/60, rich-paste 20/20. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-09 11:45] v0.9.4 - by Claude (the name is never declined; the pointer in /video's dialog; cards, videos and code blocks dragged like pictures; not released)

The owner, on the nineteenth test build: "Witaj w Nebuli should be Witaj w Nebula, and do not change the Nebula name; adding a /video, the mouse is not seen in the video picker, the cursor disappears; and videos, embedded websites, code blocks and so on should all be draggable like pictures."

- **The name.** Polish declined it — "Witaj w Nebuli", "wewnątrz Nebuli", "Ustaw Nebulę" — in the guide (its title too), What's new and one line of the interface; German had one genitive ("Nebulas violettes Dokumentsymbol"). It is "Nebula" everywhere now. Turkish writes its endings after an apostrophe ("Nebula’ya"), which leaves the name whole, and was left. tests/guide-i18n.test.js fails on any word that starts with "Nebul" and is not "Nebula", in the three guides, the translated What's new and every interface string.
- The guide's Polish title changed with it. A vault's guide still under "Witaj w Nebuli – przewodnik" is still known as the guide (guide-i18n.js `FORMER_TITLES`) and gets this build's page and title while nobody wrote in it.
- **The pointer in /video's dialog** (electron/main.js `media:pick-video`). Not reproduced by a test — the tests' keys are not the keyboard's — so this is the reading of it: Chromium hides the pointer while one types until the mouse moves over its window (Windows' "hide pointer while typing"); /video is typed; the dialog was the window's child, shares its hidden pointer, and holds the window still, so the move that would bring the pointer back never reaches it. On Windows the dialog is now nobody's child, so it has a pointer of its own. What that costs: the dialog no longer holds the window, and the note can be clicked behind it; asked for again meanwhile nothing more opens (`pickingVideo`), and the window is brought forward when the dialog closes. The video still goes in where the caret was. **For the owner to try**; if the pointer is still gone the reading was wrong.
- **Cards, videos and code blocks are dragged** (src/js/block-drag.js, new; main.js `initBlockDrag`). A bookmark, an embedded page, an embedded video and a video file are taken by their title line; a video file by its picture too, except the strip along its lower edge where the player's own controls are (`PLAYER_STRIP`); a code block by its top line, not by the language, Copy, ✕ or the code. An embedded page itself cannot take the card: it is another page and keeps the mouse. The same mark as a picture's shows the place between two blocks (image-place.js `gapAwayFrom`, taken out of the picture's drag, which uses it too), on the note or in a column; nothing moves until the button is let go; Esc leaves it; one Ctrl+Z puts it back. A press that does not move is the click it was — a card's link opens, a video plays — and the click that ends a drag is swallowed. Only a block standing in a row of its own, on the note or in a column, is taken; a locked note gives nothing.
- A video file is moved, not taken out and put in again (`moveBefore`), so it goes on playing. An embedded page is put in again and loads anew: its frame is the app's own element.
- Not done: a toggle and a list are words and are not dragged; a block inside a coloured wrapper is not taken.
- Guide: one sentence in section 8 under the embed's resizing, four languages; What's new: one sentence on the pictures' item, four languages; signatures renewed (the nineteenth test build's four kept).

Unit 940/940; e2e: layout 116/116, note-folders 60/60, v094 87/87, guide 8/8, rich-paste 20/20. No full smoke, rebuild or old-notes; not pushed. Preflight: Electron 44.5.1 is behind 44.7.0 — for the push.

---

## [2026-10-08 11:30] v0.9.4 - by Claude (what the person deletes is gone without a question; only a loss nothing in the app made is asked about; not released)

The owner, on the build that asked whenever a note lost more than three pictures at once: "what I do not understand: when someone deletes and closes, why should it come back? It has to be gone altogether." And, told how it would be changed: "let us arrange the fault detection to that — this way it works against sudden crashes too."

- The count is out (`looksLikeLoss`, `ASK_ABOVE`). What decides is who took the file out. Everything the window does to a note is written through the app (main.js `storage:write`); each such write is looked at (note-media.js `noteReleases`): the files the note named before and does not name after are *released* by the person, one named again — an undo — is released no longer. The list is kept in the vault (`storage/released.json`, `readReleased`, `writeReleased`) for the next start.
- At a start (`tidyVault` `released`): an unnamed file on the list goes — from the folder and from every backup — without a word, five as well as one. An unnamed file that is not on it stays and is asked about (Put back in the note, Delete, Open the note): nothing in the app took it out — a fault, or the note's file changed outside the app. The backups keep exactly those (`purgeUnnamedFromBackups` `keep`).
- Against a sudden end every step errs towards keeping and asking: the list is written before the note is, so cut off between the two the note still names the file; a note's file is replaced whole or not at all, and one that cannot be read is not judged; a list that is there but cannot be read is an empty list — nothing taken out, everything unnamed asked about — and a vault a list has been kept for (`meta.json` `releasedList`) whose list is gone is treated the same. Only a vault no build ever kept a list for sweeps as it always did, once.
- What this gives up, against the build before: a fault inside the window that takes pictures out of the note on the screen and saves that is a write through the app, and counts as the person's. The editor's own two checks (what is saved names all it shows; a repair takes nothing out) stay.
- The question says so: "…and they were not taken out in Nebula." Guide: the sentence under "Deleted is deleted" says what you take out is gone however much it is, and when Nebula asks; four languages; signatures renewed (the eighteenth test build's four kept).

Unit 927/927; e2e: note-folders 60/60, black-holes 58/58, deleted 6/6, rich-paste 20/20, v094 87/87, guide 8/8. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-08 11:10] v0.9.4 - by Claude (lost pictures put back into the note; not released)

The owner: "is there an answer, when a fault does happen?" Where a save is refused nothing is lost — the note on the disk is whole. Where a note has lost its pictures and the app asks, the files were kept but nothing put them back into the note. Two ways were put to the owner — back at the end of the note, or the note as the backup has it (which overwrites what was written since, and the one daily copy may already be the faulty one); "the first: put back in the note", and: "add a warning too, that they have to be put back in their old place."

- The question has a third answer, first in the row: **Put back in the note** (src/js/held-media.js `heldMarkup`; electron/main.js `media:take-held`). What is typed is saved, the files are written into the note again at its end — each picture a picture in the text, no wider than a pasted one, each video its player, and a line to type on after them — and the note is shown. Nothing is deleted; at the next start nothing is asked.
- The warning, twice: in the question, under what it asks ("Put back, they are added at the end of the note: you have to move them to where they were."), and when it is done ("Put back at the end of the note. Move them to where they were.").
- Should the note not be saved after all, the files are unnamed again at the next start and the question comes again.
- Guide: one sentence more under "Deleted is deleted", four languages; signatures renewed (the seventeenth test build's four kept).
- Found while testing it: tests/e2e/note-folders.mjs's `until` did not await what it was given, so a condition that was a promise counted as met at once — the checks of the question written the entry before ("Delete takes them out…", "Open the note…") had passed without waiting for anything. It awaits now; with that the same checks pass for what they say, twice over.

Unit 925/925; e2e: note-folders 58/58 (twice), guide 8/8. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-08 10:50] v0.9.4 - by Claude (a note is never written without its pictures by a fault; a large loss is asked about; not released)

What the last entry cost: should a fault ever write a note without its pictures, the next start would delete them, from the backups too. The owner: "what is the answer to that?" — two layers were put to them, and: "both, it is better."

- **At the source** (src/js/editor.js). The files a note's markup names are its `nebula-media://…` addresses (`namedIn`). (1) What is saved names every file the editor shows: where the stored markup is not the editor's own to the letter (something on screen was taken out of it), every address in the one must be in the other. (2) What the app itself makes of a note on the way in — a repair, a repaint (`adopt`) — names every file the note named before: only a person takes a picture out. A note that fails either is not written at all, as an edit or as a repair: what is on the disk stays, the banner says why ("…would have been saved without N of the pictures or videos it shows…", "This note did not open whole…"), every later try says it again, and opening the note again starts afresh. `flush` answers false and does not throw, so closing the app is never held up by it. Neither can be tripped by an edit: taking a picture out changes what the editor shows and what is saved alike.
- **At the start** (electron/note-media.js `looksLikeLoss`, `unnamedOf`, `tidyVault` → `held`). A note that no longer names more than three of its files, or any of them where there were at least two, keeps them — in its folder and in every backup (`purgeUnnamedFromBackups` `skip`) — and the app asks (src/js/held-media.js, after What's new): the note, how many, Delete and Open the note; Later closes it. Delete removes the files that were asked about and no others (`sweepNote` `only`, the purge's `only`); Open the note deletes nothing and the question comes again at the next start. One picture taken out of a note that had only that one, or up to three out of more, goes without a question as before.
- Nothing is remembered between starts: what is held is worked out again each time from the note and its folder.
- Guide: one sentence under "Deleted is deleted", four languages; signatures renewed (the sixteenth test build's four kept).
- tests/e2e/black-holes.mjs: the ten checks that failed straight after a build were the helper pressing a menu entry 100 ms after asking for the menu; it waits for the entry now, and two runs straight after a build pass.

Unit 923/923; e2e: note-folders 55/55, black-holes 58/58 (twice, straight after a build), deleted 6/6, rich-paste 20/20, layout 99/99, v094 87/87, v093 138/138, open-with 12/12, guide 8/8 — none of them met a refused save. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-07 19:50] v0.9.4 - by Claude (what a note no longer shows leaves the backups too; not released)

The owner, on the reading of the last entry: "I did not say take Restore out of the Trash; I did not want a backup of something deleted kept for seven days." That was so already for a note or a black hole deleted from the Trash. One thing was not: a picture or a video taken out of a note that lives on left the note's folder at the next start but stayed in the backups that shared it — a day in the daily copy, until the next update in the copy put aside before one. The owner: "close that too, deleted from the backups as well."

- At a start, after the vault's own sweep, what a living note's text no longer names leaves that note's folder in every copy, a person's label among them (backup-purge.js `purgeUnnamedFromBackups`, called in main.js `prepareNoteFolders`). Not at the save: an undo in between still has it, in the vault and in the backups alike.
- The note's text in the vault decides, not what the vault's folder holds: a file the note still names stays in the backups even when the vault has lost it. A note whose file cannot be read is not judged; a note gone from the vault is the other purge's; a file that is no picture or video is nobody's.
- A sealed video taken out of a note in a black hole went when the black hole was next opened; `unlock` now names what it swept (`swept`, kept in the main process) and those files leave every backup too (`purgeHoleFilesFromBackups` — a sealed video's name only).
- What it costs, said to the owner before: a picture taken out yesterday cannot be had back from a backup. And one more, said now: should a fault ever write a note without its pictures, the next start takes them out of the backups as well — the copy's words would still be there, the pictures not.
- Guide: one sentence under "Deleted is deleted", four languages; signatures renewed (the fifteenth test build's four kept).

Unit 914/914; e2e: note-folders 51/51, deleted 6/6, black-holes 58/58, guide 8/8. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-07 19:35] v0.9.4 - by Claude (a black hole goes to the Trash; not released)

The owner, told that a note deleted from the Trash is in no backup and offered a way to bring back yesterday's note: "if someone deletes, there should be no bringing back from the Trash; black holes should be able to be put in the Trash too." Read as: deleted from the Trash stays gone for good (nothing to change, and no restore-from-backup is built), and a black hole is no longer deleted straight from its menu.

- A black hole's ⋯ menu says "Move to trash" where it said "Delete black hole" with its question. It goes whole (electron/black-holes.js `trash`): locked first — what was typed saved, its notes out of the window, its key let go of — and `trashedAt` written into hole.json. Nothing else of it changes on the disk; its notes stay sealed, in the backups too.
- In the Trash it is one row (note-actions.js `holeRow`, class `drawer-hole`): its name, "Black hole · N notes", Restore and Delete — never anything of its notes. It cannot be opened there, by PIN, passkey or recovery key (`unlock` → `trashed`, and a wrong PIN is not counted), and a note's menu no longer offers it.
- Restore (`restore`) puts it back in its section, locked, as it was. Delete removes it for good with every note in it, in the backups too (the `delete` there was) — and where it holds notes the button first turns into "Delete for good?": a note in the Trash is one note, this may be fifty.
- The window keeps the two apart (black-holes.js `holes` / `binned`; `toTrash`, `restore`, `destroy`, `trashed`); the main process lists both with `trashedAt`.
- Guide: one sentence in the folders section, four languages; What's new, four languages; signatures renewed (the fourteenth test build's four kept). The strings of the old question are out of i18n.js.

Unit 913/913; e2e: black-holes 58/58 (three runs; the two runs straight after the build failed ten checks from "moved in" on, the menu not yet there when the helper pressed — as seen before after a build), note-folders 50/50, deleted 6/6, guide 8/8. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-07 19:25] v0.9.4 - by Claude (one daily copy, the newest; a disk that cannot share; not released)

The owner: "not seven days — a copy of twenty-four hours, on an exFAT flash drive and network drives too"; and asked what the backup of a 2 GB note (1.8 GB video, 190 MB pictures, the rest words) would be, what backups are for, and how a user brings one back.

- Of the daily copies only the newest is kept (main.js `KEEP_DAILY = 1`): made at the first start of a day, the one before it removed then. Labelled ones as before: the newest of each kind.
- Where the disk cannot share a file (exFAT, a network folder) a copy has to hold the bytes. A daily copy now takes the pictures and videos over from the copy it replaces — moved, by name and size — instead of copying them again (note-media.js `snapshotVault(src, dest, before)`, `taken`). So the 1.8 GB video is copied once, on the day it comes, not at the first start of every day, and the old and the new copy never both hold it. A labelled copy takes nothing over.
- A copy holds `.making` while it is made; one the app was closed over is removed and made again, and is neither kept as the newest nor taken from. With one copy kept, half a copy must not stand for a whole one.
- The 2 GB note: where the disk shares (NTFS, APFS, ext4) the copy is the words, about 10 MB; where it cannot, 2 GB — once.
- Not built, said to the owner: there is no way in the interface to bring a note back from a backup. The Trash is the way back for a deleted note; deleted from the Trash it is in no backup, by the owner's rule of 2026-09-27. A note as it was yesterday: Import on the note's file in the Backups folder (it comes in as a new note with its pictures).
- Guide: the sentence on the dated copy in section 10 and its "Try it", four languages; What's new, four languages; signatures renewed (the thirteenth test build's four kept). docs/UPDATING.md: the daily copy, the pre-update copy, restoring one note.

Unit 911/911; e2e: note-folders 50/50, deleted 6/6, black-holes 51/51 (49 counted once in a run straight after the build, none failing; 51 alone), guide 8/8. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-07 18:50] v0.9.4 - by Claude (backups kept the old way removed at the start; not released)

The owner, told that the seven old copies would leave one a day for a week (a vault of 7.6 MB, 87 MB of backups): "drop the old copies, do not make it wait seven days — it eats the user's disk." I first made them small where they lay (pictures out of the text, shared with the vault; 87 MB to 18.6 MB, every note read back the same). The owner: "delete the old copies altogether" — it must work for every user and take back the room the old way of backing up took. The slimming is out of the code again.

- At the start, once the vault's own move is whole (`missingMedia` 0), every copy of the app's own making that is kept the old way is removed, overwritten (backup-purge.js `oldWayCopies`, `dropOldWayCopies`; main.js `dropOldBackups`, not awaited, the app given its turn between two files): the daily ones (`YYYY-MM-DD`), and those put aside before an update or a repair (`pre-update-…`, `pre-heal-…`). Kept the old way: a note's file lies flat in the copy's `notes`.
- Then a copy of today is made the new way (`snapshotStorage`), so no start leaves the vault without one. The copy the app makes at the very start of the first run is made before the pictures leave the notes: it is one of those removed and made again.
- What this costs, said to the owner: after the update there is no copy from before it — the copy 0.9.3 puts aside before installing goes with the rest. The same reasoning as for `pre-note-folders` ("it has no meaning after the move"), and the same condition.
- Left alone: a copy under a label a person made; `pre-note-folders` (prepareNoteFolders removes it); a copy kept the new way.
- A copy is renamed `going-<name>` before its files go, so that one the app was closed over is finished at the next start and is never counted among the copies of its kind (`staleLabelled` would otherwise take it for the newest).
- Where the disk cannot share a file (exFAT, a network drive) a copy holds the pictures themselves, as files: seven days of them. Not changed here.
- In the test vault, on the owner's word: every copy removed (seven dated, pre-heal-0.9.4, pre-note-folders, the two small `before-…` ones). The app makes today's at its next start.

Unit 908/908; e2e: note-folders 49/49, deleted 6/6 (its seeded backups now one the new way and one under a person's label), black-holes 51/51. No guide change. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-07 13:35] v0.9.4 - by Claude (labelled backups: only the newest of each kind; not released)

The owner, asked whether the labelled backups of older versions should go: "yes, delete them; only the newest of each kind is kept."

- Of the copies the app itself puts aside under a label — before an update is installed (`pre-update-<version>-<time>`), before the repair of old notes at a version (`pre-heal-<version>`) — only the newest of each kind stays (backup-purge.js `staleLabelled`, `pruneLabelled`, run after every backup): an update's by the time in its name, a repair's by its version, part by part (0.10.0 is newer than 0.9.4). Until now each was kept for good, one more with every version. A label of any other kind — one a person made — is left alone.
- In the test vault: pre-heal-0.9.1 and pre-heal-0.9.3 are removed; pre-heal-0.9.4 stays.

Guide: one sentence in section 10, four languages; signatures renewed (the twelfth test build's four kept).
Unit 904/904; e2e: note-folders 46/46, deleted 6/6, black-holes 51/51, open-with 12/12, guide 8/8. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-07 13:15] v0.9.4 - by Claude (the owner's answers on the eleventh test build: no counters, a hint, four dashes, backups that share; not released)

The owner, on the four questions: "1 yes; and an option to set a hint for a black hole; delete the three old black holes; 2: at the fourth dash; 4: one copy is right; pre-note-folders has no meaning once the pictures are in the note's folder — delete it; I do not want the backups to take a great deal of room — tell me how the backups work."

- No counters anywhere: Archive and Trash lost theirs too.
- A divider at the fourth dash (`DIVIDER_DASHES` 4): three dashes stay dashes.
- A hint for a black hole's PIN (electron/black-holes.js `hint`, `setHint`): optional, set when the black hole is made, changed or taken away from its menu while it is open ("Add a hint" / "Change hint"), shown under the PIN when it is asked for. It is kept in the clear in hole.json — it is shown to whoever is asked, so it is no secret — and one that gives the PIN away is refused; a new PIN the hint would tell takes the hint away. A black hole opened by the passkey has none.
- The copy put aside before the note folders (`backups/pre-note-folders`) goes by itself: at a start, once every picture and video a note names is in that note's folder (note-media.js `missingMedia` is 0), it is overwritten and removed (backup-purge.js `shredTree`). It is still made before a vault is first moved, and kept while anything is missing.
- Backups no longer copy what never changes (note-media.js `snapshotVault`): a note's own file is copied, its pictures and videos — written once, never changed — are shared with the vault (a hard link: a second name for the same bytes). Seven days of backups hold a video once, not eight times. Where the disk cannot share a file (another drive, a flash drive's FAT) it is copied as before. Because the bytes may be shared, `shred` only overwrites a file that has no other name left: a video taken out of a note leaves the vault and stays in the backups that had it, as a copy did; a note deleted for good is taken out of the vault and of every backup, and the last place takes the bytes with it — deleted stays deleted.
- In the test vault: the three black holes of the first build (Deneme 1, Deneme 2, Deneme3) are deleted, their sealed files overwritten, in the backups too.

How the backups work, as told to the owner: one copy of the vault a day (at the first start of the day), the newest seven kept; and copies under a label that are never pruned — before each update is installed (`pre-update-…`), before the repair of old notes at each version (`pre-heal-…`). The test vault holds 106 MB of backups for 7.6 MB of notes: eleven whole copies of notes that still had their pictures as text. From now on a daily copy costs the notes' text only. Asked: whether the labelled copies of older versions should go.

Guide: sections 1, 4 and 10, four languages; What's new three items, four languages; signatures renewed (the eleventh test build's four kept).
Unit 903/903; e2e: layout 99/99, note-folders 46/46, black-holes 51/51, open-with 12/12, deleted 6/6, ai-sleep 16/16, v094 87/87, v093 138/138, rich-paste 20/20, guide 8/8. One check of note-folders was too strict about a cropped picture saved before its undo (its file waits for the next start, by design) and is loosened. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-07 12:50] v0.9.4 - by Claude (the owner's notes on the tenth test build: black holes, videos, columns, the note's file in its folder; not released)

The owner rewrote the Ideas note after trying the build: new ideas, bugs, and answers to the thirteen questions. All of it, in the order it was written.

Ideas:
- Dashes: "when it goes past four dashes it should become a divider by itself." The fifth dash on a plain line that holds nothing else makes the line a divider, with a line under it (auto-arrows.js `dashesToDivider`); one Ctrl+Z gives the dashes back. Not in a list, a heading, a quote or code. In a column the divider is made in the column (`insertDivider` took it out to the note before).
- Black hole PINs are six digits, and the two boxes say what goes in each ("Six digits." / "The same PIN once more."), one under the other. A black hole made with four keeps its four — its length is on the black hole (`digits`, four where nothing is written) — until its PIN is changed, which makes it six.
- "Ctrl+Z makes the video I added a black screen for a second": an undo step put the note back as markup, so the player was a new one. The step now keeps every player whose address is still in the note (history.js).
- No size limit on videos, in a black hole too. Adding one never had a limit; the export had (200 MB). A Nebula note now takes every video along (note-media.js `travelWhole`): those that fit 200 MB inside the file, the rest — and the kinds a data address has no name for — in a folder beside the file, named after it ("My note videos"), which the import looks in (`stageTravelled`). A note in an open black hole takes its sealed videos along the same way.
- An arrow beside "Black holes" folds the whole section (kept in `nebula:holes-folded`); the black holes stay as they are, open or locked.
- /video: a video file chosen from the computer (`media:pick-video`), put in as a dropped one is. "Every kind of video file": MKV, AVI, WMV, FLV, MPEG, 3GP, M2TS beside MP4, M4V, WebM, OGV, MOV are held, copied, sealed and exported (.ts is left out: a TypeScript file far more often than a video). Holding is not playing: the player is Chromium's. What it cannot play (an AVI, a WMV) says so on its card and offers "Open in another program" (`media:open-outside`; not for a sealed video).
- "A simple video player in the app … use the video style of the owner's study pages" (their player page: a black picture, under it a bar of round buttons and the clock at the right). The card has that bar now (file-video.js): ↩ 10s, 10s ↪, the speed (1× 1.25× 1.5× 2× 0.5× 0.75×), the whole screen, and where the video is. It is drawn on the screen and never saved with the note (note-markup.js `TRANSIENT_NODES`).
- AI tabs are awake by default; a tab sleeps by itself only once it is told "Let it sleep when unused" (`nebula:ai-may-sleep`; the list of tabs to keep awake, `nebula:ai-awake`, is not read any more).

Bugs:
- "In the right-click menu, text colour and highlight have no picture under them": the small formatting bar's A and H had no colour bar, and the menu copies those buttons. They have one now, painted with the editing bar's.
- "The JSON files inside the folder too, I do not want them apart" (and answer 1): a note is one folder — `storage/notes/<id>/<id>.json` with its pictures and videos beside it. Schema 3. To the window a note is still `notes/<id>.json`; the main process knows where that lies (`inStorage`, note-media.js `noteFile`). A vault kept the old way is put this way at its next start (`moveNotesIn`: where a note has both, the one written last is the note). A note file whose name is no id (a space in it) stays flat and is a note all the same — found by the 0.9.3 checks, whose "Shopping list" note had vanished. `purgeDeletedFromBackups` counts the notes in folders as living; before that fix it would have taken a new-layout vault for an empty one (refused) or, mixed, emptied the backups of the notes in folders. place-test-exe.js writes the guide where the vault keeps it.
- A picture alone in a column: "I cannot write under this". A column that ends with a picture, an embed, a code block or a divider is given a line to write on (`healColumns`).
- A line and a picture under it in a column: "I cannot take the picture one back up." Over a neighbour of one line the nearest gap was still the picture's own; pulled clear of itself a picture now goes one place that way at least (image-place.js).
- "Take the counters away beside the notes and the black holes; the lock to the left, it runs into the three dots; say passkey, not Windows Hello; waiting for passkey; the passkey comes up behind Nebula." The counts are gone from folder rows and black holes. The lock is an icon at the left of the name: shut on a locked one (a click opens), open on an open one (a click locks). "Passkey" everywhere. And the question is now asked for Nebula's own window (`IUserConsentVerifierInterop.RequestVerificationForWindowAsync`, the window's handle in NEBULA_HELLO_WINDOW), so it stands in front of it; asked plainly it was nobody's window and Windows put it behind. Tried here with a real prompt owned by a small window: the system's dialog became the foreground window within a quarter of a second, and went away with its owner. Should that way fail, it is asked the plain way.

The answers: (1) inside — done. (2) yes. (3) and (8) wanted explaining — in the report. (4) "no limit on the columns": `MAX_COLS` is no count any more; a column is cut for as long as both parts keep a few words' room (48px and the divider's own, as a share of the line: `leastShare`) and never under 5% of the line. (5) nothing more. (6) "not enough, no limit" — the videos above. (7) six digits, passkey, in front — above. (9) what was meant: "the editing bar — page zoom is too wide, and put page order beside increase indent; add /paragraph". The zoom's signs are slim and its ratio as wide as its words (132px → 94px), Auto order page stands beside the indents, and /paragraph is the plain line (the slash item Text is called Paragraph; /text still finds it). (10) skipped. (11) "log ChatGPT out": the test profile's ChatGPT tab is cleared (its partition folder removed with the app closed). (12) no Mac to build on. (13) not now.

Tests around it: the first run of an e2e suite after a build is slower and its drags can land late — that was the failing run noted in the last entry (and a `sleep` in the command line was simply not run, which looked like an empty result). Run again, every suite is steady.

Guide: sections 1, 4, 7, 8, 10 and four items of "New in 0.9.4", four languages; What's new four items, four languages; signatures renewed (the tenth test build's four kept).
Unit 898/898; e2e: layout 99/99, note-folders 45/45, black-holes 48/48, open-with 12/12, deleted 6/6, ai-sleep 16/16, v094 87/87, v093 138/138, rich-paste 20/20, guide 8/8. The test vault's own notes, copied to a throwaway profile and opened by this build: five notes into five folders, nothing left flat, the three black holes of the first build asking for four digits. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-06 18:15] v0.9.4 - by Claude (after part 9 — what was left undone: pictures out of memory, videos in an exported note, Word/ODT/RTF, more columns, a picture in a line of words; not released)

The owner, on the list of what the nine parts had left: "do the ones that were not done too." (This entry is dated by the machine's clock; the entries under it were dated a day ahead.)

Pictures are no longer whole in the window's memory (electron/main.js, note-media.js):
- Part 7 put a note's pictures into files but still wrote them back into the text for the window, so an open note held every picture as text. Now the window is handed the note as it is stored and shows each picture from its file (`nebula-media://note/<id>/<hash>.png`). `storage:read` no longer writes pictures in; `storage:write` no longer sweeps the folder (a picture cut and brought back by Ctrl+Z must still be there — the sweep is at start).
- Where the picture itself is needed, it is written in on request: `media:inline` (an export — one place, `exportHtml()` in toolbar.js), `media:inline-sync` (a copy: the clipboard must be filled in the event), `media:data-url` (crop), `clipboard:image` with the file's address, and a note going into a black hole (sealed whole, pictures inside).

Videos travel with an exported Nebula note (note-media.js `inlineForTravel`, `stageVideos`):
- Export as Nebula note writes the note's video files into the file, 200 MB of video in all; what does not fit is left out and said ("Too large to travel with the note: N videos"). Imported or opened with Nebula, the videos become files at once (`notes/incoming-…`, taken into the note's folder at its first save; cleared at start if never saved). A note file may be 420 MB now; the 64 MB limit of part 9 had caught note files too and is for documents only.

Word, OpenDocument and Rich Text (src/js/office.js):
- A picture in the text goes out at the side it stands (left, middle, right), its caption with it; pictures sharing a line share a paragraph, each at most its share of the line; a floating picture is centred as before.
- Columns go out as columns: a table of one row, no border but the rule between its cells, each column its share of the line — .docx `w:tbl` (fixed layout, every cell ending in a paragraph, a paragraph between two tables and after a last one), .odt `table:table` with its column and cell styles, Rich Text `\trowd … \cell … \row`. `readBlocks` reads a column as a flow of its own (`{type: 'columns', cols: [{share, blocks}]}`); Evernote and Markdown have no columns and get one column after the other with a rule between (`flatBlocks`).
- Seen in LibreOffice (all three converted to PDF in a throwaway profile): three columns with their rules and widths, the three sides, a row of two, a picture in a line. Word itself could not be started from here (its automation refused), so Word has not opened these files yet.

More than two columns (src/js/columns.js, editor.css, export.js):
- A divider pulled sideways over a column cuts that column in two where the pointer is — a divider lying in a column, or one of the note pulled up into it; the mark stands in that column, the column tinted. Up to four on a line (`MAX_COLS`), none narrower than 15% (`MIN_COL`; two columns keep their fifth). What the column held keeps the wider part.
- `data-split` names every divider's place, left to right ("25,50,80"); a block of two is written exactly as before ("50"), so nothing stored changes. Each column between two dividers carries its share (`--w`); the first is `--split` wide, the last takes the rest, so each divider stands at its place on the line.
- An upright divider dragged moves alone, between its neighbours; one taken away joins the two columns at its sides, and the last ends the columns. `healColumns` keeps two to four columns with a divider between each two and takes a fifth into the fourth.

A picture standing in a line of words (src/js/image-place.js, rich-paste.js):
- The picture bar's new last place, a▫a: the picture becomes a character of the line before it (`span.note-image.note-image--inline.note-image--inword` — a span, since a figure read back from a file would end the paragraph). Dragged, a mark shows the caret it will go to; its corners resize it; Enter lets go of it with the caret right after it (Shift: before); Delete takes it away and leaves its line. It has no caption, no side and no row; a side on the bar, or the same button, takes it out onto a line of its own, and floating does too.
- It is a picture of its line in Markdown, HTML, Word, OpenDocument, Rich Text and Evernote.

Not done, and why: the Mac build. A .dmg cannot be made on Windows (electron-builder needs macOS for it); the Mac side of Open with, the document icon there, Touch ID and the line-spacing bug are unseen until someone builds and runs it on a Mac.

Guide: sections 4, 7, 8 and three items in "New in 0.9.4", four languages; What's new three items, four languages; signatures renewed (the ninth test build's four kept).
Unit 884/884; tests/e2e/layout.mjs 89/89 (30 new); note-folders 33/33; black-holes 45/45; open-with 12/12; ai-sleep 16/16; v094 87/87; v093 138/138; rich-paste 20/20; guide 8/8; deleted 6/6. One run of layout (12) and note-folders (4) failed straight after a build with the machine busy, and passed alone before and after — timing, not found. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-07 01:00] v0.9.4 - by Claude (part 9: Open with Nebula and the violet document icon; videos in black holes; not released)

The owner's Ideas note: "an Open with Nebula entry in Windows and on the Mac — for a docx, a doc, an odt and the other files (not PDF yet); and when Nebula is the default, a file in violet tones: the logo shaped like the auto order page button made violet, fitting the emblem, the Nebula logo at the bottom right." And, on the black holes: "why can video files not be put in a black hole?"

Open with Nebula:
- The icon (build/make-doc-icon.ps1, vector like the app's, `npm run icons`): the sheet of the auto-order-page button — a page with its top right corner cut, lines of writing — in the app's violets, the app's mark on its dark tile at the bottom right. build/doc.ico (nine sizes), doc.icns (written by the script: 'icns' and PNG entries), doc.png, doc-preview.png.
- Windows (build/installer.nsh, package.json nsis.include): Nebula is OFFERED for .docx .doc .odt .rtf — `Nebula.Document` (its name, DefaultIcon resources\doc.ico, how to open), `.ext\OpenWithProgids`, `Applications\Nebula.exe\SupportedTypes` — and never makes itself the default: electron-builder's own `fileAssociations` writes the app over whatever opens a .docx today, so it is not used for Windows. A reader who picks Nebula and "Always" gets the violet icon. Uninstalling takes it all away. The installer was COMPILED with the script (into a temp folder, then deleted) and doc.ico is in the packed resources; it was NOT RUN — running it would install over the owner's Nebula, which is never touched. So what Explorer shows after an install has not been seen.
- macOS (package.json mac.fileAssociations): the same four kinds, rank Alternate (in Open With, not the default), doc.icns. Not built or seen here.
- The app (electron/open-file.js, new): a file's path among the arguments at start, the `open-file` event on a Mac, or `second-instance` while it runs — read as File → Import reads one (the handler now shares `readNoteFile`), handed to the window once (`files:take`), a new note; the file is never changed. Any kind File → Import reads opens this way.
- One copy of the app per vault now (`app.requestSingleInstanceLock`, the lock is the profile's own, so Nebula and Nebula Test do not share it): a second start hands its file over, brings the window forward and goes away. Two copies writing one vault was always a way to lose notes; it was simply possible before.
- Found on the way: every toolbar action is switched off while the open note is in Only view, and the guide is — a file opened into a fresh Nebula did nothing. `importFile` is among the actions that stay, as `import` is.

Videos in black holes (electron/black-holes.js):
- Why not at first: a note in a black hole is one sealed file opened in memory, and a video is a file beside its note, played from the disk in parts. Now a video is sealed beside its note — `<note>~vid-….bhv`: "NBV1", the piece size (1 MiB), the length, then the video in pieces, each sealed by itself with AES-256-GCM (the hole, the note, the file, the piece's number and the whole length bound in: pieces cannot be swapped, dropped or cut off). The player's requests (`nebula-media://hole/<hole>/<note>/<file>`, byte ranges) are answered by opening only the pieces asked for, in memory, while the black hole is open.
- A video dropped on a note in a black hole is sealed there; a note moved in takes its videos along (sealed first, then the plain ones go with the note's folder), and taken out gets them back as files. A note deleted takes its videos with it, in the backups too. A video taken out of a note goes the next time the black hole is opened (an undo in between still has it), unless a note of it could not be read.

Guide: sections 7, 8 and one item in "New in 0.9.4", four languages; What's new one item, four languages; signatures renewed (the eighth test build's four kept).
Unit 861/861; tests/e2e/open-with.mjs 12/12 (new); black-holes.mjs 45/45; note-folders 28/28; v094 87/87; layout 59/59; ai-sleep 16/16; v093 138/138; guide 8/8; deleted 6/6. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-06 22:00] v0.9.4 - by Claude (part 8: black holes — notes kept encrypted; not released)

The owner's Ideas note: "a black hole section beside the folders — notes kept wholly inside it, encrypted to the standards of the trade, stored in a folder of their own inside Nebula; they are for notes that must be safe, and opening one in the app asks for a password: a 4-digit PIN, set when the black hole is made — or a passkey (fingerprint, the computer's PIN)."

On the disk (electron/black-holes.js, new):
- `storage/blackholes/<hole>/hole.json` — its name, how it is locked, its key wrapped — and `<note>.bh` for each note: "NBH1", then the whole note (title, words, pictures written in) sealed with AES-256-GCM under the black hole's own 256-bit key, a fresh nonce at every save, the hole's and the note's ids bound in (a file moved or renamed does not open). Nothing of a note is anywhere else: not in the notes folder, not in a folder of pictures beside it.
- The key is kept only wrapped. By the PIN: scrypt (N = 2^16, r 8, p 1) of the four digits and a salt wraps it — and since four digits are ten thousand guesses whatever the derivation, that is wrapped once more by the operating system for this user (Electron safeStorage: DPAPI, the Keychain), so files copied off the computer (a backup, a flash drive) cannot be guessed at. Where the system cannot keep a key the PIN alone wraps it.
- By Windows Hello or Touch ID instead of a PIN ("passkey"): the key is wrapped by the operating system alone and handed over after it said yes. Windows: `UserConsentVerifier` through Windows PowerShell (the Windows Runtime; `CheckAvailabilityAsync` answered "Available" on this machine); Mac: `systemPreferences.promptTouchID`. THE WINDOWS PROMPT ITSELF HAS NOT BEEN SEEN: nobody was there to lend a finger, and the tests play its answer (NEBULA_HELLO=ok|no|none). It may open behind the window; the owner's try will tell.
- A recovery key, 160 random bits as 32 letters and digits, shown once when the black hole is made: it opens it on another computer, after Windows is installed again, or when the PIN is forgotten (and asks for a new PIN). Without the PIN and without that key nobody opens it.
- Five wrong PINs, then every try waits: 30 s, doubling, a quarter of an hour at most; counted in hole.json, so a restart does not reset it.
- Deleted is deleted: a note deleted from a black hole, and a black hole deleted, are overwritten and removed, in every backup too (backup-purge.js). A note moved INTO a black hole is sealed first and then its plain file is deleted the way a deleted note's is — out of the vault, its pictures' folder and every backup.

In the window (src/js/black-holes.js, new; notes.js; disk-store.js):
- The round button beside New folder makes one (name; 4-digit PIN twice, or Windows Hello). The black holes stand under the notes: locked, a name and "locked"; open, its notes as a folder shows them, "+ Add a note", "Lock". A note goes in by a drag onto it or from its ⋯ ("Move into a black hole"), and out by "Take out of the black hole". ⋯ on a black hole: Lock / Open, Rename, Change PIN, Delete (asks).
- While a black hole is open its notes are in the note store, marked `hole`; they are not among the list's notes, the search or "the next note to open". The disk mirror writes each note where it belongs — `placed`: the vault or a black hole — the new place first, then deleted from the old. Locking saves, takes the notes out of the store and makes the mirror forget them (a note that leaves the store otherwise IS a deletion). A file in the notes folder is a plain note whatever it says of itself.
- A black hole locks itself after ten minutes without a key, a click or the wheel (`nebula:holes-idle-minutes`, 0 for never), and all are locked when the app starts or the page loads again; the main process lets go of every key when the app quits.
- A video file cannot be kept in a black hole (it is a file beside its note): dropping one says so, and a note holding one cannot be moved in.

Said plainly:
- A 4-digit PIN protects against someone at the keyboard, and the operating system's wrap against someone with the files. Someone who can run programs as this Windows user, with the files, can try all ten thousand PINs in an hour or so. A longer PIN or a passphrase would close that; four digits were the owner's word.
- While a black hole is open, its notes are in the app's memory in the clear, and what is done with them is as open as with any note (export, copy, the AI panel).
- The names of black holes, how many notes each holds and when they were changed can be read on the disk.

Guide: sections 1 and 10 and one item in "New in 0.9.4", four languages; What's new one item, four languages; signatures renewed (the seventh test build's four kept).
Unit 843/843; tests/e2e/black-holes.mjs 38/38 (new); note-folders 28/28; v094 87/87; layout 59/59; ai-sleep 16/16; v093 138/138; guide 8/8; deleted 6/6. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-06 18:00] v0.9.4 - by Claude (part 7: a folder for each note — pictures and videos as files; not released)

The owner's Ideas note: "a copy of the pictures and videos put into a note — a folder of its own for each note, the files kept in there; let us change how the files are kept, inside storage again." And, on this turn: "part 7; the questions on your mind and what was not changed, last."

On the disk (electron/note-media.js, new):
- `storage/notes/<id>.json` is the note as before; `storage/notes/<id>/` is its folder, made when it first holds something. A picture is `<24 hex of its sha256>.png|jpg|gif|webp|bmp|avif|svg` there, and `nebula-media://note/<id>/<file>` in the note's file. The id is in the path, under the one host `note`: a browser writes a host in small letters and an id is not always small letters.
- Pictures change hands at the disk and nowhere else: `storage:read` hands a note over with its pictures written into it again (`inlinePictures`), `storage:write` takes them out (`externalize`), the files first, then the text. So the editor, undo, copy and paste, cropping, every export and the Nebula-note file are untouched — a note's file is small (the Ideas note: 2.4 MB of text before), and a save while typing writes the words only; a picture's file is written once.
- A picture taken out of a note loses its file at that save (`sweepNote`; an undo writes it again). A note deleted from the Trash loses its folder, shredded, in the vault and in every backup (backup-purge.js: `purgeNoteFromBackups` and `purgeDeletedFromBackups` take folders too).
- At a start (`prepareNoteFolders`): the first time, the vault is put aside as it was — `backups/pre-note-folders`, never overwritten; without that copy nothing is changed — then every note still holding pictures in its text is written the new way (`tidyVault`) and what no note names any more leaves the folders. A note whose file cannot be read keeps everything. `meta.json` schemaVersion is 2.
- A note that names a file of another note (a copy of a note) gets its own copy of the file (`rehome`). A note file taken out of a vault and imported brings its pictures when its folder lies beside it.

Videos (new: there was no way to keep a video file in a note):
- A video file — mp4, m4v, webm, ogv, mov — dropped on a note is copied by the main process into the note's folder (`media:add-video`, the path from `webUtils.getPathForFile` in the preload; `vid-<time>-<random>.<ext>`) and stands after the line it was dropped on, as a card like an embedded video: the browser's own player, the file's name under it, ×, the resize handles (src/js/file-video.js, `.link-block.link-embed.link-file`).
- The note plays it straight from the folder: the `nebula-media` scheme (privileged: standard, secure, stream), served by the main process with byte ranges, only files of a note's folder, only to the app's own session.
- A video's file goes at the next start after it left the note, not at the save — an undo in between still has it.
- In a file for another program a video file is a line "▶ name" (export.js `parse`, export-video.js `prepareVideos`). A note exported as a Nebula note names the video but does not carry it.

Not done, said plainly: pictures are still whole in memory while the app runs (this is the disk's layout, not the app's memory); the note's own .json lies beside its folder, not in it; a video cannot be pasted, only dropped; videos do not travel in an exported note; the daily backups copy the folders whole, videos too.

For the push: tests/e2e/smoke.mjs, old-notes.mjs and the rebuild test have not been run against the new layout.

Guide: sections 7 and 10 and one item in "New in 0.9.4", four languages; What's new one item, four languages; signatures renewed (the sixth test build's four kept). tests/fixtures/clip.webm: one second of a test card, 64 × 36, made once with ffmpeg.
Unit 811/811; tests/e2e/note-folders.mjs 28/28 (new); v094.mjs 87/87; layout.mjs 59/59; ai-sleep.mjs 16/16; v093.mjs 138/138; guide 8/8; deleted 6/6. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-06 15:00] v0.9.4 - by Claude (pictures after the owner's try; part 6: sleeping AI tabs, the sidebar's last row; not released)

The owner's note, read again after the part 5 build: "a bug in making pictures bigger and smaller, and a problem adding a third picture"; and the line about the lower part that must not overflow now stands under the snapshot of the app loading. Then: "go on; what was not done can stay".

Pictures:
- A third picture beside two was pushed under them: each picture of a row was at most half the line. Each now knows how many share its line (`--row` on the figure, written by image-place.js `tidyRows`, counted again on load) and is at most that share; three, four … fit as two did.
- Making a picture bigger and smaller: a picture in the text was resized from the width it was GIVEN, which a narrow page, a column or a row may have drawn smaller — so the first part of a pull did nothing, and a pull outward stored a width it could not have. It is resized from the width it is drawn at and never given more than is drawn. One in the middle of its line grows to both sides, so its corner follows the pointer at twice the pull.
- Not reproduced beyond these two; if the owner meant something else, a word on what was pulled and what happened.

The sidebar's last row: "Check for updates" was written there and moved into About by the script; until the script ran it squeezed the languages to "E… D… P… T…" (the snapshot). It is in About from the start (index.html).

Sleeping AI tabs (src/js/ai-services.js, ai-panel.js; electron/main.js, preload.js):
- Measured on a throwaway profile: 455 MB with nothing open (main 113, GPU 147, network 49, the page 146); every AI tab opened once +170 to 300 MB, plus an audio and a video-capture service (260 MB) once a site asks for devices; closing the panel keeps all of it (the pages are not reloaded by closing, either — checked).
- A tab not looked at for 20 minutes — another tab in front, the panel closed, or the window minimised — has its view removed (the memory goes with it) and remembers its address; opening it loads that address again. Its tab is paler, its dot a ring.
- Sleeping is a reload later, and the owner: "if somebody's temporary chat is in there I would not want to break it". So a tab stays awake when a reload could lose something we can know of without reading the page: its address says temporary / incognito; or keys were pressed in it since its address last changed and the address names no saved chat (a temporary chat whose address does not say so; words on a new chat never sent); or the last key pressed was not Enter (words not sent); or it is playing sound or loading. The main process tells the page only THAT a writing key was pressed in a view and whether it was Enter (`ai:typed` {wc, enter}) — never the key.
- Right-click a tab: Keep awake / Let it sleep when unused (kept in `nebula:ai-awake`), and Put to sleep for a tab not on screen. `nebula:ai-sleep-minutes` in localStorage sets the time (0: never); there is no control for it yet.
- Not covered: words pasted with the mouse only (no key), a temporary chat started by clicking a suggestion on a site whose address does not say so. Keep awake is the answer there.

ChatGPT, "the first time I entered the e-mail it failed, the second time it worked": Nebula Test's own sign-in log shows exactly that on 2026-09-30 — the sign-in window began as Firefox, Google refused it after the e-mail step, the window went on to the next way and asked for the e-mail again. Since the build of that evening it begins as Chromium for ChatGPT and Copilot, and the log shows both signed in at the first try (09-30 22:53, 10-01 08:20); what works is remembered per site. Nothing changed now. The installed app's log was not read (never the installed app).

Mac line spacing after A4 → A3 → NW: the owner's steps on Windows, and again as a screen whose real scale is 1 (what a Mac answers: NEBULA_REAL_SCALE, a new test switch in electron/main.js): every line 32.2 px apart before and after, the markup plain <p>s. Not reproduced, nothing changed; a note exported as a Nebula note from the Mac after it happens would show whether it is the markup or the drawing.

Guide: section 1 (the AI panel) and one item in "New in 0.9.4", four languages; What's new one item, four languages; signatures renewed (the fifth test build's four kept).
Unit 786/786; tests/e2e/ai-sleep.mjs 16/16 (new); layout.mjs 59/59; v094.mjs 87/87; v093.mjs 138/138; guide 8/8. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-05 13:00] v0.9.4 - by Claude (part 5: pictures on their line, side by side; a divider that splits the page; not released)

The owner's Ideas note, read again: "one mode fixes the picture at the left — make that an alignment setting … so I can put the picture left or right as I like" (two snapshots from Word: in line with the text, and between the lines anywhere); "I would have liked to put this picture beside the other one — it must not spill over when the window is at the side of the screen"; "dividers should be able to split the page … I add a divider and drag it to the right side; it should show how it will be dropped, and place it if the user agrees"; "split the page down the middle — only that part — so I can write on the right; later another divider below, and the old way again under it".

Pictures (src/js/image-place.js, new):
- A picture in the text stands left, in the middle or at the right of its line: `note-image--center` / `--right` on the figure, four more buttons on its bar (shown for pictures in the text only), the current place lit.
- Two pictures share a line: `note-image--row` on each; they stay blocks of the note (inline-block, each at most half the line), so everything that selects, moves and deletes pictures goes on working, and a narrow window makes them smaller instead of cutting them off. A row of one is no row (tidied on load, undo, delete, floating).
- A picture in the text can be dragged (it could not be moved by the mouse at all): sideways on its own line it snaps left / middle / right as it goes; over another picture an upright mark stands at that picture's side; between two blocks a flat mark lies there. Nothing moves until the button is let go; Esc gives it up; one Ctrl+Z undoes it.

Columns (src/js/columns.js, new; the mark is src/js/drop-mark.js):
- A divider is dragged. Up or down: a flat mark, and it moves there. Sideways by 40px or more: it stands up — an upright mark at the pointer and a tint over the part it will split. That part is everything between the divider and the next divider (or columns) above it; with the pointer held lower than the divider, below it; with the pointer over a block of that part, from that block. Let go: `<div class="blk-cols" data-split="50" style="--split: 50%"><div class="blk-col">…</div><hr class="blk-vr"><div class="blk-col">…</div></div>`, what was there in the wider column, an empty line in the other with the caret in it, and a line under the columns when nothing follows. The dragged divider IS the upright one.
- The upright divider: dragged sideways it moves the split (20–80 %, sticky at the half and the thirds); a click picks it and Backspace / Delete puts the two columns back into one flow, left first.
- Columns do not nest and need both columns: `healColumns` (on input, on load, on undo, and in migrate.js) puts right whatever an edit left — an emptied column gets its line, a block that lost a column becomes one flow again, no word lost. Backspace at the very start of a column and Delete at its very end do nothing, so a column is not joined to what stands outside it.
- The places that looked for "the block one level under the note" know a column is such a level: toolbar.js blockOf, slash-menu.js, lists.js (leaving a list), blocks.js (leaving a quote), inline-format.js, rich-paste.js (a pasted picture or link card stays in its column), migrate.js (an empty column is not "a blank line").
- In a file for another program the columns are one flow, left then right, with a rule between (the upright divider is an `<hr>`): Markdown, Word, OpenDocument, Rich Text, Evernote. PDF and print keep the columns; the HTML export has their CSS.

Not done, said plainly: a picture cannot stand in the middle of a line of words (Word's "in line with text") — it is always on a line of its own or beside other pictures; Word/ODT/RTF still centre every picture whatever its place in the note; the columns are two, not three.

Guide: section 4 (dividers), section 7 (pictures) and two items in "New in 0.9.4", in the four languages; What's new two items in four languages; signatures renewed (the fourth test build's four kept).
Unit 773/773; tests/e2e/layout.mjs 51/51 (new); v094.mjs 86/86; v093.mjs 138/138; guide 8/8. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-05 10:00] v0.9.4 - by Claude (a theme of one's own, Matcha a ready profile; not released)

The owner: take Matcha out of the row; at the far right a button, like the one that adds a folder, that opens upward, over Archive and Trash, a custom profile editor — background, sidebar / darkest tone, lines, accent, text — changing the app live; a name and "Save this profile" on top; Matcha there as the ready template. Modelled on the custom theme screen of the Pixel Pomo Android app (its CustomThemeScreen).

- Four fixed themes again (Main, Dark, Light, White) and a palette button at their right (`#btn-theme-custom`). It opens `#theme-editor` in the sidebar, above the drawer tabs: name + Save this profile, the profiles (Matcha always, saved ones with a ×, "Last edited" for colours never saved), five slots, the long bar of the chosen slot (press it for any colour) with a code field, 28 ready colours of the Pixel Pomo palette, and a warning when the words cannot be read on their ground.
- src/js/theme-custom.js: the colour math and the profiles — five picks become every token (`deriveTokens`: raised and sunken paper, three inks, rule, accent and its soft tone, `--on-clay` for words on the accent, shadow, color-scheme). src/js/theme.js: the picks are worn as inline tokens on `<html>` over the fixed theme of the same tone (`data-theme` main or light, `data-profile="custom"`), so every rule written for dark or light themes still holds; a fixed theme takes them all off. A test build's saved `matcha` is read as the custom theme wearing Matcha. src/js/theme-editor.js: the panel; every pick calls `theme.wearCustom` — the app is the preview.
- Kept in localStorage: `nebula:theme` (`custom`), `nebula:theme-custom` (the colours worn), `nebula:theme-profiles` (the saved ones). Deleting a profile asks first; Matcha's name cannot be taken.
- The picked background is the app's ground; the note's sheet lies a tone above it, as in Main.
- Opening Archive or Trash puts the editor away and the editor puts them away: they share the room.
- Guide (section 1 and "New in 0.9.4") and What's new rewritten in the four languages; signatures renewed, the third test build's four kept.
- Unit 748/748; tests/e2e/v094.mjs 86/86; v093.mjs 138/138; guide 8/8. No full smoke, rebuild or old-notes; not pushed.

---

## [2026-10-05 08:00] v0.9.4 - by Claude (Matcha made dark; not released)

The owner, on seeing Matcha as a light theme: "look at the Pixel Art Kit in the Pixel Pomo folder — like the Main theme, dark green and a white font."

- Matcha is Main's twin in green now. Its tones are the Art Kit's own MATCHA palette (BG #1a2420, CANVAS_BG #141c18, PANEL_HI #35483c, ACCENT #a6e3a1, SELECTED_ROW #3a5f3a, WORK, ERROR, ON_SURFACE, ON_DIM), with the words lifted to near-white (#F1F6EE) as asked. A dark theme: `color-scheme: dark`, the dark note colours of :root, and it is out of every rule that told the light themes apart again.
- Guide and What's new say "dark green with white words", in the four languages; signatures renewed (the second test build's four kept).
- Unit 733/733; tests/e2e/v094.mjs 73/73 (Matcha: a dark green ground, white ink, contrast over 10 on text and over 4.5 on its buttons).

---

## [2026-10-05 01:00] v0.9.4 - by Claude (labels after the owner's try; part 4: fonts and Matcha; not released)

The owner, after trying the labels: "#abc, the first label I made, changed to #ace — it stopped being kept: only #ac was left"; "the label lights up like Ctrl+F, but with several in one note there is no going from one to the next"; then: part 4.

- A label could be shortened and never lengthened: letters typed at a chip's end were put outside it (the 0.9.3 rule that kept "#errands word" apart). Now a space or a mark at the end still ends the label, and letters and digits typed straight on are the label's own; the place right behind a chip counts as its end too. #abc → #ace is one chip, tag "ace".
- The label's places in a note have a bar (label-filter.js initLabelHits): the label, "2 of 5", ↑ ↓ and ✕, in the find bar's look and place (under it when both are open). The one stepped to is lit stronger than the rest; ✕ puts bar and paint away until another note or label.
- **Matcha**, a fifth theme in the middle of the row: near-white paper, deep green ink, a matcha accent; a light theme, so every rule that tells light from dark learned its name, and it takes the light note colours.
- **Fonts.** A copy made inside Nebula keeps a font and a size somebody chose (cleanNebulaHtml: what is not the app's own face and size, and not a heading's or inline code's own); the default still goes, so default words take the font where they land. Pasted lines are written in the note's writing font, as typed ones are (dressInNoteFont — each pasted block's words in a span with it; loose words too on an empty line; a heading takes the face only).
- **The Font menu** has a search and "+ Add a font": the fonts of this computer (queryLocalFonts — `local-fonts` is granted to the app's own window only), under the app's own; picking one adds it to the reader's list (localStorage `nebula:fonts`, × takes it off) and applies it. A name typed that is in no list can be added if the computer has it (measured).
- Guide and What's new: Matcha, fonts and labels, in the four languages; signatures renewed (the first test build's four kept, so its guide is still known as unwritten-in).
- Unit 733/733; tests/e2e/v094.mjs 73/73. No full smoke, rebuild or old-notes run.

---

## [2026-10-04 22:30] v0.9.4 - by Claude (privacy, the guide in four languages, AI session data, part 3: labels; not released)

The owner passed on a reader's question — "is the app saving data from the AI chat?" — and then: "add it [the answer, to the guide], go on with the notes, add a clear-session option to the AI panel's right-click, above Delete, and Delete should ask 'are you sure'"; and a reader's word on the guide: "it would be better if, when you switch to Deutsch, the whole welcome page and its information switched too."

- The answer, checked in the code: no. An AI tab is a `<webview>` on its own `persist:ai-<id>` session; nothing reads a chat's page, nothing of it is stored or sent. What is kept locally is the session (cookies, site data, cache), `sign-in-methods.json` (site and method name) and `sign-in-log.txt` (redacted addresses). The app's own requests are the update check, a bookmark's title and a video's still.
- Guide: a new section **9 · Your privacy** says so (Where your notes live is 10, Code blocks 11), and "New in 0.9.4" lists this release; the sentences about Ctrl + / Ctrl − zooming, the right-click menu, toggles, folders and AI tabs were brought up to date. GUIDE_VERSION 0.9.4.
- **The guide in the language of the app** (guide-i18n.js, guide-de.js, guide-pl.js, guide-tr.js): one entry for each of the English guide's 148 blocks with words, plus the title and the shapes' words; code samples, dividers and the stage are the English guide's own. A translation that is a block short is not used at all. The vault's guide follows the language at start and on every change of language — title and page — while nobody has written in it (its signature is one that shipped; the four of 0.9.4 are in GUIDE_SIGNATURES), without dating it. A guide somebody typed in stays as it is. `node scripts/guide-blocks.js` lists the blocks, `--check` the counts, `--signatures` the signatures. Help → Guide page gives the guide in the app's language; place-test-exe and old-notes know the four titles.
- **What's new** for 0.9.4 is written, in the four languages (RELEASE_NOTES_I18N, notesIn); older sheets stay English.
- **AI tab → Clear session data** (`ai:clear-session`: that tab's storage, cache and auth cache; the tab loads again), above Delete website; both ask first, in the menu itself.
- **Labels (part 3 of the Ideas note):** typing `#` opens the labels already in use — of titles and of texts — narrowed as you type; nothing is lit unless what was typed is a label, so Space and Enter still make the label as typed, and ↓ or Tab pick from the list. A chip's `data-tag` follows its word as it is edited (it kept the first word: "#abc changed to #abd — abd stays among the labels"), and a chip whose # is deleted is words again. With a label picked in Filter by label, the open note shows where it is: its chips painted with the Custom Highlight API (nothing written into the note), the first brought into view when a note is opened from the list, a label of the title ringed.
- Found on the way: a chip put in by script with an ordinary space after it took the next typed letter into itself (a trailing space collapses and the caret counts as in the chip) — the space is a no-break one, as a typed one is.
- Unit 723/723; tests/e2e/v094.mjs 60/60; v093.mjs 138/138 (its AI tab checks follow the new menu); guide.mjs 8/8. No full smoke, rebuild or old-notes run.

---

## [2026-10-04 20:30] v0.9.4 - by Claude (part 2 of the Ideas note: toggles; not released)

The owner, after trying part 1: "when text is selected the right-click menu and the copy menu should be one — and go on with the notes." The Ideas note had two new snapshots: Ctrl + / Ctrl − with only a caret ("what grows? something moves but I cannot tell what") and "full folders should have + Add a note at the top too".

- Over selected words a right-click opens ONE menu: the formatting bar's buttons as its first row (drawn from the bar itself), then Cut, Copy, the three pastes and Select all. Nothing in it takes the focus, so the words stay selected.
- Ctrl + / Ctrl − with only a caret sized the editor's direct child — in a list the whole list — and words carrying a size of their own did not move. It sizes the LINE the caret is in now (the size box does too), the line's own words letting go of their size; the keys no longer change the note's writing size. The owner's note was left with `font.size 16` by the first build: the size box sets it back.
- "+ Add a note" stands at the top of every open folder, not only an empty one; a note dragged onto it goes into the folder.
- Toggles (the second Ideas note):
  - A click just before a title's first letter folded the toggle (the arrow's zone was 24 of the 26px before the words); it is 20 now, and the caret goes to the start.
  - Enter at the start of a title with words puts an empty line ABOVE the toggle (it emptied the title into the body) — the way to get a caret before a toggle that opens a note or follows an embed, where neither arrow key could go.
  - Ctrl+B (or I, strike) then typing on an empty line came out plain in a note with a writing font: the letter is put in by hand there and never saw Chromium's typing state. It is wrapped in what was switched on.
  - A list item becomes a toggle IN its list (`<li><div class="blk-toggle">`), its sub-list what folds; it used to be taken out and the list split in two. Enter and Backspace in such a toggle are handled by toggles.js (Chromium's own answer broke the item out of the list) and marked, so toolbar.js's list rules do not act on the same key.
  - Headings that fold: `/toggle-h1`, `/toggle-h2`, `/toggle-h3`, and the toggle button on a heading keeps it a heading; the arrow sits at the middle of the heading's line.
  - The toggle button on a title takes the toggle away again (it put a second toggle inside the first).
- Unit 705/705; tests/e2e/v094.mjs 41/41; tests/e2e/v093.mjs 138/138 (toggles and lists live there). No full smoke, rebuild or old-notes run.

---

## [2026-10-04 19:00] v0.9.4 - by Claude (part 1 of the Ideas note, not released)

The owner: "read the note in Nebula Test and act on it; split the tasks into parts, I will check step by step." The note is "Ideas For Nebula and Testing For Nebula" in Nebula Test's vault (about thirty items, eleven snapshots). Part 1 is the small things; the parts still to do are in memory.json `next`.

- What's new ran off the bottom of the window: the sheet (and Shortcuts, Blocks, About) is at most 86 % of the window high and its list scrolls; the button stays in reach.
- Paste from the right-click menu, the bar and Edit did nothing while Ctrl+V worked: the page may not read the clipboard (`clipboard-read` is not granted, and Electron no longer runs execCommand('paste')). The main process makes a real paste now (`edit:paste`), which arrives as the paste event Ctrl+V sends. The menu offers three ways: Paste as Nebula format, Paste original format, Paste only text.
- "I paste a web page and the screen goes to the top": focus coming back from the "Paste as" address put a caret at the top of the note first. restoreRange focuses without scrolling.
- Pasted words went black-on-dark in another theme: insertHTML wrote the ink of the theme that was on onto what it inserted (`<b style="color: rgb(…)">`). It comes off after the paste (undressInserted), and notes already written lose every frozen theme ink on opening and in the vault repair (dropFrozenInk, MARKUP_VERSION 0.9.4, an exhibit in the residue museum). A colour the source page gave ("original format") is not touched.
- Ctrl + and Ctrl − size the words, one step along the size list (they did nothing: the app has no native menu to carry an accelerator). The View menu's zoom items keep working, without a key beside them.
- `-->` and `<--` become → and ← as they are typed (auto-arrows.js); not in code; one Ctrl+Z gives the characters back.
- Spelling: "Ignore" beside "Add to dictionary" — the word is left alone until the app closes (kept in the dictionary meanwhile, taken out at the next start); English is checked as American and British together.
- A thin line between the page sizes and the pad, and the two closer together.
- An empty folder shows "+ Add a note" above "Drag notes here"; the note is made in that folder.
- The folded rail no longer shows ⋯ over a note's initial; a right-click on a note or a folder (folded or not) opens its menu at the pointer.
- While the app loads, the bar and the page stood side by side: the bar's place is set before the vault is read, and the page is served with it on top.
- Unit 701/701; tests/e2e/v094.mjs 23/23 (joined to the smoke run). No smoke, rebuild or old-notes run: the owner tests Nebula Test.exe first.
- Not done yet, for the push: the guide's "New in" and What's new for these, README/Prompt where they name the shortcuts.

---

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
