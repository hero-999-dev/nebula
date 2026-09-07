/**
 * A note, as Markdown or as a standalone HTML file.
 *
 * Printing went through `window.print()`, which hands the whole window to the
 * OS print dialog — the user's `try.pdf` came out of "Microsoft: Print To PDF"
 * and looked like a picture of the app. Notion's export of the same document
 * came out of Chromium's own PDF writer, laid out as a document. So: real
 * export, in the three formats Notion offers that mean anything here.
 *
 * (No CSV. Notion's CSV is for database views, and Nebula has no table block —
 * it would be an empty file with a confident name.)
 *
 * These are pure string→string functions over a parsed document, so they are
 * testable in jsdom without an editor, an app, or a filesystem.
 */

/** Elements that are not prose and never reach a document. */
const DROP = '.shape-layer, .code-head, .find-bar, script, style, iframe, object, embed';

/**
 * Only what would change meaning if left alone.
 *
 * Escaping the whole punctuation set turned "A sentence." into "A sentence\."
 * — correct markdown, unreadable prose. Line-leading `#`, `-` and `>` are
 * handled where blocks are written, so inline only has to guard emphasis,
 * code spans and link brackets.
 */
const ESCAPE_MD = /([\\`*_[\]])/g;

/** A DOM to read from. DOMParser documents are inert — nothing loads or runs. */
function parse(html) {
  const doc = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  doc.body.querySelectorAll(DROP).forEach((el) => el.remove());
  return doc;
}

const clean = (s) => String(s ?? '').replace(/​/g, '').replace(/[ \t]+/g, ' ');

/** Inline content → Markdown. Recursive, so nesting survives. */
function inlineMd(node, escape = true) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = clean(node.nodeValue);
    return escape ? text.replace(ESCAPE_MD, '\\$1') : text;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';

  const kids = () => Array.from(node.childNodes).map((n) => inlineMd(n, escape)).join('');
  const tag = node.tagName.toLowerCase();

  // The source is what gets written out, never the rendered KaTeX.
  if (node.classList.contains('inline-eq')) return `$${node.dataset.tex ?? ''}$`;
  if (node.classList.contains('inline-code')) return `\`${node.textContent}\``;

  switch (tag) {
    case 'br': return '\n';
    case 'strong': case 'b': return `**${kids()}**`;
    case 'em': case 'i': return `*${kids()}*`;
    case 's': case 'del': case 'strike': return `~~${kids()}~~`;
    case 'code': return `\`${node.textContent}\``;
    case 'a': {
      const href = node.getAttribute('href');
      return href ? `[${kids()}](${href})` : kids();
    }
    case 'img': {
      const src = node.getAttribute('src') ?? '';
      return src ? `![${node.getAttribute('alt') ?? ''}](${src})` : '';
    }
    default: return kids();
  }
}

/** One list, at a given depth. Nested lists indent by two spaces per level. */
function listMd(list, depth = 0) {
  const ordered = list.tagName === 'OL';
  const pad = '  '.repeat(depth);
  const out = [];
  let n = 0;
  for (const li of Array.from(list.children)) {
    if (li.tagName !== 'LI') continue;
    n += 1;
    const own = Array.from(li.childNodes)
      .filter((c) => !(c.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(c.tagName)))
      .map((c) => inlineMd(c))
      .join('')
      .trim();
    out.push(`${pad}${ordered ? `${n}.` : '-'} ${own}`);
    for (const sub of Array.from(li.children)) {
      if (/^(UL|OL)$/.test(sub.tagName)) out.push(listMd(sub, depth + 1));
    }
  }
  return out.join('\n');
}

/**
 * @param {string} html the note's stored content
 * @param {string} [title] written as the first `# heading`, the way Notion does
 */
export function toMarkdown(html, title = '') {
  const doc = parse(html);
  const parts = [];
  if (title) parts.push(`# ${title}`);

  // A note that opens with its own title as an <h1> would otherwise carry that
  // heading twice: once from the title, once from the body.
  const first = doc.body.firstElementChild;
  const skipFirst = Boolean(title)
    && first?.tagName === 'H1'
    && first.textContent.trim() === String(title).trim();

  for (const el of Array.from(doc.body.children)) {
    if (skipFirst && el === first) continue;
    const tag = el.tagName.toLowerCase();

    if (el.classList.contains('blk-code')) {
      let code = '';
      try { code = decodeURIComponent(el.dataset.code ?? ''); } catch { code = el.textContent; }
      const lang = el.dataset.lang && el.dataset.lang !== 'plain' ? el.dataset.lang : '';
      parts.push(`\`\`\`${lang}\n${code}\n\`\`\``);
      continue;
    }
    if (el.classList.contains('blk-todo')) {
      parts.push(`- [${el.classList.contains('done') ? 'x' : ' '}] ${inlineMd(el).trim()}`);
      continue;
    }
    if (tag === 'hr') { parts.push('---'); continue; }
    if (tag === 'ul' || tag === 'ol') { parts.push(listMd(el)); continue; }
    if (tag === 'blockquote') {
      parts.push(inlineMd(el).trim().split('\n').map((l) => `> ${l}`).join('\n'));
      continue;
    }
    if (/^h[1-6]$/.test(tag)) {
      parts.push(`${'#'.repeat(Number(tag[1]))} ${inlineMd(el).trim()}`);
      continue;
    }
    const text = inlineMd(el).trim();
    if (text) parts.push(text);
  }

  return `${parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/**
 * A single self-contained HTML file: styles inlined, nothing fetched. An export
 * that needs the app's stylesheet next to it is not an export.
 */
export function toHtml(html, title = 'Note') {
  const doc = parse(html);
  // Code blocks keep their source, not the highlighted spans — the colours mean
  // nothing outside the app and the source is what someone wants back.
  doc.body.querySelectorAll('.blk-code').forEach((block) => {
    let code = '';
    try { code = decodeURIComponent(block.dataset.code ?? ''); } catch { code = block.textContent; }
    const pre = doc.createElement('pre');
    const el = doc.createElement('code');
    el.textContent = code;
    if (block.dataset.lang) el.className = `language-${block.dataset.lang}`;
    pre.appendChild(el);
    block.replaceWith(pre);
  });
  doc.body.querySelectorAll('.inline-eq').forEach((eq) => {
    eq.textContent = `$${eq.dataset.tex ?? ''}$`;
  });
  doc.body.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  body { max-width: 46rem; margin: 3rem auto; padding: 0 1.5rem;
         font: 16px/1.65 Georgia, "Times New Roman", serif; color: #1a1a1a; background: #fff; }
  h1, h2, h3 { line-height: 1.25; margin: 1.6em 0 .4em; }
  h1 { font-size: 1.9em; } h2 { font-size: 1.5em; } h3 { font-size: 1.22em; }
  pre { background: #f4f4f2; border: 1px solid #e0e0dc; border-radius: 6px;
        padding: .9rem 1rem; overflow-x: auto; }
  code { font: .88em/1.5 "Cascadia Code", Consolas, monospace; }
  pre code { font-size: .92em; }
  blockquote { margin: 1em 0; padding-left: 1rem; border-left: 3px solid #d8d4cc; color: #4a4a44; }
  hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
  img { max-width: 100%; }
  .blk-todo { list-style: none; }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${doc.body.innerHTML}
</body>
</html>
`;
}

/** A filename that cannot surprise a filesystem. Pure — tested. */
export function safeFileName(title, ext) {
  const base = String(title ?? '').trim()
    .replace(/[\\/:*?"<>|]/g, '-')      // reserved on Windows
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')                 // no leading dots: not a hidden file
    .slice(0, 80)
    .trim();
  return `${base || 'Untitled'}.${ext}`;
}

export const FORMATS = [
  { id: 'md', label: 'Markdown (.md)', ext: 'md' },
  { id: 'html', label: 'HTML (.html)', ext: 'html' },
  { id: 'pdf', label: 'PDF (.pdf)', ext: 'pdf' },
];
