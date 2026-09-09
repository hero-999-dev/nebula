/**
 * The starter note: one page covering every feature, with a sample for every
 * code language, identical in every build. Written only to a vault that was
 * read successfully and came back empty — see NoteStore and disk-store.js.
 */

const code = (src, lang) =>
  `<div class="blk-code" data-block-type="code" data-lang="${lang}" data-code="${encodeURIComponent(src)}" contenteditable="false">` +
  `<div class="code-head"><select class="code-lang" title="Code language"></select>` +
  `<span class="code-hint">markdown-style block · click the code to edit</span>` +
  `<button type="button" class="code-copy" title="Copy code">Copy</button>` +
  `<button type="button" class="code-del" title="Delete this code block" aria-label="Delete this code block">✕</button></div>` +
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

const TS_SRC = `// TypeScript — types, generics, enums, interfaces
import type { Note } from './notes';

export enum Channel { Installed = 'installed', Test = 'test', Dev = 'dev' }

export interface VaultStatus {
  ok: boolean;
  empty: boolean;
  error?: string;
}

export function newest<T extends { updatedAt: number }>(items: readonly T[], take = 5): T[] {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, take);
}

const seen = new Map<string, Note>();
export const titleOf = (id: string): string | null => seen.get(id)?.title ?? null;`;

const BASH_SRC = `#!/usr/bin/env bash
# Bash — variables, quoting, conditionals, pipelines
set -euo pipefail

VAULT="\${NEBULA_USER_DATA:-$HOME/.nebula}/storage/notes"
count=0

if [[ ! -d "$VAULT" ]]; then
  echo "no vault at $VAULT" >&2
  exit 1
fi

for file in "$VAULT"/*.json; do
  title=$(grep -o '"title":"[^"]*"' "$file" | head -n 1)
  printf '%3d  %s\\n' "$((++count))" "\${title:-untitled}"
done

echo "$count notes" | tee /dev/stderr`;

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

// Every language in highlight.js has a sample, and each one is written to
// exercise the tokens its rules actually claim to know — comments, strings,
// numbers, keywords, type names — so a broken rule shows up as flat grey text
// in the guide rather than in a real note six months later.
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


/**
 * ONE note, and the same one in every build.
 *
 * It used to be six or seven separate "Test ·" notes, plus a different set for
 * an installed copy. That meant the thing you were looking for was in whichever
 * note you had not opened, and the two sets drifted apart. This is a single
 * page with headings: welcome first, then every feature with something to try
 * under it, then all fifteen code languages.
 *
 * Bump GUIDE_VERSION whenever the content changes — `NoteStore.ensureGuide`
 * uses it to add the guide to a vault that predates it, exactly once, without
 * touching anything already there.
 */
export const GUIDE_VERSION = '0.6.0';

export const GUIDE_NOTE = {
  title: 'Welcome to Nebula Guide',
  content:
    // Shapes live on layers at the top of the note; the behind-layer is a real
    // second layer, not a class, so it can be painted under the text.
    '<div class="shape-layer shape-layer--behind" contenteditable="false" data-block-type="shape-layer">' +
    // Placed near the top so they are visible the moment the note opens — a
    // shape parked next to section 6 would be a thousand pixels below the fold.
    '<div class="shape diamond behind" data-kind="diamond" style="left:520px;top:470px;width:170px;height:130px;background:#F0D2CE"><div class="shape-text" contenteditable="true">behind the text</div><span class="shape-h"></span></div>' +
    '</div>' +
    '<div class="shape-layer" contenteditable="false" data-block-type="shape-layer">' +
    '<div class="shape rect" data-kind="rect" style="left:600px;top:150px;width:150px;height:90px;background:#D6E4D0"><div class="shape-text" contenteditable="true">drag me anywhere</div><span class="shape-h"></span></div>' +
    '<div class="shape ellipse" data-kind="ellipse" style="left:640px;top:270px;width:150px;height:100px;background:#D3E0EA"><div class="shape-text" contenteditable="true">over the text</div><span class="shape-h"></span></div>' +
    '</div>' +

    '<h1>Welcome to Nebula</h1>' +
    '<p>A calm place for notes. Everything auto-saves — there is no save button to forget, though <span class="inline-code">Ctrl+S</span> works if you want one.</p>' +
    '<p>This is the whole guide in one page. Every section has something you can try on the spot; the text you are reading is an ordinary note, so edit it, break it, or delete it once you are done. Your own notes are never touched by an update.</p>' +

    '<h2>1 · The window</h2>' +
    '<p>The six buttons on the header line move the <strong>editing bar</strong>, not the note:</p>' +
    '<ul>' +
    '<li><strong>↑</strong> bar on top (default) — press the active side again to come back to it</li>' +
    '<li><strong>↓</strong> bar under the note · <strong>←</strong> and <strong>→</strong> turn it into a vertical rail</li>' +
    '<li><strong>AI</strong> opens the side panel: Claude, Gemini, ChatGPT, Mistral, DeepSeek, Copilot, Perplexity, and <strong>+</strong> adds any site. The tab strip scrolls sideways (Shift+wheel); drag the panel’s left edge to resize it.</li>' +
    '<li><strong>−</strong> hides the bar for a clean page</li>' +
    '</ul>' +
    '<p>Three themes at the bottom of the sidebar: <strong>Main</strong>, <strong>Dark</strong>, <strong>Light</strong>. The layout and the theme both survive a restart.</p>' +
    '<p><strong>Try it:</strong> send the bar to the left rail, restart the app, and it is still there.</p>' +

    '<h2>2 · Writing</h2>' +
    '<p><strong>Bold</strong> · <em>italic</em> · <span class="u-single">underline</span> · <s>strikethrough</s> · <span class="inline-code">inline code</span> · <span class="inline-eq" data-tex="E = mc^2" contenteditable="false"></span></p>' +
    '<p>Underlines come in five styles from the <em>▾</em> beside the button, and they <em>replace</em> each other rather than stacking: ' +
    '<span class="u-single">single</span> — <span class="u-double">double</span> — <span class="u-bold">bold</span> — <span class="u-wavy">wavy</span> — <span class="u-dash">dashed</span>.</p>' +
    '<p><strong>Try it:</strong> select one of those words and apply a different underline style. It must swap, never stack. “None” clears it.</p>' +
    '<h3>Leaving a format</h3>' +
    '<p>Some <span class="inline-code">inline code</span> to practise on.</p>' +
    '<p><strong>Try it:</strong> put the caret at the <em>end</em> of that code run and press Enter — the next line starts as plain text. Put it at the <em>start</em> and press Backspace — the code formatting comes off and the words stay. You are never stuck inside a format.</p>' +

    '<h2>3 · Fonts, size and colour</h2>' +
    '<p><span style="font-family:Arial, Helvetica, sans-serif">Arial</span> · ' +
    '<span style="font-family:Calibri, &quot;Segoe UI&quot;, sans-serif">Calibri</span> · ' +
    '<span style="font-family:&quot;Times New Roman&quot;, Times, serif">Times New Roman</span> · ' +
    '<span style="font-family:&quot;Comic Sans MS&quot;, &quot;Comic Sans&quot;, cursive">Comic Sans MS</span> · ' +
    '<span style="font-family:Georgia, serif">Georgia</span> · ' +
    '<span style="font-family:Verdana, Geneva, sans-serif">Verdana</span> · ' +
    '<span style="font-family:Consolas, monospace">Consolas</span></p>' +
    // Colours are classes, so this paragraph reads correctly on all three
    // themes. Written as hex it was a pastel highlight under light ink on the
    // dark ones — unreadable, and the reason this changed.
    '<p><span style="font-size:22px">22px</span> · <span style="font-size:11px">11px</span> · ' +
    '<span class="c-red">red text</span> · <span class="c-blue">blue text</span> · <span class="c-green">green text</span> · ' +
    '<span class="h-yellow">yellow background</span> · <span class="h-green">green background</span> · <span class="h-purple">purple background</span></p>' +
    '<p><strong>Try it:</strong> the <strong>Font</strong> menu shows every face in its own typeface. With text selected it restyles the selection; with only a caret it restyles the whole line. The button always names the font under the caret. <strong>Size</strong> accepts any number you type, not just the listed ones — try 37.</p>' +
    '<p><strong>Try it:</strong> <em>A</em> applies the last text colour and <em>H</em> the last highlight; each <em>▾</em> opens the full list. Every row lines up and the list fits without scrolling.</p>' +
    '<p><strong>Try it:</strong> switch between <strong>Main</strong>, <strong>Dark</strong> and <strong>Light</strong> with that paragraph in view. Every colour repaints for the theme and stays readable — a colour is stored as a name, not as a fixed value picked against one background.</p>' +

    '<h2>4 · Lists, to-dos and indent</h2>' +
    '<h3>Bulleted</h3><ul><li>first</li><li>second</li><li>third</li></ul>' +
    '<h3>Numbered</h3><ol><li>one</li><li>two</li><li>three</li></ol>' +
    '<h3>To-dos</h3>' +
    '<div class="blk-todo done">this one is done</div>' +
    '<div class="blk-todo">click the box to tick me</div>' +
    '<div class="blk-todo" data-ind="1">indented one level (Tab)</div>' +
    '<div class="blk-todo" data-ind="2">indented two levels</div>' +
    '<p><strong>Try it:</strong> put the caret at the end of “three”, press Enter for an empty item, then press <em>Enter again</em> — the list ends and leaves a normal paragraph. Backspace on that empty item does the same and never merges back into “three”.</p>' +
    '<p><strong>Try it:</strong> end a list from the <em>middle</em> — the items below stay a list of the same kind, in order, under the new paragraph.</p>' +
    '<p><strong>Try it:</strong> the to-do button toggles. Press it on “click the box to tick me” and the line becomes an ordinary paragraph; press it again and the box comes back.</p>' +
    '<p><strong>Try it:</strong> build a bulleted list and start a numbered one on the line right under it. Two separate lists, side by side — the numbered one must not end up nested inside the last bullet.</p>' +
    '<p>Tab and Shift+Tab indent any block up to six levels. The outline dropdown (paragraph, H1–H3, quote) sits before the list buttons, LibreOffice-style, and <span class="inline-code">/</span> anywhere opens the block menu.</p>' +

    '<h2>5 · Equations</h2>' +
    '<p><span class="inline-code">Ctrl+Q</span> or the √x button opens a LaTeX box with a live preview. The <em>source</em> is what gets stored, and the formula is typeset again every time the note opens — nothing depends on the saved markup, so an upgrade re-renders old notes instead of freezing them.</p>' +
    '<p>Inline: <span class="inline-eq" data-tex="e^{i\\pi} + 1 = 0" contenteditable="false"></span> and ' +
    '<span class="inline-eq" data-tex="\\sqrt{x^2 + y^2}" contenteditable="false"></span> and ' +
    '<span class="inline-eq" data-tex="\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}" contenteditable="false"></span> and ' +
    '<span class="inline-eq" data-tex="\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}" contenteditable="false"></span>.</p>' +
    '<p><strong>Try it:</strong> each one sits in its own frame, like <span class="inline-code">inline code</span>, so you can see where it starts and ends. Click one — the editor reopens with its LaTeX. Close the note and come back: all four are still typeset. It works with no network.</p>' +

    '<h2>6 · Shapes</h2>' +
    '<p>Shapes float over the whole note — the three at the top of this page are real ones. Drag them down here, resize from the corner handle, double-click to write inside. Text wrap is <strong>through</strong>: the words never reflow, the shape floats above or below them.</p>' +
    '<p>Selecting a shape opens its little bar: six colours, <em>▾</em> to send it behind the text, <em>▴</em> to bring it above, <em>✕</em> to delete it.</p>' +
    '<p><strong>Try it:</strong> send the green rectangle behind the text and drag it over this paragraph — the words run <em>on top of</em> it, at full strength, not through a faded copy.</p>' +
    '<p><strong>Try it:</strong> press <em>✕</em>. The shape goes and the bar goes with it — same for Esc, for clicking anywhere off a shape, and for switching notes. The bar is never left floating with nothing selected.</p>' +
    '<p>Add more from the toolbar ◇ button (<em>▾</em> for ellipse and diamond) or type <span class="inline-code">/shape</span>.</p>' +

    '<h2>7 · Code blocks</h2>' +
    '<p>Markdown-style: pick a language and the colours follow, the way GitHub, Discord or Notion do it. Click into the code to edit it; changing the language repaints the same text; <em>Copy</em> takes the raw source. Every language Nebula knows has a sample below.</p>' +
    '<h3>JavaScript</h3>' + code(JS_SRC, 'javascript') +
    '<h3>TypeScript</h3>' + code(TS_SRC, 'typescript') +
    '<h3>Python</h3>' + code(PY_SRC, 'python') +
    '<h3>C</h3>' + code(C_SRC, 'c') +
    '<h3>C++</h3>' + code(CPP_SRC, 'cpp') +
    '<h3>C#</h3>' + code(CSHARP_SRC, 'csharp') +
    '<h3>Java</h3>' + code(JAVA_SRC, 'java') +
    '<h3>Dart (Flutter)</h3>' + code(DART_SRC, 'dart') +
    '<h3>Ruby</h3>' + code(RUBY_SRC, 'ruby') +
    '<h3>HTML</h3>' + code(HTML_SRC, 'html') +
    '<h3>CSS</h3>' + code(CSS_SRC, 'css') +
    '<h3>JSON</h3>' + code(JSON_SRC, 'json') +
    '<h3>SQL</h3>' + code(SQL_SRC, 'sql') +
    '<h3>Bash</h3>' + code(BASH_SRC, 'bash') +
    '<h3>Markdown</h3>' + code(MD_SRC, 'markdown') +
    '<p><strong>Try it:</strong> switch the first block to Python — the same text recolours. In every sample the comment, the strings, the numbers and the keywords are coloured differently; flat grey text would mean that language’s rules failed to load.</p>' +

    '<h2>8 · Where your notes live</h2>' +
    '<p>Click the version number at the bottom of the sidebar to see every folder this copy uses. Notes are one JSON file each, written atomically, with a dated snapshot of the whole vault kept alongside them.</p>' +
    '<p>An update replaces the application folder only. The vault is copied into Backups before anything installs, and <strong>nothing in it is ever deleted</strong>. The installed app, the portable copy, the test build and the dev build each keep their own separate notes.</p>',
};

/**
 * Put the guide back, whatever the vault remembers.
 *
 * `NoteStore.ensureGuide` deliberately adds it only once per GUIDE_VERSION, so
 * deleting it keeps it gone. Help -> Guide page is the way to ask for it again,
 * and that has to work even when the version stamp says "already done".
 */
export function addGuide(store) {
  const live = store.notes.filter((n) => !n.deletedAt);
  const existing = live.find((n) => n.title === GUIDE_NOTE.title);

  // The guide that is already there is the one to open — but only while it is
  // still THIS guide. `ensureGuide` never refreshes an existing one, so a vault
  // opened before a guide rewrite kept the old text for good, and asking Help
  // for the guide handed the stale copy straight back.
  //
  // A guide the user has written in is theirs: it is never overwritten. The
  // current one arrives beside it under a versioned title instead, so nothing
  // is lost either way.
  if (existing && existing.content === GUIDE_NOTE.content) {
    if (existing.archivedAt) store.unarchive(existing.id);
    return existing.id;
  }

  const title = existing ? `${GUIDE_NOTE.title} (${GUIDE_VERSION})` : GUIDE_NOTE.title;
  const already = live.find((n) => n.title === title && n.content === GUIDE_NOTE.content);
  if (already) {
    if (already.archivedAt) store.unarchive(already.id);
    return already.id;
  }

  const note = store.createNote(title);
  store.updateActive({ content: GUIDE_NOTE.content });
  return note.id;
}

/** Every build starts with the same single page. */
export const SEED_NOTES = [GUIDE_NOTE];
