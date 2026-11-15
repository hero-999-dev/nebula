/**
 * The guide page: every release adds its features to it, and a vault whose
 * guide nobody wrote in gets the new one in place. That only works while each
 * shipped guide's text signature is on record, so this fails until it is.
 */
import { describe, it, expect } from 'vitest';
import { GUIDE_NOTE, GUIDE_VERSION, GUIDE_SIGNATURES, guideSignature, guideUnedited } from '../src/js/seed-notes.js';

describe('guide versions', () => {
  it('records the signature of the guide that ships (bump GUIDE_VERSION and add it when the text changes)', () => {
    expect(GUIDE_SIGNATURES[GUIDE_VERSION]).toBe(guideSignature(GUIDE_NOTE.content));
  });

  it('still knows the 0.6.0 guide, so vaults from then are brought up to date', () => {
    expect(GUIDE_SIGNATURES['0.6.0']).toMatch(/^[0-9a-f]{8}$/);
  });

  it('ignores what the app changes (markup, rendered code and equations) but not typed words', () => {
    const restyled = GUIDE_NOTE.content
      .replace('<h1>Welcome to Nebula</h1>', '<h1 class="x" style="color:red">Welcome to Nebula</h1>')
      .replace('<code class="code-src" contenteditable="true" spellcheck="false"></code>', '<code class="code-src">painted code</code>');
    expect(guideUnedited(restyled)).toBe(true);
    expect(guideUnedited(GUIDE_NOTE.content.replace('<h1>Welcome to Nebula</h1>', '<h1>Welcome to Nebula</h1><p>my note</p>'))).toBe(false);
  });
});

describe('guide page', () => {
  const doc = new DOMParser().parseFromString(`<body>${GUIDE_NOTE.content}</body>`, 'text/html');

  // 1.0.4, the owner: "the shapes at the very top should go, they should have a place of their own in the guide".
  it('keeps its demo shapes on a stage of their own in the section about shapes, clear of the text at any width', () => {
    const stage = doc.querySelector('.guide-stage');
    expect(stage).not.toBeNull();
    expect(doc.body.firstElementChild.tagName).toBe('H1');
    expect(doc.querySelector('body > .shape-layer')).toBeNull();
    expect(stage.parentElement.matches('.blk-toggle > .toggle-body')).toBe(true);
    expect(stage.parentElement.previousElementSibling.textContent).toBe('6 · Shapes and arrows');
    expect(stage.previousElementSibling).toBeNull();
    // Its two layers are in it, the one behind first: a shape is placed from the stage.
    expect([...stage.children].map((el) => el.className)).toEqual(['shape-layer shape-layer--behind', 'shape-layer']);
    expect(doc.querySelectorAll('.shape')).toHaveLength(3);
    expect(stage.querySelectorAll('.shape')).toHaveLength(3);
    for (const shape of doc.querySelectorAll('.shape')) {
      const top = parseFloat(shape.style.top); const h = parseFloat(shape.style.height);
      const left = parseFloat(shape.style.left); const w = parseFloat(shape.style.width);
      expect(top + h).toBeLessThanOrEqual(136);      // .guide-stage height
      expect(left + w).toBeLessThanOrEqual(560);     // fits a narrow window's page
    }
  });

  it('covers every feature since 0.6.0, the current release’s among them, each in the section it belongs to', () => {
    // Named by the words of the section that tells of each: no release has a list of its own in the page (1.0.4).
    const text = doc.body.textContent;
    for (const added of ['A timer in the Clock', 'A World clock and the Weather', 'A smaller corner card', 'Size on this computer', 'A box inside one column', 'Send to…', 'Widgets from the editing bar', 'Tabs over the note']) {
      expect(text.split(added), added).toHaveLength(2);   // once: in its section
    }
    for (const feature of ['Five themes', 'Save this profile', 'Matcha', 'two columns', 'beside the picture before it', 'Keep awake', 'a folder of its own', 'A video file of your own', 'Black holes', 'AES-256', 'recovery key', 'Open with', 'violet document icon', 'Your privacy', 'Add a font', 'Arrows', 'angle shows', 'Link any words', 'Ctrl+click', 'Videos', 'caption', 'behind the text', 'one canvas', 'Rust', 'Nebula note (.json)', 'Bookmark',
      'Embed', 'Ctrl+Shift+V', 'Only view', 'F12', 'snaps', 'Ctrl+F', 'Ctrl+K', 'Archive', 'Restore', 'Pin to top', 'The / menu', 'Quotes and dividers', 'Import', 'PDF', 'Labels', 'four corner handles', 'Signing in with Google',
      'Older notes are brought up to date', 'pre-heal', 'Pictures\\Nebula', 'Deleted is deleted', 'A page in a note that asks',
      // Told only in the removed lists until they were written into sections (owner, 1.0.4: "write the sections they belong to").
      'Settings in tabs', 'The German dash', 'Taller columns', 'as one zip', 'New project', 'A map that stays put', 'Notes side by side',
      'only its initials', 'Black holes ask before they destroy', 'Words or blocks', 'Appearance, seen first', 'scientific calculator',
      'Pomodoro, your way', 'Days with events', 'Tailscale sync']) {
      expect(text).toContain(feature);
    }
  });
});

describe('guide order (owner, 0.8.9)', () => {
  const doc = new DOMParser().parseFromString(`<body>${GUIDE_NOTE.content}</body>`, 'text/html');
  const h2 = [...doc.querySelectorAll('h2')].map((h) => h.textContent);

  it('ends with Where your notes live as 19 and Code blocks as 20, the last section', () => {
    // Your privacy is 9 since 0.9.4, a page that asks 10 since 0.9.6, projects and the Universe 11 since 1.0.0;
    // a Universe in a note, panes you can size and the black holes' own scroll are 12–14 since 1.0.0;
    // several blocks at once and a picture of your own are 15–16 since 1.0.3; widgets and syncing are 17–18
    // since 1.0.4; the last two keep their places at the end.
    expect(h2.at(-12)).toBe('9 · Your privacy');
    expect(h2.at(-11)).toBe('10 · A page in a note that asks');
    expect(h2.at(-10)).toBe('11 · Projects and the Universe');
    expect(h2.at(-9)).toBe('12 · A Universe of your own');
    expect(h2.at(-8)).toBe('13 · Panes you can size');
    expect(h2.at(-7)).toBe('14 · Black holes scroll on their own');
    expect(h2.at(-6)).toBe('15 · Several blocks at once');
    expect(h2.at(-5)).toBe('16 · A picture of your own');
    expect(h2.at(-4)).toBe('17 · Widgets');
    expect(h2.at(-3)).toBe('18 · Your notes on all your devices');
    expect(h2.at(-2)).toBe('19 · Where your notes live');
    expect(h2.at(-1)).toBe('20 · Code blocks');
  });

  it('opens the code samples with Markdown', () => {
    const codeHeading = [...doc.querySelectorAll('h2')].find((h) => h.textContent === '20 · Code blocks');
    expect(codeHeading.nextElementSibling.querySelector(':scope > h3').textContent).toBe('Markdown');
  });

  it('parts the sections by their arrows: every section heading is a toggle’s, and a divider closes the welcome (owner, 0.8.9 and 1.0.4)', () => {
    for (const h of doc.querySelectorAll('h2')) expect(h.parentElement.matches('body > .blk-toggle') && !h.previousElementSibling, h.textContent).toBe(true);
    // The first of the folded ones is parted from the welcome.
    expect(doc.querySelector('body > .blk-toggle').previousElementSibling.matches('hr.blk-hr')).toBe(true);
  });

  // 1.0.4, the owner: "only the latest update should show under what is new,
  // and the guide's pages should be friendlier: toggles for the categories".
  // Later the same day: "what is new already says what it is; adding what was added to the guide is our part".
  it('holds no list of a release, the newest one’s neither: Help → What’s new tells that, the sections explain it', () => {
    expect(doc.querySelector('body > h2')).toBeNull();
    expect([...doc.querySelectorAll('h2')].filter((h) => !/^\d+ · /.test(h.textContent))).toEqual([]);
    expect(doc.body.textContent).not.toContain('New in ');
    expect(doc.querySelector('body > .blk-toggle > h2').textContent).toBe('1 · The window and your notes');
    expect(doc.querySelector('.toggle-title')?.textContent).toBe('Click the arrow to fold this away');   // section 4's own, the only plain toggle
  });

  it('every numbered section is a folded toggle heading, and nothing of the page stands outside them but its opening', () => {
    const sections = [...doc.querySelectorAll('body > .blk-toggle')].filter((t) => /^\d/.test(t.firstElementChild.textContent));
    expect(doc.querySelectorAll('body > .blk-toggle')).toHaveLength(20);
    expect([...doc.body.children].map((el) => el.tagName).join(' ')).toBe(`H1 P P P P HR${' DIV'.repeat(20)}`);
    expect(sections.map((t) => t.firstElementChild.textContent.split(' · ')[0])).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 1)));
    for (const t of sections) {
      expect(t.hasAttribute('data-open'), t.firstElementChild.textContent).toBe(false);
      expect(t.children).toHaveLength(2);
      expect(t.lastElementChild.matches('.toggle-body')).toBe(true);
      expect(t.lastElementChild.children.length).toBeGreaterThan(0);
    }
    expect(doc.body.lastElementChild).toBe(sections.at(-1));
    // The page says so before the first of them.
    expect(doc.querySelector('body > hr').previousElementSibling.textContent).toContain('Every section below is folded');
  });

  it('is locked when it is seeded', () => {
    expect(GUIDE_NOTE.readOnly).toBe(true);
  });
});
