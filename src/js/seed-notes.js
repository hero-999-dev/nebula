/**
 * Seed notes — one per feature category, so every part of the editor can be
 * checked by hand in the real app. Created only on a fresh vault.
 */

const code = (src, lang) =>
  `<div class="blk-code" data-block-type="code" data-lang="${lang}" data-code="${encodeURIComponent(src)}" contenteditable="false">` +
  `<div class="code-head"><select class="code-lang" title="Code language"></select>` +
  `<span class="code-hint">markdown-style block · click the code to edit</span>` +
  `<button type="button" class="code-copy" title="Copy code">Copy</button></div>` +
  `<pre class="code-body"><code class="code-src" contenteditable="true" spellcheck="false"></code></pre></div>`;

const JS_SRC = `// JavaScript — strings, numbers, keywords, regex
import { highlight } from './highlight.js';

const LANGS = ['js', 'python', 'sql'];
export async function paint(block, lang = 'javascript') {
  const src = decodeURIComponent(block.dataset.code ?? '');
  if (!/^[\\w-]+$/.test(lang)) throw new Error(\`bad lang: \${lang}\`);
  await Promise.resolve();
  return highlight(src, lang); // returns escaped HTML
}
class Painter extends Base { constructor() { super(); this.count = 0xFF; } }`;

const PY_SRC = `# Python — decorators, f-strings, triple quotes
from dataclasses import dataclass

@dataclass
class Note:
    title: str
    tags: list[str] = None

    def slug(self) -> str:
        """Lowercase, dashes, no junk."""
        return "-".join(self.title.lower().split())

notes = [Note(f"note {i}", tags=["demo"]) for i in range(3)]
print(f"{len(notes)} notes -> {notes[0].slug()}", True, None)`;

const SQL_SRC = `-- SQL — keywords are case-insensitive here
SELECT n.id, n.title, COUNT(t.id) AS tag_count
FROM notes AS n
LEFT JOIN tags AS t ON t.note_id = n.id
WHERE n.updated_at > '2026-01-01' AND n.title IS NOT NULL
GROUP BY n.id, n.title
ORDER BY tag_count DESC
LIMIT 10;`;

const CSS_SRC = `/* CSS — selectors, units, hex colors */
.blk-code {
  border: 1.4px solid var(--ink);
  border-radius: 10px;
  background: #EFE8D8;
  padding: 0.5rem 12px;
}
.blk-code:hover::after { content: "code"; opacity: 0.6; }
@media (max-width: 900px) { .blk-code { border-radius: 6px; } }`;

const JSON_SRC = `{
  "name": "nebula",
  "version": "0.3.0",
  "editor": { "toolbar": ["undo", "bold", "code"], "shapes": true },
  "counts": [1, 2.5, -3e4],
  "ok": true,
  "extra": null
}`;

const HTML_SRC = `<!-- HTML — tags, attributes, strings -->
<div class="blk-code" data-lang="javascript">
  <select class="code-lang"><option value="js">JavaScript</option></select>
  <pre><code contenteditable="true">const x = 1;</code></pre>
</div>`;

const MD_SRC = `# Markdown
Regular text with **bold**, *italic* and \`inline code\`.

- bullet one
- bullet two
1. first
2. second

> a quote line
[a link](https://example.com)`;

export const SEED_NOTES = [
  {
    title: 'Welcome to Nebula',
    content:
      '<h1>Welcome to Nebula</h1>' +
      '<p>A calm place for notes. Everything auto-saves.</p>' +
      '<p>The <strong>editing bar</strong> can move: use the six buttons on the header line to send it <em>top / right / bottom / left</em>, toggle the <em>AI panel</em>, or hide the bar entirely.</p>' +
      '<p>Type <span class="inline-code">/</span> anywhere for blocks. Right-click a selection for the compact bar. The test notes below cover every feature one by one.</p>',
  },
  {
    title: 'Test · Code blocks',
    content:
      '<h1>Code blocks</h1>' +
      '<p>Markdown-style: pick a language in the dropdown and the colors follow — like GitHub, Discord or Notion. Click into the code to edit; switching language repaints it.</p>' +
      '<h2>JavaScript</h2>' + code(JS_SRC, 'javascript') +
      '<h2>Python</h2>' + code(PY_SRC, 'python') +
      '<h2>SQL</h2>' + code(SQL_SRC, 'sql') +
      '<h2>CSS</h2>' + code(CSS_SRC, 'css') +
      '<h2>JSON</h2>' + code(JSON_SRC, 'json') +
      '<h2>HTML</h2>' + code(HTML_SRC, 'html') +
      '<h2>Markdown</h2>' + code(MD_SRC, 'markdown') +
      '<p><strong>Check:</strong> change the language of the first block to Python — the same text should recolor. The Copy button copies the raw source.</p>',
  },
  {
    title: 'Test · Text formatting',
    content:
      '<h1>Text formatting</h1>' +
      '<p><strong>Bold</strong> · <em>italic</em> · <span class="u-single">underline</span> · <s>strikethrough</s> · <span class="inline-code">inline code</span> · <span class="inline-eq">E = mc²</span></p>' +
      '<h2>Underline styles (must never nest)</h2>' +
      '<p><span class="u-single">single</span> — <span class="u-double">double</span> — <span class="u-bold">bold</span> — <span class="u-wavy">wavy</span> — <span class="u-dash">dashed</span></p>' +
      '<p><strong>Check:</strong> select any of those words and apply another underline style from the ▾ menu — it must swap, not stack. "None" clears it.</p>' +
      '<h2>Colors</h2>' +
      '<p><span style="color:#9E3B32">red text</span> · <span style="color:#4A6B8A">blue text</span> · <span style="background-color:#EFE3C0">yellow background</span> · <span style="background-color:#D6E4D0">green background</span></p>' +
      '<p><strong>Check:</strong> the <em>A</em> button uses the last text color, <em>H</em> the last highlight; each ▾ opens its own list (Notion-style names) plus a custom picker.</p>' +
      '<h2>Font &amp; size</h2>' +
      '<p><span style="font-family:Georgia">Georgia</span> · <span style="font-family:Arial">Arial</span> · <span style="font-size:22px">22px</span> · <span style="font-size:11px">11px</span></p>' +
      '<p><strong>Check:</strong> put the caret in any of those — the Font and Size boxes must show what it actually is. Type any number into Size (e.g. 37) and press Enter.</p>',
  },
  {
    title: 'Test · Lists, to-dos & indent',
    content:
      '<h1>Lists, to-dos &amp; indent</h1>' +
      '<h2>Bulleted</h2><ul><li>first</li><li>second</li><li>third</li></ul>' +
      '<h2>Numbered</h2><ol><li>one</li><li>two</li><li>three</li></ol>' +
      '<h2>To-dos</h2>' +
      '<div class="blk-todo done">this one is done</div>' +
      '<div class="blk-todo">click the box to tick me</div>' +
      '<div class="blk-todo" data-ind="1">indented one level (Tab)</div>' +
      '<div class="blk-todo" data-ind="2">indented two levels</div>' +
      '<p><strong>Check:</strong> Tab / Shift+Tab indent any block up to 6 levels. The outline dropdown sits before the list buttons, LibreOffice-style.</p>',
  },
  {
    title: 'Test · Shapes (free movement)',
    content:
      '<div class="shape-layer" contenteditable="false" data-block-type="shape-layer">' +
      '<div class="shape rect" data-kind="rect" style="left:430px;top:120px;width:150px;height:90px;background:#D6E4D0"><div class="shape-text" contenteditable="true">drag me anywhere</div><span class="shape-h"></span></div>' +
      '<div class="shape ellipse" data-kind="ellipse" style="left:470px;top:260px;width:150px;height:110px;background:#D3E0EA"><div class="shape-text" contenteditable="true">over the text</div><span class="shape-h"></span></div>' +
      '<div class="shape diamond behind" data-kind="diamond" style="left:380px;top:400px;width:160px;height:120px;background:#F0D2CE"><div class="shape-text" contenteditable="true">behind text</div><span class="shape-h"></span></div>' +
      '</div>' +
      '<h1>Shapes float over the whole note</h1>' +
      '<p>Shapes are not trapped in a box any more. They sit on one layer that covers the entire note, so you can drag them anywhere — over this paragraph, past the heading, down to the bottom. Text wrap is <strong>through</strong>: the words never reflow, the shape just floats above (or behind) them.</p>' +
      '<p>Select a shape to get its little bar: recolor it, send it <em>behind</em> the text, bring it <em>above</em>, or delete it. Drag the corner handle to resize. Double-click to write inside.</p>' +
      '<p>Lorem line to give the shapes something to float over. Move the green rectangle down here and the text stays exactly where it is — that is what wrap-through means.</p>' +
      '<p><strong>Check:</strong> add more from the toolbar ◇ button (▾ for ellipse / diamond) or type <span class="inline-code">/shape</span>.</p>',
  },
  {
    title: 'Test · Editing bar & AI panel',
    content:
      '<h1>Editing bar &amp; AI panel</h1>' +
      '<p>The six buttons top-right move the <strong>editing bar</strong> (the two-row toolbar), not the note:</p>' +
      '<ul>' +
      '<li><strong>↑</strong> bar on top (default) · press the active side again to come back to top</li>' +
      '<li><strong>↓</strong> bar under the note</li>' +
      '<li><strong>←</strong> bar as a vertical rail on the left</li>' +
      '<li><strong>→</strong> bar as a vertical rail on the right</li>' +
      '<li><strong>AI</strong> opens the panel — tabs for Claude, Gemini, ChatGPT, Mistral, DeepSeek, Copilot, Perplexity; the strip scrolls sideways (shift+wheel) and <strong>+</strong> adds any site. Drag its left edge to resize.</li>' +
      '<li><strong>−</strong> hides the bar for a clean page</li>' +
      '</ul>' +
      '<p><strong>Check:</strong> the layout is remembered after a restart. In the browser preview the AI tabs show open-in-browser links; the desktop app embeds the real chats.</p>',
  },
];
