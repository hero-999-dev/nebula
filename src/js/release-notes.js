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
