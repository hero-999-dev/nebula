## 2026-10-16 (09:00) — 0.9.6: one check that raced the build machine, one preview the viewer held

- tests/e2e/ai-sleep.mjs "three tabs opened are three pages loaded": the third tab's page was looked for 700 ms after its click; the slower Windows runner had not begun it. The check now waits for the page (up to 40 × 200 ms) before it counts. Alone here: 16 of 16.
- tests/e2e/v093.mjs "turned back to landscape and closed": prints the files left in pdf-preview when it fails. tests/e2e/note-folders.mjs: until waits up to ten seconds for the disk, not four.
- tests/e2e/black-holes.mjs "a passkey is added beside the PIN": the menu is read until it offers "Remove the passkey" (up to five seconds), not once.
- tests/e2e/black-holes.mjs: every file the suite reads to look for words in the clear is read through bytesOf, which gives nothing for a file the app removed after it was listed (the second 0.9.6 build stopped there on ENOENT). Alone here: every check passed, twice.
- With dropPreview retrying (electron/main.js), the whole smoke suite at 0.9.6: 1010 of 1010.

## 2026-10-16 (08:40) — after the consultation (B26, B27, the guide, two display cuts)

- tests/dialog-words.test.js (new, Mistral): every dialog string has de, pl and tr; no translation drops or adds a {placeholder}; a full set of values leaves no {..}; an unknown key or language gives English (B26). tests/permissions.test.js (+1): the embed's question in tr, de and pl. FAIL-BEFORE: the module did not exist; askWords had no language.
- tests/mark-of-the-web.test.js (new, 4, GPT Sol): ZoneId=3 written on Windows, read back from a real NTFS stream; nothing on other systems; a drive without streams does not fail the copy. tests/e2e/open-guard.mjs (+2, in smoke): the copy Open makes and the one Save a copy writes carry the mark, the stored attachment does not. FAIL-BEFORE: 0/2 on the old build (B27).
- tests/opened-files.test.js (+1): every `clearOpened` scope goes through the real `shredTree` (spied), so an opened copy is overwritten before it goes.
- tests/notes.test.js (+1), tests/link-preview.test.js (+1): the sidebar line and a link card's title never end in half an emoji (B24). FAIL-BEFORE: a lone high surrogate on the old code.
- tests/e2e/v093.mjs: the landscape-then-Cancel check waits up to 6 s for a render still printing at Cancel to be discarded on arrival (pdf-preview.js) — it failed once in the full smoke on a loaded machine (1009/1010), passed 138/138 alone twice; not a leak.
- tests/seed-guide.test.js, tests/e2e/guide.mjs: "10 · A page in a note that asks" before "11 · Where your notes live" and "12 · Code blocks"; "A page in a note asks first" in the feature list; new 0.9.6 signatures (en/de/pl/tr).

## 2026-10-16 (05:00) — the bug hunt on the 0.9.6 test build (Claude, Mistral, GPT Sol; bugs B1–B24 in test-results/orchestra/hunt/bugs.md)

Every test below failed on the code before its fix and passes after (each bug's entry in bugs.md says how it was checked).

- tests/e2e/ipc-surface.mjs (new, in smoke): a backup label `.` or `..` is refused and a safe one makes a real backup (B1).
- tests/e2e/app-lock-opened.mjs (new, in smoke): Lock Nebula clears an opened black-hole file (B3).
- tests/file-attach.test.js, tests/opened-files.test.js: a long name is cut in its stem and keeps its ending (B2); the copied name always ends in the stored ending, a program/script/shortcut is known as one (B12); the card's face is drawn from the stored file, a true dotfile card stays true (B13); a real `.env` opens and saves as `.env` (B15).
- tests/vault-presence.test.js (new), tests/e2e/vault-disconnect.mjs (new, in smoke): a vault folder gone missing is not made again; saving fails visibly (B6).
- tests/e2e/attach-adopt.mjs (new, in smoke): a card pasted into another note is copied into it and opens there, plain and sealed (B4).
- tests/note-media.test.js (+): a note keeps its own copy of a deleted note's file, at a start too (B5); a copy cut short goes from a saved note's folder and is never backed up (B8). tests/heal.test.js (+1): the museum exhibit for B5 — the markup repair leaves such an address to the disk repair.
- tests/e2e/toggle-body.mjs (new, in smoke): a picture, a card or a video placed in a toggle body stays in it and folds with it (B7).
- tests/e2e/dense.mjs: the old-notes signature skips what the screen draws (B9).
- tests/e2e/pdf-scratch.mjs (new, in smoke): no PDF of a note left after Lock Nebula or locking a black hole (B10).
- tests/e2e/card-keys.mjs (new, in smoke): a card can be picked, removed, undone and opened from the keyboard (B11).
- tests/e2e/open-guard.mjs (new, in smoke): Open asks before a program; a forged card shows its stored ending (B12, B13).
- tests/find.test.js (+): Find skips a code block's picker and a card's controls (B14); offsets stay right past İ, İ and ı match i, and no character in Unicode changes length when folded (B19). tests/e2e/find-folded.mjs (new, in smoke): a match in a folded toggle opens it (B16).
- tests/notes.test.js (+): the sidebar search and preview skip a code block's picker (B17); "istanbul" finds "İstanbul" (B19).
- tests/note-media.test.js (+1): a file copied for a note and given up when another note opened is released once, only from that note's own folder, so the next start asks nothing (B18).
- tests/app-menu.test.js, tests/editor.test.js, tests/v093.test.js, tests/v094.test.js (+4): the command palette, @ and # suggestions, the label filter and picker and the slash menu find İndir, İstanbul, İş and Alıntı however the I is typed, in an English window (B19, part 2).
- tests/export.test.js, tests/logo.test.js, tests/theme-custom.test.js (+1 each): a name cut to length never splits an emoji (B20); tests/folders.test.js, file-attach, file-video, v094 (fonts), black-holes, app-logo and labels tests the same at every other site (B24, 8 fail-before assertions by Mistral, +1 by Claude).
- tests/heal.test.js (+1, residue museum): "up to 0.9.5: a video card whose name ended in half an emoji" — the half goes from the card's name and face, an emoji beside it stays, a second pass changes nothing (B24). tests/migrate.test.js: MARKUP_VERSION is 0.9.6.
- tests/e2e/vault-disconnect.mjs: the test moves the folder away again for up to 5 s when Windows refuses for a moment (EPERM while the note's picture is read, or a scan) — it failed about half the runs at the wrap-up smoke, on Electron 44.7.2 as well as 44.8.0; then 3 of 3 runs 6/6. A folder held for good still fails it.
- tests/navigation.test.js (new, 8): the app window stays on its page; only http, https and mailto go to the system; a page in a note opens nothing by itself and a pressed link goes to the browser once (B21, B23).
- tests/permissions.test.js (new, 6): an embedded page never gets the microphone, the clipboard, notifications or the location; a chat tab keeps its voice; openExternal only for web and mail links; which sessions are AI tabs (B22).
- tests/permissions.test.js (+6), tests/e2e/embed-ask.mjs (new, 7, in smoke) — B25, the owner's decision: an embedded page asking by itself gets no question; Don't allow leaves it without the microphone and it is not asked again; Allow gives it notifications (`Notification.permission` granted after, never before); a reload and the note opened again forget every answer. FAIL-BEFORE: on the old build the e2e failed 6 of 7 — `Notification.permission` was 'granted' with nobody asked, and no question was ever shown.
- Probes kept outside the suite (they need a throwaway profile and a built app): test-results/orchestra/hunt/probes/ — c23/c23b (B21), c24 (B22), c25 (B23), c19 (B19), c18 (B18) and the rest.

## 2026-10-15 (18:55) — files in a note (Nebula Test build, ships as 0.9.6)

- tests/file-attach.test.js (new, 14): what a card says of its file (ending, kind, size, the line under the name); only a note's own attached file is an address it keeps; a name that is markup stays words; Open and Save a copy are added on the screen once and never saved; a click saves a copy, Open opens one, a locked black hole and a missing file are said, a cancelled save says nothing; a drop's kind; /file in the slash menu; "📎 name" for other programs; the file travels with the note into and out of a black hole; a held note gets its files back as cards.
- tests/note-media.test.js (+5, "a file attached to a note (0.9.6)"): copied under a name of its own, the original left where it was; any ending, `bin` for an odd one; never outside a note; neither a picture nor a video whatever its ending; swept at the next start once the note no longer names it; shared by the backups and carried beside a note, never inside it.
- tests/black-holes.test.js (+1): an attached file is sealed (its words are nowhere in the black hole) and comes out whole; a locked hole refuses it.
- tests/opened-files.test.js (new, 12): what an attached file's address names, and nothing for a picture, a video, a path or a climb out; a name made a safe file name; where Open puts a copy, never outside its root; each copy goes with what it came from — a black hole locked or deleted (only its own), every black hole, a note taken out of one, a note deleted, a card taken out, the start; a scope that names no place clears nothing. (GPT findings 1-3.)
- tests/file-attach.test.js (+2): a note opens only its own files — the address must name the open note and its black hole or none; a card pasted from another note is neither saved nor opened. (GPT finding 5.)
- tests/note-media.test.js (+1): a note deleted while its file was being copied does not get its folder back; an unsaved note's first file still copies. (GPT finding 4.)
- tests/note-media.test.js (+1): a new note left before its first save while its file was copied leaves nothing at the next start; a note that cannot be read, or a folder with anything else in it, is left. (GPT second review, 1.)
- tests/e2e/editing-edges.mjs (+1, in smoke): a note whose first block is a divider, opened right after Backspace in another note with its caret on the note beside the divider, opens with the divider not picked. Fails on the code before the fix ({"armed":1}), passes after.
- tests/e2e/smoke.mjs: a run that threw for a reason that is not a timeout exits 1, never 0; `ERR_ABORTED` / "(-3) loading" counts as could-not-finish (2). Mistral's run 2 had exited 0 with four suites never run.
- npm run old-notes: 1 failed (the divider) twice in Mistral's runs → every trial passed after the fix.
- tests/e2e/smoke.mjs: Help → Blocks lists 22 blocks (/file).
- Unit, after the fixes: 68 files, 1164 of 1164.
- Full smoke on the final tree (Claude, idle machine): 923 of 925. The two misses passed when their suites ran alone: note-folders "and Ctrl+Z brings the picture back", and black-holes "a passkey is added beside the PIN" (the passkey was written; the menu read straight after had not caught up). An earlier run, 866 of 878, failed the black-hole move-in cascade (as Mistral's run 3 did), and the suite failed alone on that dist/ too; after a fresh build it passed alone on the released 0.9.5 tree, on 0.9.5 with this tree's electron/ and src/, and on this tree. Most likely a stale dist/, not pinned down.
- tests/ai-browser-auth.test.js: the ESR the sign-in tells Google is read from FIREFOX_ESR instead of a typed 140.
- tests/check-browsers.test.js: "stops on an ESR that is no longer one" uses an ESR past the one the app tells (165), so it holds after each ESR bump.
- tests/seed-guide.test.js, tests/guide-i18n.test.js: unchanged; pass on the 0.9.6 guide in four languages (signatures recorded).

## 2026-10-12 (15:30) — 0.9.5: two checks that held only before the version changed

- tests/e2e/v094.mjs "What's new ... its list scrolls when it is longer than the window": it measured the list of the version being run. Here the suite runs before the version is raised (0.9.4's long list); where the release is built it runs on the new version, whose list of two things has nothing to scroll. The check makes the list long itself now.
- tests/e2e/ai-sleep.mjs: an AI tab whose page had not begun to load has no address, and `new URL('')` stopped the whole run on the build machine. Such a page is passed over, and the page looked for is waited for.
- The whole smoke suite at version 0.9.5, as the build machine runs it: 924 of 924.

## 2026-10-12 (14:52) — 0.9.5: a caption's marks, and the taskbar's logo

- tests/inline-family.test.js (+3): a mark on a caption leaves the picture whole, in a column and on the page; a pasted background comes off the words that get a highlight and off no others; "No colour" takes it off, and a colour of ours takes off a pasted one.
- tests/app-logo.test.js (+4): a logo's app ID; what a window tells the taskbar with a logo, without one, and where the app is pinned; the pin that starts this copy is found among the pins.
- tests/e2e/v095.mjs (new, 8 checks, in the smoke suite): the owner's note as it is kept — two columns, a picture whose caption was pasted from a dark page. A highlight leaves picture and caption where they are and shows; another takes its place; the same on the page itself and for a text colour; Ctrl+Z; words pasted into a caption come as one line of plain words. Before the fix the first highlight left the picture without a caption (the run stopped on it).
- tests/e2e/settings.mjs (+2, 125): the window tells the taskbar of a logo under an app ID of that logo's own, and of another logo under another.
- Seen on this computer's taskbar, not kept as a test (it needs the real taskbar): the app run from source with a logo set in Settings — the button wore it at once, wore the next one when it was changed, wore it from the first moment after a restart, and went back to the app's own ID with the logo taken off.
- Not tried: a taskbar pin; a Mac; the installed copy itself.

## 2026-10-12 (08:27) — 0.9.4: two tests that held on Windows only

- tests/open-file.test.js: the paths of "the files among a command line's arguments" are made with path.resolve and path.join from the temp folder, so they are absolute on macOS and Linux too. On GitHub: 2 failed of 1105 on Linux and on the Mac before; nothing else failed there.

## 2026-10-12 (07:54) — 0.9.4: the checks before the release

- Electron 44.7.0: unit 1121 of 1121, build, smoke.
- tests/e2e/smoke.mjs and the suites it runs (recovery, ideas-note, dense) read note files in either layout through tests/e2e/profiles.mjs; six menus, 21 blocks, no drawer counters. 916 checks, all passed in the last full run.
- tests/e2e/v094.mjs: the toggle's title is measured once the embed above it has settled — 6 runs of 6.
- tests/e2e/old-notes.mjs: reads note folders and takes pictures along; 42 of 42 on copies of Nebula Test's notes (two notes and the guide).
- tests/e2e/dense.mjs: the comparison leaves out a `<br>` after the last words of a line; the "long paragraph" is one with words right under it where the note has one.
- The local page rebuild: 100 % on both pages (0.9.3: 100 %), 41 long-note trials passed.
- Not part of smoke, run by hand on Electron 44.7.0: settings 123 of 123, table 66 of 66, table-edges 151 of 151.

## 2026-10-12 (06:58) — 0.9.4: two ways to paste, the toggle's frame, a row's room, the font the bar names (not released)

- tests/paste-clean.test.js (26): the size kept on the words that had it, one span a line and a span a run; bold, italic, underline kept; no font, colour, ground or animation; a heading and code left alone; `pastedSizePx` (px, pt, rem, words, `<font size>`, 8 to 96, nothing for em and %); a box of paragraphs.
- tests/v094.test.js (+5): `healToggles` — an empty frame, one that still holds words or a body, one in a list item, one inside a toggle, and whole toggles left alone.
- tests/layout.test.js (+1): `--beside` for two and three in a row, while one is resized, and gone with the row.
- tests/e2e/v094.mjs (111): the menu's two pastes; the original paste (size kept, font and colour the note's); the last used font after a pick, its pin, its + once it is off the list; the bar's name for a stack whose first font is not here; a toggle's frame — Backspace in it, a toggle emptied from title into body, a frame found at an edit.
- tests/e2e/layout.mjs (128, +1): beside a narrow picture, one pulled out grows past half the line and stops at the line's end.
- Also run: rich-paste 20, table 66, table-edges 151 (one scene fewer: the third paste), v093 138, settings 123.
- Flaky: v094 "a click on the arrow still folds it", 2 runs of 5.
- Unit 1121 of 1121.

## 2026-10-12 (06:15) — 0.9.4: "+ Add a font" gone once pressed (not released)

- tests/e2e/v094.mjs (110, +2): pressed, the button is not shown under the fonts it opened; a typed name that is in no list brings `+ Add “name”`; the menu opened anew has "+ Add a font" again.
- Also run: settings 123 (its first run wrote nothing and ended; the second passed). Unit 1113 of 1113.

## 2026-10-12 (06:07) — 0.9.4: a font that is not on this computer is refused again, in new words (not released)

- tests/settings.test.js: the three tests of the kept stacks are gone with the feature; the new sentence is among the translated words.
- tests/e2e/v094.mjs (108): the + and the pin of a font that is not here both answer "That font is not on this computer, so it cannot be added" and list nothing; a name typed into the search gets the same answer.
- tests/e2e/settings.mjs (123, +1): what the 05:44 build listed is off the list and the pins at the next start, and its key is gone.
- Unit 1113 of 1113.

## 2026-10-12 (05:45) — 0.9.4: a font that is not on this computer, added with its stack (not released)

- tests/settings.test.js (+3): `cleanFontStacks` (its own name only, nothing that ends a style), `customFontStack`/`fontRows`/`fontChoices` with a kept stack, the store read back and a damaged one read as none.
- tests/e2e/v094.mjs (109, +3): the + of a font that is not here adds it with its stack and says a stand-in is shown; picked from the list it writes that stack; its × takes the stack away; a bare name typed into the search is still refused.
- Also run: settings 122, rich-paste 20. Unit 1116 of 1116.

## 2026-10-12 (05:30) — 0.9.4: the original paste is the font alone, the caret's colour, the font used last (not released)

- tests/paste-clean.test.js (24, +7): the face kept on the words that had it; no colour, size, ground or animation; a line break outside the span; a face a line and a span a run; `<font face>`; code untouched; no font that could end a style; a box of paragraphs no longer comes out empty.
- tests/settings.test.js (+3): the font used last — its name, its stack, kept on this computer, a damaged one read as none; the new words in three languages.
- tests/e2e/v094.mjs (106, +9): the original paste (font kept, the note's colour and size, no ground); the caret's colour on a pale line; the last used font after a paste and after a pick, its + and its pin, hidden while searching, a font that is not on this computer.
- Also run: rich-paste 20, settings 122, v093 138, layout 127, table 66. Failed once and passed after: v094's two toggle clicks (1 run of 4), layout's picture pulled to the left (1 run of 3).
- Unit 1113 of 1113.

## 2026-10-12 (05:05) — 0.9.4: the logo's shortcuts gone through gently (not released)

- tests/app-logo.test.js (16, +1; the shortcut tests now wait): every shortcut file listed, two deep; never more than two read in one go, the process let go in between; a newer logo takes over.
- tests/e2e/settings.mjs (122): the checks on a shortcut wait for it — it follows the window by a moment.
- Measured by hand in the packaged test build (test-build/win-unpacked, a profile of its own, the real shortcut folders, none of whose shortcuts start that copy): a change answered in 12-15 ms, the longest wait for the main process after it about 100 ms; before, 1034 ms held in one piece.
- e2e: settings 122/122, black-holes 69/69, v094 97/97 on this build; the other suites as they ran on the build before (the change is in the logo's shortcuts alone). Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide.
- Unit 1103/1103 (66 files).

## 2026-10-12 (morning) — 0.9.4: themes of the logo's own (not released)

- tests/logo.test.js (20, +5): logo themes — kept, each name once, never a fixed theme's or a profile's; saved again under their name; renamed; "Contrast 2" and counted on.
- tests/app-logo.test.js (15, +3): a shortcut made on the desktop, one that is there given the logo, another program's left alone, a name a file may have.
- tests/e2e/settings.mjs (122, +9): no "Nebula's own" outside the test build, Main lit; a ready theme put on makes no theme; a colour changed on it makes "Contrast 2" and the next change goes into the same; + with a name offered and a taken one refused; a change on a theme of one's own; a double-click renames; × asks and deletes; "Put a shortcut on the desktop"; the mark in the title strip in the app's theme; the test build's own logo first, and Main there as one to put on.
- e2e: settings 122/122, black-holes 69/69, v094 97/97, v093 138/138, layout 127/127, note-folders 60/60, rich-paste 20/20, table 66/66, table-edges 152/152, ai-sleep 16/16. Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide. Not tried: the packaged app against the real desktop, Start menu and taskbar — the shortcuts were a test's own, in a folder of its own.
- Unit 1101/1101 (66 files).

## 2026-10-12 (towards morning) — 0.9.4: Contrast, black holes' password, the logo's colours (not released)

- tests/black-holes.test.js (40, +10): no black hole without a PIN; a passkey beside it at the start and later, either opening; none on a black hole without one; the PIN changed with the passkey kept; another computer; `prove` with the PIN, the passkey and the recovery key, open or shut, nothing changed; a wrong answer counted and waited for as at the door; deleted only with its answer, in the Trash and by the recovery key; one of the first builds taking a PIN.
- tests/logo.test.js (15, new): Nebula's own is make-icon.ps1's palette; the drawing's geometry and colours; the edge left out under 32 px; a theme put on it, Contrast among them; the fixed themes held to tokens.css; Matcha and Contrast ready, deletable, the former name not kept twice.
- tests/app-logo.test.js (12, new): the colours and the pictures checked; the .ico's entries; kept, replaced under another name, refused when not whole; the shortcuts that start this copy pointed at it and back, another program's left alone.
- tests/e2e/black-holes.mjs (69, +11): the new dialog; taking a note out asks, by the menu and by dragging it among the notes; a passkey added and removed from the menu; the door waiting for a press; deleting asks, a wrong PIN deletes nothing.
- tests/e2e/settings.mjs (113, +15): Matcha and Contrast, deleted and brought back; the logo's editor — Nebula's own, Contrast put on it, a slot's colour by code and by a ready colour, the icon file and a real shortcut following, kept across a start, back to Nebula's own.
- e2e: settings 113/113, black-holes 69/69, v094 97/97 (+1; its three profile checks follow the ready profiles), v093 138/138, layout 127/127, note-folders 60/60, rich-paste 20/20, table 66/66, table-edges 152/152, ai-sleep 16/16. Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide.
- Unit 1093/1093 (66 files).

## 2026-10-12 (later) — 0.9.4: the lock as a PIN with a passkey beside it; the caret under a divider (not released)

- tests/app-lock.test.js (25, rewritten): a lock only with a PIN of six digits; off is not removed (the PIN, hint and recovery key kept; on again with nothing typed; Remove lock asked for its answer, on or off; by the recovery key too); a passkey beside the PIN (set only after its yes; either opens; asked only when asked for, a no not counted; gone from the computer; added later by the PIN, never by a passkey; taken away; turns off and removes as the PIN does); while the lock is shut nothing that asks no answer opens or changes it; the first test build's two shapes; the state told without the passkey lookup; the disk read once.
- tests/settings.test.js (25): "Serif"; "Nebula’s own (Serif)"; "Nebula’s own (14)" and its translations, the 14 held to app.css; the new words; off and remove said in two words in every language.
- tests/gap-caret.test.js (17, +9): beside a divider (under, over, a line made under the last one, a picture left alone, a card as before); the foot of a column.
- tests/e2e/settings.mjs (98): besides what it held — the line between the bar's two columns down past the last icon; pins drawn only under the pointer; the caret on the new line under a divider, Backspace keeping the last line and offering the divider, the next one taking it, in a column and on the note; a click at the foot of a column, under a divider that ends a column and one that ends the note, on the ground beside a divider, and on the divider; three lines typed in a new note all in the chosen font, and its title; the lock set as a PIN (no PIN, no lock), turned off (the file kept, no question at the next start, no File → Lock Nebula), on again, removed; a passkey ticked beside the PIN, the lock screen waiting for a press, a no, the PIN all the same, the passkey taken away and added again, and answering for the lock.
- e2e: settings 98/98, v094 96/96, v093 138/138, layout 127/127, black-holes 58/58, note-folders 60/60, rich-paste 20/20, table 66/66, table-edges 152/152, ai-sleep 16/16 (all but settings on the build before the last change to electron/app-lock.js, which settings and the unit tests ran after). Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide.
- Unit 1056/1056 (64 files).

## 2026-10-12 (night) — 0.9.4: the Ideas note again — Settings, the lock on opening, font pins (not released)

- tests/app-lock.test.js (16, new): no lock is no lock; a PIN of six digits and a hint that does not tell it; only hashes kept; the right PIN and no other; the wait after five wrong ones, across restarts; Lock now; not replaced without its answer; the recovery key, typed any way, takes the lock off; the passkey — set only where there is one and after its yes, a no not counted, gone from the computer; a damaged file is no lock; the state told without waiting for the passkey lookup; the disk read once however often it is asked.
- tests/settings.test.js (22, new): the store (defaults, what is kept, a change said, a damaged one); what a new note starts with; the fonts Settings offers; pins (first in the order pinned, an added font, a font not in the list, a press and the next, kept on this computer); Settings in the menus (after Help, a title that runs, "Toggle AI panel" and "Lock Nebula" there only when they apply); the dock with the AI panel put away; every new word in Deutsch, Polski and Türkçe, the app's name never declined.
- tests/app-menu.test.js, tests/v094.test.js: the six titles; a font row says whether it is pinned.
- tests/e2e/settings.mjs (59, new): the bar's lines at the right and the left; the font menu showing all fifteen fonts without scrolling at each side; pins; Settings after Help and its sheet; a new note on the chosen page in the chosen font and size from its first letter, kept in its file, an older note untouched, back at Nebula's own; the AI panel put away (pad, View menu, palette) and back; the black holes put away (the open one locked first, its note out of the list and the window) and back; a PIN lock — two PINs that differ, the recovery key shown once, the profile holding no PIN, the app opened again asking before anything and the main process refusing the list, a note, a write and the black holes; a wrong PIN, the right one, File → Lock Nebula with what was typed saved first, a wrong key, the recovery key, the PIN to take it off; Türkçe; a passkey lock set, refused, answered and taken off.
- e2e: settings 59/59 (new), v094 96/96, v093 138/138, black-holes 58/58, layout 127/127, table 66/66, table-edges 152/152, note-folders 60/60, ai-sleep 16/16, rich-paste 20/20. Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide (it is run from smoke).
- Unit 1036/1036 (64 files).

## 2026-10-11 (night) — 0.9.4: the Ideas note, its Bug part (not released)

- tests/lists.test.js (+1): the caret stays in its item when a list is lifted out of the line it fell into.
- tests/e2e/v094.mjs (96, +9): the bar's bullets on the empty line between a divider and a picture leave the caret in the bullet; Backspace makes it a line again, the divider neither picked nor taken, the picture there; words typed after the bullets go into the bullet; on Nebula Wide a divider ends as far from the frame at the right as it begins at the left, in a note that scrolls and in one that does not; the bar's code block stands right after its inline code and the row fits the bar; an embed whose process is ended is loaded again, and that is no edit.
- e2e: v094 96/96, table-edges 152/152, table 66/66, layout 127/127, v093 138/138, rich-paste 20/20, note-folders 60/60. Not run: smoke, old-notes, rebuild, dense, editing-edges, reported, guide.
- Unit 998/998 (62 files).

## 2026-10-11 (evening) — 0.9.4: the "urgent bugs" note, second round (not released)

- tests/table.test.js (46, +1): a row is given no less than a column may be narrow (24 px), from a file too; its height told to the stylesheet where the table is drawn and never held by a note, a copy or a table drawn again; the page written out tells it as well; pulled all the way up a row is 24 px; a table that fills its place takes the room to the last pixel (the + takes none); the squares are 8 x 12.
- tests/e2e/table-edges.mjs (152, +15): an empty row and one with a line of words pulled to 24 px, "6.4 mm", saved without `--row` and there when the note is opened again; a row with more lines pulled no lower than its words; a table of sixteen columns under a divider ends where the divider ends (within 1.5 px), its + in the margin, the page not scrolling sideways - after a column more, and after its last column is pulled out again; the squares 8 x 12, as wide as the numbers under them, the last one making a table of 8 x 12; Backspace on the empty line over a table, a video and a picture at the top of a column (the line goes, where the caret is, a step back); a column's only line and a first line with words stay; the first line of a note over each of the three; Delete over a picture leaves the picture; Delete on an empty line over a table and over a video.
- e2e: table-edges 152/152 (+15), table 66/66, v093 138/138, v094, layout, rich-paste and note-folders without a failure (one run of table.mjs lost four pulls of the mouse while the owner was at the machine - the window lost the focus; run again alone, 66/66).
- Unit 997/997 (+1).

## 2026-10-10 (afternoon) — 0.9.4: a portable copy in Open with (not released)

- tests/open-file.test.js (+3): what a portable copy writes for this user (its own names, every kind of document, nothing onto a kind of file itself, nothing of the installed app's); said once - a second start writes nothing, a copy that moved or one Windows listed without a name says it again, a failing reg.exe is "failed"; the description is the app's name alone.
- By hand, on the build: FileDescription "Nebula Test"; the keys after one start; Windows' own list of recommended programs for .docx, .doc, .odt, .rtf holds "Nebula Test".
- Unit 996/996.

## 2026-10-10 (noon) — 0.9.4: a row's height (not released)

- tests/table.test.js (45, +5): a row's height in pixels, capped, none at all; it stays with its row through rows put in and taken out (a merged cell across them too); drawn again, saved, copied and read from a file it is kept, and nothing else of a row's dress; the line pulled with the mouse (one step of history, the tip, the highest, all the way up takes it off); none in a locked note.
- tests/e2e/table-edges.mjs (137, +6): the line under a row's number pulled — 50 px higher, "22.2 mm" beside it, the row-resize pointer; saved and there when the note is opened again; a step back and forward; a row put in above and one taken out; words that need more make the row higher and it is pulled no lower than them; no higher than 800 px.
- Unit 993/993; table-edges 137/137, table 66/66, layout, v094.

## 2026-10-10 (late night) — 0.9.4: the "Acil Buglar" note (not released)

- tests/table.test.js (40, +4): a table drawn narrower where it would reach over the edge, the note and a copy keeping its own widths, wide again with room; a new table and a column more taking the room there is, never under 24 px, twenty-five columns of 24 drawn narrower still; a width read in millimetres; the size panel (squares, arrows, numbers, Enter, Escape, a second opening, a letter). The corner's click and the right-click lists follow the new behaviour.
- tests/e2e/table-edges.mjs (131, +14): the size panel from the bar (arrows and Enter, a click on a square, Escape and a letter); twelve columns added past the page's edge — no sideways scroll, all columns alike; the window made narrower and wide again — drawn narrower, the saved note without `data-w`, then as it was; a column's line pulled shows "26.5 mm", goes down to 24 px ("6.3 mm"), and stops at the page's edge; the corner's click and right-click; a table in a column with the window made narrower; the one menu on a line, in a cell, and with cells selected (Copy copies the cells).
- tests/e2e/table.mjs (66, +3): /table asks for the size first; the corner's click selects nothing; the right-click lists.
- tests/e2e/v093.mjs, v094.mjs: the spelling menu and the bare menu are the one menu.
- Unit 988/988; table-edges 131/131, table 66/66, v093 138/138, v094 87/87, layout 127/127, rich-paste 20/20, note-folders 60/60.

## 2026-10-10 (night) — 0.9.4: a new table is 5×5; the table trials (not released)

- tests/e2e/table-edges.mjs (117, new): what a hand does to a table that table.mjs does not, each followed by a look over every table of the note (`auditPage`). The bar's buttons with the caret in a cell and with cells selected (lists, to-do, toggle, indent, the outline menu, divider, code block, table, bold…, the four alignments); twenty things typed in a cell that mean something on a line ("# ", "- ", "[] ", "---", "```", "/", "@"…); Backspace, Delete, Ctrl+A (once, twice, three times), Shift+arrows, Home/End, three clicks; Tab, typing, Enter and Escape with cells selected; Backspace and Delete from the lines beside a table, Shift+↓ into it, a pull of the mouse into and out of it, Shift+click from outside, Ctrl+A and Delete and Ctrl+Z; a table copied with its lines and pasted in another note; cells pasted on a line; the three pastes of the right-click menu and the bar's Paste in a cell; a table from another page; merged cells with rows and columns put in and taken out through them, undone and redone; one table pulled onto another and onto itself, cells selected in two tables; a table in a toggle's body, alone in a note, in a column; a long word; 40 × 12 rows pasted and typing in them (20 letters well under 600 ms); a locked note; the saved note.
- First run on the build before the fixes: 30 of 106 failed (Log.md, 2026-10-10 01:20). After them: 117/117.
- tests/table.test.js (36, +8): a new table's size; 120 runs of 30 random changes with the grid checked after each; a copied table made plain; a table from elsewhere cleared; a file's widths and alignments; the alignment; Ctrl+A; Tab and the right-click with cells selected.
- tests/e2e/table.mjs (63, +2): /table gives 5×5; two columns and two rows selected by their numbers with Shift and deleted together.
- Unit 984/984; table-edges 117/117, table 63/63, rich-paste 20/20, layout 127/127, v093 138/138, v094 87/87.

## 2026-10-09 (late night) — 0.9.4: rows and columns put in between by a right-click (not released)

- tests/table.test.js (28): what a right-click offers on a cell, on a merged cell, on a row's and a column's number, and nothing on the corner or outside a table; a row put in above with the caret in the clicked cell's column; a column put in through a merged cell, which reaches over it; a row and a column deleted without a selection. The marks on the numbering and their checks are gone.
- tests/e2e/table.mjs (61, +4 net): a real right-click in a cell shows the six choices over the pastes; Insert column left and Insert row below, the caret in the new one, the note holding plain rows and cells; a right-click on y2 and on x2 shows that row's and that column's choices alone; Delete row and Delete column; Ctrl+Z; a locked note offers none.
- Unit 976/976; table 61/61, v093 138/138, v094 87/87.

## 2026-10-09 (night) — 0.9.4: a row or a column put in between two (not released)

- tests/table.test.js (28, +1): a row and a column put in between, the widths staying with their columns, a merged cell across the line reaching over the new one, past either end the first or the last; the marks drawn on the numbering; a click on one puts the row in and the caret into it.
- tests/e2e/table.mjs (57, +5): with the pointer on x2 a + stands on the line before it, over the numbering, and not on the others; a click puts a column in between and what is typed goes into its first cell; the + before y2 puts a row in; the note holds plain rows and cells; three Ctrl+Z take back the row, the word and the column.
- Unit 976/976; table 57/57, layout 127/127.

## 2026-10-09 (evening) — 0.9.4: tables (not released)

- tests/table.test.js (27, new): a new table's markup; the grid with merged cells, a block grown round them, a table cut short made whole; merge keeps what the cells held, unmerge gives the places back in the cell's colour; rows and columns added and deleted through merged cells, the widths with the columns; the fill's one direction, runs of numbers and of words ending in a number, a pattern repeated to a side and upwards; cells as rows of words, pasted rows growing the table; the numbering, grips and + drawn and not saved, drawn again the same; selected cells not saved as selected; a table from a file put right; migrate and heal leave a table alone; inserted after the caret's line or in place of an empty one; taken by its corner, a click beside it; the highlight on selected cells, the choices (merge, unmerge, + row, + column, delete table); Markdown and HTML.
- tests/e2e/table.mjs (52, new), in the real app: /table and the bar's button; x1…/y1… over and beside the cells; Tab, Shift+Tab, Enter, the arrows across cells and out of the table, Tab making a row; the saved note holds a plain table; Ctrl+Z in a cell and the table drawn again; cells selected by a pull, the caret waiting, Merge at the lower right and the square at the lower left; the highlight on cells, on one cell with a caret, off again, and on words; merge, the saved merged cell, unmerge, undo and redo; Delete on selected cells; the square pulled down (1, 2 → 3, 4) and to a side (a copy); a column pulled wider, not under 44 px, undone; the two +; a column and a row by their numbers and deleted; Ctrl+C as rows of words, rows pasted one cell each, plain words pasted; the corner selects all, Delete table, undo; moved by its corner with the mark; a click beside it; saved and drawn again after another note; a locked note.
- Found by the e2e and fixed: a click on the choices under a selection that reached the last row went to the line under the table (each block is a layer; the next is drawn over what reaches out of it); highlighting words in a cell cut the table (inline-family's block list had no td).
- One run of table.mjs failed three checks at the column pull and passed when run again: the pull is let go when the window loses focus, and the computer was in use. Not a fault of the app's as far as seen; noted in case it comes again.
- Unit 975/975; table 52/52, layout 127/127, v093 138/138, v094 87/87, note-folders 60/60, rich-paste 20/20, guide 8/8.

## 2026-10-09 (later) — 0.9.4: a click where there is no line to stand on (not released)

- tests/gap-caret.test.js (8, new): between two blocks that take no caret a line is made; with a line on one side the caret goes there; under the last block and over the first; beside a block, its upper half is over it and its lower half under it; pictures, dividers and lines are not answered for.
- tests/e2e/layout.mjs (127, +11): a click between a code block and the card under it makes a line there and what is typed stands in it, Ctrl+Z takes it away; under the last card of a note; clicked again, no second line; beside a card; in a gap with a line at its side the caret is near the click; the code is still clicked as it was; a locked note gets no line.
- Unit 948/948; layout 127/127, v093 138/138, v094 87/87, note-folders 60/60, rich-paste 20/20.

## 2026-10-09 — 0.9.4: the name is never declined; cards, videos and code blocks dragged like pictures (not released)

- tests/block-drag.test.js (11, new): what a press takes a block by — a card by its title line, a code block by its top line and not by its controls or its code, a video file by its picture above the strip of the player's controls (on a zoomed page too); where a gap puts it, a line to go on with at an end, nowhere where it stands already.
- tests/guide-i18n.test.js (+2): no word that starts with "Nebul" is anything but "Nebula", in the three guides, the translated What's new and every interface string; a guide under the Polish title that declined the name is still the guide and gets this one.
- tests/e2e/layout.mjs (116, +17): a code block held by its top line shows a flat mark and moves nothing until let go; Ctrl+Z; Esc; a pull from Copy takes nothing; a click on a card still opens its link, a pull opens nothing; a video by its picture into a column and by its title line out again, by its controls nowhere; an embedded page by its title line, still an embed; a locked note gives nothing.
- Not tested: the pointer in /video's dialog — the tests' keys do not hide it.
- Unit 940/940; layout 116/116, note-folders 60/60, v094 87/87, guide 8/8, rich-paste 20/20.

## 2026-10-08 (noon) — 0.9.4: what the person deletes is gone; only a loss nothing in the app made is asked about (not released)

- tests/note-media.test.js (47): a write through the app says what it took out and an undo takes that back; the list is kept, cleaned on reading, none for a vault never kept one, an empty one where it is there and cannot be read; however many the person took out they go at the next start from the folder and the backups, nothing held; a file nothing in the app took out stays in both and is named — even one — beside one the person did take out of the same note, asked again while unanswered, and the answer deletes that note's alone; a vault with no list sweeps as before.
- tests/e2e/note-folders.mjs (60): five pictures taken out of a note in the app are written down as the person's and wait for the next start; at that start all five are gone and nothing is asked; the question still comes for a note whose file lost its pictures behind the app's back.
- Unit 927/927; note-folders 60/60, black-holes 58/58, deleted 6/6, rich-paste 20/20, v094 87/87, guide 8/8.

## 2026-10-08 (later) — 0.9.4: lost pictures put back into the note (not released)

- tests/held-media.test.js (2, new): a picture is a picture in the text again (its address, its ratio, no wider than a pasted one), a video its player, a line to type on after them, every file named again; nothing that is no picture or video of a note, nothing of nothing.
- tests/e2e/note-folders.mjs (58): the question's row has Put back in the note, Delete, Open the note; Put back writes both pictures into the note at its end and shows it, nothing deleted; the warning stands in the question and is said when it is done; the next start asks nothing; lost again, Delete takes them out of the folder and the backup.
- tests/e2e/note-folders.mjs: `until` awaits its condition — given a promise it had answered "met" at once, and the checks of the question added the entry before passed without waiting. They pass now for what they say (58/58, twice).
- Unit 925/925; note-folders 58/58, guide 8/8.

## 2026-10-08 — 0.9.4: no note written without its pictures by a fault; a large loss asked about (not released)

- tests/editor-guard.test.js (6, new): the files a note names; an edit is saved as ever, a picture taken out by the person among it; a note that would be written without a picture it shows is not written, stays refused, answers false, and starts afresh when opened again; a repair that keeps every file is written back; a note that did not open whole is not written back and nothing typed in it is written; a sealed video is held to as well.
- tests/note-media.test.js (45): `looksLikeLoss` (more than three, or all of at least two; the one picture of a note is an edit); at a start such notes keep their files in the folder and the backup and are named, the others are swept, asked again while unanswered, the answer deletes one note's files and leaves the other waiting; the answer deletes only what was asked about.
- tests/e2e/note-folders.mjs (55): a note written without both its pictures — nothing deleted at the start, the question with its row and buttons; Open the note opens it and deletes nothing; asked again at the next start; Delete takes them out of the folder and the backup.
- tests/e2e/black-holes.mjs: the note-menu helper waits for the entry it presses.
- Unit 923/923; note-folders 55/55, black-holes 58/58, deleted 6/6, rich-paste 20/20, layout 99/99, v094 87/87, v093 138/138, open-with 12/12, guide 8/8.

## 2026-10-07 (last of the day) — 0.9.4: what a note no longer shows leaves the backups (not released)

- tests/note-media.test.js (42): a video taken out of a note leaves the vault at the next start and then three copies (daily, pre-update, a person's own), the picture the note still shows stays, the copies' own words untouched, no place of the app's holds the bytes; a file the note still names stays in the backups though the vault lost it; an unreadable note is not judged; a note gone from the vault, a file that is no picture or video, no vault, no backups.
- tests/black-holes.test.js (30): opening names the sealed video it swept; that name leaves two copies and the one a note still shows stays; no other file of a black hole can be asked out this way; nothing swept, nothing named.
- tests/e2e/note-folders.mjs (51): a backup made while the note showed the video holds it; after the video is taken out and the app started again it has left that backup, the note's pictures still there.
- Unit 914/914; note-folders 51/51, deleted 6/6, black-holes 58/58, guide 8/8.

## 2026-10-07 (late night) — 0.9.4: a black hole goes to the Trash (not released)

- tests/black-holes.test.js (30): into the Trash whole and locked (the day in hole.json, its sealed note untouched, nothing in the clear), not opened there by a right or a wrong PIN, nothing written into it, a second time changes nothing; restored as it was, hint and all, and opened again; an open passkey one is locked by going, and deleted for good from there.
- tests/e2e/black-holes.mjs (58): the menu ends in Move to trash; an open black hole with a note goes without a question, leaves its section and the window; hole.json has the day, the note still sealed in the vault and the backup; a note's menu no longer offers it; one row in the Trash (name, "Black hole · 1 note", Restore, Delete); restored locked and opened with the very file; Delete asks once more ("Delete for good?") and nothing is gone yet; then gone from the Trash, the list, the disk and the backup.
- Seen: the two runs started straight after the build failed ten checks from "moved in" on; three runs after that 58/58.
- Unit 913/913; black-holes 58/58, note-folders 50/50, deleted 6/6, guide 8/8.

## 2026-10-07 (night) — 0.9.4: one daily copy; a disk that cannot share a file (not released)

- tests/note-media.test.js (41): with no second name to give (the link refused), a daily copy takes the picture and the video over from the copy before it — the very file, moved, the vault's own untouched; copies what that copy lacks or holds in another size, and everything when there is no copy before; where the disk shares, nothing is taken.
- tests/e2e/note-folders.mjs (50): after the first start one dated copy, today's, and no `.making` in it.
- Unit 911/911; note-folders 50/50, deleted 6/6, black-holes 51/51, guide 8/8.

## 2026-10-07 (evening) — 0.9.4: backups kept the old way removed at the start (not released)

- tests/note-media.test.js (38): the daily copies and those before an update or a repair go, a copy the new way stays with its shared picture, a second pass does nothing; nobody's to remove — a person's label, the copy put aside for the move, a copy whose only flat file is no note id, an empty copy, no backups folder; a copy the app was closed over lies under `going-`, is no copy of any kind meanwhile and is finished at the next pass; a shared picture is let go of without touching the vault's.
- tests/e2e/note-folders.mjs (49): a daily copy and a pre-update copy written the old way are gone at the first start (nothing left on its way out); in their place today's copy the new way, the picture the vault's own file; a copy under a person's own name is left as it is.
- tests/e2e/deleted.mjs (6): its backups are now one kept the new way and one under a person's label — a copy of the app's own kept the old way would be gone at the start.
- Unit 908/908; note-folders 49/49, deleted 6/6, black-holes 51/51.

## 2026-10-07 (last) — 0.9.4: labelled backups, the newest of each kind (not released)

- tests/note-media.test.js (34): which labelled copies are not the newest of their kind (a repair's by version, 0.10.0 over 0.9.4; an update's by the time in its name; one of each kind stays; another kind of label is never pruned); the pruning itself on a folder, once, and on none.
- Unit 904/904; note-folders 46/46, deleted 6/6, black-holes 51/51, open-with 12/12, guide 8/8.

## 2026-10-07 (later) — 0.9.4: the owner's answers on the eleventh test build (not released)

- tests/black-holes.test.js (28): a hint — cleaned, kept in the clear, shown for a locked black hole, changed only while open, refused when it tells the PIN, dropped by a new PIN it would tell, none for a passkey.
- tests/note-media.test.js (33): a backup copies the notes' own files and shares pictures, videos and sealed videos (two names, one file; a note written again does not reach the backup); a video taken out of its note stays in the backups that had it; a note deleted for good leaves every place, and the last place overwrites the bytes; `missingMedia` and the copy put aside going only when nothing is missing.
- tests/v094.test.js: four dashes (three stay dashes; a list, a heading, a column).
- tests/e2e/black-holes.mjs (51): the hint's box and what it says; a hint that tells the PIN makes nothing; the hint under the PIN of a locked black hole and in hole.json; "Change hint" in the menu.
- tests/e2e/note-folders.mjs (46): the copy put aside for the move is gone once the move is whole; a backup asked for shares a picture with the vault (same file, two names) and copies the note's own file.
- tests/e2e/layout.mjs (99): three dashes, the fourth, undo, in a column.
- Unit 903/903; layout 99/99, note-folders 46/46 (three runs), black-holes 51/51, open-with 12/12, deleted 6/6, ai-sleep 16/16, v094 87/87, v093 138/138, rich-paste 20/20, guide 8/8.
- Not adapted and not run: smoke reads #archive-count and #trash-count, which are gone.

## 2026-10-07 — 0.9.4: the owner's notes on the tenth test build (not released)

- tests/black-holes.test.js (27): a PIN is six digits (four, five, seven refused); a black hole of the first build, with nothing written about its PIN's length, still opens with its four, refuses six, and is six from its next change.
- tests/note-media.test.js (29): the note's file in the note's folder (`noteFile`, `noteIds` — folders, flat files, a name with a space; null when the folder cannot be read); `moveNotesIn` (moved once; where both are there the one written last wins); `tidyVault` on a flat vault leaves nothing flat and never sweeps a note's own file; a vault kept the new way is not taken for an empty one by the backup purge; a note read out of its own folder brings the pictures and videos lying beside it; `travelWhole` (inside the file, beside it, out of a black hole, what is not there counted) and `stageTravelled`; every kind of video file, and not .ts.
- tests/file-video.test.js (11): every kind by its ending, the same list as the main process's; the player's bar drawn once and never saved; back, on, the speeds; a video that cannot be played says so, offers another program for a file of the note and not for a sealed one; the clock.
- tests/layout.test.js (45): as many columns as fit (`leastShare`, the loop that cuts until none can be cut); a divider moved with a least share of its own; a column ending with a picture or a divider given a line; a 22nd column taken into the 20th.
- tests/v094.test.js: five dashes — what counts as such a line; the fifth dash typed (a plain line, a list, a heading, a column).
- tests/editor.test.js: /paragraph and /video in the slash filter.
- tests/e2e/black-holes.mjs (48): six digits, the two boxes one under the other with their lines; "Passkey"; the row without a counter, the lock at its left; the section folded and unfolded.
- tests/e2e/layout.mjs (99): the least width from the line's own width; the owner's column with a picture (a line under it, typed in; a picture pulled clear of its top goes above the line over it); four dashes and the fifth, undo, in a column; a fifth column; /paragraph.
- tests/e2e/note-folders.mjs (45): no note file lies flat after a start, the vault says format 3; the player's bar and its buttons, nothing of it stored; an undo step keeps the same player; /video with a Matroska file (it plays) and with an AVI (tests/fixtures/clip.avi: "cannot be played here", "Open in another program"); exported as a Nebula note the videos lie in "<name> videos" beside the file, and imported again they are the new note's own.
- tests/e2e/ai-sleep.mjs (16), v093.mjs (138): tabs told they may sleep; a tab's menu offers "Let it sleep when unused" first.
- By hand: the passkey question asked for a window of its own — the system's dialog was the foreground window 250 ms later (a three-second probe, closed by itself). The test vault copied to a throwaway profile: five notes into five folders, the old black holes asking for four digits; the copy removed.
- The first e2e run after a build is slower and may fail on drags; run again before believing a failure. Foreground `sleep` is not run by the shell these commands go through.
- Unit 898/898; layout 99/99, note-folders 45/45, black-holes 48/48, open-with 12/12, deleted 6/6, ai-sleep 16/16, v094 87/87, v093 138/138, rich-paste 20/20, guide 8/8. Not adapted to notes in folders yet, and not run: smoke, old-notes, rebuild, dense, recovery, ideas-note, reported, canvas, editing-edges (they read `notes/<id>.json` from the disk).

## 2026-10-06 (after part 9) — 0.9.4: what was left undone (not released)

- tests/note-media.test.js (23): a note written for travel (pictures and videos in, a budget for videos, what is left out counted); videos staged from a note file into `incoming-…` and named by their address; the folder cleared at start.
- tests/layout.test.js (44, was 26): where the dividers of a block stand and places that cannot be right (`splitsOf`, `cleanSplits`); a column cut in two where the pointer is, the wider part keeping what it held; four at most and none too narrow; the divider dragged out of a column leaving a line; one upright divider moved between its neighbours; the two columns at its sides joined; three and four columns healed, a fifth taken in; saving, migration and healing leave them alone. Columns in Word, OpenDocument and Rich Text (grid widths, three cells, the rule, every cell and the document ending in a paragraph, well-formed XML, balanced braces) and flat for Evernote. A picture's side read and written by all three, its caption with it; a row on one line, each no wider than its share. A picture in a line of words: into the line before it, an empty line's place, the line after, a line of its own; moved to a caret; no side, row or neighbour; out again; a picture of its line in every format.
- tests/rich-paste.test.js: the bar's places now name "inword".
- tests/e2e/layout.mjs (89, was 59): a divider in a column pulled sideways — mark, tint, Esc, three columns, each divider at its place, the caret in the new one; a fourth from a divider of the note; one divider moved alone and stopped by its neighbour; one taken away; undo; saved and opened again. A picture into a line of words from its bar; dragged to a caret in another line (mark, Esc, let go); resized; Enter and typing on; out by "in the middle" and in again; Delete and undo; saved inside its paragraph and opened again.
- tests/e2e/note-folders.mjs (33): the window shows pictures from their files and the stored note names them; copy, crop, export and undo with the picture's file.
- By hand: the three documents opened in LibreOffice (converted to PDF, a throwaway profile, files deleted). Not in Word: its automation would not start here.
- Unit 884/884, layout 89/89, note-folders 33/33, black-holes 45/45, open-with 12/12, ai-sleep 16/16, v094 87/87, v093 138/138, rich-paste 20/20, guide 8/8, deleted 6/6. No full smoke, rebuild or old-notes yet.
- Seen once: layout (12 checks) and note-folders (4) failed in a run started straight after a build, and passed alone before and after. Not found; if it comes back, the first place to look is the second drag after an Esc in the columns checks.

## 2026-10-07 — 0.9.4, part 9: Open with Nebula; videos in black holes (not released)

- tests/open-file.test.js (11, new, node): the files among a command line's arguments (the installed app, a development run, switches, several, relative ones, kinds Nebula does not read); a file read for the window (text, bytes for Word, a vault note with its folder beside it, what is not there); what the installers are told (Windows: offered for each kind with the violet icon and nothing that writes a kind's default, the script ASCII; macOS: Alternate); the icon in every form.
- tests/e2e/open-with.mjs (12, new, in smoke): started with a .docx — a new note, open, named after the file, its words and bold, the other notes there, a .pdf making none, the file as it was, saved in the vault; a second copy started with an .rtf — the note arrives in the running app, the second copy goes away, the Rich Text as written; a second copy with no file; nothing opened twice at the next start.
- tests/black-holes.test.js (26): a video sealed in pieces beside its note (nothing readable, the source untouched); the parts a player asks for (start, across two pieces, end, all, past the end); locked or a swapped piece refused; out whole with its note, gone with its note; swept at the next opening unless a note could not be read; only a video under a video's name; out of the backups with its note.
- tests/file-video.test.js (7): the address of a sealed video; the videos a note names, plain and sealed.
- tests/e2e/black-holes.mjs (45): a video dropped on a note in a black hole sealed and played; nothing of it in the clear; there and playing after a lock; taken out with its note as a plain file (the same bytes) and played; moved in again sealed; gone with its note from the black hole and the backup.
- Unit 861/861, open-with 12/12, black-holes 45/45, note-folders 28/28, v094 87/87, layout 59/59, ai-sleep 16/16, v093 138/138, guide 8/8, deleted 6/6. No full smoke, rebuild or old-notes yet.

## 2026-10-06 — 0.9.4, part 8: black holes (not released)

- tests/black-holes.test.js (19, new, node, real temp folders; safeStorage and Hello played by the test): made with a name and four digits, a recovery key shown once, neither PIN nor key on the disk; a note sealed whole (no title, word or picture readable), back exactly with the right PIN, sealed afresh at every save, refused in another place, gone for good when deleted; wrong PINs counted, the waits after five and across a restart; the PIN changed; off this computer the PIN does not open it, the recovery key does with a new PIN; the PIN alone where the system keeps no key; Hello — made and opened only after a yes, no PIN, another computer, unavailable; the Hello script's answers; names; locking lets go of the key; backups purged of a note and of a black hole.
- tests/black-holes-store.test.js (13, new): hole notes not in the list, the search or the next note; made in, moved in and out, in no folder there; leaving the store at a lock; the mirror sealing instead of writing, sealing before deleting the plain file and keeping it when sealing fails, the other way round on the way out, not rewriting an opened black hole, deleting nothing at a lock, deleting from the black hole; a move cut short finished at the next open; a file in the notes folder a plain note; the words of a refusal.
- tests/e2e/black-holes.mjs (38, new, in smoke; NEBULA_HELLO=ok): the button beside New folder; the dialog (digits only, two PINs that differ); the recovery key once, Escape not putting it away; the folder on the disk with its key wrapped by PIN and system; a note written in it sealed and readable nowhere in the vault or the backups; a plain note with a picture moved in — gone in the clear from the vault, its folder and every backup, its picture nowhere as a picture; Lock (none of its notes on the page); a wrong PIN and the tries left; the fourth digit opening it; the notes read as written, the picture from inside the seal; locked after a restart, the same PIN; taken out again; a wrong recovery key, the right one with a new PIN, the old PIN no key; the menu; Windows Hello (no PIN fields, key the system's, opened by a yes); a note deleted from the Trash and a black hole deleted gone from the disk and the backup; locking itself when untouched.
- Unit 843/843, black-holes 38/38, note-folders 28/28, v094 87/87, layout 59/59, ai-sleep 16/16, v093 138/138, guide 8/8, deleted 6/6. No full smoke, rebuild or old-notes yet.

## 2026-10-06 — 0.9.4, part 7: a folder for each note (not released)

- tests/note-media.test.js (18, new, node, real temp folders): a picture out of the text as a file named by what it is, once, and back exactly as it was; a note without pictures, a tiny picture and a made-up id left alone; a missing file's name kept; a picture's file gone at the save that takes it out, a video's only at a start; an empty folder removed, a deleted note's folder whole, an unknown file left; a note naming another note's file given its own copy; a start writing old notes the new way once and sweeping videos nobody shows, an unreadable note keeping everything; a video copied in under its own name, only a video, only into a note; the address of a note's file and nothing outside the vault; mime and byte ranges; backups purged of a deleted note's folder.
- tests/file-video.test.js (7, new): a video file by its ending; shown only from a note's own folder; the card (player, name, ×); an address that is not a note's file never played; a line with its name in Markdown, the Word blocks, HTML and both video modes; untouched by the repair of old notes.
- tests/e2e/note-folders.mjs (28, new, in smoke): a vault written the old way at its first start (the picture a file byte for byte, the note's file small, a plain note untouched, the vault put aside first, schemaVersion 2); the picture shown as before; typing saved without the picture's file written again; a picture pasted, taken out (file gone), Ctrl+Z (file back); a video file dropped — after its line, under its name, its copy the same bytes, played and sought from the folder, the note's file naming it; taken out (file stays), Ctrl+Z (plays), taken out again; the next start (the video's file gone, the pictures there, nothing rewritten); a note deleted from the Trash and its folder gone from the vault and from every backup, the others whole.
- tests/e2e/deleted.mjs 6/6 with the folders in the purge.
- Unit 811/811, note-folders 28/28, v094 87/87, layout 59/59, ai-sleep 16/16, v093 138/138, guide 8/8. No full smoke, rebuild or old-notes yet.

## 2026-10-06 — 0.9.4, pictures again, part 6: sleeping AI tabs (not released)

- tests/ai-sleep.test.js (12, new): an address that says temporary or incognito; one that names a saved chat (uuid, long id) and ones that do not; what a reload could lose (a temporary chat, what was typed with no saved chat named, words after the last Enter, sound, loading) and what it cannot; twenty minutes, never the tab on screen or one kept awake; the stored minutes, 0 for never.
- tests/e2e/ai-sleep.mjs (16, new, in smoke): three local pages as tabs, the time four seconds — the unseen tab's page gone and its tab pale, the one on screen awake, one typed in awake with its words, a saved chat's address asleep, waking on the address it slept on, words after Enter keeping it awake, a temporary chat never asleep, the menu's Keep awake / Let it sleep / Put to sleep, the panel closed, the panel opened waking only the tab it shows, 0 minutes.
- tests/layout.test.js (26): each picture of a row knows how many share the line, counted again where the count is missing.
- tests/e2e/layout.mjs (59): a picture growing by as much as its corner is pulled, one in the middle to both sides, smaller the same way; a third picture beside two on one line, in a 700px window too; a pull past its share storing no more than is drawn, the next pull inward working from its first pixel; "beside" taking the third out and back.
- tests/e2e/v094.mjs (87): the served page has nothing but the version beside the languages. tests/e2e/v093.mjs: the tab menu with Keep awake.
- Unit 786/786, ai-sleep 16/16, layout 59/59, v094 87/87, v093 138/138, guide 8/8. No full smoke, rebuild or old-notes yet.

## 2026-10-05 — 0.9.4, part 5: pictures on their line, columns (not released)

- tests/layout.test.js (25, new): a picture's place (left by default, centre, right, only in the text), beside another before or after, leaving a row for a line under it, a row of one tidied; a split a whole share between 20 and 80, sticky at 50/33/67; the part a divider splits (to the divider above, below with the pointer lower, from the block under the pointer, the other side when its own is empty, stopping at columns); splitting (two columns, the divider upright, the wider side for what was there, the trailing empty line left under them, nothing to split), unsplitting back to the same markup; columns put right (well-made ones untouched, an emptied column, a lost column, words between the columns, a split out of range, nesting), untouched by the migration and safe for the vault heal, saved without the pick; Markdown and the Word blocks as one flow with a rule between.
- tests/e2e/layout.mjs (51, new, in smoke): the bar's place group and its lit button; middle and right by the buttons; the snap while dragging sideways; Ctrl+Z; the upright mark beside another picture with nothing moved while held; the row, the bar's "beside", the words under the taller picture; a 700px window (side by side, inside the page, smaller); swapped by a drop on the other side; out of the row by the button and by a drag to a gap (flat mark as wide as the page); Esc; a floated picture leaving no row. A divider pulled up (flat mark, moves, Ctrl+Z); pulled sideways (upright mark in the middle from the divider above, the tint, nothing changed, Esc); let go (two columns, the divider upright and as tall as the columns, the picture inside its column, the caret in the empty one); typing, Enter and a list from the slash menu staying in their column; Backspace at a column's start and Delete at its end; a picture pasted in a column, a picture dragged into the other column; a selection across both columns deleted leaving whole columns or none, Ctrl+Z; the upright divider dragged to 30 % and stopped at 20 %, picked by a click, Delete unsplitting left-then-right, Ctrl+Z; the stored note (data-split, hr.blk-vr, nothing armed); opened again; the split starting at the block under the pointer and the wider side keeping the words; the part under a divider.
- tests/rich-paste.test.js: the bar's ten buttons, the place group hidden for a floating picture, "beside" disabled with no picture before.
- tests/seed-guide.test.js: the three new phrases.
- Unit 773/773, layout 51/51, v094 86/86, v093 138/138, guide 8/8. No full smoke, rebuild or old-notes yet.

## 2026-10-05 — 0.9.4, a theme of one's own (not released)

- tests/theme-custom.test.js (15, new): a colour read however it is written; mixing, luminance and contrast as WCAG has them; the five picks, Matcha where one is missing; the tokens made from them, readable words on any accent, light ground from dark, words that cannot be read; profiles saved by name and again under the same name, a name needed and Matcha's refused, broken ones dropped, a profile known by its colours; four fixed themes; the picks worn as inline tokens over main or light and taken off by a fixed theme; a test build's "matcha" comes back as the custom theme.
- tests/e2e/v094.mjs (86): four themes and the palette button at their right; the editor over Archive and Trash in its order (name and Save, profiles, five slots, bar, 28 colours), opening it changing nothing; Matcha worn at a press (#1A2420, #F1F6EE, #A6E3A1, contrast over 10 and 4.5); a ready colour on Accent and a typed code on Background changing the app at once; a pale ground on the light theme and the hard-to-read warning; no save without a name or under Matcha's; a saved profile beside Matcha, each a press away; delete asks first; a fixed theme leaving no picked token on the page; "Last edited"; Archive and the editor putting each other away.
- tests/seed-guide.test.js: "Four themes", "Save this profile", Matcha. tests/e2e/smoke.mjs: four themes in the picker again.
- Unit 748/748, v094 86/86, v093 138/138, guide 8/8. No full smoke, rebuild or old-notes yet.

## 2026-10-05 — 0.9.4, labels again, fonts and Matcha (not released)

- tests/paste-clean.test.js (17): a chosen font and size stay in a copy from a note, the app's own go, a heading's size and inline code's look are not frozen; pasted lines in the note's writing font (blocks, a heading's face only, loose words only on an empty line, a font that came along wins inside, code left alone).
- tests/v094.test.js (20): a font name that cannot end a CSS value; the font menu's rows — the app's, the added, this computer's — narrowed by the search, and the name "Add" would add.
- tests/e2e/v094.mjs (73): #abc shortened and written out again is #ace, a space ends it; the label bar's "1 of 2", ↓ to the next place in view and round again, ✕; Matcha in the middle of the row, all five names fitting, deep green ink with readable contrast on text and buttons; a Nebula copy keeps Consolas and drops the frozen colour; outside words in a Consolas note are Consolas, bold and list kept; the font search; "+ Add a font" lists this computer's fonts and a picked one joins the list with its ×.
- tests/e2e/smoke.mjs: five themes in the picker.
- Unit 733/733, v094 73/73. No full smoke, rebuild or old-notes yet.

## 2026-10-04 — 0.9.4, the guide in four languages, privacy, AI session data, labels (not released)

- tests/guide-i18n.test.js (11): each translation has an entry for every block, the same kind of block with the same elements inside in the same order; the translated page keeps the code samples, dividers and stage, and its signature is on record; a translation a block short is not used; the guide's four titles; the vault's guide switches language and back without being dated, a guide somebody wrote in and a note that only shares the title stay; Help → Guide page once, in the app's language; What's new translated item for item, English when there is none.
- tests/v094.test.js (18): `#` and the start of a label open the list, "#1" and "C#" do not; labels that begin with the query first; a chip's label follows its word, a chip without its # is words; the chips of a picked label found whatever their case.
- tests/seed-guide.test.js, tests/e2e/guide.mjs: Your privacy is section 9, the last two are 10 and 11.
- tests/e2e/v094.mjs (60): the label list on `#`, narrowed, Tab picks, Enter makes the label as typed, an edited chip's label, the old word gone from Filter by label, the picked label painted and in view in a note opened from the list, a title's label ringed, the paint off with the filter; Deutsch turns the open guide German (title, page, shapes, locked, 16 code samples), Türkçe with another note open, a guide written in stays; an AI tab's Clear session data above Delete website, both ask, Cancel, a cookie really gone, the tab deleted once confirmed.
- tests/e2e/v093.mjs: the AI tab menu's items and the two-step delete.
- Unit 723/723, v094 60/60, v093 138/138, guide 8/8. No full smoke, rebuild or old-notes yet.

## 2026-10-04 — 0.9.4, part 2 of the Ideas note: toggles (not released)

- tests/v094.test.js (13): a heading that folds from the slash menu and from a heading line, "/h1" and "/toggle" still finding the plain ones first; a list item toggled in its list with its sub-list as the body; a toggle taken away without losing a word (in an item, and a heading); the list rules leaving a toggle's lines alone.
- tests/e2e/v094.mjs (41): with only a caret Ctrl + grows the line and not the list; one menu over selected words (its row, its items, Bold, Copy, the words still selected); "+ Add a note" above the notes of a full folder; a click before a title's first letter, the arrow still folding; Enter at a title's start = a line above, after an embed; Ctrl+B then typing in a Consolas note; the toggle button on a heading; "/toggle-h1" with its arrow at the line's middle; a numbered item toggled, written under, left by Enter to the next item, and un-toggled by Backspace — one list throughout.
- tests/v093.test.js, tests/editor.test.js: the list-item toggle and the "/head" filter updated to the new behaviour. tests/e2e/smoke.mjs: 19 rows in the Blocks sheet.
- Unit 705/705, v094 41/41, v093 138/138. No full smoke, rebuild or old-notes yet.

## 2026-10-04 — 0.9.4, part 1 of the Ideas note (not released)

- tests/v094.test.js (9): `-->` / `<--` to arrows and nothing else; English spelling as en-US and en-GB together, one language for the others; the ignored words leave the dictionary again; a theme ink frozen into words goes and a source's own colour, a chosen font and a shape's style stay; after a paste only what the paste made is undressed; the View zoom items carry no key.
- tests/heal.test.js: a new exhibit — the theme's ink frozen by a paste.
- tests/e2e/v094.mjs (23, in smoke): What's new inside the window and scrolling; the line beside the pad; arrows typed and undone; Ctrl + / Ctrl − on selected words; a real right-click offers the three pastes and each does what it says (only text, Nebula format with no frozen colour, original format with the source's font); the bar's Paste button; the page stays put after "Paste as"; "+ Add a note" in an empty folder; the note menu on a right-click, on the folded rail too, and its commands act on that note.
- Unit 701/701. No smoke, rebuild or old-notes yet (the owner tests the build first).

## 2026-10-04 — 0.9.3, twenty-eighth round

- tests/export-video.test.js (12): without = a bookmark card; offline = the bookmark; a bookmark in .docx/.odt/.rtf/.enex/.html as its boxed card.
- By hand: Word opens the bookmark box and both links in .docx, .odt and .rtf.

## 2026-10-02 — 0.9.3, twenty-seventh round

- tests/export-video.test.js (11): with/without remembered; with = the still, linked, card-wide, the player's address kept; without = the link; offline = the link; Word plays it (webVideoPr), ODT and RTF link it; HTML keeps the player; videoOf and fetchVideoPoster (the grey stand-in skipped); .enex out and back with MD5 pictures and to-dos; .rtf; the documents' preview page.
- tests/e2e/v093.mjs (138): .docx/.odt/.doc/.rtf through the preview (title, paper, the PDF shown) and .enex; each imported back; the menu's video choice; with = player in HTML and the playable still in Word; without = the link only; the preview offers the choice only when the note has a video.
- By hand: Word opens the files (the video as Word's online video); real YouTube and Vimeo stills.
- Unit 690/690, full smoke 519/519.

## 2026-10-02 — 0.9.3, twenty-sixth round

- tests/office.test.js (7): the note as blocks (shapes left out); picture sizes from PNG bytes; .docx on A4, landscape for NW, and back through mammoth; .odt with mimetype first and back; .doc as Rich Text and back; .doc kinds told apart.
- tests/e2e/v093.mjs (133): the order button faded on NW, pressed and the chip shown while on, the chip turns it off; export as .docx, .odt, .doc and import each back with its bold, list and picture.
- By hand: LibreOffice and Word open the three files.
- Unit 679/679, full smoke 514/514.

## 2026-10-02 — 0.9.3, twenty-fifth round

- tests/page-order.test.js (4): the line a box straddles; placed under it, a too-tall one left; nothing on NW; autoOrder a setting.
- tests/e2e/v093.mjs (129): the button off on NW; the first line leaves the title's room; pressed, a shape across the line goes under it; turned on in the ⋯ menu, it happens on letting go.
- Unit 672/672, full smoke 510/510. By hand: A4/NN/A5 screen lines against the PDF's page starts (pypdf) — exact for pages 2-3, a line off later on NN/A5.

## 2026-10-02 — 0.9.3, twenty-fourth round

- tests/page-mode.test.js: NW fluid (no data-paper), NW/NN at the screen's size, NW's sheet turned by the orientation, the preview's paper line, the remembered orientation.
- tests/page-zoom.test.js: 100 % is 1 on NW/NN. tests/export.test.js: the PDF document keeps shapes; HTML does not.
- tests/e2e/v093.mjs (125): NW as it always was; NN at 100 %; the preview on NN (paper line, the PDF in a plugin webview, file removed on Cancel); NW landscape/portrait re-rendered, remembered, printed that way.
- smoke: the PDF export goes through the preview's Export. Unit 668/668, full smoke 506/506.

## 2026-10-02 — 0.9.3, twenty-third round

- tests/e2e/v093.mjs (119): "Fit (n%)" first in the box and its number matching the zoom; B4 at 100 % scrolls only when the sheet itself is wider; in Only view the zoom stays bright and pressable while the rest is dimmed.
- Unit 666/666, full smoke 500/500.

## 2026-10-01 — 0.9.3, twenty-second round

- tests/editor.test.js: parseSize goes down to 5. smoke: the size menu starts at 5.
- Unit 666/666, full smoke 497/497 (the first run after the 10px run was stopped had 5 timing failures, v093 alone then passed 116/116 twice).

## 2026-10-01 — 0.9.3, twenty-first round

- tests/e2e/v093.mjs (116): 100 % equals the main process's real scale (the startup race gave 1); the canvas is the A4 sheet, from its left edge.
- smoke: shape outline weights measured unzoomed.
- Unit 666/666, full smoke 497/497.

## 2026-10-01 — 0.9.3, twentieth round

- tests/page-zoom.test.js: 100 % is real size (1.644), 50 % half of it, 'actual' reads as 100, the window's zoom taken out; fit to page (fitFor) and stepping past it; setZoom 'fit'.
- tests/page-mode.test.js: NW, A3, B4, B3 open fitted; sheetPx.
- tests/e2e/v093.mjs (114): lines measured over the page's zoom; NW opens fitted with no sideways scroll; fit follows a narrower window; A5 at 100 % with "Fit to page" first; real size keeps the paper's edges; embed resize over the zoom.
- rich-paste, view-snap, v090 checks zoom-aware; smoke compares outline weights at 100 %.
- Unit 666/666, full smoke 495/495 (guide included).

## 2026-10-01 — 0.9.3, nineteenth round

- tests/page-mode.test.js: NN 746 px line, 1075 px pages, opens at actual size; NN's margin in the export document, an injected margin refused.
- tests/e2e/v093.mjs (111): actual size shown as a bare percentage with the tooltip; B3 at 200 % keeps its 1238 px line and the frame scrolls sideways; NN's 746 px line.
- Unit 665/665, guide 8/8, full smoke 492/492.

## 2026-10-01 — 0.9.3, eighteenth round

- tests/page-mode.test.js: NW 1027 px on A4 landscape, NN on A4 portrait; page heights (NW 698, A4 and NN 1027, A5 698); which papers open at real size; NW's title; the editor gets --page-col and --page-break.
- tests/page-zoom.test.js (5): realScaleFor — the owner's 31 cm 1920 px screen 1.639, scaling cancelling out, the monitor shaped like the screen, implausible answers 1; actual size as a zoom of its own, − / + past it; setZoom 'actual' and null.
- tests/e2e/v093.mjs (109): NW's line and page height, its meaning on a press; A5 opens at actual size with the percentage in the box; choosing the page's default zoom stores none; A4 at 100 % exactly 698 px (scroll bar accounted).
- Unit 665/665, guide 8/8, full smoke 490/490 (the PDF margin check now expects NW's A4 landscape: 1027x698 writing area).

## 2026-10-01 — 0.9.3, seventeenth round

- tests/page-zoom.test.js (new, 3): the steps (50–200 %, nearest, − and + at the ends); the editor's zoom and editorZoom read from inside it; setZoom keeps the date, 100 % stores nothing.
- tests/e2e/v093.mjs (106): at 150 % a dragged shape moves exactly as far as the pointer; the zoom on the page and in the box; − steps down; 100 % leaves no zoom.
- Probe (local): shape move, picture move and picture corner at 150 % measured 1.5× before the fix, 1:1 after; caret clicks right either way.
- Unit 663/663, guide 8/8, full smoke 487/487.

## 2026-10-01 — 0.9.3, sixteenth round

- tests/page-mode.test.js (new, 5): the eight boxes in order; each paper's printed line in px (A4 698, A5 463, A3 1027, B4 849, B5 569, B3 1238), NN 760, NW none; the print sheet per mode, A4 for Nebula's own, and an injected size refused; the column and print sheet applied to the editor; setPage keeps the date, NW stores nothing.
- tests/e2e/v093.mjs (102): A5 and A4 lines measured in the real app; the page kept on the note without dating it; the print sheet follows; NW gives the whole width back.
- Probe (local): the opening traced from inside main — hidden and screen-wide until shown, first layout at 1920.
- Unit 660/660, guide 8/8, full smoke 483/483.

## 2026-10-01 — 0.9.3, fifteenth round

- tests/editor.test.js: the shipped line-up is Claude, Gemini, ChatGPT, Mistral, MathGPT, Copilot. tests/e2e/v093.mjs (98): MathGPT after Mistral, no Perplexity, no DeepSeek. Guide signature recorded (seventh test build kept).
- Unit 655/655 in one run. v093 98/98.

## 2026-10-01 — 0.9.3, fourteenth round

- tests/ai-browser-auth.test.js (22): the order — a service's tab starts as Chromium, Gemini as Firefox, a remembered way first; the refusal sequence Chromium → Firefox → ESR → explanation page; each refusal moves the site on in memory; openSignIn carries firefoxFirst.
- Unit: 655 pass (41 files with two workers, heal.test.js alone after an out-of-memory crash of the machine, not of a test). v093 e2e 98/98.

## 2026-09-30 — 0.9.3, thirteenth round

- tests/check-browsers.test.js (5): a newer Electron stops the release with the upgrade commands and the tests; compareVersions.
- tests/ai-browser-auth.test.js (21): redactUrl keeps host, path and parameter names, never a value.
- Bug check after Electron 44.5.1: unit 654/654, full smoke 479/479 (see Log.md for the one timed-out relaunch and its reruns).

## 2026-09-30 — 0.9.3, twelfth round (Electron 44)

- Full smoke on Electron 44.5.0: 479/479. Fixed on the way: Help → Blocks expects 16 (the toggle list), the save-dialog stub keeps the file name only (the app now hands the last folder too).
- tests/e2e/v093.mjs 98/98 on 44: Backspace on the empty line under a divider brings the picture up and picks the divider, the next Backspace takes the divider and keeps the picture; passkeys refused in an AI tab (WebAuth off per webview), a picture copied is on the clipboard (read back as a ClipboardItem), a click in the AI page closes the tab menu (window blur).
- e2e clipboard helpers moved to ClipboardItem: dense.mjs, rebuild-findings.mjs, rebuild-page.mjs, v093.mjs, view-snap.mjs.
- Unit 652/652. `npm run check:browsers`: Firefox 157, ESR 140, Chromium 152 vs 154 — all ok.

## 2026-09-30 — 0.9.3, eleventh round

- tests/ai-browser-auth.test.js (20): refused → the next browser (today's Firefox, the ESR, Chromium as it is) from the start; all refused → the explanation page in the app's language, no more rounds; what worked is remembered per site and tried first.
- tests/check-browsers.test.js (new, 4): today's Firefox (or the one before) passes; one behind stops with the line to change; an ESR that is no longer one stops; Electron's Chromium far behind is a warning.
- Real app (probe): MathGPT's window opens on Google's address page as Firefox 157. `npm run check:browsers`: Firefox 157 ok, ESR 140 ok, Chromium 130 vs 154 warned.
- Unit 652/652, v093 e2e 97/97. Not run (owner's rule): the full smoke, rebuild and old-notes.

## 2026-09-30 — 0.9.3, tenth round

- tests/editor.test.js: currentFirefox (157 on 30 September 2026, 158 four weeks on, never older) and the user agent built from it.
- tests/e2e/v093.mjs (97): a real click in the AI page closes the tab menu.
- Probe (local): the host document sees only `focus` (target WEBVIEW) when the page is clicked; reload and + render as the same round button.
- Unit 647/647. Not run (owner's rule): the full smoke, rebuild and old-notes.

## 2026-09-30 — 0.9.3, ninth round

- tests/ai-browser-auth.test.js: no window spam — a window closed by hand is not reopened by the page until the tab gets input; an idle tab opens two a minute at most; input opens one at once.
- Probe (local): a click in an AI tab reaches the tab's `input-event` (mouseDown); Mistral's Google window still opens on Google's address page.
- Unit 646/646, v093 e2e 96/96. Not run (owner's rule): the full smoke, rebuild and old-notes.

## 2026-09-29 — 0.9.3, eighth round

- tests/ai-browser-auth.test.js (19): the hand-back redirect is stopped in the window and the tab alone takes the address; a page the window arrived at is not loaded again in the tab — the window finishes, closes after a quiet moment, and the tab reloads.
- tests/v093.test.js: the page script acts on Google hosts only (accounts.google.co.uk, youtube yes; chat.deepseek.com, google.com.evil.test, notgoogle.com, copilot no).
- tests/editor.test.js: mergeServices (renamed, re-addressed, hidden, + sites after) and siteUrl.
- tests/e2e/v093.mjs (96): Esc on the picture under the divider leaves the caret on a line; a long <pre> line wraps; a tab's right-click menu, Change header, Delete website, Restore removed sites; the passkey probe now expects no stand-in in a service's tab.
- rich-paste 20/20, editing-edges 8/8, reported 16/16, guide 8/8.
- Not run (owner's rule): the full smoke, rebuild and old-notes.

## 2026-09-29 — 0.9.3, seventh round

- tests/folders.test.js (16): orderFor (between, top, bottom, alone, numbered afresh); setPlace keeps the date and the pin; a new note still comes in on top; ownRun — dragging never pins or unpins; setOrders one save; a folder stands among the notes by creation or its dragged place, order kept in folders.json.
- tests/e2e/v093.mjs (89): ↓ and → from the heading go past the divider to the picture, never beside the divider; a note dropped among pinned ones is not pinned, a pinned one dropped among the others stays pinned; a folder dragged below a note; MathGPT after Mistral, no Perplexity; reload and + right of the strip.
- rich-paste.mjs 20/20, editing-edges 8/8, reported 16/16, guide 8/8 after the picture/divider changes.
- Probes (local): caret steps on a copy of the Ideas note (found the caret between heading and divider); Mistral's Google window in the real app reaches Google's address page; DeepSeek sign-in with and without the app's settings (Turnstile, no challenge shown).
- Not run (owner's rule): the full smoke, rebuild and old-notes.

## 2026-09-29 — 0.9.3, sixth round

- tests/ai-browser-auth.test.js (+4, 17): one header listener per session covering all of Google, Firefox only for account pages or a Firefox-throughout contents; a sign-in window sharing the Mistral tab's session is Firefox to gstatic while the tab is not, and Gemini's session is Firefox even for a request with no tab; an OAuth "Sign in with Google" request is kept whole (also when carried in a refusal's continue); the window loads within the limit when the debugger never answers, straight to Google with no empty page first; the refusal is caught inside the page too.
- tests/folders.test.js (new, 14): sortKey; a note dropped between two stands there and keeps its date, to the top and the bottom; a new note still comes in at the top; the pinned ones ordered among themselves, pinned by a drop among them, unpinned out of them; numbered afresh when there is no room; into a folder and out; a deleted folder gives its notes back, archived ones too; folder names cleaned, folders.json read defensively; make/rename/remove, new ones open; open folders remembered; listGroups (pinned, folders, rest, a lost folder's notes in the list); group keys; dropGapBreaks.
- tests/heal.test.js: museum exhibit "a loose <br> between a divider and a picture" (fails without the step — checked).
- tests/migrate.test.js: migrateNote counts `gaps`.
- tests/e2e/v093.mjs (82): the Ideas note's `<hr><br><figure>` opens with nothing between; deleting the picture under a divider selects the next one with the caret hidden; New folder, a note dragged onto a folder, a note dragged above another, a click closes and opens a folder, folders.json and note.folder on disk, Delete folder keeps the notes. Drags use notes on screen: Playwright's drag is cut short when it has to scroll the list on the way.
- Probes (test-results/probe/, local only): the real Mistral sign-in in Electron with the app's ai-browser-auth.js (blank window reproduced; after the fix Google shows the Mistral sign-in and answers "Couldn't find this account" to a made-up address instead of refusing the browser); the script registration order (loading about:blank first makes the script miss the next page); the divider gap in the real app; folders end to end with screenshots in Main and White.
- tests/e2e/guide.mjs: 8/8 with the new section.
- Not run (owner's rule): the full smoke, rebuild and old-notes.

## 2026-09-29 — 0.9.3, fifth round

- tests/ai-browser-auth.test.js (+3, 14): the window starts afresh with only the destination; refused, it retries by itself at most twice; the tab landing on the refusal (not on the silent check) opens the window; freshSignInUrl never takes a non-https continue.

## 2026-09-29 — 0.9.3, fourth round

- tests/v093.test.js: taking a label off a title leaves the text; deleteLabel takes a label off every note's title and text and nothing else; the passkey script leaves a PublicKeyCredential that says no; where the page is told Firefox, userAgentData and window.chrome are hidden (and not in a Chrome page); Google gets no sec-ch-ua headers; chips come out of the repair as plain text.
- tests/heal.test.js: the chip exhibit now also removes a chip's contenteditable.
- tests/e2e/v093.mjs (73): ⋯ -> Delete label with its confirmation, from title and text; ArrowDown through lines of #chips keeps them; Backspace on the empty line under a divider selects the picture; the AI tab's passkey check now expects a present, empty API.

## 2026-09-29 — 0.9.3, third round

- tests/ai-browser-auth.test.js (+4): the silent check stays in the tab and nothing is stopped without a window to open; a sign-in the person started (a navigation, or a redirect from a service) goes to its own window, frames and other sites do not; which pages are Google's accounts steps; the window closes and sends the tab on when Google hands back, and a window closed by hand reloads the tab; what counts as an interactive sign-in.
- tests/v093.test.js (+3): setLabels names the labels taken off; removeTagChips takes a label's chips and one space out; the one-set search matches either kind.
- tests/e2e/v093.mjs (69): one label set in the search; taking a label off the title removes its #chip and undo brings it back; Delete on an empty line between a divider and a picture; Alt+Up and Enter on a selected picture; eight embed handles, the left side widens, a freshly pasted embed has them.

## 2026-09-29 — 0.9.3, second round

- tests/v093.test.js (+7): text labels read from the markup; the label catalogue keeps note and text labels apart and filters by either; nested tag chips taken apart without losing a word, then idempotent; a divider inside a toggle stays in its body; Backspace after a <br> at the start of an item keeps the item; crop maps the frame onto the picture's pixels; spelling in the chosen language only.
- tests/heal.test.js: museum exhibit "a #tag chip was editable, so the tags below went inside it".
- tests/rich-paste.test.js: the picture bar has ✂.
- tests/e2e/v093.mjs (62 checks): the four languages always open right of the version and fitting; German spelling set; #word not added to the note's labels, the next line's tag not inside the one above; the label filter closed until pressed, two groups, each kind filters, the × clears; the owner's three editing bugs on the structures of the note; /todo, /code, /divider and the to-do button inside a toggle; an empty nested item comes back out on Enter inside a toggle; crop to half the width and undo; an embed resized by its corner.
- Probed by hand on a COPY of the owner's Ideas note in a throwaway profile (test-results/probe-ideas.mjs, probe-caption.mjs, probe-toggle.mjs; local only).
- Not run (owner's rule): the full smoke, rebuild and old-notes.

## 2026-09-29 — 0.9.3 (owner's "Ideas & Bugs" note)

- tests/v093.test.js (new, 24): Tab nests a list item and Shift+Tab lifts it, the first item stays, a paragraph is left to the block indent, a list in a toggle stays there; @ and #word detection (C#, #1, "# " left alone) and note matching; the four languages (all strings have three translations, patterns fill values, the note, title and note names are never translated, back to English restores); spelling languages; the passkey refusal script; the note's writing font kept without dating the note; hasExplicitFont; a save serialises and writes only the changed note and drops the stale localStorage copy, and the browser preview still writes localStorage; dropWrapperIndents; makeToggle from a line and from a list item.
- tests/heal.test.js: museum exhibit "Tab indented the wrapper round a heading and its list".
- tests/migrate.test.js: MARKUP_VERSION is 0.9.3.
- tests/seed-guide.test.js: guide signature 0.9.3.
- tests/e2e/v093.mjs (new, 44 checks, in smoke): language picker (German/Turkish interface, closed picker above the version, the note unchanged, menus drawn later translated, back to English); Tab/Shift+Tab in a list; a click picks a divider, Backspace removes it, one undo brings it back, never saved armed; Backspace/Delete next to a picture in the text select it first; double-click opens a caption; Ctrl+C puts the picture on the clipboard; the right-click menu for a misspelt word and for a picture; toggle list (toolbar, Enter in/out, arrow folds, a list inside stays); @ mention (list, Enter, click opens the note); #word label chip and the note's label; label chips filter the list; the writing font on a new line, other lines unchanged, one undo, kept with the note; an AI tab is not offered passkeys; WebRTC has no UDP host candidates; an autosave beside a 5 MB note takes no long task and does not rewrite the big note.
- tests/e2e/dense.mjs: the long-note trials include /toggle on a new line (passed 2/2 on the guide).
- Real spellcheck checked by hand in the built app: "sentense" -> right-click offers "sentence", it replaces the word, Ctrl+Z restores it.
- Not run (owner's rule: no long runs before "push"): the full smoke, rebuild and old-notes.

## 2026-09-28 — 0.9.2

- tests/ai-browser-auth.test.js (rewritten, 7): a Google redirect is never stopped; the tab is Firefox once a Google page has arrived and its own identity again after; no switch in the middle of a navigation (it restarted the navigation and looped); a Firefox request header once per session; "Continue with Google" popups are windows of the app, anything that is not a web page is refused; popups get the same treatment.
- tests/e2e/v090.mjs: the redirect check now proves the opposite of 0.9.0 — the sign-in stays in the tab as Firefox and no browser is opened (22/22).
- tests/paste-clean.test.js (new, 9): pasted HTML loses the page's font, size and colour and keeps bold, italic, underline, strike, lists, headings, quotes and web links; layout boxes become paragraphs; a copy from a note keeps Nebula's classes and loses Chromium's fixed ink, scrollbar colour and font; shapes keep their fill.
- tests/lists.test.js: leaving a list with Enter on an empty item in a font keeps that font; an ordinary empty item still makes a plain line.
- tests/e2e/view-snap.mjs: the ⋯ menu offers Edit mode on a locked note (no checkbox).
- tests/e2e/dense.mjs: a place for the trials needs a plain run of words (the owner's Bug Finding note opens with a line all in bold).

## 2026-09-27 — 0.9.1: old notes heal too

The owner's complaint: a bug fixed in the app kept living inside the notes it had already touched, on every computer, while a new note was clean. The first measurement ran the long-note trials (tests/e2e/dense.mjs) on COPIES of the owner's own notes with 0.9.0: the guide and "Bug search" passed every trial, the installed Ideas note 0 of 19, an older copy of it 0 of 19, a newer one 3 of 19, a second note 9 of 19. None of the notes the trials had ever run on (the guide, the rebuilt articles) could have shown this: this version wrote them.

- tests/note-markup.test.js (new, 8): the save, undo steps, export and print leave out every kind of on-screen state (a selected picture or shape, a shape being typed in, an armed divider, a picked-up arrow and its target, the rotation readout, a shape's text left editable, the pending-format caret); `<hr class="armed">` is saved as `<hr>`, not `<hr class="">`; the screen itself is not touched.
- tests/heal.test.js (new, 18): the residue museum. Ten exhibits of markup older versions wrote (a picture saved selected, an armed divider, the 0.8.3 angle readout, shape text saved editable, a shape without a turning grip, an empty canvas left after the last shape went, pictures on their own layer, a span wrapping paragraphs, a divider inside a list item). Each comes out as this version writes it, safely, and a second pass finds nothing to do. The guard tells a changed word, picture or shape text from a change of markup, and compares code and equations by their source. healVault repairs every note once per MARKUP_VERSION after a backup, dates none of them, writes nothing without a working backup, never overwrites a note typed in meanwhile, leaves an unsafe repair undone and reports it, and leaves the open note to the editor.
- tests/migrate.test.js: rebuildShapeChrome replaces an outline an older version drew wrongly, gives old shapes both grips once in makeShape's order, and changes nothing on a shape this version made; migrateNote cleans on-screen state saved by older versions; an empty canvas goes on open.
- tests/history.test.js: absorb keeps the redo steps (a page title arriving after an undo no longer kills redo), is not a step, and closes a pending edit as its own step first.
- tests/save-indicator.test.js: the save never writes on-screen state; adopt() makes the repaired note the baseline, so looking at a note and moving on is not an edit.
- tests/notes.test.js: store.heal keeps the date and the order.
- tests/link-preview.test.js (10): the editor decides how a title goes in (onTitle(write)); an embed is not named after an error page (HTTP 503 "Service unavailable", found in the owner's Ideas note), and is named on a later successful load.
- tests/blocks.test.js: Enter then Backspace in text set in a font makes the two halves one span again, with the picker's font name, and the no-break space Enter made a plain space again; spans that format differently stay apart; the same after deleting an underlined word typed inside such text.
- tests/blocks.test.js: a heading or list made by "/" on a line in a font gets the <br> inside the font it kept — the line was an empty span once the command was taken out, it had no line box, and the words went into the paragraph under it ("Heading 3 sometimes does nothing", the owner's Ideas note); a line with words is left alone.
- tests/arrows.test.js: pruneAnchors keeps an anchor an arrow uses and drops the rest and Enter's copies (first copy wins, as arrows resolved it); dropCopiedAnchor after Enter. The museum has this as its tenth exhibit.
- tests/seed-guide.test.js: the guide now covers old-note repair and shows `Pictures\Nebula` (it showed "PicturesNebula" since 0.8.9: the backslash was eaten by the JS string).
- tests/blocks.test.js: Backspace joins the whole block — a list item of three lines split with Enter and joined again is one item of three lines, its words back in their font span with a plain space, the caret where the lines met; a block Chromium joined whole is left alone.
- The old note, validated both ways: on a 0.9.0 build (a git worktree) it fails 9 trials, one for every bug class found in the owner's notes; on 0.9.1 it passes 19/19.
- tests/e2e/old-note.mjs (new, in smoke): a hand-written note with the structures that broke the trials in the owner's notes — words inside the font picker's spans, list lines joined by <br>, a paragraph ending in a no-break space above a picture that stands alone and a list, stale anchors, an empty canvas, a picture saved selected. Its words are made up.
- tests/e2e/dense.mjs: a span that only sets a font, size or colour counts as plain text for the click (the owner's notes could not be tried at all without it); "the end of the line" is after a no-break space, as a click lands; a note is left to settle after it opens; a link card's title is metadata that may arrive at any time.
- tests/backup-purge.test.js (new, 5): a note deleted from the vault leaves every backup (daily, pre-update, pre-heal) and nothing else does; only a note id is accepted, never a path; the one-time purge of notes deleted before 0.9.1 keeps notes in the Trash and refuses when the vault is empty or unreadable. The owner: "a note I deleted must not be recoverable — that is a security hole"; Nebula Test's backups held 28 deleted notes.
- tests/e2e/deleted.mjs (new, in smoke, 6): in the real app, the first start takes a note deleted before 0.9.1 out of a daily and a pre-update backup and records that it did; a note in the Trash stays in the backups; deleted from the Trash, it is gone from the vault and every backup while the kept note is untouched. 6/6 on the first run.
- tests/e2e/profiles.mjs (new): smoke and the long-note trials first remove the temp profiles killed runs left behind (older than three hours): 158 had piled up, two with copies of the owner's notes.
- tests/e2e/old-notes.mjs (new, npm run old-notes): the trials on copies of this machine's vaults; nothing is written back and every file is hash-checked afterwards.

## 2026-09-27 — upcoming 0.9.0 validation

- 506 unit tests pass across 35 files. New coverage: shape-outline intersections, four-corner image geometry, labels and native export/import, bounded title fetch, preview load events, and Google browser routing.
- tests/e2e/v090.mjs covers locked buried shapes, text fitting, selected Backspace, caption editing, shape undo typing, label menus, four real mouse drags, metadata IPC and a real HTTP Google redirect (OS launch recorded). Optional NEBULA_V090_NOTES copies local reports and checks their source bytes remain unchanged; never commit private fixtures.
- tests/link-preview.test.js (8): an embed's title counts only after the page has loaded (a YouTube player first reports just "YouTube"), a title already in the note is never replaced for an embed or a bookmark, and a placeholder address is, also one an older version wrote in another format (scheme, www., trailing slash). Found by the long-note trials in both rebuilt articles, where the replaced title was an edit nobody made and broke undo/redo in the trials.
- Focused Electron run: 22/22, including real metadata IPC, triangle arrow attachment after reload/growth, and stable editor scroll. Earlier full smoke: 349/350; the sidebar geometry failure was a CSS transition stuck at time zero in an occluded Windows window. Both collapse/expand checks now finish the real transition and assert the resulting width. Full Electron smoke passed: 354/354 checks.
- Sidebar text extraction benchmark on a local image-heavy report: median 139.26 ms to 14.76 ms, 12 uncached runs, same text. This is a jsdom microbenchmark, not whole-app typing latency.

# Tests

What is tested, what each test proves, and what is knowingly untested.

| | |
|---|---|
| **Unit** | 476 passing — `npm test` (Vitest, jsdom) |
| **Electron smoke** | 332 passing — `npm run build && npm run smoke` (playwright-core, real app, throwaway profiles) |
| **Failing** | 0 |
| **CI** | `.github/workflows/test.yml` on push/PR · smoke + packaging assertions in `release.yml` |

Unit tests cover pure logic. The smoke test covers what jsdom structurally
cannot see: the preload bridge, the main process, the filesystem, and boot.

| **Page rebuild** | `npm run rebuild` — local only; a real article rewritten in the app and scored; run by `npm run push` after smoke when present |

---

## Suites

### Page rebuild — `npm run rebuild` (new in 0.8.5, local only)

Its files (`tests/rebuild/`, `tests/rebuild.test.js`, `tests/e2e/rebuild-page.mjs`) are gitignored and live on the owner's machine: they name and rewrite a real article, which is not ours to publish. `npm run push` skips the step in a clone that does not have them.

A different kind of test: not "does this handler work" but "can Nebula write this page". `tests/rebuild/pages.json` lists the pages (kept locally). For each, `tests/e2e/rebuild-page.mjs` fetches the source (cached in `test-results/rebuild/cache/`; `--refresh` fetches again), reads it into a plan (`tests/rebuild/plan.js`), and writes it into a new note with the app's own tools — typing, Ctrl+B/I, the slash menu, a pasted and dragged image per figure, a pasted URL chosen as Embed per video. The saved file is scored by `tests/rebuild/score.js`; layout, image order and working video players are measured in the running app. Each metric is compared with the previous version's report and any drop fails `npm run push`. A feature Nebula has no tool for can be listed in `KNOWN_GAPS` (score.js) so it reads as a gap, not a failure; the list is empty since 0.8.5.

| Version | Score | What moved |
|---|---|---|
| 0.8.4 | 65.2% | Enter could not leave a quote, so the rest of the note was quoted; italic came back after Enter; videos embedded the watch page |
| 0.8.6 | 100% | Measured at 1280, 1920 and 960 px wide, with blank-line runs counted: pasted images now sit in the text. A second article added |
| 0.8.5 | 100% | All of the above fixed; links on words (44/44) and image captions (6/6) built; /divider no longer nests in an empty line |

Reports, screens and the rebuilt note stay in `test-results/` (gitignored): they hold the article. The rebuilt note is also written into Nebula Test's vault (`Nebula-data`, gitignored) as `rebuild-<page>`, replaced on every run, so Nebula Test always shows the page as the current version wrote it (`--no-vault` skips this).

### `tests/e2e/dense.mjs` — the simple checks inside long notes (in smoke for the guide, in the page rebuild for the articles; new in 0.8.9)

The owner's point: most checks try one tool on an empty note, but the bugs show up while writing long notes, where a tool lands between headings, lists, quotes, pictures and code. So each long note is opened as it is, and at real places in it — the middle of the longest paragraph, a list item, a quote, the end of a paragraph (one before a heading) — a tool is used with the keyboard and mouse: typing a word, Ctrl+B / Ctrl+I / Ctrl+U typing, Enter, the / menu and Esc, a pasted URL as URL and as Mention, a pasted picture, /shape, and on a new line /h2 /h3 /quote /bullet /numbered /todo /code /divider. Each trial checks the result, takes it back with Ctrl+Z, brings it back with Ctrl+Y, then deletes it the way a person does — Backspace or Delete one press at a time (a picture or shape clicked first) — and requires: the note exactly as it was (structure and text; no-break spaces and code colouring aside), no press eating text that was there before, and one typed letter landing back in that line. At the end the saved file must be the note that was opened. One check per tool per note; `DENSE_ONLY=<tool>` and `DENSE_TRACE=1|html|keys` narrow and trace a run.

`npm run smoke` runs it on the guide (18 checks); `npm run rebuild` runs it on the rewritten articles after scoring them (local only; a failure there fails `npm run push`). Standalone: `node tests/e2e/dense.mjs [note.json ...]`.

What it found on its first runs, all fixed in 0.8.9: undo/redo put the caret back by raw DOM position, which parsing the saved HTML shifts — after Ctrl+Z/Ctrl+Y the caret sat at the end of the line or the top of the note and the next Backspace deleted other words; a note with pictures kept a single undo step (every step carried every picture; the stack's 8 MB ceiling was one 6 MB article); Ctrl+Z inside a code block went to Chromium's own undo, and focus fell out of the note after an undo; after a redo into code the caret fell out of the code; Ctrl+U with nothing selected did nothing; Enter then Backspace left `<span style>` wrappers, split a list in two, and in a quote turned half a sentence italic; /todo and /code left a blank line above; an emptied code block could not be removed with Backspace; after deleting a divider or a picture, typing went into another paragraph or the end of the note; deleting the last shape left an empty shape layer.

### `tests/e2e/guide.mjs` (in smoke, 8 checks, new in 0.8.9)

The guide as this build ships it, in the app: a fresh vault opens it, locked; every section heading has a divider before it, never two dividers in a row nor one at the end, and no empty section; Where your notes live and Code blocks are the last two; the code samples start with Markdown and are all coloured; every equation is typeset; the demo shapes overlap no text at 960, 1280 and 1920 px; no page error. `scripts/place-test-exe.js` writes the same guide into Nebula Test's vault on every test build.

### `tests/e2e/view-snap.mjs` (in smoke, 22 checks, new in 0.8.9)

Only view: the seeded guide opens locked; typing, Enter, Backspace, paste and Ctrl+Z change nothing; a toolbar action, a code block and the title stay put; a shape does not drag; selecting and copying work; the ⋯ menu shows it ticked and toggles it both ways; it survives a restart; the badge unlocks. Shapes: a selected diamond and triangle stroke their own edge with no box ring, and the diamond's handles are at the bottom corners like the rectangle's. Arrows: an end 15px outside a shape (not at its centre) outlines the shape and snaps to its edge mid-drag, attaches on release, both ends attach to two shapes, moving one takes its end along, out of reach lets go, and the outline is never saved. F12: a PNG the size of the window named by date and time, the same image on the clipboard, a toast with the path, no overwrite within a second, and a key through the input pipeline caught once by the main process.

### `tests/e2e/canvas.mjs` (in smoke, 22 checks, new in 0.8.8)

Pictures and shapes on one canvas, with the real pointer: an old note's image layer merged on open (the picture still over the shape), ▴ on a shape then on the picture flips the order, each drags across the other without moving it, one bar open at a time both ways, an arrow tied to a picture follows its drag, undo order around a drag (words after, the drag, words before) and redo, resize and its undo, behind/above/in the text by real clicks with the lit button, the same after switching notes, the save indicator after an input that changed nothing, Delete and its undo, all of it after a restart, and a video card that is 16:9, wider than 560px, player first, no hint. 9 fail on 0.8.7.

### `tests/e2e/rebuild-findings.mjs` (in smoke, 17 checks)

What the rebuild found and needed, offline and with keys and pointer only: Enter on an empty quote line leaves it; italic switched off before Enter stays off; a pasted YouTube link embeds the player URL with a start time, keeps the pasted link on the card, and sends a Referer; a URL pasted over selected words links them and typing after stays outside the link; Ctrl+click opens a link (shell.openExternal stubbed); the image bar adds a caption and Enter returns typing to the note; /divider on an empty line and the heading after it are top level; arrows have their own menu with icons and untruncated names; a pasted image goes into the text on the caret line and overlaps nothing at 1920 or 900 px wide; in the link menu ↓ ← Enter picks Mention by wrapping (0.8.7); the guide's Rust sample is coloured in the running app (0.8.7).

Unit additions: `tests/rebuild.test.js` (16: plan reading, H1/H2 mapping, run spacing, scoring incl. real captions and normalised link addresses, regressions), `tests/blocks.test.js` +4 (quote exit), `tests/arrows.test.js` +5 (magnetTarget), `tests/notes.test.js` +3 (Only view toggles without an edit, the guide seeds and refreshes locked), `tests/history.test.js` +1 (no undo/redo while locked), `tests/seed-guide.test.js` +3 (Where 9 / Code blocks 10 last, Markdown first, locked) and a coverage list of every function, `tests/save-indicator.test.js` (new, 2: an input that changed nothing still ends on "saved"; a real change is written), `tests/history.test.js` +1 (a scripted change just before typing is its own step; the coalescing test now calls typed() before the change, as beforeinput does), `tests/migrate.test.js` +1 (image layers merge onto the canvas after the shapes, idempotent), `tests/rich-paste.test.js` three placements and one stacking order replace the ⇄ test, `tests/highlight.test.js` +4 (Rust: picker entry, char literal vs lifetime, raw strings, attributes/macros/keywords/types/suffixes), `tests/rich-paste.test.js` +3 more (link menu keys: order, ↓ ← → wrap ↑, Enter applies, Esc gives the caret back), `tests/seed-guide.test.js` (new, 5: the shipped guide's signature is on record, 0.6.0 still known, markup-only changes still count as unedited and typed words do not, shapes stay on the stage, the guide names every feature since 0.6.0), `tests/notes.test.js` +2 (an unedited guide is refreshed in place, a written-in one never), `tests/rich-paste.test.js` +22 (a pasted image goes into the text, replaces an empty line, a dropped one floats, ⇄ both ways; `embedSource`, links on words and unlinking, captions: bar button, Enter back to the note, empty removed, Backspace never deletes the image, Markdown export), `tests/inline-format.test.js` +4 (formats off across Enter).

### `tests/e2e/ideas-note.mjs` (in smoke, 12 checks)

The Ideas-note reports driven with real keys and pointer: `/h3` and `/bullet` on lines typed after a heading, the angle readout shown while turning and gone (and unsaved) after, an arrow attached to a shape following it and deleted with Delete without touching text, a crafted `.nebula.json` that must not run `onerror`, and a raw vault note file imported as a note. 10 of the 12 fail against 0.8.3.

`tests/import.test.js` adds 5: `sanitizeNote` strips handlers, frames, script URLs and SVG animation, keeps shape style, arrows, embeds and data images, and `noteFromFile` applies it to exported and raw vault notes.

Latest audit adds 19 unit and 14 Electron regressions. The rich-paste subset now
checks actual sandboxed content from a deterministic intercepted page, all four
link results, deletion/undo/redo, real image drag/drop, Escape, restart persistence
and bottom-of-page scroll stability. It runs standalone and in normal smoke.
The fixture disables background-window throttling; shipped launch flags are
unchanged. Mac manual-mode tests prove that download/install never invoke the
Windows installer hook. CI also asserts DMG/ZIP and universal executable slices.
Hands-on Mac upgrades, all remote providers and large-image storage exhaustion
are not covered; see [ProjectNotes.md](ProjectNotes.md).

| File | Tests | Proves |
|---|---|---|
| `tests/blocks.test.js` | 8 | A slash heading or list changes one block, and a divider nested in a list is lifted out; a bare `<div>` line (Enter after a heading) and loose editor text are lines too, a container div or a shape is not |
| `tests/arrows.test.js` | 7 | Straight, elbow and curve paths, the nearest attach point, and the degree readout |
| `tests/notes.test.js` | 20 | `NoteStore` seeds once (not once per note), creates/switches/updates, refuses to delete the last note, filters title + body, and adds the guide to an older vault exactly once without touching what is there |
| `tests/editor.test.js` | 41 | Toolbar actions, outline formats, indent, underline styles, code blocks, shapes, slash menu, icons, the font stacks, and the guide note's completeness |
| `tests/lists.test.js` | 36 | The tree Chromium's list commands actually leave behind, and leaving a list from an empty item |
| `tests/migrate.test.js` | 31 | Bringing a stored note up to what this version writes, including dropping the rotation readout and arrow selection 0.8.3 saved |
| `tests/release-notes.test.js` | 17 | What each release says for itself |
| `tests/inline-format.test.js` | 21 | Inline Enter/Backspace, preceding prose, nested text and empty-wrapper boundaries |
| `tests/rich-paste.test.js` | 14 | Four results, selection splits, delete/undo/redo, sandbox/fallback, stale decode cancellation, corrupt input and safe imports |
| `tests/release-body.test.js` | 3 | Actual changelog, exact assets, Mac steps and missing-version rejection |
| `tests/highlight.test.js` | 14 | Per-language tokens, and that only SQL is case-insensitive |
| `tests/disk-store.test.js` | 10 | Serialized acknowledged writes, retry of failed writes/deletions, latest state wins, and a partially corrupt vault disables the mirror without replacing its cache |
| `tests/seed-guard.test.js` | 13 | Empty versus unreadable vault, including malformed files and rejected note reads |
| `tests/user-data.test.js` | 8 | Which vault each build channel gets, and which one may replace itself |
| `tests/version-compare.test.js` | 7 | `0.3.10 > 0.3.9`, `v` prefixes, pre-releases, unparseable tags refuse rather than guess |
| `tests/find.test.js` | 9 | Finding text in a note without editing it |
| `tests/history.test.js` | 23 | Undo stack, image selection excluded and redo preserved across rehydration |
| `tests/notes-archive.test.js` | 14 | Pin, archive, trash and restore |
| `tests/app-menu.test.js` | 10 | The five menus, and that the palette reads them |
| `tests/export.test.js` | 30 | A note as Markdown or as a standalone HTML file |
| `tests/import.test.js` | 18 | A Markdown or HTML file read back as a note, sanitised |
| `tests/inline-family.test.js` | 7 | Exact selected occurrence, native underline removal, cross-block wrapping, collapsed caret and clean serialization |
| `tests/recovery.test.js` | 11 | Pending buffer ownership on archive/trash, synchronous save retry, wrapped Markdown text, long fences, unsafe URL schemes and code-block edge detection |
| `tests/updater.test.js` | 4 | Version comparisons, save/backup gates, silent Windows install and manual-only Mac behavior |
| `tests/docs.test.js` | 1 | Repository attribution is removed from public documentation without removing real content |
| `tests/reported.test.js` | 9 | Legacy prose normalization is idempotent and preserves shapes; underline follows coloured text without losing formatting or selection; the code hint follows source input |
| `tests/e2e/smoke.mjs`, `recovery.mjs`, `reported.mjs`, `editing-edges.mjs`, `rich-paste.mjs` | 231 | Original 173, 14 save-recovery, 16 reported-note, 8 divider/code-hint and 20 link/image checks, all using throwaway profiles |

---

## The smoke test, check by check

**Launch 1 — a fresh, healthy vault (1-25).**
The window opens and is titled · the preload bridge exposes `storage`,
`updates`, `paths` + `reveal` · the theme picker offers main / dark / light,
starts on main, and repaints both ways · a fresh vault seeds exactly one note
and it reaches disk · `storage/meta.json` is stamped · path-traversal reads are
rejected through the real IPC handler · the updater reports a mode without
crashing · `paths` reports the build channel and honours `NEBULA_USER_DATA` ·
About lists all six folders · toolbar, slash menu, shapes and AI panel are
wired · **the guide is the starter note, it carries a sample for every language
the picker offers, and none of them renders flat grey**.

**Launch 2 — the same profile again (26-27).**
The same notes, not a second seeding, and the note files are byte-identical.

**Launch 3 — a scratch profile, driving the editor (28-63).**
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

**Launches 4 and 5 — a vault that predates the guide (64-67).**
A profile holding one hand-written note file. The guide is added and is what
opens; the note that was already there is byte-identical afterwards; a second
launch adds nothing. This is the path that runs on a machine already using
Nebula, where seeding never fires because the vault is not empty.

**Launch 6 — a vault that cannot be read (68-71)**, `storage/notes` created as a
*file* so `readdir` fails with ENOTDIR — a real error that is not ENOENT:
the red storage-error banner appears · **nothing is seeded and no guide is
added** · the vault is left exactly as it was.

---

## Log

### [2026-09-23] v0.7.7 - the remaining Untitled editor edges

The real Untitled 1 and Untitled 2 files are copied only into temporary Electron
profiles. A Backspace at the text below a divider now removes the intervening
blank paragraph first; the next press arms the divider and the following press
removes it. The caret is restored to the text line after the gap is consumed.

The Markdown-style code hint is 12px instead of 10.5px, hides immediately on
input, and is hidden on load for a block whose source is already non-empty. The
code source has a larger left/right inset. `editing-edges.mjs` runs these checks
against both generic fixtures and the two real report originals; the originals
remained byte-identical. Focused command: `node tests/e2e/editing-edges.mjs`.

### [2026-09-22] v0.7.6 - the two current Untitled reports

<!-- agent-note: gpt6astra tarafından eklendi -->

Read the current two report notes from the Test vault. Baseline reproduction
failed prose joining, loose underline paragraph structure, underline colour,
nested-divider blank removal, code-picker spacing and Backspace inside shapes.
The lowest square's upward drag already passed; no speculative drag change.

After repair, the sixteen reported-note Electron checks cover joining while
preserving layers, real paragraphs, matching underline/text ink, pointer placement
and typing at BOTH highlighted starts, None and undo, the nested-divider
blank/arm/delete sequence, picker inset, shape-text Backspace and undo, and bottom
dragging. The optional actual-note run also verifies both source files remain
byte-identical. Screenshots are retained only in the temporary test profile.

The initial caret geometry probe used a collapsed ELEMENT range, which returns
no text rectangle; corrected it to use the first text node before asserting
pointer placement. Do not interpret a zero element-range rectangle as proof of
a missing painted caret.

Eight unit cases cover overlay ordering, idempotence, empty nested layers,
preservation of nonempty nested-layer coordinates, block-unwrapping order and
old/new underline normalization. Fixtures retain the reported DOM structure
but contain no private report prose.

Focused command after building: `node tests/e2e/reported.mjs`.
Optional `NEBULA_REPORT_NOTES` is a JSON array of the two source file paths.
Only their temporary copies are edited.

### [2026-09-22] v0.7.5 - interrupted work recovered

<!-- agent-note: gpt6astra tarafından eklendi -->

The existing interrupted changes were preserved and completed. The 338 unit
tests cover acknowledged disk writes, partially unreadable vault protection,
note-bound title/body buffers, precise inline formatting, Markdown round trips,
import sanitization and update preparation failures.

Fourteen new Electron checks now run as part of the standard smoke command:
archive before autosave; the next note stays intact; recolour only the selected
repeated word; colour-menu hit-testing at all four dock positions; real disk
failure and retry; native close refuses failed saving; bottom-shape dragging;
deleting its last shape frees the reserved canvas; immediate close flushes both
title and body; and restart preserves both.

The bottom-shape regression failed before the fix: moving the pointer up 60px
also moved scrollTop from 752 to 692, leaving the shape at the same screen y.
Reserving the extent on the non-scrolling shape layer keeps scrollTop at 752
and moves the rendered shape from y=684 to y=624. Never reserve on the editor.

An optional real-note reproduction uses `NEBULA_REPRO_NOTE` with
`node tests/e2e/recovery.mjs`. It reads the supplied note into a temporary
profile, verifies a real pointer drag and checks the source stays byte-identical.
The user's reported note passed; no private note is committed as a fixture.
Failure dialogs in this suite are intercepted so automated checks do not leave
a misleading native save-error popup on the user's desktop.

The sidebar test now waits for its target width rather than an animation delay.
Repository-only attribution comments are stripped by the docs build and tested.
Windows Electron behaviour is exercised locally; macOS packaging is checked by CI,
not by claiming a local macOS runtime test.

### [2026-09-10] v0.7.4 - the note, copied by hand

**Smoke 169 -> 173.**

The instruction was exact: make Untitled 2 the same as Untitled1 — the text,
the shapes' positions, the colours — before touching anything else. Doing that
found two faults that six rounds of reading the report had not.

**"The underline part will not close", said six times, and true.** Formatting
carries across Enter, so a new line inherits the wrappers of the line above.
Every one of these controls needs a SELECTION — which was the answer to "a
colour I did not ask for took the whole line" — and on a fresh empty line there
is nothing to select, so the mark could not be switched off at all. Typing the
note out revealed it immediately: every line after an underlined one came out
underlined, coloured and highlighted.

With the caret inside a wrapper and nothing selected, an empty wrapper is now
taken away and a wrapper holding words is stepped out of.

**The shape names were there and invisible.** `labelW: 0`. `min-width: 0` was
added when the menu was asked to be less wide and it crushed the name column to
nothing; the labels stayed in the markup at 13px, measuring 0 x 18. Every check
made until now asked whether the text EXISTED, which is why "write the shapes'
names next to the arrow, I have asked dozens of times" was answered with "they
are already there" more than once. The smoke suite measures the rendered width
now.

**Untitled 2 is in the test vault**, built from scratch: every character typed,
every mark applied from the toolbar, every shape inserted from the menu and
dragged into place. It matches the original 12 blocks out of 12 — text, marks,
both dividers and the code block — and 7 shapes out of 7 for kind, position and
size. The last few pixels of each shape's position are set rather than dragged,
because a thousand-pixel drag through a scrolling container accumulates drift;
everything else is a real gesture.

Two of the three defects fixed in this release were found by that exercise, and
the recipe extractor itself had to be fixed twice on the way — first it walked
only the editor's direct children and so treated a code block nested in a
wrapper as prose, "typing" its painted source and its language menu's option
labels into the copy.

### [2026-09-10] v0.7.3 - built the note by hand

The user's instruction, after the same faults came back too many times: stop
reading the report and *make* it. Open a new note, call it Untitled 2, and try
to build the same thing with the mouse.

That found more in one pass than the previous three rounds of prose.

**Clicking a shape threw the view to the top of the note.** Measured at
820 -> 0. Mine, from 0.7.2: the editor's size was frozen for the length of a
drag to stop the bottom of the note moving under the hand, and a `min-height`
on the element that SCROLLS stops it overflowing — so it stops scrolling and its
scrollTop goes to zero. It ran on mousedown, so every click did it. Second
attempt at that report, second worse fault; it is out, and the original is open
again until there is a reproduction to work from.

**One to-do swallowed both lists and the divider.** Building the note by hand
produced this:

    <div class="blk-todo"><ul>…</ul><div><ol>…</ol><div>a thing</div></div></div>

The whole cascade came from the first step. `execCommand('insertUnorderedList')`
leaves the list INSIDE the block the caret was in, and `<p><ul>` is not merely
untidy — it is invalid. Leaving the list then added a `<div>` inside that
paragraph, the next list nested inside that, and To-do converted the outermost
block, taking everything with it.

`listCommand` half-knew: it builds a list by hand for a to-do line, with a
comment describing exactly this markup, and left the ordinary case to the
browser. `normalizeLists` lifts a list out of any wrapper that is not an `<li>`
now.

The first attempt only handled `<p>` — and passed a clean-start trace while the
real sequence still failed, because after a heading the block Chromium makes on
Enter is a `<div>`. The order the user actually works in is the test.

**Enter on an empty to-do ends the run,** the way it does in a list; before
this the only way out was to keep making empty to-dos. **And a divider is
inserted at the top level** rather than wherever the caret happens to be — it
was landing inside the to-do.

**Untitled 2 is in the test vault**, built end to end with a real pointer, so
the structure can be looked at rather than described.

### [2026-09-10] v0.7.2 - the indicator, read from two screenshots

**Smoke 155 -> 160.**

The user sent two screenshots rather than another list, and they settled three
things a week of prose had not.

**"Gösterge" was never the caret.** "Where I said the underline does not close,
right at the start there is no indicator at all" — the *toolbar mark*, not the
text cursor. Measured, and two separate faults fell out of it:

- `queryCommandState('bold')` reports the TYPING state, which Chromium carries
  across a boundary. With the caret at the start of a line whose first word is
  bold, Bold lit up on plain text: "bold is stuck here, it will not turn off".
- A caret at offset 0 of a paragraph sits OUTSIDE the span holding the line's
  formatting, so `closest()` from that node found nothing and the underline mark
  never appeared at the beginning of an underlined line.

Both are answered by asking which element is at the caret — stepping into the
child it sits beside — and reading the DOM for all four marks rather than asking
the browser what it would type next.

**The outlines, at last, by looking at them.** The screenshot shows the diamond
and triangle carrying a visibly lighter line than the square, which is what
"make them all the weight of the square" meant, said three times. The
inset-fill trick was replaced with a real SVG stroke and a `non-scaling-stroke`
vector-effect — one width, mitred corners, at any size. Then the measurement
caught the last part: a declared `1.6px` border is rounded to a whole pixel by
the browser and an SVG stroke is not, so declaring the same number gave the
stroked kinds a heavier line than the square's. Both are 1px now, and the smoke
suite asserts the set of weights has exactly one member.

**The divider's blank line.** "It selects the divider, but the empty white row
underneath is still there" — arming it while a blank line sat in between meant
the gap could never be closed, which was the whole point of getting close to it.
The blank row goes on the first press, the divider is offered on the second.
Finding that row had to come from the SELECTION, not from `getTargetRanges()`:
the range a backward delete reports starts in the block BEFORE the caret.

**A shape holds the note still while it is dragged.** The clamp reverted in
0.7.1 is not back; instead the editor's own extent is frozen for the length of
the gesture and released afterwards, so a shape can still be put anywhere but
the bottom of the note stops moving under the hand.

### [2026-09-10] v0.7.1 - what is actually about to be deleted

**Smoke 153 -> 155.**

**Two Backspaces before a marked line removed all eleven shapes in the note.**
The user marked the spot with a `*` and said "press back just before it"; from
there it reproduced on the second press, every time.

Both delete rules had been written against `keydown`, working out from the caret
which element WOULD go. That guess is wrong often enough to matter. Between the
caret and the shape layer sat empty spans left over from deleted text, so the
guess looked at the spans and stood aside — and Chromium, which SELECTS a
non-editable island on the first Backspace and removes it on the second, took
the layer whole.

`beforeinput` does not guess: `getTargetRanges()` is the range the browser is
about to delete, before it deletes it. One guard now reads it and refuses when a
shape layer is in it.

**The divider needed the other half of the same lesson.** An `<hr>` is a void
element, so a delete positioned right after one does not *intersect* it and the
range test missed it — it was removed without ever being armed. Its boundary is
read instead. And the second press removes it here rather than leaving it to the
browser, whose own backward delete at that boundary merges the blocks around the
divider and leaves the divider standing.

**The shape clamp is reverted.** 0.7.0 stopped a shape dragging the note's
bottom edge around, and the cure was worse: a tall shape in a short note already
sits below any such limit, so the first pixel of movement threw it upwards and
then it would not come back down — "they fly straight up and cannot be dragged
down". Two certain faults for one ambiguous one is the wrong trade, so it is
out, and the original report is open again.

### [2026-09-09] v0.7.0 - a blank line that is really blank

**Unit 300 -> 303, smoke 152.**

**"From here down, five lines, the cursor does not show" — and, in the same
breath, "underline gets in, something silly happens".** One cause. Those lines
were

    <p class="h-blue"><span class="u-single"><span class="h-blue">
      <span class="c-red"></span></span></span></p>

— a style applied, then the words under it deleted, leaving the wrappers. Two
things follow and the user reported both: the caret lands inside a stub four
pixels wide against the highlight it is standing in, and anything typed there
comes out underlined, highlighted AND red, because that is what the caret is
inside. `migrateBlankLines` used to skip these — it only emptied a block with no
children at all, and these have three. A line with no text is now cleared to a
single `<br>`, keeping the block's own class so the line itself is unchanged.

**The AI panel would not stop resizing.** It holds a `<webview>`, which is a
view of its own: the moment the pointer crossed into it the host renderer
stopped receiving `mousemove` and `mouseup` entirely, so the drag never ended.
Pointer events with capture, a pointer-events shield over the guest while
dragging, and `blur` as a last resort.

**The shape outlines were set in percentages,** so they scaled with the shape —
the rule that looked like a hairline on a small diamond drew a four-pixel band
on a 150x90 one. Reported twice as "still not fixed", and correctly: 0.6.9
changed how the line was drawn without changing that it grew. Pixels now.

**A divider takes two presses.** One press deleted it as soon as the caret
reached the line beneath, which is the opposite of "I want to get CLOSE to the
divider". The first press arms it and shows what the next one will take.

**A shape could drag the bottom of the note with it.** It is absolutely
positioned, so dragging one past the last paragraph grew the editor's scroll
height to reach it — measured going 1033 -> 2610 across one drag — and shrank it
again on the way home, which is the bottom edge moving under your hand. A shape
is clamped to the note's own extent now, measured once before the drag so the
limit cannot chase its own tail.

**Checked and already right:** the shape menu does carry both a drawing of each
shape and its name, and the code block's language picker had moved — it is
lined up with the code inside the `<pre>` now rather than with the block's outer
edge, which is what made it look left of everything under it.

### [2026-09-09] v0.6.9 - printed as a document, and shapes you can turn

**Unit 289 -> 300, smoke 150 -> 152.**

**The export is no longer a picture of the window.** The margin problem was a
genuine dead end while the LIVE window was the thing being printed: Chromium
fills a page's margin band from a document background colour it captures once,
at load, outside the print stylesheet — so `@page { margin: 12.7mm }` framed
every page of a dark-themed app in violet, and the only route to a white sheet,
`@page { margin: 0 }`, cannot repeat a margin. Four ways round it were measured
and all four failed (0.6.7).

A document that is white from the moment it loads has neither problem. The note
is now built into a standalone page — its own markup, the app's own stylesheets
with their relative font URLs made absolute — written to a temp file and printed
from a hidden window with JavaScript off. Measured on a three-page export: the
page box is 698x1027 on every page (A4 less 1.27 cm a side), every painted
rectangle is white, and the highlight, text colour, code-block fill and border
all survive with four embedded fonts and no images.

**Backspace could swallow every shape in a note.** A shape layer is
`contenteditable="false"`, and Chromium's answer to Backspace against a
non-editable island beside the caret is to take the whole island — eleven shapes
in one keystroke. Both delete keys now refuse when a shape layer is what would
go.

**Shapes turn.** A second grip at the bottom-left, opposite the resize grip;
Shift snaps to fifteen degrees. The angle is kept in `data-rot`, so it survives
being saved, and old shapes get the grip from the migration.

**One line weight for every shape.** The diamond and triangle drew their outline
as a box inset on the fill, and a box inset moves each edge perpendicular to the
BOX — which on a diagonal is not perpendicular to the EDGE. The diamond read as
heavier than the square and the triangle went thin at its apex, where the inset
degenerates. The fill is clipped to its own polygon now, drawn parallel just
inside the outer one.

**The shape menu draws the shapes.** Unicode glyphs were never the right
silhouette and were hairlines at 14px; each row is the shape it makes, in the
same 1.6px line.

**The website had been stuck on v0.6.0 for eight releases.** The page prints
`memory.currentPhase` as "Right now", and nothing was updating it while every
other version on the page was correct — which is why "the site is not up to
date" was reported twice and looked wrong both times. `npm run push` now refuses
to ship when that line does not name the version being released.

**Two smoke checks were rewritten rather than deleted:** one asserted the
outline was a box inset, which is no longer how it is drawn, and one asserted a
colour with only a caret restyled the whole line — the behaviour 0.6.8 removed
on request.

### [2026-09-09] v0.6.8 - the page edge, and lists that line up

**Unit 289, smoke 150.**

**"Why are bulleted and numbered not on the same line" — reported three times,
measured as aligned every time.** Both put their TEXT at exactly the same x;
what was out of line was the markers. `::marker` is right-aligned against the
text in `list-style-position: outside`, so a narrow "•" and a wide "1." share
their right edge and begin at different places. Measuring the text answered a
question nobody had asked. The markers are drawn as `::before` in a fixed
22px column now, left-aligned, so "•", "1." and "10." all begin at the same x.

**Enter did nothing inside a code block.** The handler was there and looked
right: `execCommand('insertText', '\n')`. Chromium discards a bare newline in a
contenteditable, so the character never arrived — typing "one", Enter, "two"
produced "onetwo". The newline is inserted as a text node now, doubled when the
caret is at the end (a trailing newline has no line box, so nothing appears to
move), and `data-code` is updated by hand because a scripted insertion fires no
`input` event.

**The dark line along the top of every exported page.** Chromium was rounding
the page box: the sheet came out 795x1124 while the page box was 794x1123 offset
by one pixel, leaving a 0.75pt strip of the document's background along the top
edge — and the clip region started below it, so nothing the page painted could
reach it. `preferCSSPageSize: true` makes the page box the stylesheet's own
`@page` box exactly; the white now covers the sheet corner to corner, on every
page. Measured across a three-page export.

*Still true, and worth stating:* the 1.27 cm margins come from padding on the
content, so a note long enough to break starts its second page at the paper's
edge. Repeating margins need `@page` margins, and a page's margin band cannot be
painted — four separate attempts are recorded under 0.6.7. Between a dark frame
on every page and a missing top margin on continuation pages, this is the better
half of a trade that Chromium does not let us avoid.

**Nothing selected, nothing changed.** The colour picker kept the whole-block
fallback the font picker lost in 0.6.7 — "I did not select anywhere, I press
change colour and everything changes". Both are selection-only now, and the
smoke check that asserted the old behaviour was rewritten rather than deleted.
`applyFontSize` also swept the WHOLE note for `xxx-large` whenever it had no
selection to scope by, which is "sometimes random places grow by themselves".

**A highlight nudged the line.** `padding: 0 2px` on the highlight classes
widened the run by 4px, so every following word jumped sideways when a
background was applied and jumped back when it was removed. The padding is
still painted; a matching negative margin gives the width back.

**Also:** a shape cannot be dragged smaller than the text in it; the shape menu
uses filled marks in full-strength ink; the code block's language picker lines
up with the code under it; "Default text" is called Black text; and the size box
paints what it is about to change, because Chromium stops drawing a selection
the moment its editable loses focus.

**The caret could leave the note.** Held at the top, the up arrow walked the
selection out of the editable and into the page around it — it came to rest in
the sidebar's wordmark, where no caret is drawn and nothing typed arrives. The
default is still allowed to run; the selection is pulled back only when it has
actually left.

### [2026-09-09] v0.6.7 - switches that switch off

**Unit 284 -> 289, smoke 149 -> 150.**

**Nothing switched off.** Bold and Italic go through execCommand, which toggles;
underline, text colour and highlight are ours, and every one of them only ever
applied. "The underline part will not switch off", "a background was picked and
it will not close". Picking what is already there clears it now.

**A font took the whole line.** 0.6.0 gave a collapsed caret a whole-block
fallback, because picking a font with the caret merely parked in a line looked
like it did nothing. The answer to that was explicit — *only what is selected
should change* — and a font quietly swallowing a paragraph is the more
surprising of the two. The smoke check that asserted the old behaviour was
rewritten rather than deleted: it asserts the new rule and that a selection
still works.

**An empty line had no cursor.** A block with no children has no line box, so
Chromium paints no caret in it and it has no height either: clicking a blank
line put the cursor nowhere visible — *"the straight line that guides while
typing is gone, clicking does not show it"*. A browser puts a `<br>` in an empty
paragraph of its own accord; these were made by script and never got one.

**Shapes.** Square and circle join the set and stay equilateral when grown or
dragged. The button repeats the kind chosen last. The menu is 54px instead of as
wide as the font list. Double-clicking the text takes all of it — the hit test
had to move to geometry, because `.shape-text` only accepts pointer events once
the shape is already editing, so `e.target` always reported the shape. Bold,
italic and the rest work inside a shape now: `cmd()` called `editorEl.focus()`
unconditionally, and a shape's text is a nested editable INSIDE the editor, so
focusing the editor threw the selection away. And arrow keys no longer walk into
one — the text is `contenteditable="false"` until it is actually being edited.

**The export's dark band, measured to the end.** Four separate attempts, each
disproved: `html { background: #fff }` under print media (the page computes
white and the band stays dark), `webContents.setBackgroundColor` (does not exist
in this Electron), `BrowserWindow.setBackgroundColor` (measured: no effect on
printToPDF at all), and switching the app's theme (the band follows one change
LATE — Chromium caches a document background colour outside the print
stylesheet). A page's margin band cannot be painted. So there is no band:
`@page { margin: 0 }` makes the page box the whole sheet, the white canvas
covers it edge to edge, and the 1.27 cm Word-Narrow margins come from padding on
the content. The one thing padding cannot do is repeat, so a note long enough to
break starts its second page at the paper's edge — a real limitation, and a
better one than a dark frame on every page. The note's title heads the document.

**One typeface.** Eleven `font-family: var(--sans)` declarations moved to the
wordmark's serif: the chrome was Inter while every note was set in Charter, so
the window read as two programs. Only code itself stays monospaced.

**`styleWithCSS` is a document-wide flag** and `applyFont` leaves it on, so bold
afterwards emitted `<span style="font-weight:bold">` instead of `<b>` — and
queryCommandState, the export and the importer's allow-list are all written for
the tags. `cmd()` resets it.

**macOS.** The reported message is *"Apple konnte nicht überprüfen, ob Nebula
frei von Schadsoftware ist"* — that is **notarization**, not a broken download,
and removing it needs a paid Developer ID. The release page now names the two
ways past the dialog, instead of the right-click that newer macOS no longer
honours.

An ad-hoc `codesign` hook was written first, on the theory that an unsigned
arm64 binary would be reported as *damaged*. It was wrong twice over and both
mistakes cost a release. The first cost one because an unknown key was added
inside `build.mac`, which electron-builder validates strictly — the config error
failed the Windows build too, and it would have been caught by running
`npx electron-builder --dir` locally, which is now the habit. The second was the
hook itself: `afterPack` runs once per architecture, and two independently
signed halves cannot be merged into a universal binary
(*"expected all non-binary files to have identical SHAs"*). It was also
unnecessary — electron-builder already signs the frameworks, which is why the
Mac that reported this got the notarization dialog rather than a refusal. The
hook is gone.

### [2026-09-09] v0.6.4 - reproduced against the note that reported it

**Unit 267 -> 284, smoke 141 -> 149.**

**"I still cannot delete a code block by pressing back underneath it."** Said
for three releases running, and right every time. 0.6.3 was verified against a
note I built to look like the real one, and the shape I guessed was wrong. Read
out of the actual vault, the note holds this:

    <div class="c-red">
      <div class="blk-code">…</div>
      <p>the caret is here</p>
    </div>

Applying a colour across a run that contains a code block puts the block AND the
line under it inside ONE wrapper. `blockOf` climbed all the way to the editor's
direct child, so it returned the *wrapper*, and compared whatever came before
the wrapper with the caret — never the block sitting directly above it. Backspace
fell through to Chromium, which cannot delete a `contenteditable="false"` island,
so nothing happened at all. It finds the nearest real block now and steps
outward a level at a time when a block has no sibling of its own.

The lesson is the one the user put plainly: *if we cannot solve this, we can
never solve users' problems.* The fix was verified by loading the actual
`Untitled1` content and deleting all three of its blocks.

**The underline button never lit up.** Bold and Italic get their state from
`document.queryCommandState`, and underline is ours — a class, which that API
knows nothing about. It reads the DOM now, and counts a native `<u>` from an
older note as an underline too.

**The size control.** "px" on every row of a list where every row is a size in
px, in a menu twice as wide as its widest entry, with the arrow across a gap
from the number. Rows are bare numbers, the menu is 62px, the field is 48px and
the arrow sits 1px from its edge.

**Two lines beside the theme buttons in the collapsed rail.**
`.theme-pick button + button` draws a `border-left` — correct for the horizontal
row it was written for, and in a vertical stack those became short vertical
stubs hanging beside the names. Stacked, the separator runs across.

**Every update now says what it changed.** A card in the middle of the screen,
once per version, listing what the reader can now do; Help -> What's new opens it
again. `release-notes.js` decides what there is to say and whether it has been
said, both pure and tested; the dialog only draws. It does NOT open on a first
run — there is no older version to have missed, and it would land on top of the
guide. `npm run push` refuses to ship a version with no entry.

**`app.getVersion()` was answering with Electron's version.** It reads the
package.json of whatever directory Electron was pointed at, and
`electron dist-electron/main.js` — how both a dev run and the smoke suite start
it — points at a directory that has none. Everything downstream believed the app
was v33.4.11, which is why the card looked up notes for a version that will never
have any and silently showed nothing.

**Two tests were wrong, not the code.** One clicked the sidebar toggle twice
(`el.click()` returns undefined, so a `??` fallback fired as well) and measured
the expanded rail while asserting about the collapsed one. The other waited a
fixed 250ms for a 140ms width transition; it passed by luck for months and broke
the moment boot got busier. Both wait for the width to settle now — stability
alone is not enough, because an ease curve crawls at both ends and two frames
round to the same pixel while the bar is still moving.

### [2026-09-09] v0.6.3 - what the old notes were still holding

**Unit 245 -> 267, smoke 132 -> 141.**

The user asked the question this release is named after: *"in trying not to lose
my old notes, are you still keeping their buggy state?"* Comparing tonight's
report against the 02:07 backup answered half of it — six items in it are
byte-identical to text written before 0.6.1 and were fixed then; the report is a
running document nobody deletes from. But the other half was a fair hit, and
bigger than the question implied.

**A fix that lives in a note's MARKUP never reaches the notes written before
it.** The code block's ✕ needed a hand-written top-up to reach old blocks;
`--shape-fill` needed another; the `<br>` that gives an empty shape a visible
caret never got one at all. Each was patched where it was found. `migrate.js`
is now the single place that runs on every note open, and every new in-markup
control belongs in it.

The clearest case was the guide note's own shape: a 150x90 box with 155
characters in it. `fitToText` only ever ran on `input`, so a shape saved
overflowing was never measured again — the text was clipped, and double-clicking
put the caret at the end of it, outside the visible box. That is the whole of
"the flat line for writing does not appear": the caret was there, off-screen,
inside a box that should have grown.

**An underline applied to a selection spanning two paragraphs underlined
nothing.** Reproduced, and worse than reported: `wrapSelection` extracted BLOCK
nodes and put them inside one inline span —

    <p>first </p><span class="u-single"><p>rest</p><p>second</p></span><p> more</p>

`text-decoration` does not propagate into a block child, so every text node
computed `none`; and the paragraph the drag started in was silently split in
two. It wraps one span per block now, which is exactly what `execCommand` does
for fonts and why the font path never had this bug.

That same markup explains a second report. A `<span class="c-red">` holding
several paragraphs becomes the editor's direct child, so it is what "the block
the caret is in" resolves to — picking a font anywhere inside restyled all of
it. "Selecting some places still changes the font of the whole area." Notes
already carrying such a span are taken apart on open, the formatting moved down
onto each block where it belongs.

**Ctrl+U was never in the shortcut table.** It fell through to Chromium, which
inserts a native `<u>` — a different mechanism from the button's `u-single`, so
the style menu's own "None" could not remove it. It runs the same action as the
button now, and "None" strips `<u>` as well.

**"There is a nonsense colour outside the export."** Measured this time, not
guessed: every exported PDF opens with

    .0902 .0706 .1647 rg   0 0 1009 1479 re f

across the whole sheet, then white only inside the margins. `#17122A` is this
window's own `backgroundColor`. Chromium fills a page's margin band with the
view's base colour and paints no CSS background into it, so no print stylesheet
could ever have reached it — 0.6.2 looked for the colour in the export *menu*
and found subpixel antialiasing, which was a real finding about a different
thing. `@page { margin: 0 }` hands the whole sheet to the stylesheet, the
margins are drawn as padding, and the base colour is white for the length of the
export so nothing can show through at the edge.

**Also:** the pin in the collapsed rail has a column of its own, so the initials
line up down the list; Archive and Trash put their count under a centred label;
the size field's arrow moved inside the field; the `<select>` arrow was drawn
from `currentColor` and so came out darker than every other caret; the √x mark's
x is bold like the rest of the set; and A and H are now the same glyph in the
same face, on the same baseline, rather than one drawn path and one letter.

### [2026-09-08] v0.6.2 - the third report

**Smoke 123 -> 132**, unit unchanged at 245: everything here is behaviour in the
running app rather than new pure logic.

The report was written at 12:33 against 0.6.0; the test build only became 0.6.1
at 13:31. Its last third repeats items 0.6.1 had already fixed, so this entry
covers what was genuinely new.

**A code block below a wrapper could not be removed.** 0.6.1 added Backspace at
the edge, but it looked at `previousElementSibling` of the caret's own block —
and applying a colour or a font around a code block leaves it inside a
`<div class="c-red">`. The lookup found the wrapper, gave up, and Chromium's
default merged the paragraphs and left the block *and* a blank line behind. It
now finds a block wrapped at either depth, takes the nearest one when a wrapper
holds several, keeps a wrapper that also holds text, and removes a wrapper left
empty — which was the reported blank line.

**Underline applied to the whole line.** The block-level fallback added in 0.6.0
was right for colours and fonts (picking one with a caret parked in a line was
reported as "nothing happens") but wrong here: an underline across a whole
paragraph is never what anyone means. It needs a selection now; colours and
fonts keep the fallback.

**The size field had no arrow.** It was an `<input list>`, and a `<datalist>`
draws no mark of its own and cannot be styled to match anything. It keeps free
typing and gains the same caret the other menus have, opening the common sizes.

**"There is a strange colour in the export menu, outside — remove that layer."**
Measured: the rows compute to `--ink`, exactly like every other menu. What
differed was the *rendering*. Windows draws near-white text on a dark ground
with RGB subpixel antialiasing, which fringes small text warm — the rows read as
pink and there was no colour anywhere to account for it. Grayscale smoothing on
the body removes the fringe.

**Shapes.** Double-clicking to edit did work, but the text starts empty and an
empty contenteditable has no line box, so Chromium paints no caret: nothing at
all said you could type. It carries a `<br>` and a minimum line height now, with
a rule under the text while editing. A shape also grows to fit what is typed
into it — the text was clipped and simply vanished before, and the clipped kinds
get more slack because a diamond only shows its middle.

**Also:** the numbered-list mark's digits are bold like the rest of the set, and
the theme picker's segments now reach the same edges as the New note button
above them — its own border and 2px padding had held them three pixels inside.

### [2026-09-08] v0.6.1 - the second bug report

**Unit 238 -> 245, smoke 116 -> 123.**

**A title could be lost.** Rename a note and press New note within the 400 ms
debounce and the new name was simply dropped — only the body was ever flushed
before the active note changed. Worse, the pending timer then fired against
whichever note had become active, so the name could land on the wrong one.
`flushTitle()` runs before every note switch now. This is the only one in the
report that could cost the user something they had written.

**Three that were not reproducible as described, and what they actually were:**

- *"I can only tick the to-do, I cannot click into it to write."* Clicking into
  a to-do works — but the whole 24px left edge toggled the checkbox, so clicking
  near the start of the line to place the caret ticked it off instead. The hit
  area is the box now, and the rest of the line has a text cursor.
- *"Bulleted and numbered are not aligned."* Measured: both put their text at
  exactly the same x. The markers were not styled at all though, so a bullet and
  a "1." were different sizes and colours; they share one marker column now.
- *"Backspace does not take me back to the far left."* On an EMPTY item it
  already did. On an item with text it merged into the line above, and there was
  no way out at all — `liftListItemAtStart` turns it into a paragraph at the
  margin, which is what every editor does.

**A code block in an older note still could not be deleted.** The ✕ added in
0.6.0 is written into the markup at creation, and the markup lives in the note —
so every block written before that had a header with no delete button. Every
paint tops the header up now. Selecting across a block and pressing Delete works
too; Chromium leaves a `contenteditable="false"` island behind when a range
crosses it.

**The / menu did not scroll.** The highlight moved with the arrow keys but the
menu never followed it, so past the sixth item you were choosing something you
could not see.

**The dropdown marks were three different things:** an 8px `▾` glyph on the
underline, colour, shape and font menus; a 4px CSS triangle on the `<select>`s;
and the browser's own arrow before that. One triangle, one size, everywhere.

**A clip-path cuts the border off** with everything else outside the shape, so
the diamond and the triangle had no outline at all. They are drawn in two layers
now — the element paints the outline colour, a pseudo-element inset by the line
width carries the fill, both clipped to the same silhouette — and the shape bar
can turn the outline off. The fill moved to a `--shape-fill` custom property
because CSS cannot read the inline `background` a note stores; shapes saved
before this get it copied across when their note opens.

**The text-colour swatches came back out of the shape bar.** The user's point
was that a shape's text is just text: double-click in, select it, use the
toolbar like anywhere else.

**Also:** a pinned note shows a pin rather than a dot; the to-do mark had rows
of different lengths at different x positions; the quote mark read as two
commas with tails; Open in the archive shows the note without un-archiving it,
and the dividers between archived rows are gone with the buttons moved to the
right.

**Printing.** The export path was measured, not assumed: the PDF it writes has
**zero image objects and six embedded fonts** — it is a document. The print
stylesheet was measured too, under emulated print media: title strip, menus,
sidebar, toolbar and overlays all compute to `display: none`, on white paper
with black ink. What was left was `window.print()`, which hands the page to the
platform and lets the printer driver decide how to rasterise it. Printing goes
through `webContents.print` now, so Chromium's own layout and text reach the
driver.

### [2026-09-07] v0.6.0 - export, and the fourteen things in the bug report

**Unit 201 -> 238, smoke 92 -> 116.** Two new suites: `export.test.js` (18),
`import.test.js` (18).

The user wrote a Bug Report note in the test build and put Notion's export of
the same document - PDF, HTML and Markdown - in a Feedback folder beside a
`try.pdf` of their own. `try.pdf`'s producer is **"Microsoft: Print To PDF"**;
Notion's is **Skia/PDF**. That is the whole complaint in two lines of metadata:
`window.print()` hands the window to the OS dialog, so the output is a picture
of the app rather than a document.

**Everything here was reproduced in the running app before it was changed**, and
three of the causes were not what reading the code suggested.

**Changing the size of selected text did nothing at all** - not a scoping
subtlety, nothing. The toolbar's mousedown preventDefaults to keep the
selection, *except* over `input` and `select`, which have to take focus to be
usable - and focusing them is what clears the document selection. So
`selectionInEditor()` returned null and `applyFontSize` returned early, in
silence. The same trap had the outline dropdown. The last selection inside the
editor is remembered now and put back before a field-driven action runs.

**Nothing in the slash menu could be undone.** `slash-menu.js` never imported
`history` at all, and `insertCodeBlock` never pushed a step either, so `/code`,
`/divider`, `/shape` and the rest were invisible to Ctrl+Z - it skipped past
them to whatever was typed before. That is both "code block does not go back"
and "it got stuck here, I cannot undo".

**A code block could not be deleted.** Not by a button - there wasn't one - and
not by keyboard: the block is `contenteditable="false"`, so Chromium's Backspace
and Delete both simply decline. Nothing anywhere in `src/` called `remove()` on
a `.blk-code`. There is a ✕ in the block's header now, and Backspace/Delete at
the edge next to one removes it.

**And the code block insert had a second bug behind it:** the newly inserted
block was found with `.blk-code:not([data-ready])`, which returns the first
unpainted block in DOCUMENT order - and the guide's seeded blocks carry no
`data-ready`. So inserting a code block in the guide stamped, repainted and
focused the note's **first** block instead: the caret jumped to the top and the
editor scrolled with it, while the block actually inserted was left unpainted.
It is found by its own marker now.

**The down arrow threw the screen up** because leaving a code block fired
`focusout`, which rewrote `src.innerHTML` *while the browser was still placing
the caret*. Destroying those nodes mid-move makes Chromium collapse the
selection to the top of the editable root and scroll there. The repaint waits a
frame and only runs if the caret really did leave.

**Headings** were ordered correctly (26/21/18px) but body text is 17px, so h3
was a heading nobody could see; the scale is 31/24.5/20 now. The `/` menu drew
all three with the same icon - H1, H2 and H3 were three identical rows. They
have their own marks, and the code-block entry no longer shares the inline-code
`<>`.

**A to-do would not become a list.** Handing the command a plain paragraph first
was not enough either: it produced `<p><ul><li>…</li></ul></p>`, a list nested
inside a paragraph. The list is built directly now, and merges with a list
already next to it.

**Export, at last.** `toMarkdown` and `toHtml` are pure functions over a parsed
document; PDF goes through `webContents.printToPDF`, the same Skia writer
Notion's export uses. Markdown writes the title once (not twice, when the note
opens with its own title as an h1), takes code from `data-code` rather than the
highlighted spans, writes an equation as its LaTeX, skips shape layers, and
escapes only what would change meaning - escaping the whole punctuation set
turned "A sentence." into "A sentence\.". Import reads a `.md` or `.html` file
into a NEW note, sanitised: scripts, styles, frames, event handlers,
`javascript:` URLs and unknown classes are all stripped, because an imported
file otherwise becomes part of the vault. No CSV: Notion's CSV is for database
views and there is no table block here.

**The print stylesheet** now also hides the title strip, the menus, the find
bar, the update card and the overlays, flattens the theme to black on white,
sets `@page`, and keeps headings with the text under them.

**Two more:** the AI panel built its `<webview>` during boot while the panel was
still `hidden` - i.e. `display: none`, the exact state that detaches an Electron
guest - with no `try/catch` anywhere and `initAiPanel` running *before* the
editor was wired, so a throw there would abort the rest of `boot()` and leave no
toolbar and no notes. It is built when the panel becomes visible, guarded, with
`did-fail-load` and `crashed` reported in the panel; and it starts last. And
`history.js` kept 100 full copies of the note - fine for the 85 KB guide, not
fine after a large paste on a machine that has been killing releases for want of
memory. There is a byte ceiling on the stack now as well as a step count.

**Archive and Trash** are one panel with two buttons side by side under it, in
the New note button's visual language, opening upward with the sidebar's own
note blocks and a divider between them.

**Help -> Blocks** lists the eleven `/` blocks, built from `SLASH_ITEMS` itself
so it cannot fall behind the menu - the same arrangement the command palette has
with the app menus.

**A note on the release ritual.** Four releases in a row were killed for want of
memory, twice *after* the gates had already passed — leaving the version bumped
with no tag. The cause was ordering, not the code: `npm run kill` lived inside
`pack:test`, which runs after the tag, so Vitest, a full build and six Electron
launches all happened while the installed app and the test build were holding
about 1.6 GB between them. It runs first now. The same processes get closed
either way.

### [2026-09-07] v0.5.0 - the editor gets its own undo, and the app gets a menu bar

**Unit 156 -> 201, smoke 71 -> 92.** Three new suites: `history.test.js` (21),
`notes-archive.test.js` (14), `app-menu.test.js` (10).

**Three fixes from 0.4.x never actually worked. They were reproduced in the
running app before anything was changed this time**, and two of the three had a
different cause than the code review suggested:

- **A colour with only a caret did nothing.** Not a CSS or theme problem at all:
  `applyExclusive` returns early on a collapsed selection, and the caret
  fallback the font picker grew in 0.4.4 was never given to the colours. Proved
  by driving the real menu in all four themes - with a *selection* the colour
  applied correctly every time, which is why reading the code had not found it.
- **Formatting quietly corrupted the text.** 0.4.4 routed `wrapSelection`
  through `execCommand('insertHTML')` to get onto Chromium's undo stack. It
  worked, and it rewrote the spaces on either side of the selection:
  `<p>colour&nbsp;<span class="c-red">this</span>&nbsp;word</p>`. Every
  formatting action, every time.
- **A shape behind the text could be selected but never moved.** The
  `under !== selected` guard added in 0.4.4 dropped every mousedown after the
  first, and a drag begins with a mousedown.

**The editor now has its own undo stack** (`history.js`). Chromium's knows only
about edits Chromium made, and this app makes a lot by script - shapes, list
repair, equations, wrappers - so `execCommand('undo')` was always rolling back
the wrong thing. Snapshots of the note plus a path-based caret, typing coalesced
into one step at 600 ms, everything else its own step, 100 per note, cleared
when another note opens. `wrapSelection` went back to precise node surgery,
because there is nothing left to buy from the browser's command.

Deleting a shape and pressing Ctrl+Z now brings it back **with its position and
its colour** - the check asserts both, not merely that a shape exists.

**Notes gained pin, archive and trash.** The old `deleteActive` refused to
remove the last note because nothing could bring it back; the trash is that way
back, so the guard is gone and the guide can be deleted and re-added from Help.
Archiving deliberately does not touch `updatedAt` - it is not editing.

**Two bugs the new checks caught in the new code:**
- The document-level shape deselect bubbles last, so it cleared the selection
  microseconds after a buried shape was picked up. Claimed events are skipped.
- `renderList` returned early on an empty list, before redrawing the archive and
  trash counts - and trashing the last note is exactly when they change. The
  trash showed 0 with a note in it.

**The app draws its own File / Edit / View / Window / Help**, beside an enlarged
logo, in a title strip the window no longer draws itself (`titleBarStyle:
'hidden'` plus `titleBarOverlay`, `hiddenInset` on macOS). `Menu.setApplicationMenu(null)`
removes the stock bar. The same definitions are the only list the Ctrl+K palette
reads, so a command cannot exist in one and not the other - a unit test pins
that. Zoom works and is remembered: it acts on the window rather than on
whatever `webContents` has focus, which is why the stock View roles appeared
dead with the AI panel in front.

**Window state** - size, position and maximised - is remembered, and Maximize is
in the Window menu.

**Updates are checked on every launch in every channel**, two seconds in rather
than ten and no longer only when packaged.

**The smoke suite could not be released with.** It passed three times in a row
standalone and then failed inside `npm run push` — which runs it after the unit
tests and a build, on a loaded machine. `page.click` waits for an element to be
"stable", and it decides that with `requestAnimationFrame`; rAF stops firing
when the window is not being composited, so a button sitting perfectly still
timed out after thirty seconds and took the release with it. (Measured: the
button's box was identical across fourteen samples over five seconds.)

There are no `page.click` calls left. Fixture steps — "put the app in this
state" — call the handler directly; a mousedown listener gets a real mousedown;
and the shape bar, where hit-testing genuinely is the thing under test, is
clicked through `win.mouse` at the element's centre after asserting that the
element is what sits at that point. That last one is a **stronger** check than
`page.click` was, and it is what the position:fixed bar needed.

Three consecutive clean runs before the release was retried — and it failed
again, this time killed outright for low memory. So the suite now says which
kind of failure it had: **exit 1 is a check that failed, exit 2 is a run that
could not finish** (a Playwright wait timing out, a closed target). `npm run
push` stops immediately on a 1 and gives a 2 one more attempt, which is the
honest split — a real regression fails both times. A throw also leaves an
Electron instance alive, and this suite starts six of them, so the teardown is
in a `finally` now.

### [2026-09-07] v0.4.4 - ten things reported from the test build

**Unit 141 -> 156, smoke 59 -> 71.** One new suite, `find.test.js`.

**Ctrl+Z put the text back twice.** Chromium's undo stack only knows about edits
Chromium made. `applyFont` let `execCommand('fontName')` insert a `<font face>`
and then **replaced that element** with a span of its own - invisible to the
undo stack, so Ctrl+Z rolled back a different edit and the two states together
read as duplicated text. `styleWithCSS` makes the browser write the
`font-family` itself, so there is nothing left to rewrite. `wrapSelection` (all
the colours, inline code, the underline styles) had the same shape and now goes
through `insertHTML`, which is a real edit command. The check asserts the
editor's HTML after undo is **byte-identical to what it was before**, not merely
that the styling is gone - the duplication would have passed the weaker test.

**Ctrl+F did nothing.** `find.js` plus a bar in the note frame. Matches are
painted with the CSS Custom Highlight API rather than wrapped in `<mark>`:
marking them up would edit the note, dirty it, reach the autosave and land on
the undo stack. The check confirms the note's HTML is unchanged while eight
matches are lit.

**The sidebar filter only searched the first 500 characters** - it ran over
`plainSnippet(content, 500)`, so a word further down a long note could not be
found from the sidebar at all. It searches the whole body now.

**A shape's text became every note's preview.** Shape layers are the note's
first children, so "Heyoooo... drag me anywhere" was what the sidebar showed for
any note with a shape on it. `noteText` drops the layers - parsed with
DOMParser, not regexed, because `.shape-layer` holds nested divs and a pattern
matching a closing tag across them picks the wrong one. Two defects fell out of
writing it: `textContent` joins blocks with nothing at all, so a heading ran
straight into the paragraph under it ("Welcome to NebulaA calm place"), and a
long unbroken word widened the whole panel and put a sideways scrollbar under
the note list.

**A shape sent behind the text could not be picked up again** - it is painted
under the paragraph, so the paragraph took every click. `behindShapeAt`
hit-tests the back layer before the click becomes a caret. One click picks the
shape up, a second goes through to the text, so a large shape never makes the
paragraph over it permanently unclickable. **The check found a second bug in the
fix:** the document-level deselect handler bubbles last, saw a target that was
not a shape, and cleared the selection microseconds after it was made. Claimed
events are skipped now.

**The collapsed sidebar hid everything.** It kept only the toggle, which made
the narrow state useless - it is meant to give the page width, not take the app
away. The rail keeps the notes (as their initial, full title on hover), New note
as **+**, and all four themes.

**DeepSeek refused the embedded view** with "Abnormal usage environment". The UA
said `Electron/33`; the engine is the same Chromium those sites are built for,
so the views now report Chrome's own string with the Electron and Nebula tokens
removed.

**A fourth theme, White** - a plain white sheet with black ink, for checking a
note against what it will look like printed on A4. The highlight-contrast check
covers all four.

**Scrollbars** are thin and painted from the theme tokens; the browser default
was a light-mode grey stripe down the edge of a dark page.

### [2026-09-07] v0.4.3 — colours that survive a theme, and four things that were simply hard to use

**Unit 138 -> 141, smoke 50 -> 59.**

**Colours were frozen values.** `execCommand('foreColor')` writes a hex literal
into the note, and the palette was chosen against the warm light paper. Open the
same note on Main or Dark and a "yellow background" was a pale pastel sitting
under light ink — the highlight and the text ran into each other and neither
could be read. A colour is a **class** now (`c-red`, `h-yellow`), resolved
through three palettes in `tokens.css`: on the dark themes text is a bright tint
and a highlight is a deep block with light ink forced on it, so text colour and
background can never be chosen into an unreadable pair. `applyUnderline` was
already an exclusive-wrapper apply; it generalised to `applyExclusive(family,
class)` and the two colour families use it, so colours cannot nest either. The
custom hex picker is gone — it was exactly the frozen value this removes. Old
notes keep their inline colours and get a readability rule instead.

The smoke check reads the *computed* background and ink of a highlight in all
three themes and asserts both that the value changes and that the two stay far
apart in luminance — 0.68 / 0.68 / 0.77 against a floor of 0.35.

**Switching AI tabs logged you out.** The panel set `hidden` on the view you
were leaving, i.e. `display: none` — and an Electron `<webview>` that is
display:none is detached from its guest and comes back **reloaded**. That is why
sessions vanished, and why several mid-attach views looked like they were piling
up. Every view is now absolutely positioned in the same box and switching flips
`visibility`, so no guest is ever detached. The check asserts both views survive
a switch, exactly one is visible, none is display:none, and each keeps its own
`persist:` partition.

**Shapes were hard to grab.** `.shape-text` filled the whole shape and took the
press, so a drag could only start from the 1.6px border. The text is
`pointer-events: none` until a double-click puts the shape in `.editing`; the
body of the shape is a drag handle the rest of the time. The check drags from
the centre and asserts the shape actually moved 60x40. Their border was
`var(--ink)` — a pale outline around a pale fill with dark text inside it, three
values that never agreed; a shape fill is always one of six light pastels, so
the border and the ink are fixed dark tones and the check asserts the luminance
gap.

**The note list folds away** behind three lines beside "Nebula"
(`side-toggle.js`), remembered across restarts. The button is inside the panel
it hides, so `#app.side-collapsed .side > *:not(.brand)` is what keeps it
reachable — the check asserts the list reaches width 0 while the toggle does
not.

**The test vault was still full of the old notes.** Seeding never re-runs, so
`<repo>/Nebula-data` still held the six pre-0.4.2 `Test ·` notes next to the
guide. The whole vault was copied to `backups/before-guide-cleanup-<stamp>/`
first, then only those six were removed.

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

**Two things the release itself hit.** `pack:test` was killed mid-package when
the machine ran out of memory, so the tag and the GitHub build were fine but the
three post-tag steps were not — they are best-effort by design and each printed
how to retry, which is what happened. Then the retry lost a race: `npm run kill`
runs at the *start* of `pack:test`, packaging takes about two minutes, and the
app was opened again inside that window, so the final copy hit EBUSY and the
whole refresh was thrown away at the last step. `place-test-exe.js` now closes a
copy that appeared during the build and retries once before giving up.

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

- Local report-copy verification: H3 changes only the reported paragraph; Backspace removes the slash beside its divider; the source note remains byte-identical. Private fixtures and the probe stay under test-results/.
