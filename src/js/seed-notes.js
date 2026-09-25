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

const RUST_SRC = `// Rust — lifetimes, raw strings, macros, attributes
use std::collections::HashMap;

#[derive(Debug, Clone)]
struct Note<'a> {
    title: &'a str,
    words: u32,
}

fn longest<'a>(notes: &[Note<'a>]) -> Option<&Note<'a>> {
    notes.iter().max_by_key(|n| n.words)
}

fn main() {
    let raw = r#"a "quoted" title"#;
    let mut seen: HashMap<char, usize> = HashMap::new();
    for c in raw.chars().filter(|c| c.is_alphabetic()) {
        *seen.entry(c).or_insert(0) += 1;
    }
    let notes = vec![Note { title: raw, words: 0x2A }, Note { title: "short", words: 3 }];
    println!("{:?} {}", longest(&notes).map(|n| n.title), seen.len());
}`;

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
 * under it, then every code language, each with a sample.
 *
 * Bump GUIDE_VERSION whenever the content changes — `NoteStore.ensureGuide`
 * uses it to add the guide to a vault that predates it, exactly once, without
 * touching anything already there.
 */
export const GUIDE_VERSION = '0.8.9';

/**
 * The guide's words, without its markup, shapes, code or equations — so a
 * guide the app has only restyled or re-rendered still matches, and one the
 * user has typed in does not. FNV-1a, 8 hex digits.
 * @param {string} html
 */
export function guideSignature(html) {
  const doc = new DOMParser().parseFromString(`<body>${String(html ?? '')}</body>`, 'text/html');
  doc.body.querySelectorAll('.blk-code, .shape-layer, .image-layer, .inline-eq, .guide-stage').forEach((el) => el.remove());
  const text = doc.body.textContent.replace(/\s+/g, ' ').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/**
 * The signature of every guide that has shipped. A guide in a vault that
 * matches one of these was never written in, so `NoteStore.ensureGuide` may
 * replace it with the current one; any other guide is the user's and is left
 * alone. When the guide's text changes: bump GUIDE_VERSION and add its
 * signature here (tests/seed-guide.test.js fails until you do).
 */
export const GUIDE_SIGNATURES = {
  '0.6.0': 'c33a6b3a',
  '0.8.6': '66f979f9',
  '0.8.7': '2ef83bbb',
  '0.8.8': 'c4a8a567',
  '0.8.9': 'b32ad974',
};

/** Whether a vault's guide is one we shipped and nobody has typed in. */
export const guideUnedited = (html) => Object.values(GUIDE_SIGNATURES).includes(guideSignature(html));

export const GUIDE_NOTE = {
  title: 'Welcome to Nebula Guide',
  // Opens in Only view so a stray key cannot change it (0.8.9); ⋯ -> Only view unlocks it.
  readOnly: true,
  content:
    // Shapes live on layers at the top of the note; the behind-layer is a real
    // second layer, not a class, so it can be painted under the text.
    //
    // They sit in a row on a stage of their own — an empty band at the very top
    // that no text flows through. Placed over the opening paragraphs (up to
    // 0.8.5) they landed on the words at any window width but one, which looked
    // like a mistake rather than a demonstration.
    '<div class="shape-layer shape-layer--behind" contenteditable="false" data-block-type="shape-layer">' +
    '<div class="shape diamond behind" data-kind="diamond" style="left:392px;top:8px;width:150px;height:116px;background:#F0D2CE"><div class="shape-text" contenteditable="true">behind the text</div><span class="shape-h"></span></div>' +
    '</div>' +
    '<div class="shape-layer" contenteditable="false" data-block-type="shape-layer">' +
    '<div class="shape rect" data-kind="rect" data-rot="-6" style="left:14px;top:22px;width:150px;height:86px;background:#D6E4D0;transform:rotate(-6deg)"><div class="shape-text" contenteditable="true">drag me anywhere</div><span class="shape-h"></span></div>' +
    '<div class="shape ellipse" data-kind="ellipse" style="left:196px;top:16px;width:164px;height:98px;background:#D3E0EA"><div class="shape-text" contenteditable="true">double-click to write</div><span class="shape-h"></span></div>' +
    '</div>' +
    '<div class="guide-stage" contenteditable="false" aria-hidden="true"></div>' +

    '<h1>Welcome to Nebula</h1>' +
    '<p>A calm place for notes. Everything auto-saves — there is no save button to forget, though <span class="inline-code">Ctrl+S</span> works if you want one.</p>' +
    '<p>This is the whole guide in one page. Every section has something you can try on the spot; the text you are reading is an ordinary note, so edit it, break it, or delete it once you are done. Your own notes are never touched by an update — and this page updates itself only while you have not written in it.</p>' +
    '<p>This page opens in <strong>Only view</strong> (the 🔒 badge by its title), so nothing here changes by accident. To try things on it, click the badge or choose ⋯ → Only view in the note list — or try them in a new note.</p>' +

    // Each release adds its features here (features, not fixes) and in the
    // section they belong to. See GUIDE_SIGNATURES before changing any text.
    // A divider closes each section before the next heading (owner, 0.8.9).
    '<hr class="blk-hr">' +
    '<h2>New in 0.8.9</h2>' +
    '<ul>' +
    '<li><strong>Only view.</strong> Lock any note from its ⋯ menu so it can be read and copied but not changed; this guide starts locked — section 1.</li>' +
    '<li><strong>Arrows snap on.</strong> Bring an arrow’s end near a shape, a picture or a link card and it takes hold, the way mind-map apps do — section 6.</li>' +
    '<li><strong>F12 takes a picture of the window</strong>, saves it and copies it — section 1.</li>' +
    '<li>Recently: <strong>pictures and shapes on one canvas</strong>, <strong>three places for a picture</strong>, <strong>sharper videos</strong>, <strong>Rust</strong> and <strong>the link menu by keyboard</strong> (0.8.8); <strong>images that sit in your text</strong> and an <strong>arrow menu</strong> (0.8.6); <strong>links on any words</strong>, <strong>image captions</strong> (0.8.5).</li>' +
    '</ul>' +

    '<hr class="blk-hr">' +
    '<h2>1 · The window and your notes</h2>' +
    '<p>The six buttons on the header line move the <strong>editing bar</strong>, not the note:</p>' +
    '<ul>' +
    '<li><strong>↑</strong> bar on top (default) — press the active side again to come back to it</li>' +
    '<li><strong>↓</strong> bar under the note · <strong>←</strong> and <strong>→</strong> turn it into a vertical rail</li>' +
    '<li><strong>AI</strong> opens the side panel: Claude, Gemini, ChatGPT, Mistral, DeepSeek, Copilot, Perplexity, and <strong>+</strong> adds any site. The tab strip scrolls sideways (Shift+wheel); drag the panel’s left edge to resize it. If a site will not let you sign in inside the app, <em>Sign in in browser</em> opens it in your browser.</li>' +
    '<li><strong>−</strong> hides the bar for a clean page</li>' +
    '</ul>' +
    '<p>Four themes at the bottom of the sidebar: <strong>Main</strong>, <strong>Dark</strong>, <strong>Light</strong> and <strong>White</strong>. The layout and the theme both survive a restart. <span class="inline-code">Ctrl +</span> and <span class="inline-code">Ctrl −</span> zoom, <span class="inline-code">Ctrl 0</span> goes back to actual size, <span class="inline-code">F11</span> is full screen, and the View menu hides the note list.</p>' +
    '<p><strong>F12</strong> takes a picture of the window: it is saved as a PNG in <em>Pictures\Nebula</em> and copied, ready to paste anywhere. A note at the bottom says where it went.</p>' +
    '<p><strong>Try it:</strong> send the bar to the left rail, restart the app, and it is still there.</p>' +
    '<h3>Your notes</h3>' +
    '<ul>' +
    '<li><strong>New note</strong> under the list, or <span class="inline-code">Ctrl+N</span>. The box at the top of the list filters by title and text.</li>' +
    '<li>Everything saves itself as you go; the word by the title says <em>Saving…</em> and then <em>Saved</em>. <span class="inline-code">Ctrl+S</span> saves at once.</li>' +
    '<li>Each note’s <strong>⋯</strong> menu: <em>Pin to top</em>, <em>Archive</em> (out of the list, kept), <strong>Only view</strong>, and <em>Move to trash</em>. <strong>Archive</strong> and <strong>Trash</strong> under the list open their notes, with <em>Unarchive</em> or <em>Restore</em> to bring one back.</li>' +
    '<li><strong>Only view</strong> locks a note: you can read it, scroll it, select and copy, open its links with Ctrl+click and play its videos, but no key, paste, drag or toolbar button changes it. The 🔒 badge by the title shows it, and clicking the badge unlocks it.</li>' +
    '<li><span class="inline-code">Ctrl+F</span> finds words in the open note and steps through every match. <span class="inline-code">Ctrl+K</span> opens the command palette: type part of any command’s name and press Enter. <span class="inline-code">Ctrl+Z</span> and <span class="inline-code">Ctrl+Y</span> undo and redo, one step at a time — a move, a paste or a run of typing each count as one.</li>' +
    '<li>Help → <em>Keyboard shortcuts</em> lists every key, and <em>What’s new</em> shows what the current version changed.</li>' +
    '</ul>' +
    '<p><strong>Try it:</strong> lock a note of your own with ⋯ → Only view, try to type in it, then click the 🔒 badge to unlock it.</p>' +

    '<hr class="blk-hr">' +
    '<h2>2 · Writing</h2>' +
    '<p><strong>Bold</strong> · <em>italic</em> · <span class="u-single">underline</span> · <s>strikethrough</s> · <span class="inline-code">inline code</span> · <span class="inline-eq" data-tex="E = mc^2" contenteditable="false"></span></p>' +
    '<p>Underlines come in five styles from the <em>▾</em> beside the button, and they <em>replace</em> each other rather than stacking: ' +
    '<span class="u-single">single</span> — <span class="u-double">double</span> — <span class="u-bold">bold</span> — <span class="u-wavy">wavy</span> — <span class="u-dash">dashed</span>.</p>' +
    '<p><strong>Try it:</strong> select one of those words and apply a different underline style. It must swap, never stack. “None” clears it.</p>' +
    '<h3>Leaving a format</h3>' +
    '<p>Some <span class="inline-code">inline code</span> to practise on.</p>' +
    '<p><strong>Try it:</strong> put the caret at the <em>end</em> of that code run and press Enter — the next line starts as plain text. Put it at the <em>start</em> and press Backspace — the code formatting comes off and the words stay. You are never stuck inside a format.</p>' +

    '<h3>The / menu</h3>' +
    '<p>Type <span class="inline-code">/</span> at the start of a line (or after a space) and a menu of blocks opens; keep typing to narrow it, ↑ ↓ to choose, Enter to use. It turns the line you are on into <strong>Text</strong>, <strong>Heading 1–3</strong>, a <strong>bulleted</strong> or <strong>numbered</strong> list or a <strong>quote</strong>, and it inserts a <strong>to-do</strong>, a <strong>code block</strong>, a <strong>divider</strong>, a <strong>shape</strong>, or a link as an <strong>embed</strong>, a <strong>bookmark</strong>, a <strong>URL</strong> or a <strong>mention</strong>.</p>' +
    '<p><strong>Try it:</strong> in a new note type <span class="inline-code">/h2</span> and Enter, then a title — only that line becomes a heading.</p>' +

    '<hr class="blk-hr">' +
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
    '<p><strong>Try it:</strong> switch between the four themes with that paragraph in view. Every colour repaints for the theme and stays readable — a colour is stored as a name, not as a fixed value picked against one background.</p>' +

    '<hr class="blk-hr">' +
    '<h2>4 · Lists, to-dos, quotes and dividers</h2>' +
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

    '<h3>Quotes and dividers</h3>' +
    '<blockquote>A quote stands apart from the text around it.</blockquote>' +
    '<p>A quote comes from the outline dropdown or <span class="inline-code">/quote</span>. Enter on an empty line of a quote leaves it, the way a list does. A <strong>divider</strong> — the ― button or <span class="inline-code">/divider</span> — is a line of its own; Backspace next to it first marks it, and a second Backspace removes it, so one stray key cannot.</p>' +

    '<hr class="blk-hr">' +
    '<h2>5 · Equations</h2>' +
    '<p><span class="inline-code">Ctrl+Q</span> or the √x button opens a LaTeX box with a live preview. The <em>source</em> is what gets stored, and the formula is typeset again every time the note opens — nothing depends on the saved markup, so an upgrade re-renders old notes instead of freezing them.</p>' +
    '<p>Inline: <span class="inline-eq" data-tex="e^{i\\pi} + 1 = 0" contenteditable="false"></span> and ' +
    '<span class="inline-eq" data-tex="\\sqrt{x^2 + y^2}" contenteditable="false"></span> and ' +
    '<span class="inline-eq" data-tex="\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}" contenteditable="false"></span> and ' +
    '<span class="inline-eq" data-tex="\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}" contenteditable="false"></span>.</p>' +
    '<p><strong>Try it:</strong> each one sits in its own frame, like <span class="inline-code">inline code</span>, so you can see where it starts and ends. Click one — the editor reopens with its LaTeX. Close the note and come back: all four are still typeset. It works with no network.</p>' +

    '<hr class="blk-hr">' +
    '<h2>6 · Shapes and arrows</h2>' +
    '<p>Five kinds from the ◇ button’s <em>▾</em>: rectangle, square, ellipse, diamond and triangle (plus circle). A selected shape shows its outline in colour, the resize grip at its bottom-right corner and the turning handle at its bottom-left.</p>' +
    '<p>Shapes float over the whole note — the three at the top of this page are real ones. Drag them down here, resize from the corner handle, double-click to write inside, and turn them with the round handle: the angle shows while you turn (the green one is tilted by −6°). Text wrap is <strong>through</strong>: the words never reflow, the shape floats above or below them.</p>' +
    '<p>Selecting a shape opens its little bar: six colours, <em>▾</em> to send it behind the text, <em>▴</em> to bring it above, <em>✕</em> to delete it.</p>' +
    '<p>Shapes and floating pictures share one canvas: they stack in a single order, so either can lie over the other. <em>▴</em> on a shape’s or a picture’s bar puts it on top of everything there.</p>' +
    '<p><strong>Try it:</strong> paste a picture, press <em>▴</em> on its bar to set it free, drag it half over the green shape at the top, then select the shape and press <em>▴</em> — now the shape is on top.</p>' +
    '<p><strong>Try it:</strong> send the green rectangle behind the text and drag it over this paragraph — the words run <em>on top of</em> it, at full strength, not through a faded copy.</p>' +
    '<p><strong>Try it:</strong> press <em>✕</em>. The shape goes and the bar goes with it — same for Esc, for clicking anywhere off a shape, and for switching notes. The bar is never left floating with nothing selected.</p>' +
    '<p>Add more from the toolbar ◇ button (<em>▾</em> for every kind) or type <span class="inline-code">/shape</span>.</p>' +
    '<h3>Arrows</h3>' +
    '<p>The ↗ button beside the shapes adds a <strong>straight</strong> arrow; its <em>▾</em> has <strong>elbow</strong> and <strong>curved</strong> ones too. Drag an arrow’s end towards a shape, a picture or a link card: once it comes close — inside it, or within a finger’s width of its edge — the target is outlined and the end snaps onto its side. Let go and the two are joined; move either and the arrow follows. A line of text holds an end only when you drop it right on the words.</p>' +
    '<p><strong>Try it:</strong> in a note of your own, add two shapes and an arrow, pull each end near a shape until it snaps, then drag the shapes apart — the arrow stretches with them. Click an arrow so it lights up and press Delete to remove it.</p>' +

    '<hr class="blk-hr">' +
    '<h2>7 · Links, pictures and videos</h2>' +
    '<p><strong>Paste a web address</strong> on its own (or type <span class="inline-code">/embed</span>, <span class="inline-code">/bookmark</span>, <span class="inline-code">/url</span> or <span class="inline-code">/mention</span>) and Nebula asks how to show it:</p>' +
    '<ul>' +
    '<li><strong>Embed</strong> — the page itself, live inside the note, with its own scrolling and sign-in forms. A YouTube or Vimeo link embeds its player. If a site refuses to be shown this way, the card’s link opens it in your browser.</li>' +
    '<li><strong>Bookmark</strong> — a card with the site’s address, a tidy way to keep a link without loading the page.</li>' +
    '<li><strong>URL</strong> — the address as a link in the line of text.</li>' +
    '<li><strong>Mention</strong> — a short @site tag in the line, for when the address itself is noise.</li>' +
    '</ul>' +
    '<p>The ✕ on a card removes it. Nothing is fetched until you choose Embed.</p>' +

    '<p>No mouse needed: in that menu press <strong>↓</strong> to reach the choices, <strong>←</strong> and <strong>→</strong> to move between them, and <strong>Enter</strong> to use the lit one. <strong>↑</strong> goes back to the address, <strong>Esc</strong> closes the menu and returns you to your text.</p>' +
    '<p><strong>Try it:</strong> copy any web address, paste it on an empty line, then ↓ → → Enter.</p>' +
    '<p><strong>Link any words:</strong> select them and paste a URL over them, or use the link button in the toolbar. <strong>Ctrl+click</strong> a link to open it; choosing the link button again with an empty address takes the link off.</p>' +
    '<p><strong>Videos:</strong> embed a YouTube or Vimeo link and you get the player itself, as wide as the text (up to a comfortable size) so the picture is sharp, black while it loads like on any site — a start time in the link is kept.</p>' +
    '<p><strong>Pictures:</strong> paste an image and it goes on the line you are on, part of the text, so it moves with the words at any window size. Click it for its bar, where three buttons say where it lives and the current one is lit: <em>▾</em> behind the text, <em>▴</em> above the text (floating, on top), <em>≡</em> in the text. <em>Aa</em> writes a caption under it, <em>✕</em> deletes it, and the corner handle resizes it. An image dropped from a folder floats where you drop it.</p>' +
    '<p><strong>Try it:</strong> copy any picture, click at the end of this line and paste. Give it a caption, then make the window narrow and wide — the picture stays between the same two lines.</p>' +

    '<hr class="blk-hr">' +
    '<h2>8 · Import, export, print and moving a note</h2>' +
    '<p>The export button (and the File menu) writes the open note as <strong>Markdown</strong>, <strong>HTML</strong>, <strong>PDF</strong> (A4, laid out the way it looks) or a <strong>Nebula note (.json)</strong>. <span class="inline-code">Ctrl+P</span> prints. <strong>Import</strong> opens a Markdown, HTML, text or Nebula note file as a new note; anything that could run is stripped out first.</p>' +
    '<p>To move a note to another Nebula intact, export it as a <strong>Nebula note</strong> — text, shapes, arrows, pictures and embeds in one file — and import that file there. A note file copied straight out of a vault folder imports too. Markdown and HTML are for other apps; they cannot carry shapes.</p>' +

    '<hr class="blk-hr">' +
    '<h2>9 · Where your notes live</h2>' +
    '<p>Click the version number at the bottom of the sidebar to see every folder this copy uses. Notes are one JSON file each, written atomically, with a dated snapshot of the whole vault kept alongside them.</p>' +
    '<p>An update replaces the application folder only. The vault is copied into Backups before anything installs, and <strong>nothing in it is ever deleted</strong>. The installed app, the portable copy, the test build and the dev build each keep their own separate notes.</p>' +
    '<p><strong>File → Open notes folder</strong> shows that folder in Explorer. Pictures taken with F12 go to <em>Pictures\Nebula</em>, outside the vault.</p>' +

    '<hr class="blk-hr">' +
    '<h2>10 · Code blocks</h2>' +
    '<p>Markdown-style: pick a language and the colours follow, the way GitHub, Discord or Notion do it. Click into the code to edit it; changing the language repaints the same text; <em>Copy</em> takes the raw source. Every language Nebula knows has a sample below.</p>' +
    '<h3>Markdown</h3>' + code(MD_SRC, 'markdown') +
    '<h3>JavaScript</h3>' + code(JS_SRC, 'javascript') +
    '<h3>TypeScript</h3>' + code(TS_SRC, 'typescript') +
    '<h3>Python</h3>' + code(PY_SRC, 'python') +
    '<h3>C</h3>' + code(C_SRC, 'c') +
    '<h3>C++</h3>' + code(CPP_SRC, 'cpp') +
    '<h3>C#</h3>' + code(CSHARP_SRC, 'csharp') +
    '<h3>Java</h3>' + code(JAVA_SRC, 'java') +
    '<h3>Dart (Flutter)</h3>' + code(DART_SRC, 'dart') +
    '<h3>Rust</h3>' + code(RUST_SRC, 'rust') +
    '<h3>Ruby</h3>' + code(RUBY_SRC, 'ruby') +
    '<h3>HTML</h3>' + code(HTML_SRC, 'html') +
    '<h3>CSS</h3>' + code(CSS_SRC, 'css') +
    '<h3>JSON</h3>' + code(JSON_SRC, 'json') +
    '<h3>SQL</h3>' + code(SQL_SRC, 'sql') +
    '<h3>Bash</h3>' + code(BASH_SRC, 'bash') +
    '<p><strong>Try it:</strong> switch the JavaScript block to Python — the same text recolours. In every sample the comment, the strings, the numbers and the keywords are coloured differently; flat grey text would mean that language’s rules failed to load.</p>',
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
  store.setReadOnly?.(note.id, true);
  return note.id;
}

/** Every build starts with the same single page. */
export const SEED_NOTES = [GUIDE_NOTE];
