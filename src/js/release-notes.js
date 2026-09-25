/**
 * What each release changed, in the words of someone using the app.
 *
 * This is shown once per version, in the middle of the screen, the first time
 * a build runs — an update that arrives silently gives no reason to look for
 * what it fixed, and the reports that drive this project are written by
 * someone who has to notice.
 *
 * Keep the lines short and about what the reader can now DO. No version
 * numbers inside the text, no internals: "a code block can be deleted with
 * Backspace", not "codeBlockIn walks outward".
 *
 * A version with no entry here simply shows nothing.
 */
export const RELEASE_NOTES = {
  '0.8.5': {
    headline: 'Link any words, caption images, and YouTube links play in the note.',
    items: [
      { title: 'Link words', text: 'Select words and paste a URL over them, or press the link button in the toolbar. Ctrl+click a link to open it. An empty address takes a link off.' },
      { title: 'Image captions', text: 'Select an image and press Aa on its bar to write a caption under it. The caption moves with the image; Enter takes you back to your text.' },
      { title: 'Videos, not whole pages', text: 'Embed a YouTube or Vimeo link and you get the player, sized for video. A start time in the link is kept. Videos embedded earlier switch to the player when the note opens.' },
      { title: 'Leaving a quote', text: 'Press Enter on an empty line of a quote to carry on writing outside it, the way a list works.' },
      { title: 'Bold and italic stay off', text: 'Turn italic or bold off at the end of a line and press Enter: the next line starts plain.' },
      { title: 'Dividers stay on their own line', text: 'A divider added with the slash menu on an empty line no longer takes the next heading inside it.' },
    ],
  },
  '0.8.4': {
    headline: 'Slash commands work on every line you type, and arrows can be deleted.',
    items: [
      { title: 'Headings and lists on any line', text: 'Heading, list and quote commands now work on a line typed after a heading, not only on the first line of a note.' },
      { title: 'The angle leaves when you let go', text: 'The degrees show while a shape turns and disappear when you release it. Old notes that kept a stray number are cleaned when opened.' },
      { title: 'Delete an arrow', text: 'Click an arrow so it lights up, then press Delete or Backspace.' },
      { title: 'Safer note import', text: 'An imported Nebula note can no longer run anything. A note file copied straight out of another Nebula can be imported as it is.' },
    ],
  },
  '0.8.3': {
    headline: 'Slash commands stay on one line, and a note can move to another Nebula.',
    items: [
      { title: 'Headings and lists stay put', text: 'A slash command changes only the line you are on. A divider no longer slides inside a list, and Backspace deletes a slash instead of jumping to the rule.' },
      { title: 'Headings line up with the text', text: 'Heading 1, 2 and 3 start at the same left edge as a paragraph.' },
      { title: 'The window buttons match the bar', text: 'Minimise, maximise and close sit on the same strip as the menus, and the line under them runs along the bottom.' },
      { title: 'Shapes show their angle', text: 'While you turn a shape, the angle is shown in degrees.' },
      { title: 'Arrows', text: 'Straight, elbow and curved arrows sit with the shapes. Drag either end onto a shape, a link, an image or a line of text.' },
      { title: 'Embeds open the real page', text: 'An embed loads in its own view, so a site that refuses a frame can still show its page and its sign-in form. If a chat still calls this app insecure, use Sign in in browser.' },
      { title: 'Move a note intact', text: 'Export as a Nebula note and import that file in the other copy. Shapes, images and embeds come with it. Older notes are repaired when you open them.' },
    ],
  },
  // v0.8.1 was tagged but its Mac CI check failed, so it never published;
  // these notes ship with the next release instead.
  '0.8.2': {
    headline: 'Links, images and Mac upgrade instructions checked more deeply.',
    items: [
      { title: 'Link blocks behave like edits', text: 'Cards insert at your selection, can be deleted and support undo/redo. Embed now loads a sandboxed preview with an external-link fallback for sites that block it.' },
      { title: 'Safer image paste and editing', text: 'A pending image cannot land in another note after you switch. Corrupt images are rejected, proportions are preserved, and HTML imports keep safe image positions and sizes.' },
      { title: 'Caret and update guidance', text: 'Leaving inline formatting no longer jumps over preceding text. The Mac guide explains saving, backing up, replacing the app, security warnings and checking the new version.' },
    ],
  },
  '0.8.0': {
    headline: 'Links and images now paste like real note blocks.',
    items: [
      {
        title: 'Paste links four ways',
        text: 'Paste a web link and choose Embed, Bookmark, URL or Mention. The same four choices are available from the slash menu.',
      },
      {
        title: 'Images can float over a note',
        text: 'Copy or drop an image into a note, then drag it, resize it, or send it behind and bring it back above your text.',
      },
      {
        title: 'Backspace keeps the caret steady',
        text: 'Leaving inline formatting at the start of a line keeps the caret on the first visible character instead of jumping to the block edge.',
      },
    ],
  },
  '0.7.7': {
    headline: 'The last divider and code-block details are tidier.',
    items: [
      {
        title: 'Backspace closes divider gaps first',
        text: 'When a blank line sits between your text and a divider, the first Backspace removes that gap. The divider is selected only on the next press, and the caret stays at the text line.',
      },
      {
        title: 'The code hint gets out of the way',
        text: 'The Markdown-style editing hint is easier to read, disappears as soon as you type source, and stays hidden for code that already has content.',
      },
    ],
  },
  '0.7.6': {
    headline: 'The remaining editing problems in the two report notes.',
    items: [
      {
        title: 'Backspace joins the old note lines',
        text: 'Invisible shape layers no longer sit between ordinary text lines. Older highlighted and underlined text gets a proper paragraph you can click and type into.',
      },
      {
        title: 'Underline uses the colour of its words',
        text: 'The line follows coloured text, including wavy underline. Removing the underline keeps the other formatting.',
      },
      {
        title: 'Shape text can be erased normally',
        text: 'Backspace removes characters inside a shape instead of being blocked by the protection for the whole shape. Undo restores the text.',
      },
      {
        title: 'Close the gap before removing a divider',
        text: 'Backspace removes the empty line first, selects the divider next, and removes it only on the following press, including in older nested notes.',
      },
      {
        title: 'More room inside the code language picker',
        text: 'The box sits closer to the left edge, with space between its own edge and the language name.',
      },
    ],
  },
  '0.7.5': {
    headline: 'Safer saving, precise formatting, and shapes that follow the pointer.',
    items: [
      {
        title: 'Unsaved changes stay visible',
        text: 'Failed saves offer a retry. Closing waits for your latest title and text, and stays open if saving fails. Updates also stop if the safety backup cannot be made.',
      },
      {
        title: 'Edits stay with the right note',
        text: 'Archiving or switching immediately after typing no longer sends pending changes to the next note.',
      },
      {
        title: 'Formatting changes exactly what you selected',
        text: 'Repeated words, older underline marks and turning a style off at the cursor are handled precisely. Colour menus remain clickable on every side of the window.',
      },
      {
        title: 'The lowest shape moves up normally',
        text: 'Dragging a shape up from the bottom no longer scrolls the paper in the opposite direction and makes the shape look stuck.',
      },
      {
        title: 'Markdown keeps more of your note',
        text: 'Export keeps wrapped text and blank lines inside code. Code containing backticks can be imported again without cutting the block short.',
      },
    ],
  },
  '0.7.4': {
    headline: 'Underline switches off, and the shape names are visible.',
    items: [
      {
        title: 'Underline, colour and highlight switch off on a new line',
        text: 'Formatting carries across Enter, and these controls need a '
          + 'selection — so on a fresh empty line there was nothing to select '
          + 'and no way to turn the mark off. Every line after an underlined one '
          + 'came out underlined.',
      },
      {
        title: 'The shape names are readable again',
        text: 'They were in the menu the whole time at zero width, squeezed out '
          + 'when the menu was made narrower.',
      },
      {
        title: 'Untitled 2',
        text: 'A copy of your bug report note, built from scratch in the test '
          + 'build with the mouse and keyboard, to compare against.',
      },
    ],
  },
  '0.7.3': {
    headline: 'Built the note by hand, and fixed what that turned up.',
    items: [
      {
        title: 'Clicking a shape no longer jumps to the top',
        text: 'The view stayed where it was measured at; a change in the last '
          + 'release had been throwing it to the top of the note on every click.',
      },
      {
        title: 'Lists, to-dos and dividers stay separate blocks',
        text: 'Making a bulleted list, then a numbered one, then a to-do used to '
          + 'end with one to-do holding all of them — and a divider inserted '
          + 'inside it. Each is its own block now.',
      },
      {
        title: 'Enter on an empty to-do ends the run',
        text: 'The only way out before was to keep making empty to-dos.',
      },
      {
        title: 'A divider is always a line of its own',
        text: 'It went wherever the cursor was, including inside a to-do.',
      },
    ],
  },
  '0.7.2': {
    headline: 'Toolbar marks that tell the truth, and one outline weight.',
    items: [
      {
        title: 'Bold no longer looks stuck',
        text: 'With the cursor next to a bold word the Bold button lit up on '
          + 'plain text. The marks now show what the cursor is standing in.',
      },
      {
        title: 'Underline shows at the start of a line',
        text: 'At the very beginning of an underlined line there was no mark at '
          + 'all, because the cursor sits just outside the underline there.',
      },
      {
        title: 'A blank line under a divider goes first',
        text: 'The divider was offered while the empty row beneath it stayed put, '
          + 'so the gap could never be closed. The row goes, then the divider.',
      },
      {
        title: 'Every shape has the same outline',
        text: 'The diamond and triangle are stroked properly now instead of being '
          + 'drawn as a fill inset from the edge, which made their line a '
          + 'different weight from the square’s and thinner at a sharp corner.',
      },
      {
        title: 'A shape no longer moves the bottom of the note',
        text: 'While one is being dragged the note holds its size, so the page '
          + 'does not shift under your hand.',
      },
    ],
  },
  '0.7.1': {
    headline: 'Deleting near a shape, and dragging one, both behave.',
    items: [
      {
        title: 'No delete key can take your shapes',
        text: 'Pressing Backspace twice just before a line that sat under a '
          + 'shape removed every shape in the note. The rule was working out '
          + 'which element WOULD go; it now asks the browser what is actually '
          + 'about to be deleted.',
      },
      {
        title: 'A divider really does take two presses',
        text: 'The first highlights it, the second removes it.',
      },
      {
        title: 'Shapes drag freely again',
        text: 'A limit added in the last release threw a tall shape upwards on '
          + 'the first pixel of movement and then would not let it come back '
          + 'down. It is gone.',
      },
    ],
  },
  '0.7.0': {
    headline: 'Blank lines that are really blank, and a resize that stops.',
    items: [
      {
        title: 'Blank lines behave again',
        text: 'A line you cleared kept the underline, highlight and colour it '
          + 'used to carry, as empty wrappers a few pixels wide. The cursor '
          + 'vanished inside them and anything typed there came out formatted. '
          + 'They are emptied when the note opens.',
      },
      {
        title: 'The AI panel stops resizing when you let go',
        text: 'Dragging its edge over the panel itself meant the release was '
          + 'never seen, so it kept growing until you clicked again.',
      },
      {
        title: 'One line weight for every shape, at every size',
        text: 'The diamond and triangle outlines were set as a percentage, so '
          + 'they grew thicker as the shape did.',
      },
      {
        title: 'A divider takes two presses',
        text: 'The first highlights it, the second removes it — so you can bring '
          + 'a block up close to a divider without losing it.',
      },
      {
        title: 'The code block language sits with the code',
        text: 'It was lined up with the block edge instead.',
      },
      {
        title: 'A shape stays inside the note',
        text: 'Dragging one below the last paragraph used to pull the bottom of '
          + 'the note down with it, and shove it back up on the way home.',
      },
    ],
  },
  '0.6.9': {
    headline: 'Shapes you can turn, and an export with margins on every page.',
    items: [
      {
        title: 'Shapes rotate',
        text: 'A second grip at the bottom-left turns the shape; hold Shift to '
          + 'snap to fifteen degrees.',
      },
      {
        title: 'The shape menu shows the shapes',
        text: 'Each row is drawn as the shape it makes, in the same line weight, '
          + 'instead of the nearest character a font happened to have.',
      },
      {
        title: 'One line weight for every shape',
        text: 'The diamond read as heavier than the square and the triangle went '
          + 'thin at its point, because the outline was a box inset rather than a '
          + 'line drawn parallel to each edge.',
      },
      {
        title: 'Backspace cannot swallow your shapes',
        text: 'Pressing it beside a shape layer removed every shape in the note '
          + 'in one keystroke.',
      },
      {
        title: 'Exported pages keep their margins',
        text: 'All four 1.27 cm margins now hold on every page, not only the '
          + 'first. The note is printed as a document of its own rather than as a '
          + 'picture of the window.',
      },
      {
        title: 'The website says what this build is',
        text: 'Its "Right now" line had been stuck several releases back.',
      },
    ],
  },
  '0.6.8': {
    headline: 'Lists that line up, Enter in code blocks, and a clean page edge.',
    items: [
      {
        title: 'Bullets and numbers start in the same column',
        text: 'A bullet and a "1." were pushed apart because a list marker is '
          + 'right-aligned by default. They are drawn in a fixed column now, so '
          + 'even "10." begins where the bullet does.',
      },
      {
        title: 'Enter works inside a code block',
        text: 'It did nothing at all: the newline was being handed to the browser '
          + 'in a way it quietly discards.',
      },
      {
        title: 'Nothing selected, nothing changed',
        text: 'A colour picked with no selection used to recolour the whole line, '
          + 'like the font did. Both leave the line alone now. Text no longer '
          + 'changes size on its own in places you never touched.',
      },
      {
        title: 'Highlighting does not nudge the line',
        text: 'Applying a background shifted every following word sideways and '
          + 'shifted it back when removed.',
      },
      {
        title: 'A clean page edge in exports',
        text: 'The thin dark line along the top of every exported page is gone.',
      },
      {
        title: 'Shapes and the toolbar',
        text: 'A shape cannot be dragged smaller than the words inside it, the '
          + 'shape menu marks are bolder, and the size box shows what it is about '
          + 'to change while you type in it.',
      },
      {
        title: 'The cursor stays in the note',
        text: 'Holding the up arrow at the top used to carry it out of the page '
          + 'entirely, somewhere nothing you typed would land.',
      },
    ],
  },
  '0.6.7': {
    headline: 'Switches that switch off, and one typeface for the whole app.',
    items: [
      {
        title: 'Underline and highlight turn off again',
        text: 'Pressing Underline on underlined text removes it, the way Bold '
          + 'always has. Picking a highlight you already have clears it.',
      },
      {
        title: 'A font only changes what you selected',
        text: 'Picking a font with nothing selected no longer restyles the whole '
          + 'line.',
      },
      {
        title: 'Empty lines have a cursor again',
        text: 'A blank line written by the app had no height and no caret, so '
          + 'clicking it put the cursor nowhere you could see.',
      },
      {
        title: 'Shapes',
        text: 'Square and circle join the set, the button repeats whichever kind '
          + 'you chose last, double-clicking the text selects all of it, and bold, '
          + 'italic and underline work inside a shape. Arrow keys no longer walk '
          + 'the cursor into one.',
      },
      {
        title: 'Exports use A4 with narrow margins',
        text: '1.27 cm on all four sides, the note title at the top, and no dark '
          + 'band around the page.',
      },
      {
        title: 'One typeface',
        text: 'The panels, menus and code-block labels are set in the same face as '
          + 'the Nebula wordmark. Only code itself stays monospaced.',
      },
      {
        title: 'Opening it on a Mac',
        text: 'macOS says it cannot verify the app, because registering with Apple '
          + 'costs money and Nebula is not registered. The release page now names '
          + 'exactly which two clicks get past the dialog — you do it once.',
      },
    ],
  },
  '0.6.4': {
    headline: 'Deleting, underlining, and a tidier toolbar.',
    items: [
      {
        title: 'Code blocks delete with Backspace',
        text: 'Press Backspace at the start of the line under a code block and the '
          + 'block goes, even when a colour or a font was applied around it — which '
          + 'is what put the block and that line inside the same wrapper and made it '
          + 'unreachable before.',
      },
      {
        title: 'The underline button lights up',
        text: 'Underline now shows as active in the toolbar the way Bold and Italic '
          + 'do, and Ctrl+U makes the same underline the button makes.',
      },
      {
        title: 'A smaller size box',
        text: 'The font size list drops the repeated "px", the field is narrower, and '
          + 'its arrow sits next to the number instead of across a gap.',
      },
      {
        title: 'The collapsed note list',
        text: 'The theme buttons no longer show stray lines down their side when the '
          + 'list is narrowed.',
      },
      {
        title: 'This screen',
        text: 'Every update now says what changed. Help → What’s new opens it again.',
      },
    ],
  },
  '0.6.3': {
    headline: 'What the old notes were still holding.',
    items: [
      {
        title: 'Old notes are brought up to date when they open',
        text: 'A shape saved with more text than it had room for is measured again, '
          + 'so it grows instead of clipping what you typed.',
      },
      {
        title: 'Underlining across two paragraphs works',
        text: 'It used to apply and underline nothing at all, and split the paragraph '
          + 'you started in.',
      },
      {
        title: 'Exported PDFs are white to the edge',
        text: 'The dark frame around the page is gone.',
      },
    ],
  },
};

/** The notes for a version, or null when there is nothing to say about it. */
export function notesFor(version, all = RELEASE_NOTES) {
  if (!version) return null;
  const key = String(version).replace(/^v/, '');
  const entry = all[key];
  return entry && entry.items?.length ? { version: key, ...entry } : null;
}

/**
 * Whether to open the dialog.
 *
 * `seen` is the version this vault last acknowledged. No stored value means an
 * install that predates this feature — which is an update, so it shows.
 */
export function shouldShow(version, seen, all = RELEASE_NOTES) {
  if (!notesFor(version, all)) return false;
  return String(seen ?? '') !== String(version).replace(/^v/, '');
}
