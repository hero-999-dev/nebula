/**
 * The tag and mention read caches are keyed by a note's whole markup
 * (perf, 2026-10-23): they keep a character budget and leave one entry at a
 * time, and a markup too big for the budget is scanned again rather than
 * kept. What these tests prove: the results stay right either way — with or
 * without a cache hit — which is what every caller sees.
 */
import { describe, it, expect } from 'vitest';
import { contentTags, contentMentions } from '../src/js/mentions.js';

const fill = 'x'.repeat(300_000); // over the budget: never cached

describe('content caches', () => {
  it('a markup too large for the tag cache is read right every time', () => {
    const a = `<p>${fill}<span class="note-tag" data-tag="one">#one</span></p>`;
    const b = `<p>${fill}<span class="note-tag" data-tag="two">#two</span></p>`;
    expect(contentTags(a)).toEqual(['one']);
    expect(contentTags(b)).toEqual(['two']);
    expect(contentTags(a)).toEqual(['one']);
    expect(contentTags(b)).toEqual(['two']);
  });

  it('a markup too large for the mention cache is read right every time', () => {
    const a = `<p>${fill}<a class="note-mention" data-note="x1">@X</a></p>`;
    const b = `<p>${fill}<a class="note-mention" data-note="y2">@Y</a></p>`;
    expect(contentMentions(a)).toEqual(['x1']);
    expect(contentMentions(b)).toEqual(['y2']);
    expect(contentMentions(a)).toEqual(['x1']);
    expect(contentMentions(b)).toEqual(['y2']);
  });

  it('a small markup still answers from the cache', () => {
    const src = '<p><span class="note-tag" data-tag="keep">#keep</span></p>';
    expect(contentTags(src)).toEqual(['keep']);
    expect(contentTags(src)).toEqual(['keep']);
  });
});
