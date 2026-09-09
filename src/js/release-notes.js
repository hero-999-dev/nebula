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
