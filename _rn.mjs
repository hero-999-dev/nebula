import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const note = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dom = new JSDOM(`<body>${note.content || ''}</body>`);
const { document } = dom.window;

// The chrome that is not prose.
document.querySelectorAll('.shape-layer, .code-head, select').forEach((el) => el.remove());
document.querySelectorAll('.blk-code').forEach((el) => {
  const lang = el.dataset.lang || 'plain';
  let src = '';
  try { src = decodeURIComponent(el.dataset.code || ''); } catch { src = ''; }
  el.replaceWith(document.createTextNode(`\n[CODE ${lang}${src ? `: ${src.slice(0, 60)}` : ' — empty'}]\n`));
});
document.querySelectorAll('li').forEach((el) => el.prepend(document.createTextNode(' - ')));
document.querySelectorAll('hr').forEach((el) => el.replaceWith(document.createTextNode('\n----------\n')));
document.querySelectorAll('p, div, h1, h2, h3, h4, li, blockquote, pre, br')
  .forEach((el) => el.after(document.createTextNode('\n')));

const text = (document.body.textContent || '')
  .replace(/ /g, ' ')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

console.log(`### ${note.title}  (${(note.content || '').length} bytes)\n`);
console.log(text);
