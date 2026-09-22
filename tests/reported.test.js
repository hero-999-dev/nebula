import { describe, it, expect } from 'vitest';
import { migrateNote, normalizeProse } from '../src/js/migrate.js';
import { normalizeUnderlineInk, applyInlineFamily } from '../src/js/inline-family.js';

const root = html => { const el = document.createElement('div'); el.innerHTML = html; return el; };

describe('reported legacy note structures', () => {
  it('places overlays before prose without changing their order or losing shapes', () => {
    const el = root('upper<br><div class="shape-layer" id="front"><i class="shape">shape</i></div><div class="shape-layer" id="back"></div><div>lower</div>');
    normalizeProse(el);
    expect([...el.children].map(n => n.id || n.tagName)).toEqual(['front', 'back', 'P', 'DIV']);
    expect(el.querySelector('p').innerHTML).toBe('upper<br>');
    expect(el.querySelector('.shape').textContent).toBe('shape');
  });
  it('is idempotent, including overlay order and loose marked text', () => {
    const el = root('upper<br><div class="shape-layer" id="a"></div><div class="shape-layer" id="b"></div><span class="u-single"></span><div>lower</div><span class="h-blue">marked</span>');
    normalizeProse(el);
    const first = el.innerHTML;
    normalizeProse(el);
    expect(el.innerHTML).toBe(first);
    expect(el.querySelector('.h-blue').parentElement.tagName).toBe('P');
    expect(el.querySelector('.u-single')).toBeNull();
  });
  it('does not move a nonempty nested layer to a different coordinate system', () => {
    const el = root('<div id="wrapper"><div class="shape-layer"><i class="shape">shape</i></div>text</div>');
    normalizeProse(el);
    expect(el.querySelector('.shape-layer').parentElement.id).toBe('wrapper');
  });
  it('moves empty nested overlays out of the prose merge path', () => {
    const el = root('<div>text<div class="shape-layer"></div></div>');
    normalizeProse(el);
    expect(el.firstElementChild.className).toBe('shape-layer');
    expect(el.lastElementChild.textContent).toBe('text');
  });
  it('unwraps block-swallowing spans before making prose paragraphs', () => {
    const el = root('<span class="u-single"><p><span class="c-red">one</span></p><p>two</p></span>');
    migrateNote(el);
    expect(el.querySelector('p p')).toBeNull();
    expect(el.querySelectorAll(':scope > p')).toHaveLength(2);
    expect(el.textContent).toBe('onetwo');
  });
});

describe('underline ink follows the actual text run', () => {
  it('moves legacy underline inside both highlight and text colour', () => {
    const el = root('<span class="u-single"><span class="h-blue"><span class="c-red">red</span></span></span>');
    normalizeUnderlineInk(el);
    expect(el.querySelector('.c-red > .u-single').textContent).toBe('red');
    const html = el.innerHTML;
    normalizeUnderlineInk(el);
    expect(el.innerHTML).toBe(html);
  });
  it('keeps plain and differently coloured runs underlined without dropping other styles', () => {
    const el = root('<span class="u-double" style="font-size:20px">plain<b class="c-blue">blue</b>end</span>');
    normalizeUnderlineInk(el);
    expect(el.textContent).toBe('plainblueend');
    expect(el.querySelector('b.c-blue > .u-double').textContent).toBe('blue');
    expect(el.querySelector('[style]').style.fontSize).toBe('20px');
    expect(el.querySelectorAll('.u-double')).toHaveLength(3);
  });
  it('new underlining also paints inside existing colours and keeps selection', () => {
    const el = root('<p>plain<span class="c-red">red</span></p>');
    document.body.appendChild(el);
    const range = document.createRange(); range.selectNodeContents(el.firstChild);
    applyInlineFamily(el, [range], ['u-single', 'u-double'], 'u-single', 'u');
    expect(el.querySelector('.c-red > .u-single').textContent).toBe('red');
    expect(getSelection().toString()).toBe('plainred');
    el.remove();
  });
});
