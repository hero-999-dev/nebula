/**
 * Getting out of an inline format.
 *
 * The reported bug: apply inline code, press Enter, and the next line is still
 * code with no way back. Backspace should be the way back — that is what it
 * does in every other note app.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  wrapperAt, isEmptyWrapper, unwrap,
  caretAtWrapperStart, caretAtWrapperEnd,
  enterOutOfWrapper, backspaceOutOfWrapper,
} from '../src/js/inline-format.js';

let root;

/** jsdom's Selection needs the nodes to be in the live document. */
function mount(html) {
  root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

/** Put a collapsed caret at `offset` inside the first text node of `sel`. */
function caret(selector, offset) {
  const host = root.querySelector(selector) ?? root;
  const text = host.firstChild;
  const range = document.createRange();
  range.setStart(text, offset);
  range.collapse(true);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(range);
  return s;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('wrapperAt', () => {
  it('finds every wrapper kind', () => {
    for (const cls of ['inline-code', 'inline-eq', 'u-single', 'u-wavy', 'u-dash']) {
      mount(`<p>a<span class="${cls}">x</span></p>`);
      const span = root.querySelector(`.${cls}`);
      expect(wrapperAt(span.firstChild, root)?.className).toBe(cls);
    }
  });

  it('returns null outside a wrapper', () => {
    mount('<p>plain</p>');
    expect(wrapperAt(root.querySelector('p').firstChild, root)).toBeNull();
  });

  it('refuses a wrapper that is not inside the editor', () => {
    mount('<p>a</p>');
    const stray = document.createElement('span');
    stray.className = 'inline-code';
    stray.textContent = 'x';
    document.body.appendChild(stray);
    expect(wrapperAt(stray.firstChild, root)).toBeNull();
  });
});

describe('caret position inside a wrapper', () => {
  it('knows the start and the end', () => {
    mount('<p><span class="inline-code">code</span></p>');
    const span = root.querySelector('.inline-code');
    const r = document.createRange();

    r.setStart(span.firstChild, 0); r.collapse(true);
    expect(caretAtWrapperStart(r, span)).toBe(true);
    expect(caretAtWrapperEnd(r, span)).toBe(false);

    r.setStart(span.firstChild, 4); r.collapse(true);
    expect(caretAtWrapperEnd(r, span)).toBe(true);
    expect(caretAtWrapperStart(r, span)).toBe(false);

    r.setStart(span.firstChild, 2); r.collapse(true);
    expect(caretAtWrapperStart(r, span)).toBe(false);
    expect(caretAtWrapperEnd(r, span)).toBe(false);
  });
});

describe('isEmptyWrapper / unwrap', () => {
  it('an empty span and one holding only a break are both empty', () => {
    mount('<p><span class="inline-code"></span><span class="u-single"><br></span></p>');
    expect(isEmptyWrapper(root.querySelector('.inline-code'))).toBe(true);
    expect(isEmptyWrapper(root.querySelector('.u-single'))).toBe(true);
  });

  it('unwrap keeps the text and drops the element', () => {
    mount('<p>a<span class="inline-code">code</span>b</p>');
    unwrap(root.querySelector('.inline-code'));
    expect(root.querySelector('.inline-code')).toBeNull();
    expect(root.textContent).toBe('acodeb');
  });
});

describe('Enter', () => {
  it('builds a plain next block when the wrapper ends the line', () => {
    mount('<p><span class="inline-code">code</span></p>');
    const sel = caret('.inline-code', 4);
    expect(enterOutOfWrapper(root, sel)).toBe(true);

    expect(root.children.length).toBe(2);
    expect(root.children[1].tagName).toBe('P');
    expect(root.children[1].querySelector('.inline-code')).toBeNull();
    expect(wrapperAt(sel.getRangeAt(0).startContainer, root)).toBeNull();
  });

  it('leaves a caret in the middle alone — that is a real split', () => {
    mount('<p><span class="inline-code">code</span></p>');
    const sel = caret('.inline-code', 2);
    expect(enterOutOfWrapper(root, sel)).toBe(false);
    expect(root.children.length).toBe(1);
  });

  it('leaves it to the browser when text follows the wrapper', () => {
    mount('<p><span class="inline-code">code</span>tail</p>');
    expect(enterOutOfWrapper(root, caret('.inline-code', 4))).toBe(false);
  });

  it('does not touch list items — <li> has its own Enter', () => {
    mount('<ul><li><span class="u-single">x</span></li></ul>');
    expect(enterOutOfWrapper(root, caret('.u-single', 1))).toBe(false);
  });

  it('keeps a heading from producing another heading', () => {
    mount('<h2><span class="inline-code">t</span></h2>');
    enterOutOfWrapper(root, caret('.inline-code', 1));
    expect(root.children[1].tagName).toBe('P');
  });

  it('carries the indent level to the new paragraph', () => {
    mount('<p data-ind="2"><span class="inline-code">c</span></p>');
    enterOutOfWrapper(root, caret('.inline-code', 1));
    expect(root.children[1].dataset.ind).toBe('2');
  });

  it('does nothing outside a wrapper', () => {
    mount('<p>plain</p>');
    expect(enterOutOfWrapper(root, caret('p', 5))).toBe(false);
  });
});

describe('Backspace', () => {
  it('removes the format at the start of a wrapper and keeps the text', () => {
    mount('<p>a<span class="inline-code">code</span></p>');
    const sel = caret('.inline-code', 0);
    expect(backspaceOutOfWrapper(root, sel)).toBe(true);
    expect(root.querySelector('.inline-code')).toBeNull();
    expect(root.textContent).toBe('acode');
  });

  it('removes an empty wrapper outright — the line Enter carried down', () => {
    mount('<p><span class="u-wavy"></span></p>');
    const range = document.createRange();
    range.setStart(root.querySelector('.u-wavy'), 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    expect(backspaceOutOfWrapper(root, sel)).toBe(true);
    expect(root.querySelector('.u-wavy')).toBeNull();
  });

  it('does NOT hijack Backspace in the middle of a wrapper', () => {
    mount('<p><span class="inline-code">code</span></p>');
    expect(backspaceOutOfWrapper(root, caret('.inline-code', 2))).toBe(false);
    expect(root.querySelector('.inline-code')).not.toBeNull();
  });

  it('does nothing outside a wrapper', () => {
    mount('<p>plain</p>');
    expect(backspaceOutOfWrapper(root, caret('p', 0))).toBe(false);
  });

  it('ignores a non-collapsed selection — that is an ordinary delete', () => {
    mount('<p><span class="inline-code">code</span></p>');
    const span = root.querySelector('.inline-code');
    const range = document.createRange();
    range.setStart(span.firstChild, 0);
    range.setEnd(span.firstChild, 3);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    expect(backspaceOutOfWrapper(root, sel)).toBe(false);
  });
});
