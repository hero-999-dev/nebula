/**
 * A Markdown or HTML file, turned into a note.
 *
 * Both paths end in the same place: HTML that the editor already knows how to
 * render — paragraphs, headings, lists, quotes, dividers, code blocks with
 * their source in `data-code`.
 *
 * Everything that comes in from a file is treated as hostile. A note is loaded
 * with `innerHTML` and mirrored to disk, so an imported `<script>`, a `<style>`
 * that repaints the app, or an `<iframe>` pointing anywhere would all become
 * part of the vault. `sanitize` is not optional.
 */

/** Removed outright, with everything inside them. */
const FORBIDDEN = 'script, style, link, meta, iframe, object, embed, form, input, button, svg, math';

/** Kept, per element. Anything else is dropped. */
const ALLOWED_ATTRS = new Set(['href', 'src', 'alt', 'title', 'class', 'data-lang', 'data-code', 'data-tex', 'data-ind', 'colspan', 'rowspan']);

/** Classes the editor gives meaning to. An imported file may not invent others. */
const ALLOWED_CLASSES = new Set([
  'blk-code', 'blk-todo', 'blk-hr', 'done', 'inline-code', 'inline-eq',
  'u-single', 'u-double', 'u-bold', 'u-wavy', 'u-dash',
  'c-gray', 'c-brown', 'c-orange', 'c-yellow', 'c-green', 'c-blue', 'c-purple', 'c-pink', 'c-red',
  'h-gray', 'h-brown', 'h-orange', 'h-yellow', 'h-green', 'h-blue', 'h-purple', 'h-pink', 'h-red',
]);

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Strip anything an imported document has no business carrying.
 * @param {string} html
 * @returns {string} HTML safe to put in a note
 */
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  doc.body.querySelectorAll(FORBIDDEN).forEach((el) => el.remove());

  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      // on* handlers, style, and anything not on the list.
      if (!ALLOWED_ATTRS.has(name)) { el.removeAttribute(attr.name); continue; }
      if ((name === 'href' || name === 'src') && /^\s*(javascript|data|vbscript):/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
    if (el.classList.length) {
      for (const cls of Array.from(el.classList)) {
        if (!ALLOWED_CLASSES.has(cls)) el.classList.remove(cls);
      }
      if (!el.classList.length) el.removeAttribute('class');
    }
  }
  return doc.body.innerHTML;
}

/** The note's title: the first `# heading`, else the filename. */
export function titleFromMarkdown(md, fallback = 'Imported note') {
  const line = String(md ?? '').split('\n').find((l) => /^#\s+\S/.test(l));
  return line ? line.replace(/^#\s+/, '').trim() : fallback;
}

const inline = (text) => esc(text)
  .replace(/`([^`]+)`/g, '<span class="inline-code">$1</span>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  .replace(/~~([^~]+)~~/g, '<s>$1</s>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');

/**
 * Markdown → the editor's HTML.
 *
 * Deliberately small: the blocks Nebula itself can produce, and nothing more.
 * A construct it does not know becomes a paragraph rather than being dropped —
 * losing the user's text is worse than rendering it plainly.
 *
 * @param {string} md
 * @param {{skipTitle?: boolean}} [opts] drop the leading `# heading`, which
 *   becomes the note's title rather than part of its body
 */
export function fromMarkdown(md, { skipTitle = true } = {}) {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null;            // 'ul' | 'ol'
  let items = [];
  let titleTaken = !skipTitle;

  const flushList = () => {
    if (!list) return;
    out.push(`<${list}>${items.map((i) => `<li>${i}</li>`).join('')}</${list}>`);
    list = null;
    items = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // fenced code — consume through the closing fence
    const fence = line.match(/^```\s*([\w+#-]*)\s*$/);
    if (fence) {
      flushList();
      const lang = fence[1] || 'plain';
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { body.push(lines[i]); i += 1; }
      out.push(`<div class="blk-code" data-block-type="code" data-lang="${esc(lang)}"`
        + ` data-code="${encodeURIComponent(body.join('\n'))}" contenteditable="false"></div>`);
      continue;
    }

    if (/^\s*$/.test(line)) { flushList(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushList(); out.push('<hr class="blk-hr">'); continue; }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushList();
      if (heading[1].length === 1 && !titleTaken) { titleTaken = true; continue; }
      const level = Math.min(3, heading[1].length);   // the editor has h1..h3
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      continue;
    }

    const todo = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (todo) {
      flushList();
      out.push(`<div class="blk-todo${todo[1].toLowerCase() === 'x' ? ' done' : ''}">${inline(todo[2])}</div>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      if (list !== 'ul') { flushList(); list = 'ul'; }
      items.push(inline(bullet[1]));
      continue;
    }
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (list !== 'ol') { flushList(); list = 'ol'; }
      items.push(inline(numbered[1]));
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) { flushList(); out.push(`<blockquote>${inline(quote[1])}</blockquote>`); continue; }

    flushList();
    out.push(`<p>${inline(line.trim())}</p>`);
  }
  flushList();
  return out.join('');
}

/** The `<title>` or first heading of an HTML document. */
export function titleFromHtml(html, fallback = 'Imported note') {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const title = doc.querySelector('title')?.textContent?.trim();
  if (title) return title;
  const h = doc.body.querySelector('h1, h2, h3')?.textContent?.trim();
  return h || fallback;
}

/**
 * One imported file → `{ title, content }` ready for `store.createNote`.
 * @param {string} name the filename, used as the title of last resort
 * @param {string} text the file's contents
 */
export function noteFromFile(name, text) {
  const base = String(name ?? '').replace(/\.[^.]+$/, '').trim() || 'Imported note';
  if (/\.html?$/i.test(name ?? '')) {
    const doc = new DOMParser().parseFromString(String(text ?? ''), 'text/html');
    return { title: titleFromHtml(text, base), content: sanitize(doc.body.innerHTML) };
  }
  return { title: titleFromMarkdown(text, base), content: sanitize(fromMarkdown(text)) };
}
