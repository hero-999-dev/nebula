/**
 * Word and OpenDocument, out and in (0.9.3).
 *
 * The owner: "add odt, doc and docx to export and import". One reader turns a
 * note into blocks (headings, paragraphs, lists, to-dos, quotes, code,
 * dividers, pictures) of runs (bold, italic, underline, struck, code, colour,
 * size, link); three writers make the files from those blocks:
 *
 *   .docx  Office Open XML, written here and zipped (JSZip).
 *   .odt   OpenDocument Text, written here and zipped, `mimetype` first and stored.
 *   .doc   Rich Text, which Word, LibreOffice and WordPad open as a .doc. The
 *          old binary Word format is closed and cannot be written by an app.
 *
 * Each document is set on the note's paper with its margins (A4 for Nebula
 * Wide, across or upright as last chosen). Shapes and arrows have no place in
 * a word processor's flow and are left out, as in Markdown and HTML.
 *
 * In: .docx through mammoth, .odt read here, a .doc that is Rich Text or HTML
 * read here; a binary .doc is read to text in the main process
 * (word-extractor). Everything ends as HTML for import.js to sanitise.
 */
import JSZip from 'jszip';
import { parseNote } from './export.js';

const PX_PER_MM = 96 / 25.4;
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// XML 1.0 has no place for most control characters.
const xmlText = (s) => esc(String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, ''));

/* ------------------------------------------------------------------ reading */

const BLOCK = 'p,div,h1,h2,h3,h4,h5,h6,ul,ol,li,blockquote,pre,hr,section,article,figure,figcaption,table,tr,td,th,details,summary';

function colorHex(value) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value || '');
  if (m) return m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || '').trim());
  if (!h) return null;
  const v = h[1].length === 3 ? h[1].split('').map((c) => c + c).join('') : h[1];
  return v.toUpperCase();
}

/** The runs of an inline subtree, each with the formatting it inherits. */
function readRuns(node, fmt = {}, out = []) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = String(node.nodeValue ?? '').replace(/\u200b/g, '').replace(/[\t\r\n ]+/g, ' ');
    if (text) out.push({ ...fmt, text });
    return out;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return out;
  const el = node;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') { out.push({ ...fmt, br: true }); return out; }
  if (tag === 'img') return out;                                  // pictures are blocks of their own
  if (el.classList.contains('inline-eq')) { out.push({ ...fmt, text: `$${el.dataset.tex ?? el.textContent}$` }); return out; }
  const f = { ...fmt };
  if (tag === 'strong' || tag === 'b') f.b = true;
  if (tag === 'em' || tag === 'i') f.i = true;
  if (tag === 'u' || /\bu-(single|double|bold|wavy|dash)\b/.test(el.className)) f.u = true;
  if (tag === 's' || tag === 'del' || tag === 'strike') f.s = true;
  if (tag === 'code' || el.classList.contains('inline-code')) f.code = true;
  if (tag === 'a' && el.getAttribute('href')) f.href = el.getAttribute('href');
  const st = el.style;
  if (st) {
    if (/^(bold|[6-9]00)$/.test(st.fontWeight)) f.b = true;
    if (st.fontStyle === 'italic') f.i = true;
    if (/underline/.test(st.textDecoration || st.textDecorationLine || '')) f.u = true;
    if (/line-through/.test(st.textDecoration || st.textDecorationLine || '')) f.s = true;
    const c = colorHex(st.color);
    if (c) f.color = c;
    const size = /^(\d+(?:\.\d+)?)px$/.exec(st.fontSize || '');
    if (size) f.size = Number(size[1]);
    if (st.fontFamily) f.font = st.fontFamily.split(',')[0].replace(/["']/g, '').trim();
  }
  for (const child of el.childNodes) readRuns(child, f, out);
  return out;
}

function imageBlock(figure) {
  const img = figure.tagName === 'IMG' ? figure : figure.querySelector('img');
  const src = img?.getAttribute('src') || '';
  if (!src) return null;
  const width = Number.parseFloat(figure.style?.width) || Number.parseFloat(img.getAttribute('width')) || 0;
  const ratio = Number.parseFloat(figure.dataset?.ratio) || 0;
  const caption = figure.querySelector?.('figcaption')?.textContent.trim() || '';
  // A video put on the page (export-video.js): its still links to it, and Word can play it.
  const href = img.closest('a[href]')?.getAttribute('href') || '';
  const video = figure.dataset?.video || '';
  return { type: 'image', src, width, ratio, caption, alt: img.getAttribute('alt') || '', href, video };
}

/**
 * The note as blocks.
 * @returns {Array<object>}
 */
export function readBlocks(html) {
  const doc = parseNote(html);
  const blocks = [];
  const para = (runs, extra = {}) => {
    if (runs.some((r) => r.br || (r.text && r.text.trim()))) blocks.push({ type: 'para', runs: trimRuns(runs), ...extra });
  };
  function list(el, level) {
    const ordered = el.tagName === 'OL';
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      const own = [];
      for (const c of li.childNodes) {
        if (c.nodeType === Node.ELEMENT_NODE && /^(UL|OL)$/.test(c.tagName)) continue;
        if (c.nodeType === Node.ELEMENT_NODE && c.matches('figure, img')) continue;
        readRuns(c, {}, own);
      }
      blocks.push({ type: 'list', ordered, level, runs: trimRuns(own), listId: el });
      for (const c of li.children) {
        if (/^(UL|OL)$/.test(c.tagName)) list(c, level + 1);
        else if (c.matches('figure, img')) { const im = imageBlock(c); if (im) blocks.push(im); }
      }
    }
  }
  function walk(parent, extra = {}) {
    let inline = [];
    const flush = () => { para(inline, extra); inline = []; };
    for (const child of parent.childNodes) {
      if (child.nodeType !== Node.ELEMENT_NODE || !(child.matches(BLOCK) || child.querySelector(BLOCK) || child.matches('img'))) {
        readRuns(child, {}, inline);
        continue;
      }
      flush();
      block(child, extra);
    }
    flush();
  }
  function block(el, extra) {
    const tag = el.tagName.toLowerCase();
    if (el.classList.contains('link-block')) {
      const a = el.querySelector('a');
      const title = (el.querySelector('.link-card__title')?.textContent || a?.textContent || a?.getAttribute('href') || '').trim();
      // A bookmark goes out as the card the note shows: its title and its address, in a box.
      if (a?.getAttribute('href')) blocks.push({ type: 'bookmark', title, href: a.getAttribute('href') });
      return;
    }
    if (el.classList.contains('blk-code') || tag === 'pre') {
      let code = el.querySelector('pre')?.textContent ?? el.textContent;
      if (el.hasAttribute('data-code')) { try { code = decodeURIComponent(el.dataset.code); } catch { /* the visible source */ } }
      blocks.push({ type: 'code', text: code.replace(/\r\n?/g, '\n') });
      return;
    }
    if (el.classList.contains('blk-todo')) {
      blocks.push({ type: 'todo', checked: el.classList.contains('done'), runs: trimRuns(readRuns(el)) });
      return;
    }
    if (tag === 'hr') { blocks.push({ type: 'hr' }); return; }
    if (tag === 'figure' || tag === 'img') {
      const im = imageBlock(el);
      if (im) blocks.push(im);
      else walk(el, extra);
      return;
    }
    if (tag === 'ul' || tag === 'ol') { list(el, 0); return; }
    if (tag === 'blockquote') { walk(el, { ...extra, quote: true }); return; }
    if (/^h[1-6]$/.test(tag)) {
      const runs = trimRuns(readRuns(el));
      if (runs.length) blocks.push({ type: 'heading', level: Math.min(3, Number(tag[1])), runs });
      return;
    }
    if (tag === 'tr') {
      const cells = [...el.children].map((td) => td.textContent.trim()).filter(Boolean);
      if (cells.length) blocks.push({ type: 'para', runs: [{ text: cells.join(' | ') }], ...extra });
      return;
    }
    walk(el, extra);
  }
  walk(doc.body);
  return blocks;
}

function trimRuns(runs) {
  const out = runs.filter((r) => r.br || r.text);
  while (out.length && out[0].text !== undefined && !out[0].text.trim() && !out[0].br) out.shift();
  if (out[0]?.text) out[0] = { ...out[0], text: out[0].text.replace(/^\s+/, '') };
  while (out.length && out.at(-1).br) out.pop();
  const last = out.length - 1;
  if (out[last]?.text) out[last] = { ...out[last], text: out[last].text.replace(/\s+$/, '') };
  return out.filter((r) => r.br || r.text);
}

/* ------------------------------------------------------------------ pictures */

function base64Bytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

/** A picture's bytes, kind and pixel size, from a data URL (others are not carried). */
export function pictureOf(src) {
  const m = /^data:image\/(png|jpe?g|gif);base64,([a-z0-9+/=\s]+)$/i.exec(String(src || ''));
  if (!m) return null;
  const bytes = base64Bytes(m[2].replace(/\s+/g, ''));
  const kind = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
  let w = 0;
  let h = 0;
  if (kind === 'png' && bytes.length > 24) {
    w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19];
    h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23];
  } else if (kind === 'gif' && bytes.length > 10) {
    w = bytes[6] | (bytes[7] << 8);
    h = bytes[8] | (bytes[9] << 8);
  } else if (kind === 'jpeg') {
    for (let i = 2; i + 9 < bytes.length;) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i + 1];
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        h = (bytes[i + 5] << 8) | bytes[i + 6];
        w = (bytes[i + 7] << 8) | bytes[i + 8];
        break;
      }
      i += 2 + len;
    }
  }
  return { bytes, kind, ext: kind === 'jpeg' ? 'jpg' : kind, mime: `image/${kind}`, w: w >>> 0, h: h >>> 0, b64: m[2].replace(/\s+/g, '') };
}

/** A picture's size on the page, in CSS pixels: its width in the note, no wider than the line. */
function pictureSize(block, pic, lineWidth) {
  const natural = pic.w && pic.h ? pic.w / pic.h : (block.ratio || 4 / 3);
  const ratio = block.ratio || natural;
  const w = Math.max(16, Math.min(lineWidth, block.width || pic.w || lineWidth));
  return { w, h: w / ratio };
}

/** The sheet in mm and its margin: what the note's page prints on. */
function sheet(page = {}) {
  const w = Number(page.w) || 210;
  const h = Number(page.h) || 297;
  const margin = Number(page.margin) || 12.7;
  return { w, h, margin, line: (w - 2 * margin) * PX_PER_MM };
}

/* ------------------------------------------------------------------ .docx */

const EMU_PER_PX = 9525;
const TWIP_PER_MM = 1440 / 25.4;

function docxRun(r, rels) {
  if (r.br) return '<w:r><w:br/></w:r>';
  const props = [];
  if (r.code) props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>');
  else if (r.font) props.push(`<w:rFonts w:ascii="${esc(r.font)}" w:hAnsi="${esc(r.font)}" w:cs="${esc(r.font)}"/>`);
  if (r.b) props.push('<w:b/>');
  if (r.i) props.push('<w:i/>');
  if (r.s) props.push('<w:strike/>');
  if (r.href) props.push('<w:rStyle w:val="Hyperlink"/>');
  if (r.color) props.push(`<w:color w:val="${r.color}"/>`);
  else if (r.href) props.push('<w:color w:val="0563C1"/>');
  if (r.size) props.push(`<w:sz w:val="${Math.round(r.size * 0.75 * 2)}"/>`);
  if (r.u || r.href) props.push('<w:u w:val="single"/>');
  const run = `<w:r>${props.length ? `<w:rPr>${props.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlText(r.text)}</w:t></w:r>`;
  if (!r.href || !/^(https?|mailto):/i.test(r.href)) return run;
  const id = rels.link(r.href);
  return `<w:hyperlink r:id="${id}">${run}</w:hyperlink>`;
}

function docxParagraph(style, runs, rels, extra = '') {
  const pPr = `${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}`;
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs.map((r) => docxRun(r, rels)).join('')}</w:p>`;
}

function docxImage(block, rels, page, n) {
  const pic = pictureOf(block.src);
  if (!pic) return docxParagraph(null, [{ text: block.alt || block.src.slice(0, 80), href: /^https?:/i.test(block.src) ? block.src : undefined }], rels);
  const { w, h } = pictureSize(block, pic, page.line);
  const id = rels.image(pic);
  const cx = Math.round(w * EMU_PER_PX);
  const cy = Math.round(h * EMU_PER_PX);
  const linked = /^https?:/i.test(block.href || '');
  const click = linked ? `<a:hlinkClick xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" r:id="${rels.link(block.href)}"/>` : '';
  // A video: Word's own "online video" — the still, and the player when it is clicked in Word.
  const player = /^https:\/\/(www\.youtube-nocookie\.com\/embed\/|player\.vimeo\.com\/video\/)/.test(block.video || '')
    ? `<a:extLst><a:ext uri="{C809E66F-F1BF-436E-b5F7-EEA9579F0CBA}"><wp15:webVideoPr xmlns:wp15="http://schemas.microsoft.com/office/word/2012/wordprocessingDrawing" embeddedHtml="${esc(`<iframe width="${Math.round(w)}" height="${Math.round(h)}" src="${block.video}" frameborder="0" allowfullscreen></iframe>`)}" h="${Math.round(h)}" w="${Math.round(w)}"/></a:ext></a:extLst>`
    : '';
  const drawing = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}">${click}</wp:docPr>`
    + '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="${player ? `Video ${n}` : `image${n}.${pic.ext}`}">${click}</pic:cNvPr><pic:cNvPicPr/></pic:nvPicPr>`
    // Where Word itself puts an online video: on the picture's blip (checked against Word's own AddWebVideo).
    + `<pic:blipFill><a:blip r:embed="${id}">${player}</a:blip><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>`
    + '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  let out = `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${drawing}</w:p>`;
  if (block.caption) out += docxParagraph('Caption', [{ text: block.caption, i: true, href: linked ? block.href : undefined }], rels, '<w:jc w:val="center"/>');
  return out;
}

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia" w:eastAsia="Georgia"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="260" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:sz w:val="25"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="C9A27A"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F4F4F2"/><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:left="120" w:right="120"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:i/><w:sz w:val="18"/><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/><w:ind w:left="720"/></w:pPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
</w:styles>`;

function docxNumbering(orderedIds) {
  const levels = (fmt) => Array.from({ length: 9 }, (_, l) => {
    const text = fmt === 'bullet' ? ['•', '◦', '▪'][l % 3] : `%${l + 1}.`;
    return `<w:lvl w:ilvl="${l}"><w:start w:val="1"/><w:numFmt w:val="${fmt === 'bullet' ? 'bullet' : ['decimal', 'lowerLetter', 'lowerRoman'][l % 3]}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 + l * 360}" w:hanging="360"/></w:pPr></w:lvl>`;
  }).join('');
  let nums = '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
  for (const id of orderedIds) {
    nums += `<w:num w:numId="${id}"><w:abstractNumId w:val="1"/>${Array.from({ length: 9 }, (_, l) => `<w:lvlOverride w:ilvl="${l}"><w:startOverride w:val="1"/></w:lvlOverride>`).join('')}</w:num>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${levels('bullet')}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels('decimal')}</w:abstractNum>
${nums}
</w:numbering>`;
}

/**
 * The note as a .docx.
 * @param {string} html @param {string} title @param {{w:number,h:number,margin:number}} page
 * @returns {Promise<Uint8Array>}
 */
export async function toDocx(html, title = '', page = {}) {
  const blocks = readBlocks(html);
  const p = sheet(page);
  const zip = new JSZip();
  const relList = [];
  const images = [];
  const rels = {
    link(href) { const id = `rIdL${relList.length + 1}`; relList.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(href)}" TargetMode="External"/>`); return id; },
    image(pic) { const n = images.length + 1; const id = `rIdI${n}`; images.push({ id, pic, name: `image${n}.${pic.ext}` }); relList.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${n}.${pic.ext}"/>`); return id; },
  };
  const body = [];
  if (title) body.push(docxParagraph('Title', [{ text: title }], rels));
  const orderedNum = new Map();       // a numbered list's element -> its own numId, so each starts at 1
  let pictureNo = 0;
  blocks.forEach((b, i) => {
    if (i === 0 && b.type === 'heading' && b.level === 1 && b.runs.map((r) => r.text || '').join('').trim() === String(title).trim()) return;
    if (b.type === 'heading') body.push(docxParagraph(`Heading${b.level}`, b.runs, rels));
    else if (b.type === 'para') body.push(docxParagraph(b.quote ? 'Quote' : null, b.runs, rels));
    else if (b.type === 'list') {
      let numId = 1;
      if (b.ordered) { if (!orderedNum.has(b.listId)) orderedNum.set(b.listId, orderedNum.size + 2); numId = orderedNum.get(b.listId); }
      body.push(docxParagraph('ListParagraph', b.runs, rels, `<w:numPr><w:ilvl w:val="${Math.min(8, b.level)}"/><w:numId w:val="${numId}"/></w:numPr>`));
    } else if (b.type === 'todo') body.push(docxParagraph(null, [{ text: b.checked ? '☑ ' : '☐ ' }, ...b.runs], rels));
    else if (b.type === 'code') body.push(...b.text.split('\n').map((line) => docxParagraph('Code', [{ text: line || ' ' }], rels)));
    else if (b.type === 'hr') body.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="BBBBBB"/></w:pBdr></w:pPr></w:p>');
    else if (b.type === 'bookmark') {
      // The card: a box with the title over the address, both linked.
      const box = '<w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="CCCCCC"/><w:left w:val="single" w:sz="6" w:space="4" w:color="CCCCCC"/><w:bottom w:val="single" w:sz="6" w:space="4" w:color="CCCCCC"/><w:right w:val="single" w:sz="6" w:space="4" w:color="CCCCCC"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F7F7F5"/><w:spacing w:before="120" w:after="160"/><w:ind w:left="120" w:right="120"/>';
      body.push(docxParagraph(null, [
        { text: 'BOOKMARK', size: 9, color: '888888' }, { br: true },
        { text: b.title, b: true, href: b.href, color: '1A1A1A' }, { br: true },
        { text: b.href, size: 11, color: '777777', href: b.href },
      ], rels, box));
    }
    else if (b.type === 'image') { pictureNo += 1; body.push(docxImage(b, rels, p, pictureNo)); }
  });
  const landscape = p.w > p.h;
  const sect = `<w:sectPr><w:pgSz w:w="${Math.round(p.w * TWIP_PER_MM)}" w:h="${Math.round(p.h * TWIP_PER_MM)}"${landscape ? ' w:orient="landscape"' : ''}/>`
    + `<w:pgMar w:top="${Math.round(p.margin * TWIP_PER_MM)}" w:right="${Math.round(p.margin * TWIP_PER_MM)}" w:bottom="${Math.round(p.margin * TWIP_PER_MM)}" w:left="${Math.round(p.margin * TWIP_PER_MM)}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>${body.join('')}${sect}</w:body></w:document>`;
  const kinds = [...new Set(images.map((im) => im.pic.ext))];
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${kinds.map((k) => `<Default Extension="${k}" ContentType="image/${k === 'jpg' ? 'jpeg' : k}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlText(title)}</dc:title><dc:creator>Nebula</dc:creator></cp:coreProperties>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdT" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${relList.join('')}</Relationships>`);
  zip.file('word/document.xml', document);
  zip.file('word/styles.xml', DOCX_STYLES);
  zip.file('word/numbering.xml', docxNumbering([...orderedNum.values()]));
  // Without its compatibility mode Word opens the file as a Word 2007 one, where
  // an online video is only its picture.
  zip.file('word/settings.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>');
  for (const im of images) zip.file(`word/media/${im.name}`, im.pic.bytes);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ------------------------------------------------------------------ .odt */

const ODF_NS = 'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.3"';

/**
 * The note as an .odt.
 * @returns {Promise<Uint8Array>}
 */
export async function toOdt(html, title = '', page = {}) {
  const blocks = readBlocks(html);
  const p = sheet(page);
  const spanStyles = new Map();        // a run's formatting -> T1, T2...
  const pictures = [];
  const spanName = (r) => {
    const key = JSON.stringify([!!r.b, !!r.i, !!r.u || !!r.href, !!r.s, !!r.code, r.color || '', r.size || 0, r.code ? '' : (r.font || '')]);
    if (key === JSON.stringify([false, false, false, false, false, '', 0, ''])) return null;
    if (!spanStyles.has(key)) {
      const props = [];
      if (r.b) props.push('fo:font-weight="bold"');
      if (r.i) props.push('fo:font-style="italic"');
      if (r.u || r.href) props.push('style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"');
      if (r.s) props.push('style:text-line-through-style="solid"');
      if (r.code) props.push('style:font-name="Consolas"');
      else if (r.font) props.push(`fo:font-family="${esc(r.font)}"`);
      if (r.color) props.push(`fo:color="#${r.color}"`);
      else if (r.href) props.push('fo:color="#0563C1"');
      if (r.size) props.push(`fo:font-size="${Math.round(r.size * 0.75 * 10) / 10}pt"`);
      spanStyles.set(key, { name: `T${spanStyles.size + 1}`, props: props.join(' ') });
    }
    return spanStyles.get(key).name;
  };
  const runs = (list) => list.map((r) => {
    if (r.br) return '<text:line-break/>';
    const text = xmlText(r.text).replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`);
    const name = spanName(r);
    const span = name ? `<text:span text:style-name="${name}">${text}</text:span>` : text;
    return r.href && /^(https?|mailto):/i.test(r.href) ? `<text:a xlink:type="simple" xlink:href="${esc(r.href)}">${span}</text:a>` : span;
  }).join('');
  const body = [];
  if (title) body.push(`<text:p text:style-name="Title">${xmlText(title)}</text:p>`);
  let open = null;             // the list being written: { ordered, level, el }
  const closeLists = () => { if (open) { body.push('</text:list-item></text:list>'.repeat(open.level + 1)); open = null; } };
  blocks.forEach((b, i) => {
    if (i === 0 && b.type === 'heading' && b.level === 1 && b.runs.map((r) => r.text || '').join('').trim() === String(title).trim()) return;
    if (b.type !== 'list') closeLists();
    if (b.type === 'heading') body.push(`<text:h text:style-name="Heading_20_${b.level}" text:outline-level="${b.level}">${runs(b.runs)}</text:h>`);
    else if (b.type === 'para') body.push(`<text:p text:style-name="${b.quote ? 'Quotations' : 'Standard'}">${runs(b.runs)}</text:p>`);
    else if (b.type === 'todo') body.push(`<text:p text:style-name="Standard">${b.checked ? '☑' : '☐'} ${runs(b.runs)}</text:p>`);
    else if (b.type === 'code') body.push(...b.text.split('\n').map((line) => `<text:p text:style-name="Preformatted_20_Text">${xmlText(line).replace(/ {2,}/g, (m) => ` <text:s text:c="${m.length - 1}"/>`) || ''}</text:p>`));
    else if (b.type === 'hr') body.push('<text:p text:style-name="Horizontal_20_Line"/>');
    else if (b.type === 'bookmark') {
      body.push(`<text:p text:style-name="Bookmark">${runs([
        { text: 'BOOKMARK', size: 9, color: '888888' }, { br: true },
        { text: b.title, b: true, href: b.href, color: '1A1A1A' }, { br: true },
        { text: b.href, size: 11, color: '777777', href: b.href },
      ])}</text:p>`);
    }
    else if (b.type === 'image') {
      const pic = pictureOf(b.src);
      if (!pic) { body.push(`<text:p text:style-name="Standard">${xmlText(b.alt || b.src.slice(0, 80))}</text:p>`); return; }
      const { w, h } = pictureSize(b, pic, p.line);
      const name = `Pictures/image${pictures.length + 1}.${pic.ext}`;
      pictures.push({ name, pic });
      const frame = `<draw:frame draw:name="Picture ${pictures.length}" text:anchor-type="as-char" svg:width="${(w / PX_PER_MM / 10).toFixed(3)}cm" svg:height="${(h / PX_PER_MM / 10).toFixed(3)}cm"><draw:image xlink:href="${name}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
      // A video's still links to the video.
      const linked = /^https?:/i.test(b.href || '');
      body.push(`<text:p text:style-name="Centered">${linked ? `<draw:a xlink:type="simple" xlink:href="${esc(b.href)}">${frame}</draw:a>` : frame}</text:p>`);
      if (b.caption) body.push(`<text:p text:style-name="Caption">${linked ? `<text:a xlink:type="simple" xlink:href="${esc(b.href)}">${xmlText(b.caption)}</text:a>` : xmlText(b.caption)}</text:p>`);
    } else if (b.type === 'list') {
      // Lists nest: deeper opens a list inside the item; shallower closes back up.
      if (open && (open.el !== b.listId && b.level === 0)) closeLists();
      if (!open) { body.push(`<text:list text:style-name="${b.ordered ? 'LNum' : 'LBullet'}"><text:list-item>`); open = { level: 0, el: b.listId }; }
      else if (b.level > open.level) { for (let l = open.level; l < b.level; l += 1) body.push(`<text:list><text:list-item>`); open.level = b.level; }
      else {
        while (open.level > b.level) { body.push('</text:list-item></text:list>'); open.level -= 1; }
        body.push('</text:list-item><text:list-item>');
      }
      body.push(`<text:p text:style-name="Standard">${runs(b.runs)}</text:p>`);
    }
  });
  closeLists();
  const auto = [...spanStyles.values()].map((s) => `<style:style style:name="${s.name}" style:family="text"><style:text-properties ${s.props}/></style:style>`).join('');
  const listStyle = (name, ordered) => `<text:list-style style:name="${name}">${Array.from({ length: 10 }, (_, l) => (ordered
    ? `<text:list-level-style-number text:level="${l + 1}" style:num-suffix="." style:num-format="${['1', 'a', 'i'][l % 3]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="${(1.27 + l * 0.635).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-number>`
    : `<text:list-level-style-bullet text:level="${l + 1}" text:bullet-char="${['•', '◦', '▪'][l % 3]}"><style:list-level-properties text:list-level-position-and-space-mode="label-alignment"><style:list-level-label-alignment text:label-followed-by="listtab" fo:text-indent="-0.635cm" fo:margin-left="${(1.27 + l * 0.635).toFixed(3)}cm"/></style:list-level-properties></text:list-level-style-bullet>`)).join('')}</text:list-style>`;
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${ODF_NS}><office:font-face-decls><style:font-face style:name="Georgia" svg:font-family="Georgia"/><style:font-face style:name="Consolas" svg:font-family="Consolas" style:font-family-generic="modern" style:font-pitch="fixed"/></office:font-face-decls>
<office:automatic-styles>${auto}${listStyle('LBullet', false)}${listStyle('LNum', true)}</office:automatic-styles>
<office:body><office:text>${body.join('')}</office:text></office:body></office:document-content>`;
  const cm = (mm) => `${(mm / 10).toFixed(3)}cm`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${ODF_NS}><office:font-face-decls><style:font-face style:name="Georgia" svg:font-family="Georgia"/><style:font-face style:name="Consolas" svg:font-family="Consolas" style:font-family-generic="modern" style:font-pitch="fixed"/></office:font-face-decls>
<office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="0.212cm" fo:line-height="115%"/><style:text-properties style:font-name="Georgia" fo:font-size="10.5pt"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph" style:class="text"/>
<style:style style:name="Title" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0.423cm"/><style:text-properties fo:font-size="22pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_1" style:display-name="Heading 1" style:family="paragraph" style:parent-style-name="Standard" style:default-outline-level="1"><style:paragraph-properties fo:margin-top="0.564cm" fo:margin-bottom="0.212cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="18pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_2" style:display-name="Heading 2" style:family="paragraph" style:parent-style-name="Standard" style:default-outline-level="2"><style:paragraph-properties fo:margin-top="0.459cm" fo:margin-bottom="0.176cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="15pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Heading_20_3" style:display-name="Heading 3" style:family="paragraph" style:parent-style-name="Standard" style:default-outline-level="3"><style:paragraph-properties fo:margin-top="0.388cm" fo:margin-bottom="0.141cm" fo:keep-with-next="always"/><style:text-properties fo:font-size="12.5pt" fo:font-weight="bold"/></style:style>
<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-left="0.635cm" fo:padding-left="0.3cm" fo:border-left="1.1pt solid #C9A27A"/><style:text-properties fo:font-style="italic" fo:color="#555555"/></style:style>
<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0cm" fo:background-color="#F4F4F2" fo:line-height="100%"/><style:text-properties style:font-name="Consolas" fo:font-size="9pt"/></style:style>
<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:padding="0cm" fo:border-bottom="0.5pt solid #BBBBBB" fo:margin-bottom="0.3cm"/></style:style>
<style:style style:name="Centered" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/></style:style>
<style:style style:name="Bookmark" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-top="0.2cm" fo:margin-bottom="0.3cm" fo:padding="0.2cm" fo:border="0.5pt solid #CCCCCC" fo:background-color="#F7F7F5"/></style:style>
<style:style style:name="Caption" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:text-align="center"/><style:text-properties fo:font-style="italic" fo:font-size="9pt" fo:color="#555555"/></style:style>
</office:styles>
<office:automatic-styles><style:page-layout style:name="PageLayout"><style:page-layout-properties fo:page-width="${cm(p.w)}" fo:page-height="${cm(p.h)}" style:print-orientation="${p.w > p.h ? 'landscape' : 'portrait'}" fo:margin-top="${cm(p.margin)}" fo:margin-bottom="${cm(p.margin)}" fo:margin-left="${cm(p.margin)}" fo:margin-right="${cm(p.margin)}"/></style:page-layout></office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="PageLayout"/></office:master-styles>
</office:document-styles>`;
  const zip = new JSZip();
  // `mimetype` first and stored, or an ODF reader does not know what it holds.
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });
  zip.file('META-INF/manifest.xml', `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${pictures.map((pc) => `<manifest:file-entry manifest:full-path="${pc.name}" manifest:media-type="${pc.pic.mime}"/>`).join('')}</manifest:manifest>`);
  zip.file('content.xml', content);
  zip.file('styles.xml', styles);
  zip.file('meta.xml', `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${ODF_NS}><office:meta><dc:title>${xmlText(title)}</dc:title><meta:generator>Nebula</meta:generator></office:meta></office:document-meta>`);
  for (const pc of pictures) zip.file(pc.name, pc.pic.bytes);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', mimeType: 'application/vnd.oasis.opendocument.text' });
}

/* ------------------------------------------------------------------ .doc (Rich Text) */

function rtfEscape(text) {
  let out = '';
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0);
    if (ch === '\\' || ch === '{' || ch === '}') out += `\\${ch}`;
    else if (ch === '\t') out += '\\tab ';
    else if (code < 0x80) out += ch;
    else if (code <= 0xffff) out += `\\u${code > 32767 ? code - 65536 : code}?`;
    else {
      // Outside the BMP: the two UTF-16 halves.
      const s = String.fromCodePoint(code);
      for (let i = 0; i < 2; i += 1) { const c = s.charCodeAt(i); out += `\\u${c > 32767 ? c - 65536 : c}?`; }
    }
  }
  return out;
}

/**
 * The note as Rich Text, written to a .doc (Word and LibreOffice open it as one).
 * @returns {string}
 */
export function toDoc(html, title = '', page = {}) {
  const blocks = readBlocks(html);
  const p = sheet(page);
  // \cf1 links, \cf2 quotes, \cbpat3 the code blocks' grey; a run's own colours after them.
  const colors = ['0563C1', '555555', 'F4F4F2'];
  const colorIndex = (hex) => { let i = colors.indexOf(hex); if (i < 0) { colors.push(hex); i = colors.length - 1; } return i + 1; };
  const run = (r) => {
    if (r.br) return '\\line ';
    let fmt = '';
    if (r.code) fmt += '\\f1';
    if (r.b) fmt += '\\b';
    if (r.i) fmt += '\\i';
    if (r.u || r.href) fmt += '\\ul';
    if (r.s) fmt += '\\strike';
    if (r.color) fmt += `\\cf${colorIndex(r.color)}`;
    else if (r.href) fmt += '\\cf1';
    if (r.size) fmt += `\\fs${Math.round(r.size * 0.75 * 2)}`;
    const text = `{${fmt}${fmt ? ' ' : ''}${rtfEscape(r.text)}}`;
    if (r.href && /^(https?|mailto):/i.test(r.href)) return `{\\field{\\*\\fldinst HYPERLINK "${rtfEscape(r.href).replace(/"/g, '')}"}{\\fldrslt ${text}}}`;
    return text;
  };
  const para = (fmt, runs) => `{\\pard\\sa120\\sl276\\slmult1${fmt} ${runs.map(run).join('')}\\par}\n`;
  const out = [];
  if (title) out.push(para('\\fs44\\b\\sa240', [{ text: title }]));
  const counters = new Map();
  blocks.forEach((b, i) => {
    if (i === 0 && b.type === 'heading' && b.level === 1 && b.runs.map((r) => r.text || '').join('').trim() === String(title).trim()) return;
    if (b.type === 'heading') out.push(para(`\\keepn\\sb240\\b\\fs${[0, 36, 30, 25][b.level]}`, b.runs));
    else if (b.type === 'para') out.push(para(b.quote ? '\\li360\\i\\cf2' : '', b.runs));
    else if (b.type === 'todo') out.push(para('', [{ text: b.checked ? '☑ ' : '☐ ' }, ...b.runs]));
    else if (b.type === 'list') {
      const n = (counters.get(b.listId) ?? 0) + 1;
      counters.set(b.listId, n);
      const indent = 720 + b.level * 360;
      out.push(para(`\\li${indent}\\fi-360`, [{ text: b.ordered ? `${n}.\t` : `${['•', '◦', '▪'][b.level % 3]}\t` }, ...b.runs]));
    } else if (b.type === 'code') out.push(`{\\pard\\sa0\\li120\\cbpat3\\f1\\fs18 ${b.text.split('\n').map(rtfEscape).join('\\line ')}\\par}\n`);
    else if (b.type === 'hr') out.push('{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par}\n');
    else if (b.type === 'bookmark') {
      // The card: a box (\cbpat3, the code's grey) with the title over the address.
      out.push(`{\\pard\\sb120\\sa160\\li120\\ri120\\box\\brdrs\\brdrw10\\brdrcf2\\brsp80\\cbpat3 ${[
        { text: 'BOOKMARK', size: 9 }, { br: true },
        { text: b.title, b: true, href: b.href }, { br: true },
        { text: b.href, size: 11, href: b.href },
      ].map(run).join('')}\\par}\n`);
    }
    else if (b.type === 'image') {
      const pic = pictureOf(b.src);
      if (!pic || pic.kind === 'gif') { out.push(para('', [{ text: b.alt || '[picture]' }])); return; }
      const { w, h } = pictureSize(b, pic, p.line);
      const hex = Array.from(pic.bytes, (x) => x.toString(16).padStart(2, '0')).join('').replace(/.{1,128}/g, '$&\n');
      const pict = `{\\pict\\${pic.kind === 'png' ? 'pngblip' : 'jpegblip'}\\picw${pic.w || Math.round(w)}\\pich${pic.h || Math.round(h)}\\picwgoal${Math.round(w * 15)}\\pichgoal${Math.round(h * 15)}\n${hex}}`;
      // A video's still links to the video.
      const linked = /^https?:/i.test(b.href || '');
      out.push(`{\\pard\\qc${linked ? `{\\field{\\*\\fldinst HYPERLINK "${rtfEscape(b.href).replace(/"/g, '')}"}{\\fldrslt ${pict}}}` : pict}\\par}\n`);
      if (b.caption) out.push(para('\\qc\\i\\fs18', [{ text: b.caption, href: linked ? b.href : undefined }]));
    }
  });
  const twip = (mm) => Math.round(mm * TWIP_PER_MM);
  const table = `{\\colortbl;${colors.map((c) => `\\red${parseInt(c.slice(0, 2), 16)}\\green${parseInt(c.slice(2, 4), 16)}\\blue${parseInt(c.slice(4, 6), 16)};`).join('')}}`;
  const body = out.join('');
  return `{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\froman Georgia;}{\\f1\\fmodern Consolas;}}${table}`
    + `\\paperw${twip(p.w)}\\paperh${twip(p.h)}\\margl${twip(p.margin)}\\margr${twip(p.margin)}\\margt${twip(p.margin)}\\margb${twip(p.margin)}${p.w > p.h ? '\\landscape' : ''}`
    + `\\f0\\fs21\n${body}}`;
}

/* ------------------------------------------------------------------ in */

/** A .docx, as HTML (mammoth: headings, lists, emphasis, links, tables, pictures as data URLs). */
export async function docxToHtml(bytes) {
  const mammoth = await import('mammoth/mammoth.browser.js');
  const lib = mammoth.default ?? mammoth;
  // A document's Title is its heading; Nebula writes the note's title that way.
  const res = await lib.convertToHtml({ arrayBuffer: toArrayBuffer(bytes) }, { styleMap: ["p[style-name='Title'] => h1:fresh"] });
  return res.value;
}

function toArrayBuffer(bytes) {
  if (bytes instanceof ArrayBuffer) return bytes;
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

const ODF = {
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  xlink: 'http://www.w3.org/1999/xlink',
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
};

/** An .odt, as HTML: headings, paragraphs, spans with their styles, lists, links, pictures, tables as lines. */
export async function odtToHtml(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('content.xml')?.async('string');
  if (!xml) throw new Error('Not an OpenDocument text');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const styles = new Map();
  const listKinds = new Map();
  for (const s of doc.getElementsByTagNameNS(ODF.style, 'style')) {
    const t = s.getElementsByTagNameNS(ODF.style, 'text-properties')[0];
    const name = s.getAttributeNS(ODF.style, 'name');
    if (!t || !name) continue;
    styles.set(name, {
      b: t.getAttributeNS(ODF.fo, 'font-weight') === 'bold',
      i: t.getAttributeNS(ODF.fo, 'font-style') === 'italic',
      u: !!t.getAttributeNS(ODF.style, 'text-underline-style') && t.getAttributeNS(ODF.style, 'text-underline-style') !== 'none',
      s: !!t.getAttributeNS(ODF.style, 'text-line-through-style') && t.getAttributeNS(ODF.style, 'text-line-through-style') !== 'none',
    });
  }
  for (const l of doc.getElementsByTagNameNS(ODF.text, 'list-style')) {
    const first = [...l.children].find((c) => c.localName?.startsWith('list-level-style'));
    listKinds.set(l.getAttributeNS(ODF.style, 'name'), first?.localName === 'list-level-style-number' ? 'ol' : 'ul');
  }
  const pics = new Map();
  for (const name of Object.keys(zip.files)) {
    const m = /\.(png|jpe?g|gif)$/i.exec(name);
    if (m) pics.set(name, `data:image/${m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase()};base64,${await zip.file(name).async('base64')}`);
  }
  const wrap = (html, st) => {
    if (!st) return html;
    let out = html;
    if (st.b) out = `<strong>${out}</strong>`;
    if (st.i) out = `<em>${out}</em>`;
    if (st.u) out = `<u>${out}</u>`;
    if (st.s) out = `<s>${out}</s>`;
    return out;
  };
  const inline = (node) => {
    let out = '';
    for (const c of node.childNodes) {
      if (c.nodeType === 3) { out += esc(c.nodeValue); continue; }
      if (c.nodeType !== 1) continue;
      const n = c.localName;
      if (n === 's') out += ' '.repeat(Number(c.getAttributeNS(ODF.text, 'c')) || 1);
      else if (n === 'tab') out += '\t';
      else if (n === 'line-break') out += '<br>';
      else if (n === 'span') out += wrap(inline(c), styles.get(c.getAttributeNS(ODF.text, 'style-name')));
      else if (n === 'a') out += `<a href="${esc(c.getAttributeNS(ODF.xlink, 'href'))}">${inline(c)}</a>`;
      else if (n === 'frame') {
        const img = c.getElementsByTagNameNS(ODF.draw, 'image')[0];
        const src = pics.get(img?.getAttributeNS(ODF.xlink, 'href') || '');
        if (src) out += `<img src="${src}" alt="">`;
      } else if (n === 'note' || n === 'annotation' || n === 'bookmark' || n === 'bookmark-start' || n === 'bookmark-end' || n === 'soft-page-break') { /* not text */ }
      else out += inline(c);
    }
    return out;
  };
  const blocks = (node) => {
    let out = '';
    for (const c of node.childNodes) {
      if (c.nodeType !== 1) continue;
      const n = c.localName;
      if (n === 'h') {
        const level = Math.min(3, Math.max(1, Number(c.getAttributeNS(ODF.text, 'outline-level')) || 1));
        out += `<h${level}>${inline(c)}</h${level}>`;
      } else if (n === 'p') {
        const body = inline(c);
        const styleName = c.getAttributeNS(ODF.text, 'style-name');
        if (styleName === 'Title') out += `<h1>${body}</h1>`;
        else out += `<p>${wrap(body, styles.get(styleName)) || '<br>'}</p>`;
      } else if (n === 'list') {
        const tag = listKinds.get(c.getAttributeNS(ODF.text, 'style-name')) || 'ul';
        out += `<${tag}>${[...c.children].map((item) => `<li>${[...item.children].map((x) => (x.localName === 'p' || x.localName === 'h' ? inline(x) : blocks({ childNodes: [x] }))).join('')}</li>`).join('')}</${tag}>`;
      } else if (n === 'table') {
        for (const row of c.getElementsByTagNameNS(ODF.table, 'table-row')) {
          const cells = [...row.getElementsByTagNameNS(ODF.table, 'table-cell')].map((cell) => inline(cell).replace(/<br>/g, ' ').trim()).filter(Boolean);
          if (cells.length) out += `<p>${cells.join(' | ')}</p>`;
        }
      } else if (n === 'section' || n === 'list-item') out += blocks(c);
    }
    return out;
  };
  const text = doc.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'text')[0];
  return text ? blocks(text) : '';
}

/**
 * Rich Text (a .doc that is RTF, as Word writes them for "Rich Text" and as
 * Nebula exports them), as HTML: paragraphs, bold, italic, underline, struck,
 * links, PNG and JPEG pictures. Tables, headers and fields' codes are skipped.
 */
export function rtfToHtml(rtf) {
  const src = String(rtf ?? '');
  const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'header', 'footer', 'headerl', 'headerr', 'footerl', 'footerr', 'fldinst', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'xmlnstbl', 'themedata', 'colorschememapping', 'latentstyles', 'datastore', 'pgdsctbl', 'revtbl', 'mmathPr', 'object', 'nonshppict', 'fonttbl']);
  const stack = [];
  let state = { b: false, i: false, u: false, s: false, skip: false, pict: null, uc: 1 };
  const paras = [];
  let cur = '';
  let pendingSkip = 0;
  const open = () => { stack.push(state); state = { ...state }; };
  const close = () => {
    if (state.pict && !(stack.at(-1)?.pict)) {
      const hex = state.pict.hex.replace(/[^0-9a-f]/gi, '');
      if (hex.length > 16 && state.pict.kind) {
        let bin = '';
        for (let k = 0; k + 1 < hex.length; k += 2) bin += String.fromCharCode(parseInt(hex.slice(k, k + 2), 16));
        cur += `<img src="data:image/${state.pict.kind};base64,${btoa(bin)}" alt="">`;
      }
    }
    state = stack.pop() ?? state;
  };
  const emit = (chunk) => {
    let text = chunk;
    if (pendingSkip > 0) {                    // the stand-in after a \u character
      const drop = Math.min(pendingSkip, text.length);
      pendingSkip -= drop;
      text = text.slice(drop);
      if (!text) return;
    }
    if (state.skip) return;
    if (state.pict) { state.pict.hex += text; return; }
    let t = esc(text);
    if (state.b) t = `<strong>${t}</strong>`;
    if (state.i) t = `<em>${t}</em>`;
    if (state.u) t = `<u>${t}</u>`;
    if (state.s) t = `<s>${t}</s>`;
    cur += t;
  };
  const endPara = () => { paras.push(cur); cur = ''; };
  const cp1252 = (byte) => new TextDecoder('windows-1252').decode(new Uint8Array([byte]));
  let i = 0;
  let destinationNext = false;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '{') { open(); i += 1; destinationNext = true; continue; }
    if (ch === '}') { close(); i += 1; continue; }
    if (ch === '\\') {
      const next = src[i + 1];
      if (next === '\\' || next === '{' || next === '}') { emit(next); i += 2; destinationNext = false; continue; }
      if (next === '*') { state.star = true; i += 2; continue; }
      if (next === "'") { emit(cp1252(parseInt(src.slice(i + 2, i + 4), 16))); i += 4; destinationNext = false; continue; }
      if (next === '~') { emit('\u00a0'); i += 2; continue; }
      if (next === '\n' || next === '\r') { endPara(); i += 2; continue; }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(src.slice(i, i + 40));
      if (!m) { i += 2; continue; }
      i += m[0].length;
      const word = m[1];
      const arg = m[2] === undefined ? null : Number(m[2]);
      // \*\shppict holds Word's picture; any other \* destination is not text.
      if (state.star) { state.star = false; if (word !== 'shppict') state.skip = true; }
      if (destinationNext && SKIP.has(word)) state.skip = true;
      destinationNext = false;
      if (word === 'pict') { state.pict = { hex: '', kind: null }; continue; }
      if (state.pict) { if (word === 'pngblip') state.pict.kind = 'png'; else if (word === 'jpegblip') state.pict.kind = 'jpeg'; continue; }
      if (word === 'par' || word === 'sect') endPara();
      else if (word === 'line') cur += '<br>';
      else if (word === 'tab') emit('\t');
      else if (word === 'b') state.b = arg !== 0;
      else if (word === 'i') state.i = arg !== 0;
      else if (word === 'ul') state.u = arg !== 0;
      else if (word === 'ulnone') state.u = false;
      else if (word === 'strike') state.s = arg !== 0;
      else if (word === 'plain') { state.b = false; state.i = false; state.u = false; state.s = false; }
      else if (word === 'uc') state.uc = arg ?? 1;
      else if (word === 'u' && arg !== null) { emit(String.fromCharCode(arg < 0 ? arg + 65536 : arg)); pendingSkip = state.uc; }
      else if (word === 'emdash') emit('—');
      else if (word === 'endash') emit('–');
      else if (word === 'bullet') emit('•');
      else if (word === 'lquote') emit('‘');
      else if (word === 'rquote') emit('’');
      else if (word === 'ldblquote') emit('“');
      else if (word === 'rdblquote') emit('”');
      continue;
    }
    if (ch === '\r' || ch === '\n') { i += 1; continue; }
    destinationNext = false;
    let j = i;
    while (j < src.length && !'\\{}\r\n'.includes(src[j])) j += 1;
    emit(src.slice(i, j));
    i = j;
  }
  if (cur) endPara();
  // Two halves of a surrogate pair written as \u escapes come out as two
  // characters; the browser joins them on the way back to a string.
  // Rich Text has lists only as a mark and a tab at a line's start (as Nebula
  // writes them, and as most writers' plain-text fallbacks do): a run of such
  // lines is a list again.
  let html = '';
  let list = null;
  for (const raw of paras) {
    const p = raw.trim();
    const m = /^(?:<[^>]+>)*(?:([•◦▪·-])|(\d+)[.)])\t\s*/.exec(p);
    const kind = m ? (m[1] ? 'ul' : 'ol') : null;
    if (kind !== list) { if (list) html += `</${list}>`; if (kind) html += `<${kind}>`; list = kind; }
    html += kind ? `<li>${p.slice(m[0].length)}</li>` : `<p>${p || '<br>'}</p>`;
  }
  if (list) html += `</${list}>`;
  return html;
}

/** What kind of .doc a file really is, from its first bytes. */
export function docKind(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const head = String.fromCharCode(...b.slice(0, 8));
  if (head.startsWith('{\\rtf')) return 'rtf';
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'binary';
  if (b[0] === 0x50 && b[1] === 0x4b) return 'zip';             // a .docx under another name
  return /^\s*</.test(new TextDecoder().decode(b.slice(0, 64))) ? 'html' : 'text';
}

/* ------------------------------------------------------------------ the preview */

/**
 * The document as it will look, as a page for the export preview (0.9.3, the
 * owner: "a preview for docx and odt too"): the same blocks the file is made
 * of, set in the file's own styles (Georgia 10.5 pt, its heading sizes, the
 * quote's rule, the code's grey) on the same paper with the same margins.
 * Printed to a PDF by the main process like the PDF export's preview.
 */
export function previewDocument(html, title = '', page = {}) {
  const blocks = readBlocks(html);
  const p = sheet(page);
  const runs = (list) => list.map((r) => {
    if (r.br) return '<br>';
    let t = esc(r.text);
    if (r.code) t = `<code>${t}</code>`;
    if (r.b) t = `<b>${t}</b>`;
    if (r.i) t = `<i>${t}</i>`;
    if (r.u) t = `<u>${t}</u>`;
    if (r.s) t = `<s>${t}</s>`;
    const style = [r.color ? `color:#${r.color}` : '', r.size ? `font-size:${(r.size * 0.75).toFixed(1)}pt` : '', r.font && !r.code ? `font-family:'${esc(r.font)}'` : ''].filter(Boolean).join(';');
    if (style) t = `<span style="${style}">${t}</span>`;
    return r.href ? `<a href="${esc(r.href)}">${t}</a>` : t;
  }).join('');
  const out = [];
  if (title) out.push(`<p class="title">${esc(title)}</p>`);
  const counters = new Map();
  blocks.forEach((b, i) => {
    if (i === 0 && b.type === 'heading' && b.level === 1 && b.runs.map((r) => r.text || '').join('').trim() === String(title).trim()) return;
    if (b.type === 'heading') out.push(`<h${b.level}>${runs(b.runs)}</h${b.level}>`);
    else if (b.type === 'para') out.push(`<p${b.quote ? ' class="quote"' : ''}>${runs(b.runs) || '<br>'}</p>`);
    else if (b.type === 'todo') out.push(`<p>${b.checked ? '☑' : '☐'} ${runs(b.runs)}</p>`);
    else if (b.type === 'list') {
      const n = (counters.get(b.listId) ?? 0) + 1;
      counters.set(b.listId, n);
      out.push(`<p class="li" style="margin-left:${12.7 + b.level * 6.35}mm"><span class="mark">${b.ordered ? `${n}.` : ['•', '◦', '▪'][b.level % 3]}</span>${runs(b.runs)}</p>`);
    } else if (b.type === 'code') out.push(`<pre>${esc(b.text)}</pre>`);
    else if (b.type === 'hr') out.push('<hr>');
    else if (b.type === 'bookmark') out.push(`<div class="bm"><small>BOOKMARK</small><a href="${esc(b.href)}"><b>${esc(b.title)}</b></a><a class="u" href="${esc(b.href)}">${esc(b.href)}</a></div>`);
    else if (b.type === 'image') {
      const pic = pictureOf(b.src);
      const size = pictureSize(b, pic ?? { w: 0, h: 0 }, p.line);
      const img = `<img src="${esc(b.src)}" style="width:${Math.round(size.w)}px;height:${Math.round(size.h)}px" alt="">`;
      out.push(`<p class="center">${b.href ? `<a href="${esc(b.href)}">${img}</a>` : img}</p>`);
      if (b.caption) out.push(`<p class="caption">${esc(b.caption)}</p>`);
    }
  });
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  @page { size: ${p.w}mm ${p.h}mm; margin: ${p.margin}mm; }
  html, body { margin: 0; background: #fff; color: #111; }
  body { font: 10.5pt/1.15 Georgia, serif; }
  p { margin: 0 0 6pt; }
  .title { font-size: 22pt; font-weight: bold; margin-bottom: 12pt; }
  h1, h2, h3 { font-weight: bold; break-after: avoid; margin: 0; }
  h1 { font-size: 18pt; margin: 16pt 0 6pt; } h2 { font-size: 15pt; margin: 13pt 0 5pt; } h3 { font-size: 12.5pt; margin: 11pt 0 4pt; }
  .quote { border-left: 1.5pt solid #C9A27A; padding-left: 8pt; margin-left: 6mm; font-style: italic; color: #555; }
  .li { margin-bottom: 2pt; text-indent: -6.35mm; } .li .mark { display: inline-block; width: 6.35mm; text-indent: 0; }
  pre { font: 9pt/1.2 Consolas, monospace; background: #F4F4F2; padding: 2pt 6pt; margin: 0 0 6pt; white-space: pre-wrap; }
  code { font-family: Consolas, monospace; }
  hr { border: 0; border-bottom: 0.5pt solid #BBB; margin: 6pt 0 10pt; }
  .center { text-align: center; } img { max-width: 100%; }
  .caption { text-align: center; font-style: italic; font-size: 9pt; color: #555; }
  .bm { border: 0.5pt solid #CCC; background: #F7F7F5; padding: 5pt 7pt; margin: 6pt 2pt 8pt; break-inside: avoid; }
  .bm small { display: block; font-size: 6.75pt; color: #888; letter-spacing: .04em; }
  .bm a { display: block; color: #1A1A1A; text-decoration: underline; } .bm a.u { color: #777; font-size: 8.25pt; }
  a { color: #0563C1; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${out.join('')}</body></html>`;
}

/* ------------------------------------------------------------------ Evernote (.enex) */

/** MD5, for Evernote's media hashes (crypto.subtle has none). */
export function md5Hex(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i += 1) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const len = b.length;
  const words = new Uint32Array((((len + 8) >>> 6) + 1) * 16);
  for (let i = 0; i < len; i += 1) words[i >> 2] |= b[i] << ((i % 4) * 8);
  words[len >> 2] |= 0x80 << ((len % 4) * 8);
  words[words.length - 2] = (len * 8) >>> 0;
  words[words.length - 1] = Math.floor((len * 8) / 2 ** 32) >>> 0;
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let o = 0; o < words.length; o += 16) {
    let [A, B, C, D] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i += 1) {
      let F;
      let g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; } else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const tmp = D;
      D = C;
      C = B;
      const sum = (A + F + K[i] + words[o + g]) >>> 0;
      const s = S[(i >> 4) * 4 + (i % 4)];
      B = (B + ((sum << s) | (sum >>> (32 - s)))) >>> 0;
      A = tmp;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  return [a0, b0, c0, d0].map((v) => [0, 8, 16, 24].map((s) => ((v >>> s) & 0xff).toString(16).padStart(2, '0')).join('')).join('');
}

function enexDate(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/**
 * The note as an Evernote export (.enex) — what Apple Notes, Evernote, Bear,
 * Joplin and UpNote import (0.9.3, the owner: "the note formats popular on a
 * Mac"). ENML: the XHTML Evernote keeps, pictures as resources by their MD5.
 */
export function toEnex(html, title = '', { created = Date.now(), updated = Date.now() } = {}) {
  const blocks = readBlocks(html);
  const resources = [];
  const runs = (list) => list.map((r) => {
    if (r.br) return '<br/>';
    let t = xmlText(r.text);
    if (r.code) t = `<code>${t}</code>`;
    if (r.b) t = `<b>${t}</b>`;
    if (r.i) t = `<i>${t}</i>`;
    if (r.u) t = `<u>${t}</u>`;
    if (r.s) t = `<s>${t}</s>`;
    if (r.color) t = `<span style="color:#${r.color}">${t}</span>`;
    return r.href && /^(https?|mailto):/i.test(r.href) ? `<a href="${esc(r.href)}">${t}</a>` : t;
  }).join('');
  const body = [];
  let open = [];               // the lists open, innermost last: 'ul' | 'ol'
  const closeTo = (level) => { while (open.length > level) body.push(`</li></${open.pop()}>`); };
  blocks.forEach((b) => {
    if (b.type !== 'list') closeTo(0);
    if (b.type === 'heading') body.push(`<h${b.level}>${runs(b.runs)}</h${b.level}>`);
    else if (b.type === 'para') body.push(b.quote ? `<blockquote><div>${runs(b.runs)}</div></blockquote>` : `<div>${runs(b.runs) || '<br/>'}</div>`);
    else if (b.type === 'todo') body.push(`<div><en-todo checked="${b.checked ? 'true' : 'false'}"/>${runs(b.runs)}</div>`);
    else if (b.type === 'code') body.push(`<pre>${xmlText(b.text)}</pre>`);
    else if (b.type === 'hr') body.push('<hr/>');
    else if (b.type === 'bookmark') body.push(`<div style="border:1px solid #cccccc;background-color:#f7f7f5;padding:6px 9px;margin:6px 0"><div style="font-size:9px;color:#888888">BOOKMARK</div><div><a href="${esc(b.href)}"><b>${xmlText(b.title)}</b></a></div><div><a href="${esc(b.href)}" style="color:#777777">${xmlText(b.href)}</a></div></div>`);
    else if (b.type === 'image') {
      const pic = pictureOf(b.src);
      if (!pic) { body.push(`<div>${xmlText(b.alt || '')}</div>`); return; }
      const hash = md5Hex(pic.bytes);
      resources.push({ pic, hash });
      const media = `<en-media type="${pic.mime}" hash="${hash}"/>`;
      body.push(`<div>${/^https?:/i.test(b.href || '') ? `<a href="${esc(b.href)}">${media}</a>` : media}</div>`);
      if (b.caption) body.push(`<div><i>${xmlText(b.caption)}</i></div>`);
    } else if (b.type === 'list') {
      const tag = b.ordered ? 'ol' : 'ul';
      if (open.length > b.level + 1) closeTo(b.level + 1);
      if (open.length === b.level + 1) {
        if (open[b.level] !== tag) { closeTo(b.level); body.push(`<${tag}><li>`); open.push(tag); } else body.push('</li><li>');
      } else {
        while (open.length < b.level + 1) { body.push(`<${tag}><li>`); open.push(tag); }
      }
      body.push(runs(b.runs));
    }
  });
  closeTo(0);
  const enml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE en-note SYSTEM "http://xml.evernote.com/pub/enml2.dtd"><en-note>${body.join('')}</en-note>`;
  const res = resources.map(({ pic, hash }) => `<resource><data encoding="base64">${pic.b64}</data><mime>${pic.mime}</mime>${pic.w ? `<width>${pic.w}</width><height>${pic.h}</height>` : ''}<resource-attributes><file-name>${hash}.${pic.ext}</file-name></resource-attributes></resource>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE en-export SYSTEM "http://xml.evernote.com/pub/evernote-export4.dtd">
<en-export export-date="${enexDate()}" application="Nebula" version="0.9.3">
<note><title>${xmlText(title || 'Untitled')}</title><content><![CDATA[${enml.replace(/]]>/g, ']]]]><![CDATA[>')}]]></content><created>${enexDate(new Date(created))}</created><updated>${enexDate(new Date(updated))}</updated>${res}</note>
</en-export>
`;
}

/**
 * An Evernote export, as notes: [{ title, html }]. Pictures come back from
 * their resources (matched by MD5), to-dos as to-dos.
 */
export function enexToNotes(xml) {
  const doc = new DOMParser().parseFromString(String(xml ?? ''), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Not an Evernote export');
  const notes = [];
  for (const note of doc.getElementsByTagName('note')) {
    const title = note.getElementsByTagName('title')[0]?.textContent.trim() || 'Imported note';
    const media = new Map();
    for (const r of note.getElementsByTagName('resource')) {
      const b64 = (r.getElementsByTagName('data')[0]?.textContent || '').replace(/\s+/g, '');
      const mime = r.getElementsByTagName('mime')[0]?.textContent.trim() || '';
      if (!b64 || !/^image\/(png|jpeg|gif|webp)$/i.test(mime)) continue;
      media.set(md5Hex(base64Bytes(b64)), `data:${mime};base64,${b64}`);
    }
    const enml = note.getElementsByTagName('content')[0]?.textContent || '';
    const body = new DOMParser().parseFromString(enml.replace(/<\?xml[^>]*\?>/, '').replace(/<!DOCTYPE[^>]*>/i, ''), 'text/html').body;
    for (const m of [...body.querySelectorAll('en-media')]) {
      const src = media.get(String(m.getAttribute('hash') || '').toLowerCase());
      if (src) { const img = body.ownerDocument.createElement('img'); img.setAttribute('src', src); img.setAttribute('alt', ''); m.replaceWith(img); } else m.remove();
    }
    for (const t of [...body.querySelectorAll('en-todo')]) {
      const host = t.closest('div, p, li') || t.parentElement;
      if (host && host !== body) {
        const todo = body.ownerDocument.createElement('div');
        todo.className = t.getAttribute('checked') === 'true' ? 'blk-todo done' : 'blk-todo';
        t.remove();
        todo.innerHTML = host.innerHTML;
        host.replaceWith(todo);
      } else t.remove();
    }
    const content = body.querySelector('en-note')?.innerHTML ?? body.innerHTML;
    notes.push({ title, html: content });
  }
  return notes;
}
