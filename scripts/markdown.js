/**
 * A small Markdown renderer, enough for this project's own documents.
 *
 * Why not a dependency: the site it builds has to open by double-clicking a
 * file. That rules out fetching anything at runtime, so the HTML is produced at
 * build time — and pulling a library into the build to render seven files we
 * wrote ourselves is more moving parts than the job needs.
 *
 * Supported: ATX headings, fenced code, tables, nested bullet and ordered
 * lists, task items, blockquotes, rules, paragraphs; inline code, bold, italic,
 * links and bare URLs. Anything else passes through as text.
 */

const escapeHtml = (s) => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** Slug for heading anchors and the in-page outline. */
export const slug = (s) => s
  .toLowerCase()
  .replace(/[^\wÀ-ɏ\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-');

/**
 * Inline spans. Code is pulled out first and put back last, so nothing inside
 * a code span is mistaken for emphasis or a link.
 */
function inline(text) {
  const codes = [];
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  out = escapeHtml(out);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`);
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_, pre, url) => `${pre}<a href="${url}">${url}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^\w*])\*([^*\n]+)\*(?![\w*])/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^\w_])_([^_\n]+)_(?![\w_])/g, '$1<em>$2</em>');

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[Number(i)])}</code>`);
}

const cell = (s) => inline(s.trim());

function renderTable(rows) {
  const [header, , ...body] = rows;
  const cells = (line) => line.replace(/^\||\|$/g, '').split('|');
  let html = '<div class="scroll"><table><thead><tr>';
  for (const h of cells(header)) html += `<th>${cell(h)}</th>`;
  html += '</tr></thead><tbody>';
  for (const line of body) {
    html += '<tr>';
    for (const cl of cells(line)) html += `<td>${cell(cl)}</td>`;
    html += '</tr>';
  }
  return `${html}</tbody></table></div>`;
}

/**
 * @param {string} src markdown
 * @returns {{html: string, outline: {level: number, text: string, id: string}[]}}
 */
export function renderMarkdown(src) {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const outline = [];
  let html = '';
  let i = 0;

  /** Open list stack: each entry is {tag, indent}. */
  let lists = [];
  const closeLists = (toIndent = -1) => {
    while (lists.length && lists[lists.length - 1].indent > toIndent) {
      html += `</${lists.pop().tag}>`;
    }
  };

  let paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    html += `<p>${inline(paragraph.join(' '))}</p>`;
    paragraph = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      flushParagraph(); closeLists();
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      html += `<pre class="code"${fence[1] ? ` data-lang="${fence[1]}"` : ''}><code>${escapeHtml(body.join('\n'))}</code></pre>`;
      continue;
    }

    // table: a header row followed by a |---|---| separator
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? '')) {
      flushParagraph(); closeLists();
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++].trim());
      html += renderTable(rows);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph(); closeLists();
      const level = heading[1].length;
      const text = heading[2].replace(/\s*#+\s*$/, '');
      const id = slug(text);
      outline.push({ level, text: text.replace(/[*`_]/g, ''), id });
      html += `<h${level} id="${id}">${inline(text)}</h${level}>`;
      i++;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph(); closeLists();
      html += '<hr>';
      i++;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph(); closeLists();
      const quote = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      html += `<blockquote>${renderMarkdown(quote.join('\n')).html}</blockquote>`;
      continue;
    }

    const item = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (item) {
      flushParagraph();
      const indent = item[1].length;
      const ordered = /\d/.test(item[2]);
      const tag = ordered ? 'ol' : 'ul';
      closeLists(indent);
      const top = lists[lists.length - 1];
      if (!top || top.indent < indent) {
        html += `<${tag}>`;
        lists.push({ tag, indent });
      }
      let text = item[3];
      const task = text.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) {
        html += `<li class="task"><span class="box">${task[1].trim() ? '✓' : ''}</span>${inline(task[2])}</li>`;
      } else {
        html += `<li>${inline(text)}</li>`;
      }
      i++;
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeLists();
      i++;
      continue;
    }

    paragraph.push(line.trim());
    i++;
  }

  flushParagraph();
  closeLists();
  return { html, outline };
}
