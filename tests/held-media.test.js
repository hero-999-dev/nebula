/**
 * Pictures a note lost by a fault, put back into it (0.9.4): the markup that
 * names them again — at the end of the note, for where they stood is not known.
 */
import { describe, it, expect } from 'vitest';
import { heldMarkup } from '../src/js/held-media.js';
import { namedIn } from '../src/js/editor.js';

const measure = async (url) => (url.includes('aaaa') ? { width: 1200, height: 600 } : { width: 40, height: 30 });
const parse = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d; };

describe('the files of a note put back into it', () => {
  it('a picture is a picture in the text again, no wider than a pasted one; a video is its player; and a line to type on follows', async () => {
    const html = await heldMarkup('n1', ['aaaaaaaaaaaaaaaaaaaaaaaa.png', 'bbbbbbbbbbbbbbbbbbbbbbbb.jpg', 'vid-m1abc-0a1b2c3d.mp4'], measure);
    const d = parse(html);
    const figures = [...d.querySelectorAll('figure.note-image.note-image--inline')];
    expect(figures.map((f) => f.querySelector('img').getAttribute('src'))).toEqual(['nebula-media://note/n1/aaaaaaaaaaaaaaaaaaaaaaaa.png', 'nebula-media://note/n1/bbbbbbbbbbbbbbbbbbbbbbbb.jpg']);
    expect(figures.map((f) => f.style.width)).toEqual(['560px', '40px']);
    expect(figures.map((f) => Number(f.dataset.ratio).toFixed(2))).toEqual(['2.00', '1.33']);
    expect(figures.every((f) => f.getAttribute('contenteditable') === 'false' && f.dataset.blockType === 'image')).toBe(true);
    const card = d.querySelector('.link-block.link-file');
    expect(card.querySelector('video').getAttribute('src')).toBe('nebula-media://note/n1/vid-m1abc-0a1b2c3d.mp4');
    expect(d.lastElementChild.outerHTML).toBe('<p><br></p>');
    // Every file is named again: none of them is unnamed at the next start.
    expect(namedIn(html)).toHaveLength(3);
  });

  it('takes nothing that is no picture or video of a note, and makes nothing of nothing', async () => {
    expect(await heldMarkup('n1', ['n1.json', '../x.png', 'notes.txt', 'a b.png', null], measure)).toBe('');
    expect(await heldMarkup('../n1', ['aaaaaaaaaaaaaaaaaaaaaaaa.png'], measure)).toBe('');
    expect(await heldMarkup('n1', [], measure)).toBe('');
    expect(await heldMarkup('n1', undefined, measure)).toBe('');
  });
});
