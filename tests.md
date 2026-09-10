# Tests

What is tested, what each test proves, and what is knowingly untested.

| | |
|---|---|
| **Unit** | 303 passing — `npm test` (Vitest, jsdom) |
| **Electron smoke** | 160 passing — `npm run build && npm run smoke` (playwright-core, real app, throwaway profiles) |
| **Failing** | 0 |
| **CI** | `.github/workflows/test.yml` on push/PR · smoke + packaging assertions in `release.yml` |

Unit tests cover pure logic. The smoke test covers what jsdom structurally
cannot see: the preload bridge, the main process, the filesystem, and boot.

---

## Suites

| File | Tests | Proves |
|---|---|---|
| `tests/notes.test.js` | 20 | `NoteStore` seeds once (not once per note), creates/switches/updates, refuses to delete the last note, filters title + body, and adds the guide to an older vault exactly once without touching what is there |
| `tests/editor.test.js` | 41 | Toolbar actions, outline formats, indent, underline styles, code blocks, shapes, slash menu, icons, the font stacks, and the guide note's completeness |
| `tests/lists.test.js` | 30 | The tree Chromium's list commands actually leave behind, and leaving a list from an empty item |
| `tests/migrate.test.js` | 30 | Bringing a stored note up to what this version writes |
| `tests/release-notes.test.js` | 17 | What each release says for itself |
| `tests/inline-format.test.js` | 18 | Enter and Backspace out of an inline wrapper |
| `tests/highlight.test.js` | 14 | Per-language tokens, and that only SQL is case-insensitive |
| `tests/disk-store.test.js` | 6 | Rapid saves serialize per file, every mirrored file is valid JSON, deleting a note deletes *its* file, unchanged notes are skipped, boot loads from disk and survives one corrupt file, browser mode never throws |
| `tests/seed-guard.test.js` | 10 | The distinction between an empty vault and an unreadable one |
| `tests/user-data.test.js` | 8 | Which vault each build channel gets, and which one may replace itself |
| `tests/version-compare.test.js` | 7 | `0.3.10 > 0.3.9`, `v` prefixes, pre-releases, unparseable tags refuse rather than guess |
| `tests/find.test.js` | 9 | Finding text in a note without editing it |
| `tests/history.test.js` | 21 | The editor's own undo stack |
| `tests/notes-archive.test.js` | 14 | Pin, archive, trash and restore |
| `tests/app-menu.test.js` | 10 | The five menus, and that the palette reads them |
| `tests/export.test.js` | 18 | A note as Markdown or as a standalone HTML file |
| `tests/import.test.js` | 18 | A Markdown or HTML file read back as a note, sanitised |
| `tests/e2e/smoke.mjs` | 160 | The real app, six launches |

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
