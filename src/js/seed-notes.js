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

// The six languages added in 0.4.0. Each sample is written to exercise the
// tokens its rules actually claim to know — comments, strings, numbers,
// keywords, type names — so a broken rule shows up as flat grey text here
// rather than in a real note six months later.
const C_SRC = `/* C — preprocessor, pointers, printf formats */
#include <stdio.h>
#include <stdlib.h>

#define MAX_NOTES 64

typedef struct {
    char *title;
    int   tags;
} Note;

int main(void) {
    Note *notes = calloc(MAX_NOTES, sizeof(Note));
    if (notes == NULL) return 1;
    for (int i = 0; i < 3; i++) {
        notes[i].title = "untitled";
        printf("%d: %s\\n", i, notes[i].title);
    }
    free(notes);
    return 0;
}`;

const CPP_SRC = `// C++ — templates, namespaces, RAII
#include <iostream>
#include <string>
#include <vector>

namespace nebula {

template <typename T>
class Store {
 public:
  explicit Store(std::size_t cap) { items_.reserve(cap); }
  void add(const T& item) { items_.push_back(item); }
  auto size() const noexcept -> std::size_t { return items_.size(); }

 private:
  std::vector<T> items_;
};

}  // namespace nebula

int main() {
  nebula::Store<std::string> notes{8};
  notes.add("first");
  std::cout << notes.size() << '\\n';
}`;

const CSHARP_SRC = `// C# — records, properties, LINQ, async
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Nebula
{
    public record Note(string Title, DateTime Updated);

    public sealed class Store
    {
        private readonly List<Note> _notes = new();

        public int Count => _notes.Count;

        public async Task<Note[]> RecentAsync(int take = 5)
        {
            await Task.Delay(1);
            return _notes.OrderByDescending(n => n.Updated).Take(take).ToArray();
        }
    }
}`;

const JAVA_SRC = `// Java — generics, annotations, streams
package com.nebula;

import java.util.List;
import java.util.stream.Collectors;

public final class NoteStore {
    private final List<Note> notes;

    public NoteStore(List<Note> notes) {
        this.notes = List.copyOf(notes);
    }

    @Override
    public String toString() {
        return notes.stream()
                .map(Note::title)
                .collect(Collectors.joining(", "));
    }

    public static void main(String[] args) {
        System.out.println(new NoteStore(List.of()));
    }
}`;

const DART_SRC = `// Dart (Flutter) — widgets, null safety, async
import 'package:flutter/material.dart';

class NoteTile extends StatelessWidget {
  const NoteTile({super.key, required this.title, this.done = false});

  final String title;
  final bool done;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(done ? Icons.check_box : Icons.check_box_outline_blank),
      title: Text(title, style: const TextStyle(fontSize: 16.0)),
      onTap: () async => debugPrint('tapped $title'),
    );
  }
}

void main() => runApp(const MaterialApp(home: NoteTile(title: 'Hello')));`;

const RUBY_SRC = `# Ruby — symbols, blocks, interpolation
require 'json'

class Note
  attr_reader :title, :tags

  def initialize(title, tags: [])
    @title = title
    @tags  = tags
  end

  def slug
    title.downcase.split.join('-')
  end

  def to_s
    "#{title} (#{tags.size} tags)"
  end
end

notes = %w[first second third].map { |t| Note.new(t, tags: [:demo]) }
puts JSON.generate(notes.map(&:slug))`;

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
      '<h2>C</h2>' + code(C_SRC, 'c') +
      '<h2>C++</h2>' + code(CPP_SRC, 'cpp') +
      '<h2>C#</h2>' + code(CSHARP_SRC, 'csharp') +
      '<h2>Java</h2>' + code(JAVA_SRC, 'java') +
      '<h2>Dart (Flutter)</h2>' + code(DART_SRC, 'dart') +
      '<h2>Ruby</h2>' + code(RUBY_SRC, 'ruby') +
      '<h2>SQL</h2>' + code(SQL_SRC, 'sql') +
      '<h2>CSS</h2>' + code(CSS_SRC, 'css') +
      '<h2>JSON</h2>' + code(JSON_SRC, 'json') +
      '<h2>HTML</h2>' + code(HTML_SRC, 'html') +
      '<h2>Markdown</h2>' + code(MD_SRC, 'markdown') +
      '<p><strong>Check:</strong> change the language of the first block to Python — the same text should recolor. The Copy button copies the raw source.</p>' +
      '<p><strong>New:</strong> the six blocks from C down to Ruby are the languages added this release. In each one the comment, the strings, the numbers and the keywords must all be coloured differently — flat grey text means that language’s rules did not load.</p>',
  },
  {
    title: 'Test · Text formatting',
    content:
      '<h1>Text formatting</h1>' +
      '<p><strong>Bold</strong> · <em>italic</em> · <span class="u-single">underline</span> · <s>strikethrough</s> · <span class="inline-code">inline code</span> · <span class="inline-eq" data-tex="E = mc^2" contenteditable="false"></span></p>' +
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
      '<p><strong>Check:</strong> Tab / Shift+Tab indent any block up to 6 levels. The outline dropdown sits before the list buttons, LibreOffice-style.</p>' +
      '<h2>Getting out of a list</h2>' +
      '<p><strong>New:</strong> put the caret at the end of “three” above, press Enter to get an empty item 4, then press <em>Enter again</em> — the list must end and leave a normal paragraph. Backspace on that empty item must do the same. Neither may merge the caret back up into “three”.</p>' +
      '<p><strong>New:</strong> click into the middle of a list and end it there — the items below must stay a list of the same kind, under the new paragraph, still in order.</p>' +
      '<p><strong>New:</strong> the to-do button toggles. Press it on “click the box to tick me” and the line becomes an ordinary paragraph; press it again and the box comes back. Before 0.4.0 this was one-way.</p>' +
      '<p><strong>Check:</strong> build a bulleted list, then start a numbered one on the line right under it — two separate lists, side by side. The numbered one must not appear nested inside the last bullet.</p>',
  },
  {
    title: 'Test · Shapes (free movement)',
    content:
      // Two layers, not one: a shape sent behind the text has to be painted
      // under it, and a single overlay could only ever fake that with opacity.
      '<div class="shape-layer shape-layer--behind" contenteditable="false" data-block-type="shape-layer">' +
      '<div class="shape diamond behind" data-kind="diamond" style="left:380px;top:400px;width:160px;height:120px;background:#F0D2CE"><div class="shape-text" contenteditable="true">behind text</div><span class="shape-h"></span></div>' +
      '</div>' +
      '<div class="shape-layer" contenteditable="false" data-block-type="shape-layer">' +
      '<div class="shape rect" data-kind="rect" style="left:430px;top:120px;width:150px;height:90px;background:#D6E4D0"><div class="shape-text" contenteditable="true">drag me anywhere</div><span class="shape-h"></span></div>' +
      '<div class="shape ellipse" data-kind="ellipse" style="left:470px;top:260px;width:150px;height:110px;background:#D3E0EA"><div class="shape-text" contenteditable="true">over the text</div><span class="shape-h"></span></div>' +
      '</div>' +
      '<h1>Shapes float over the whole note</h1>' +
      '<p>Shapes are not trapped in a box any more. They sit on one layer that covers the entire note, so you can drag them anywhere — over this paragraph, past the heading, down to the bottom. Text wrap is <strong>through</strong>: the words never reflow, the shape just floats above (or behind) them.</p>' +
      '<p>Select a shape to get its little bar: recolor it, send it <em>behind</em> the text, bring it <em>above</em>, or delete it. Drag the corner handle to resize. Double-click to write inside.</p>' +
      '<p>Lorem line to give the shapes something to float over. Move the green rectangle down here and the text stays exactly where it is — that is what wrap-through means.</p>' +
      '<p><strong>Check:</strong> add more from the toolbar ◇ button (▾ for ellipse / diamond) or type <span class="inline-code">/shape</span>.</p>' +
      '<p><strong>New:</strong> select the green rectangle and press <em>▾ Send behind text</em>, then drag it over this paragraph — the words must run <em>on top of</em> it, not through a faded version of it. <em>▴</em> brings it back over the text.</p>' +
      '<p><strong>New:</strong> press <em>✕</em> on the shape bar. The shape goes and <em>the bar goes with it</em>. Same for Esc, for clicking anywhere off a shape, and for switching to another note — the bar must never be left floating with nothing selected.</p>',
  },
  {
    title: 'Test · Equations, fonts & leaving a format',
    content:
      '<h1>Equations, fonts &amp; leaving a format</h1>' +
      '<h2>Equations</h2>' +
      '<p>Press <span class="inline-code">Ctrl+Q</span> or the √x button, type LaTeX, watch the preview, press Enter. The source is kept and the formula is typeset again every time the note opens — nothing depends on the stored HTML.</p>' +
      // data-tex holds raw LaTeX — paintAllEquations typesets from it on load,
      // so the markup here can stay empty.
      '<p>Inline: <span class="inline-eq" data-tex="e^{i\\pi} + 1 = 0" contenteditable="false"></span> and ' +
      '<span class="inline-eq" data-tex="\\sqrt{x^2 + y^2}" contenteditable="false"></span> and ' +
      '<span class="inline-eq" data-tex="\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}" contenteditable="false"></span>.</p>' +
      '<p><strong>New:</strong> each equation sits in its own bordered frame, like <span class="inline-code">inline code</span>, so you can see where it starts and ends. Click one — the editor reopens with its LaTeX. Close the note and come back: all three must still be typeset.</p>' +
      '<h2>Fonts</h2>' +
      '<p><span style="font-family:Arial, Helvetica, sans-serif">Arial</span> · <span style="font-family:Calibri, &quot;Segoe UI&quot;, sans-serif">Calibri</span> · <span style="font-family:&quot;Times New Roman&quot;, Times, serif">Times New Roman</span> · <span style="font-family:&quot;Comic Sans MS&quot;, &quot;Comic Sans&quot;, cursive">Comic Sans MS</span> · <span style="font-family:Georgia, serif">Georgia</span> · <span style="font-family:Consolas, monospace">Consolas</span></p>' +
      '<p><strong>New:</strong> the Font button opens a real menu and every row is drawn in its own typeface. Select a few words and pick one — those words change. Put the caret in a line with nothing selected and pick one — the whole line changes. The button always names the font under the caret.</p>' +
      '<h2>Leaving an inline format</h2>' +
      '<p>Some <span class="inline-code">inline code</span> to try it on.</p>' +
      '<p><strong>Check:</strong> put the caret at the end of that code run and press Enter — the new line must start as plain text, not more code. Put the caret at its start and press Backspace — the code formatting comes off and the words stay.</p>',
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

/**
 * What the installed app starts with. The six test notes above are a checklist
 * for the test build — useful when you are looking for a defect, clutter when
 * you just installed a note app. So the same material is here as ONE note:
 * everything you can do, no "Check:" lines, nothing to tick off.
 */
export const HELP_NOTES = [
  SEED_NOTES[0],
  {
    title: 'Nebula · Everything in one page',
    content:
      '<h1>Everything Nebula does</h1>' +
      '<p>One page, so you can read it once and delete it. Nothing here is needed again — your notes live in your own folder and are saved as you type.</p>' +

      '<h2>Writing</h2>' +
      '<p><strong>Bold</strong> · <em>italic</em> · <span class="u-single">underline</span> · <s>strikethrough</s> · <span class="inline-code">inline code</span>. Underlines come in five styles from the <em>▾</em> next to the button — single, <span class="u-double">double</span>, <span class="u-bold">bold</span>, <span class="u-wavy">wavy</span>, <span class="u-dash">dashed</span> — and they replace each other rather than stacking.</p>' +
      '<p>Enter at the end of an inline format starts the next line plain; Backspace at the start of one takes the format off. You are never stuck inside a format.</p>' +
      '<p>The <strong>Font</strong> menu shows each face in its own type. With text selected it changes that text; with just a caret it changes the line. <strong>Size</strong> takes any number of pixels, not only the ones listed.</p>' +
      '<p>Colours: <em>A</em> applies the last text colour, <em>H</em> the last highlight, and each <em>▾</em> opens the full list plus a custom picker.</p>' +

      '<h2>Structure</h2>' +
      '<ul><li>Bulleted and numbered lists — Enter or Backspace on an empty item ends the list</li>' +
      '<li>To-do lines: the button turns a line into a to-do and back again; click the box to tick it</li>' +
      '<li>Tab and Shift+Tab indent any block, up to six levels</li>' +
      '<li>Headings and quotes from the outline dropdown; <span class="inline-code">/</span> anywhere opens the block menu</li></ul>' +

      '<h2>Code</h2>' +
      '<p>A code block colours itself for the language you pick — JavaScript, TypeScript, Python, C, C++, C#, Java, Dart&nbsp;(Flutter), Ruby, HTML, CSS, JSON, SQL, Bash, Markdown. Click the code to edit it, <em>Copy</em> takes the raw source.</p>' +

      '<h2>Equations</h2>' +
      '<p><span class="inline-code">Ctrl+Q</span> or the √x button opens a LaTeX box with a live preview; the result sits in the line in its own frame, like ' +
      '<span class="inline-eq" data-tex="\\sqrt{x^2 + y^2}" contenteditable="false"></span>. Click one to edit it again. It all works offline.</p>' +

      '<h2>Shapes</h2>' +
      '<p>Shapes float over the whole note — drag them anywhere, resize from the corner, double-click to write inside. Selecting one opens a small bar: recolour, send behind the text, bring above it, or delete.</p>' +

      '<h2>The window</h2>' +
      '<p>The six buttons on the header line move the editing bar to the top, bottom, left or right, open the <strong>AI panel</strong> (Claude, Gemini, ChatGPT and more, in the app), or hide the bar. The layout is remembered.</p>' +
      '<p>Three themes at the bottom of the sidebar: <strong>Main</strong>, <strong>Dark</strong>, <strong>Light</strong>.</p>' +

      '<h2>Your notes</h2>' +
      '<p>Click the version number in the sidebar to see exactly where everything is kept. Updates replace the application only — the whole vault is copied to Backups first, and nothing in it is ever deleted.</p>',
  },
];

/**
 * The builds you check things in — the test app and the dev profile — get the
 * per-feature checklist. An installed or portable copy is somebody's note app,
 * so it gets the single help page.
 */
export function seedFor(channel) {
  return channel === 'test' || channel === 'dev' ? SEED_NOTES : HELP_NOTES;
}
