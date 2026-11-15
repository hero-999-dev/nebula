import { parseNote } from './export.js';
import { gridOf } from './table-grid.js';
import { isGuideTitle } from './seed-notes.js';
import { STRINGS } from './i18n.js';

/**
 * A note, as the text Discord reads (1.0.4).
 *
 * Copy for Discord puts this on the clipboard and the user pastes it into a
 * chat. Discord's markdown is not a `.md` file's: it has no heading under
 * `###`, no table, no checkbox, no picture in the text, and a message ends at
 * 2000 characters. So this is its own walk through the note, beside
 * `toMarkdown()` in export.js and over the same cleaned document, and not a
 * rewriting of what that one writes.
 *
 * Nothing is dropped silently: what the text cannot carry — shapes, arrows,
 * widgets, attached files — is counted, and the card says it (discord-copy.js).
 *
 * Pure string and DOM functions: no clipboard, no window, no network.
 */

/** One Discord message. A constant of Discord's, checked when this was written (2026-11). */
export const MESSAGE_LIMIT = 2000;

const ZW = '​';

/** What Discord would read as emphasis, a code span or a link inside plain words. */
const ESCAPE = /([\\`*_[\]])/g;

const BLOCK_SELECTOR = 'p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,hr,section,article,figure,figcaption,table,tr,td,th';

/** A picture the note holds itself: in its own markup, or in its folder. */
const OWN_PICTURE = /^(data:image\/|nebula-media:\/\/)/i;
const WEB = /^https?:\/\//i;

const clean = (s) => String(s ?? '').replace(/​/g, '').replace(/[ \t]+/g, ' ');

/**
 * Whether a note may leave for Discord at all. Never a black hole's note,
 * never anything while Nebula is locked, never a note in the Trash, never the
 * guide.
 * @param {object|null} note
 * @param {{locked?: boolean}} [state] whether the lock screen is up
 */
export function canShare(note, { locked = false } = {}) {
  return !!note && !locked && !note.hole && !note.deletedAt && !isGuideTitle(note.title);
}

/**
 * Plain words, so that Discord shows them as they were written. An address is
 * left alone: a backslash inside one breaks it. `@everyone`, `@here` and a
 * written-out mention (`<@id>`, `<@&id>`) would call people when pasted by
 * someone allowed to; a zero-width space after the `@` or the `<` stops that
 * and shows nothing.
 */
function plain(text) {
  return clean(text).split(/(https?:\/\/[^\s<>]+)/).map((piece, i) => (i % 2 ? piece : piece
    .replace(ESCAPE, '\\$1')
    .replace(/~~|\|\|/g, (pair) => `\\${pair[0]}\\${pair[1]}`)
    .replace(/@(?=everyone|here)/g, `@${ZW}`)
    .replace(/<(?=@)/g, `<${ZW}`))).join('');
}

/** `mark` round the words, the spaces at either end left outside: `** x **` is not bold. */
function wrap(mark, inner) {
  const [, lead, words, trail] = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return words ? `${lead}${mark}${words}${mark}${trail}` : inner;
}

function codeSpan(text) {
  const src = String(text ?? '').replace(/​/g, '');
  if (!src.trim()) return '';
  return src.includes('`') ? `\`\` ${src} \`\`` : `\`${src}\``;
}

const hasClass = (node, re) => Array.from(node.classList).some((name) => re.test(name));

/**
 * Inline content → Discord markdown. `on` is what the words are already
 * inside, so bold in bold (a highlight in a bold line) is written once.
 */
function inline(node, on = {}) {
  if (node.nodeType === Node.TEXT_NODE) return plain(node.nodeValue);
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const kids = (also = {}) => Array.from(node.childNodes).map((n) => inline(n, { ...on, ...also })).join('');
  const mark = (name, sign) => (on[name] ? kids() : wrap(sign, kids({ [name]: true })));
  const tag = node.tagName.toLowerCase();

  // The source is what gets written out, never the rendered KaTeX.
  if (node.classList.contains('inline-eq')) return codeSpan(node.dataset.tex);
  if (node.classList.contains('inline-code') || tag === 'code') return codeSpan(node.textContent);
  // Discord has no highlight; the words still stand out.
  if (hasClass(node, /^h-[a-z]+$/)) return mark('bold', '**');
  if (tag === 'u' || hasClass(node, /^u-[a-z]+$/)) return mark('under', '__');

  switch (tag) {
    case 'br': return '\n';
    case 'strong': case 'b': return mark('bold', '**');
    case 'em': case 'i': return mark('italic', '*');
    case 's': case 'del': case 'strike': return mark('strike', '~~');
    case 'a': {
      // A link into the vault (a mention, a wiki link) opens nothing outside: its words stay.
      const href = node.getAttribute('href') ?? '';
      if (!WEB.test(href)) {
        // A mail address or a phone number is not in the vault: it stays, written out beside its words.
        const to = /^(?:mailto|tel):([^?]+)/i.exec(href)?.[1] ?? '';
        return to && !clean(node.textContent).includes(to) ? `${kids()} (${plain(to)})` : kids();
      }
      const words = kids().trim();
      return !words || clean(node.textContent).trim() === href ? href : `[${words}](${href.replace(/\s/g, '%20').replace(/\)/g, '%29')})`;
    }
    // A picture is not text: the note's own are copied after it (`pictures`),
    // one from the web is its address, which Discord shows as the picture.
    case 'img': {
      const src = node.getAttribute('src') ?? '';
      return WEB.test(src) ? src : '';
    }
    default: return kids();
  }
}

/**
 * A line of plain words that begins like a heading, a quote or a list would
 * be drawn as one. Only paragraphs are guarded: the blocks write their own
 * first characters.
 */
const guard = (text) => text
  .replace(/^(\s*)(#{1,3}|-#|>{1,3}|[-+])(?= )/gm, '$1\\$2')
  .replace(/^(\s*\d+)\.(?= )/gm, '$1\\.');

/** One list, at a given depth. Nested lists indent by two spaces per level. */
function listText(list, depth = 0) {
  const ordered = list.tagName === 'OL';
  const pad = '  '.repeat(depth);
  const out = [];
  let n = 0;
  for (const li of Array.from(list.children)) {
    if (li.tagName !== 'LI') continue;
    n += 1;
    const own = Array.from(li.childNodes)
      .filter((c) => !(c.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(c.tagName)))
      .map((c) => inline(c))
      .join('')
      .trim();
    out.push(`${pad}${ordered ? `${n}.` : '-'} ${own}`);
    for (const sub of Array.from(li.children)) {
      if (/^(UL|OL)$/.test(sub.tagName)) out.push(listText(sub, depth + 1));
    }
  }
  return out.join('\n');
}

/** A cell's words on one line. */
function cellWords(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  if (node.tagName === 'BR') return ' ';
  return Array.from(node.childNodes).map(cellWords).join('');
}

const widthOf = (text) => [...text].length;

/**
 * Discord draws no table. In a code block every character is as wide as the
 * next, so the columns line up; a merged cell stands in its first place.
 */
function tableText(el) {
  const table = el.querySelector('table');
  const grid = table ? gridOf(table) : null;
  if (!grid?.rows || !grid.cols) return null;
  const all = grid.matrix.map((row, r) => Array.from({ length: grid.cols }, (_, c) => {
    const at = grid.where.get(row[c]);
    if (!at || at.r !== r || at.c !== c) return '';
    return clean(cellWords(row[c])).replace(/\s+/g, ' ').trim();
  }));
  // A row or a column with no word in it is room on the page; in the text it
  // would be a line of nothing, or a run of dashes over nothing.
  const cols = Array.from({ length: grid.cols }, (_, c) => c).filter((c) => all.some((row) => row[c]));
  const rows = all.filter((row) => row.some(Boolean)).map((row) => cols.map((c) => row[c]));
  if (!rows.length) return null;
  const widths = cols.map((_, c) => Math.max(1, ...rows.map((row) => widthOf(row[c]))));
  const line = (cells) => cells.map((cell, c) => cell + ' '.repeat(widths[c] - widthOf(cell))).join('  ').trimEnd();
  // The rule stands under the table's own first row, where that row has words and rows follow it.
  const rule = all[0].some(Boolean) && rows.length > 1 ? [widths.map((w) => '─'.repeat(w)).join('  ')] : [];
  return [line(rows[0]), ...rule, ...rows.slice(1).map(line)].join('\n');
}

/** A block as it is pasted. Discord's fence is three backticks and no more, so three in the code are parted. */
const render = (block) => (block.code === undefined
  ? block.text
  : `\`\`\`${block.lang}\n${block.code.replace(/```/g, `\`${ZW}\`\``)}\n\`\`\``);

/** Raw text and block boundaries, through the editor's and the fonts' wrappers. */
function childBlocks(parent, skip = null) {
  const out = [];
  let words = '';
  const flush = () => {
    if (words.trim()) out.push({ text: guard(words.trim()) });
    words = '';
  };
  for (const child of parent.childNodes) {
    if (child === skip) continue;
    if (child.nodeType === Node.ELEMENT_NODE
      && (child.matches(BLOCK_SELECTOR) || child.querySelector(BLOCK_SELECTOR))) {
      flush();
      out.push(...blockOf(child));
    } else words += inline(child);
  }
  flush();
  return out;
}

/** @returns {{text: string}[] | {code: string, lang: string}[]} */
function blockOf(el) {
  const tag = el.tagName.toLowerCase();
  if (el.classList.contains('link-block')) {
    const anchor = el.querySelector('a');
    if (anchor) {
      const href = anchor.getAttribute('href') ?? '';
      const title = clean(el.querySelector('.link-card__title')?.textContent || anchor.textContent).trim();
      if (!WEB.test(href)) return title ? [{ text: plain(title) }] : [];
      return [{ text: !title || title === href ? href : `[${plain(title)}](${href.replace(/\s/g, '%20').replace(/\)/g, '%29')})` }];
    }
  }
  if (el.classList.contains('blk-code') || tag === 'pre') {
    let code = el.querySelector('pre')?.textContent ?? el.textContent;
    if (el.hasAttribute('data-code')) {
      try { code = decodeURIComponent(el.dataset.code); } catch { /* keep visible source */ }
    }
    return [{ code, lang: el.dataset.lang && el.dataset.lang !== 'plain' ? el.dataset.lang : '' }];
  }
  // Discord draws no checkbox.
  if (el.classList.contains('blk-todo')) {
    return [{ text: `${el.classList.contains('done') ? '☑' : '☐'} ${inline(el).trim()}` }];
  }
  if (el.classList.contains('blk-table')) {
    const code = tableText(el);
    return code ? [{ code, lang: '' }] : [];
  }
  if (tag === 'hr') return [{ text: '───' }];
  // An image's caption follows it as an italic line.
  if (tag === 'figcaption') {
    const text = inline(el).trim();
    return text ? [{ text: wrap('*', text) }] : [];
  }
  if (tag === 'ul' || tag === 'ol') {
    const text = listText(el);
    return text ? [{ text }] : [];
  }
  if (tag === 'blockquote') {
    const inner = childBlocks(el).map(render).join('\n\n');
    return inner ? [{ text: inner.split('\n').map((line) => `> ${line}`).join('\n') }] : [];
  }
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1]);
    // Discord has nothing under ###: a deeper heading is a bold line.
    const text = level <= 3 ? inline(el).trim() : inline(el, { bold: true }).trim();
    if (!text) return [];
    return [{ text: level <= 3 ? `${'#'.repeat(level)} ${text}` : `**${text}**` }];
  }
  return childBlocks(el);
}

/**
 * The note as blocks of Discord text, the pictures to copy after it, and what
 * stays behind.
 * @param {string} html the note's stored content
 * @param {string} [title] written as the first `# heading`
 * @returns {{
 *   blocks: ({text: string} | {code: string, lang: string})[],
 *   pictures: {src: string, alt: string}[],
 *   left: {shapes: number, widgets: number, files: number},
 * }}
 */
export function toDiscord(html, title = '') {
  // Counted in the note as it is stored: the cleaning below takes the shapes out.
  const stored = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const left = {
    shapes: stored.querySelectorAll('.shape-layer .shape, .shape-layer .arrow-line').length,
    widgets: stored.querySelectorAll('.note-widget').length,
    files: stored.querySelectorAll('.link-block.link-file, .link-block.link-attach').length,
  };

  const doc = parseNote(html);
  // A widget's keys and dials are not words.
  doc.body.querySelectorAll('.note-widget').forEach((fig) => fig.remove());
  // A bookmark's small picture belongs to its card, and the card goes as a link.
  const pictures = Array.from(doc.body.querySelectorAll('img'))
    .filter((img) => !img.closest('.link-block'))
    .map((img) => ({ src: img.getAttribute('src') ?? '', alt: img.getAttribute('alt') ?? '' }))
    .filter((picture) => OWN_PICTURE.test(picture.src));

  const blocks = [];
  // A note never named is "Untitled" in the app's language: that is no title to carry.
  const given = clean(title).trim();
  const name = given === 'Untitled' || (STRINGS.Untitled ?? []).includes(given) ? '' : given;
  if (name) blocks.push({ text: `# ${plain(name)}` });
  // A note that opens with its own title as an <h1> would carry it twice.
  const first = doc.body.firstElementChild;
  const skipFirst = !!name && first?.tagName === 'H1' && first.textContent.trim() === name;
  blocks.push(...childBlocks(doc.body, skipFirst ? first : null));
  return { blocks, pictures, left };
}

/** Text in pieces of `room` characters at most: cut at a line's end, else at a space, else where the room ends. */
function cut(text, room) {
  const out = [];
  let rest = text;
  while (rest.length > room) {
    let at = rest.lastIndexOf('\n', room);
    if (at <= 0) at = rest.lastIndexOf(' ', room);
    if (at <= 0) {
      at = room;
      // Never between the two halves of one character.
      if (/[\uD800-\uDBFF]/.test(rest[at - 1])) at -= 1;
    }
    out.push(rest.slice(0, at));
    rest = rest.slice(at).replace(/^[\n ]/, '');
  }
  if (rest) out.push(rest);
  return out;
}

/** A block as one piece, or — longer than a message by itself — as several, a code block fenced again in each. */
function pieces(block, limit) {
  const whole = render(block);
  if (whole.length <= limit) return [whole];
  if (block.code === undefined) return cut(block.text, limit);
  const room = limit - render({ code: '', lang: block.lang }).length;
  // The backticks parted in `render` make the code longer; they are parted first, so a piece is measured as it goes out.
  return cut(block.code.replace(/```/g, `\`${ZW}\`\``), room).map((code) => `\`\`\`${block.lang}\n${code}\n\`\`\``);
}

/**
 * The blocks as messages: as many whole blocks in each as fit, an empty line
 * between them, never a cut inside a block that fits a message by itself.
 * @param {({text: string} | {code: string, lang: string})[]} blocks
 * @param {number} [limit]
 * @returns {string[]}
 */
export function splitForDiscord(blocks, limit = MESSAGE_LIMIT) {
  const parts = [];
  let now = '';
  for (const block of blocks) {
    for (const piece of pieces(block, limit)) {
      if (!now) now = piece;
      else if (now.length + 2 + piece.length <= limit) now += `\n\n${piece}`;
      else { parts.push(now); now = piece; }
    }
  }
  if (now) parts.push(now);
  return parts;
}

/**
 * What Copy for Discord copies of a note: its text in parts of one message
 * each, its own pictures in their order, and what stays behind.
 * @param {{title?: string, content?: string}} note
 * @param {number} [limit]
 */
export function forDiscord({ title = '', content = '' } = {}, limit = MESSAGE_LIMIT) {
  const { blocks, pictures, left } = toDiscord(content, title);
  return { parts: splitForDiscord(blocks, limit), pictures, left };
}
