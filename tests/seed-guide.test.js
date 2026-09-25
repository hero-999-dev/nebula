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

  it('keeps its demo shapes on their own stage above the text, clear of it at any width', () => {
    const stage = doc.querySelector('.guide-stage');
    expect(stage).not.toBeNull();
    expect(stage.nextElementSibling.tagName).toBe('H1');
    for (const shape of doc.querySelectorAll('.shape')) {
      const top = parseFloat(shape.style.top); const h = parseFloat(shape.style.height);
      const left = parseFloat(shape.style.left); const w = parseFloat(shape.style.width);
      expect(top + h).toBeLessThanOrEqual(136);      // .guide-stage height
      expect(left + w).toBeLessThanOrEqual(560);     // fits a narrow window's page
    }
  });

  it('tells what the current release added, and covers every feature since 0.6.0', () => {
    const text = doc.body.textContent;
    expect(text).toContain(`New in ${GUIDE_VERSION}`);
    for (const feature of ['Four themes', 'Arrows', 'angle shows', 'Link any words', 'Ctrl+click', 'Videos', 'caption', 'behind the text', 'one canvas', 'Rust', 'Nebula note (.json)', 'bookmark']) {
      expect(text).toContain(feature);
    }
  });
});
