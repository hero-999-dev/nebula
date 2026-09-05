/**
 * Tiny syntax highlighter — no dependencies, works offline.
 * Tokenizes with one combined regex per language so ordering (comments and
 * strings first) prevents keywords inside strings from being colored.
 * Output: <span class="tok-*"> spans; input is escaped first, always.
 */

export const LANGS = {
  plain: { label: 'Plain text' },
  javascript: { label: 'JavaScript' },
  typescript: { label: 'TypeScript' },
  python: { label: 'Python' },
  html: { label: 'HTML' },
  css: { label: 'CSS' },
  json: { label: 'JSON' },
  sql: { label: 'SQL' },
  bash: { label: 'Bash' },
  markdown: { label: 'Markdown' },
};

const KEYWORDS = {
  javascript: 'await async break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while yield',
  typescript: 'abstract any as asserts async await boolean break case catch class const continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let namespace never new null number of private protected public readonly return set static string super switch this throw true try type typeof undefined union unknown var void while yield',
  python: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda none nonlocal not or pass raise return self true false try while with yield',
  sql: 'select from where insert update delete create table drop alter add join left right inner outer on group by order having limit offset values set into as and or not null distinct count sum avg min max primary key foreign references index view union all case when then else end',
  bash: 'if then else elif fi for while do done case esac function return export local readonly echo cd ls mkdir rm cp mv cat grep sed awk curl git npm node sudo apt exit source',
  css: '',
  html: '',
  json: '',
  markdown: '',
  plain: '',
};

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Ordered rules per language. First match wins, so comments/strings lead. */
function rulesFor(lang) {
  const kw = KEYWORDS[lang] ? new RegExp(`\\b(?:${KEYWORDS[lang].trim().split(/\s+/).join('|')})\\b`, 'i') : null;

  const common = [];
  if (lang === 'javascript' || lang === 'typescript') {
    common.push(
      ['comment', /\/\/[^\n]*|\/\*[\s\S]*?\*\//],
      ['string', /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/],
      ['regexp', /\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[gimsuy]*/],
      ['number', /\b0[xX][\da-fA-F]+n?\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?\b/],
      ['keyword', kw],
      ['literal', /\b(?:true|false|null|undefined|NaN|Infinity)\b/],
      ['fn', /\b[A-Za-z_$][\w$]*(?=\s*\()/],
      ['klass', /\b[A-Z][\w$]*\b/],
      ['punct', /[{}()[\];,.]|=>|[+\-*/%=<>!&|?:~^]+/],
    );
  } else if (lang === 'python') {
    common.push(
      ['comment', /#[^\n]*/],
      ['string', /"""[\s\S]*?"""|'''[\s\S]*?'''|[rbfu]{0,2}"(?:\\.|[^"\\])*"|[rbfu]{0,2}'(?:\\.|[^'\\])*'/],
      ['decorator', /@[\w.]+/],
      ['number', /\b0[xXbBoO][\da-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?j?\b/],
      ['keyword', kw],
      ['literal', /\b(?:True|False|None)\b/],
      ['fn', /\b[A-Za-z_]\w*(?=\s*\()/],
      ['klass', /\b[A-Z]\w*\b/],
      ['punct', /[{}()[\];,.:]|[+\-*/%=<>!&|^~]+/],
    );
  } else if (lang === 'html') {
    common.push(
      ['comment', /<!--[\s\S]*?-->/],
      ['string', /"[^"]*"|'[^']*'/],
      ['tag', /<\/?[A-Za-z][\w-]*|\/?>/],
      ['attr', /\b[a-zA-Z-]+(?==)/],
      ['punct', /[=]/],
    );
  } else if (lang === 'css') {
    common.push(
      ['comment', /\/\*[\s\S]*?\*\//],
      ['string', /"[^"]*"|'[^']*'/],
      ['atrule', /@[\w-]+/],
      ['number', /#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg|fr)?\b/],
      ['selector', /[.#][\w-]+|::?[\w-]+/],
      ['attr', /\b[a-z-]+(?=\s*:)/],
      ['punct', /[{}();:,]/],
    );
  } else if (lang === 'json') {
    common.push(
      ['attr', /"(?:\\.|[^"\\])*"(?=\s*:)/],
      ['string', /"(?:\\.|[^"\\])*"/],
      ['number', /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/],
      ['literal', /\b(?:true|false|null)\b/],
      ['punct', /[{}[\],:]/],
    );
  } else if (lang === 'markdown') {
    common.push(
      ['comment', /^>[^\n]*/m],
      ['klass', /^#{1,6}[^\n]*/m],
      ['string', /`[^`\n]*`|```[\s\S]*?```/],
      ['keyword', /\*\*[^*\n]+\*\*|__[^_\n]+__/],
      ['literal', /\*[^*\n]+\*|_[^_\n]+_/],
      ['fn', /^\s*(?:[-*+]|\d+\.)\s/m],
      ['regexp', /\[[^\]\n]*\]\([^)\n]*\)/],
    );
  } else if (lang === 'sql' || lang === 'bash') {
    common.push(
      ['comment', lang === 'sql' ? /--[^\n]*|\/\*[\s\S]*?\*\// : /#[^\n]*/],
      ['string', /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/],
      ['number', /\b\d+(?:\.\d+)?\b/],
      ['keyword', kw],
      ['punct', lang === 'sql' ? /[(),;.*=<>]/ : /[|&;()<>$]/],
    );
  }
  return common.filter(([, re]) => re);
}

const cache = new Map();
function combined(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const rules = rulesFor(lang);
  if (!rules.length) {
    cache.set(lang, null);
    return null;
  }
  const re = new RegExp(rules.map(([, r]) => `(${r.source})`).join('|'), 'gm' + (rules.some(([, r]) => r.flags.includes('i')) ? 'i' : ''));
  const entry = { re, names: rules.map(([n]) => n) };
  cache.set(lang, entry);
  return entry;
}

/** Highlight source → HTML string (already escaped). */
export function highlight(code, lang) {
  const src = String(code ?? '');
  const entry = LANGS[lang] ? combined(lang) : null;
  if (!entry) return esc(src);

  let out = '';
  let last = 0;
  entry.re.lastIndex = 0;
  let m;
  while ((m = entry.re.exec(src))) {
    if (m.index > last) out += esc(src.slice(last, m.index));
    const gi = m.slice(1).findIndex((g) => g !== undefined);
    const cls = entry.names[gi] ?? 'punct';
    out += `<span class="tok-${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
    if (m[0] === '') entry.re.lastIndex++; // never spin on empty matches
  }
  if (last < src.length) out += esc(src.slice(last));
  return out;
}
