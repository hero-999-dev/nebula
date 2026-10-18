/**
 * The starter note: one page covering every feature, with a sample for every
 * code language, identical in every build. Written only to a vault that was
 * read successfully and came back empty — see NoteStore and disk-store.js.
 */
import { guideIn, guideTitles } from './guide-i18n.js';

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
export const GUIDE_VERSION = '0.9.9';

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
  '0.9.0': '5b765db9',
  '0.9.1': '1823b8d5',
  '0.9.2': '7d56ce37',
  '0.9.3 first test build': 'ba8043ce',
  '0.9.3 second test build': 'e7656553',
  '0.9.3 third test build': '61d84c6e',
  '0.9.3 fourth test build': 'f12275a0',
  '0.9.3 fifth test build': 'bf9c031e',
  '0.9.3 sixth test build': '396b684c',
  '0.9.3 seventh test build': '05ad1f4c',
  '0.9.3 eighth test build': '0dd064de',
  '0.9.3 ninth test build': '24419b13',
  '0.9.3 tenth test build': '55944dc2',
  '0.9.3 eleventh test build': '5e0f35dd',
  '0.9.3 twelfth test build': '30e1beb9',
  '0.9.3 thirteenth test build': '61bc5960',
  '0.9.3 fourteenth test build': '80ec76b9',
  '0.9.3 fifteenth test build': 'aeb2bdbc',
  '0.9.3 sixteenth test build': '838f87ba',
  '0.9.3 seventeenth test build': 'e0a03dd1',
  '0.9.3 eighteenth test build': 'e2798686',
  '0.9.3 nineteenth test build': '0288c643',
  '0.9.3': '6a23d307',
  // From 0.9.4 the guide ships in four languages (guide-i18n.js); each has a
  // signature, so a translated guide nobody wrote in is recognised as ours too.
  // `node scripts/guide-blocks.js --signatures` prints them.
  '0.9.4 first test build': 'a53591ce',
  '0.9.4 first test build de': 'd290af8d',
  '0.9.4 first test build pl': 'bd06c1ba',
  '0.9.4 first test build tr': 'c635d66a',
  '0.9.4 second test build': 'e81c19be',
  '0.9.4 second test build de': 'd57d9207',
  '0.9.4 second test build pl': '39650cf0',
  '0.9.4 second test build tr': '15a280a5',
  '0.9.4 third test build': '115f99df',
  '0.9.4 third test build de': '0723b0e7',
  '0.9.4 third test build pl': 'b8c6c44d',
  '0.9.4 third test build tr': '3f1296d1',
  '0.9.4 fourth test build': '1a314bad',
  '0.9.4 fourth test build de': '86f8eee5',
  '0.9.4 fourth test build pl': '44c95612',
  '0.9.4 fourth test build tr': '7b4bf209',
  '0.9.4 fifth test build': '283975b4',
  '0.9.4 fifth test build de': '2b728b00',
  '0.9.4 fifth test build pl': 'bfe26328',
  '0.9.4 fifth test build tr': 'e558fb29',
  '0.9.4 sixth test build': 'c89d39b0',
  '0.9.4 sixth test build de': '2de3ebc4',
  '0.9.4 sixth test build pl': 'cdc3d160',
  '0.9.4 sixth test build tr': '6e8fdbd7',
  '0.9.4 seventh test build': '6f6563fe',
  '0.9.4 seventh test build de': '09ed0e5c',
  '0.9.4 seventh test build pl': '3c4ef70d',
  '0.9.4 seventh test build tr': 'e30ed8bb',
  '0.9.4 eighth test build': 'f7cdfbfb',
  '0.9.4 eighth test build de': '046edd5e',
  '0.9.4 eighth test build pl': '0246b1cf',
  '0.9.4 eighth test build tr': '4f264cf8',
  '0.9.4 ninth test build': 'cbddf410',
  '0.9.4 ninth test build de': 'fcb95d66',
  '0.9.4 ninth test build pl': '5d956694',
  '0.9.4 ninth test build tr': '8608d565',
  '0.9.4 tenth test build': '6f4d08f4',
  '0.9.4 tenth test build de': '44a78669',
  '0.9.4 tenth test build pl': '32de0e3e',
  '0.9.4 tenth test build tr': 'bc9e1cb1',
  '0.9.4 eleventh test build': '8c9c57a0',
  '0.9.4 eleventh test build de': 'd803d2cc',
  '0.9.4 eleventh test build pl': '948bd245',
  '0.9.4 eleventh test build tr': '779e2370',
  '0.9.4 twelfth test build': '97e71acd',
  '0.9.4 twelfth test build de': 'b95960cb',
  '0.9.4 twelfth test build pl': '31cf1848',
  '0.9.4 twelfth test build tr': 'd60aac3f',
  '0.9.4 thirteenth test build': '4fab8ea7',
  '0.9.4 thirteenth test build de': '752d7e1e',
  '0.9.4 thirteenth test build pl': '538e94df',
  '0.9.4 thirteenth test build tr': '985ea4b3',
  '0.9.4 fourteenth test build': 'be96b679',
  '0.9.4 fourteenth test build de': '74b50c61',
  '0.9.4 fourteenth test build pl': '6e7355c8',
  '0.9.4 fourteenth test build tr': '4074056e',
  '0.9.4 fifteenth test build': '823b6987',
  '0.9.4 fifteenth test build de': '09496810',
  '0.9.4 fifteenth test build pl': '55ec6e45',
  '0.9.4 fifteenth test build tr': 'ccbe8203',
  '0.9.4 sixteenth test build': 'ef8d810c',
  '0.9.4 sixteenth test build de': 'b61dbbad',
  '0.9.4 sixteenth test build pl': '81bdc9b4',
  '0.9.4 sixteenth test build tr': 'f25251a2',
  '0.9.4 seventeenth test build': '20106ba8',
  '0.9.4 seventeenth test build de': '3c24e92f',
  '0.9.4 seventeenth test build pl': 'f9b03604',
  '0.9.4 seventeenth test build tr': '0acc6b05',
  '0.9.4 eighteenth test build': '92af1f93',
  '0.9.4 eighteenth test build de': '0a3025cc',
  '0.9.4 eighteenth test build pl': '095f8251',
  '0.9.4 eighteenth test build tr': '60e74c8f',
  '0.9.4 nineteenth test build': '497a57e2',
  '0.9.4 nineteenth test build de': 'c98fe90c',
  '0.9.4 nineteenth test build pl': '2ebf4454',
  '0.9.4 nineteenth test build tr': 'b2f7b9f4',
  '0.9.4 twentieth test build': 'f0c36779',
  '0.9.4 twentieth test build de': '9a592a03',
  '0.9.4 twentieth test build pl': 'a28a7804',
  '0.9.4 twentieth test build tr': '020bb6ec',
  '0.9.4 twenty-second test build': '14a368ab',
  '0.9.4 twenty-second test build de': 'b93092a5',
  '0.9.4 twenty-second test build pl': 'b35d7af0',
  '0.9.4 twenty-second test build tr': '2c0a44eb',
  '0.9.4 twenty-third test build': 'ee9f1fe2',
  '0.9.4 twenty-third test build de': '04cd6f67',
  '0.9.4 twenty-third test build pl': '5c75bbf4',
  '0.9.4 twenty-third test build tr': '68351909',
  '0.9.4 twenty-fourth test build': 'b7fc797a',
  '0.9.4 twenty-fourth test build de': 'ab268bc1',
  '0.9.4 twenty-fourth test build pl': 'feab1e38',
  '0.9.4 twenty-fourth test build tr': 'e81109f4',
  '0.9.4 twenty-fifth test build': '292f1445',
  '0.9.4 twenty-fifth test build de': 'b179ba45',
  '0.9.4 twenty-fifth test build pl': '57b0d7dd',
  '0.9.4 twenty-fifth test build tr': '8643b4c4',
  '0.9.4 twenty-sixth test build': 'cc2e6edd',
  '0.9.4 twenty-sixth test build de': '13e63480',
  '0.9.4 twenty-sixth test build pl': '5a9fada2',
  '0.9.4 twenty-sixth test build tr': '9406a37f',
  '0.9.4 twenty-seventh test build': '37ab0948',
  '0.9.4 twenty-seventh test build de': 'fd018e89',
  '0.9.4 twenty-seventh test build pl': 'd730d750',
  '0.9.4 twenty-seventh test build tr': '0d370f41',
  '0.9.4 twenty-eighth test build': '80955266',
  '0.9.4 twenty-eighth test build de': '80999f65',
  '0.9.4 twenty-eighth test build pl': 'a9efaa97',
  '0.9.4 twenty-eighth test build tr': 'b42f3346',
  '0.9.4 twenty-ninth test build': 'eca8b64c',
  '0.9.4 twenty-ninth test build de': '29cbe461',
  '0.9.4 twenty-ninth test build pl': '431b7573',
  '0.9.4 twenty-ninth test build tr': '3cc37eef',
  '0.9.4 thirtieth test build': '702e27ff',
  '0.9.4 thirtieth test build de': '553b5559',
  '0.9.4 thirtieth test build pl': 'e6acc27c',
  '0.9.4 thirtieth test build tr': 'c004d883',
  '0.9.4 thirty-first test build': '8d317361',
  '0.9.4 thirty-first test build de': '9cccee89',
  '0.9.4 thirty-first test build pl': '3c67455a',
  '0.9.4 thirty-first test build tr': 'd284d6ce',
  '0.9.4 thirty-second test build': '2eb1fcb9',
  '0.9.4 thirty-second test build de': 'ce9c97e0',
  '0.9.4 thirty-second test build pl': 'b3f1aea2',
  '0.9.4 thirty-second test build tr': '8c26adca',
  '0.9.4': 'cce0d88c',
  '0.9.4 de': 'b73b4833',
  '0.9.4 pl': '356932d5',
  '0.9.4 tr': '44dc6b07',
  '0.9.6 first test build': 'c51c53b0',
  '0.9.6 first test build de': '19e7a4cb',
  '0.9.6 first test build pl': '1a2146c9',
  '0.9.6 first test build tr': 'df783cdb',
  '0.9.6': 'b852fb04',
  '0.9.6 de': '599b51b8',
  '0.9.6 pl': '17126f7c',
  '0.9.6 tr': '3839c6a7',
  // The 0.9.6 guide as it was released, kept reachable so a vault still
  // holding it is known to be unedited and may be brought up to date.
  '0.9.6 released': '4dde44d2',
  '0.9.6 released de': 'fe1c04a3',
  '0.9.6 released pl': '51e1c07e',
  '0.9.6 released tr': '004c6008',
  '0.9.7': '4697651d',
  '0.9.7 de': 'ed0067bd',
  '0.9.7 pl': '6399f8f0',
  '0.9.7 tr': 'e7e1e1d7',
  '0.9.8': 'cfebb8b6',
  '0.9.8 de': '64589292',
  '0.9.8 pl': '2518e665',
  '0.9.8 tr': '6b8bf964',
  '0.9.9': 'a72d9cfb',
  '0.9.9 de': '20d409c3',
  '0.9.9 pl': '7b616b0e',
  '0.9.9 tr': 'fc94db91',
};

/** Whether a vault's guide is one we shipped and nobody has typed in. */
export const guideUnedited = (html) => Object.values(GUIDE_SIGNATURES).includes(guideSignature(html));

export const GUIDE_NOTE = {
  title: 'Welcome to Nebula Guide',
  // Opens in Only view so a stray key cannot change it (0.8.9); ⋯ -> Edit mode unlocks it.
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
    '<p>This page opens in <strong>Only view</strong> (the 🔒 badge by its title), so nothing here changes by accident. To try things on it, click the badge or choose ⋯ → Edit mode in the note list — or try them in a new note.</p>' +

    // Each release adds its features here (features, not fixes) and in the
    // section they belong to. See GUIDE_SIGNATURES before changing any text.
    // A divider closes each section before the next heading (owner, 0.8.9).
    '<hr class="blk-hr">' +
    '<h2>New in 0.9.9</h2>' +
    '<p><strong>Black holes ask before they destroy.</strong> Every note in the Trash needs a second press to delete for good; a black hole also asks for its PIN or passkey. An open black hole can make a new recovery key from its ⋯ menu, showing it once and ending the old key. A PIN change asks for the current PIN or passkey first.</p>' +
    '<p><strong>Try it:</strong> With a throwaway note, press Delete once in the Trash and read the changed button before you press it again. In an open black hole, look under ⋯ for New recovery key.</p>' +
    '<hr class="blk-hr">' +
    '<h2>New in 0.9.6</h2>' +
    '<ul><li><strong>Files in a note.</strong> Drag any file — a PDF, a spreadsheet, an archive — onto a note, or choose it with /file: a copy stays in the note as a card with the logo of its kind, its name and its size. A click saves a copy wherever you like — section 7.</li><li><strong>A page in a note asks first.</strong> An embedded page that wants your microphone, your camera or notifications asks you, and the answer is forgotten when the page closes — section 10.</li></ul>' +

    '<hr class="blk-hr">' +
    '<h2>New in 0.9.4</h2>' +
    '<ul>' +
    '<li><strong>This guide in your language.</strong> Choose Deutsch, Polski or Türkçe and this page follows, as long as you have not written in it — section 1.</li>' +
    '<li><strong>Two ways to paste.</strong> A right-click offers <em>Paste as Nebula format</em> and <em>Paste original format</em>; it is one menu everywhere in a note, with the formatting buttons, Cut and Copy too — sections 2 and 7.</li>' +
    '<li><strong>Bigger and smaller words.</strong> Ctrl + and Ctrl − size the selected words, or the line the caret is in — section 3.</li>' +
    '<li><strong>Arrows as you type.</strong> <span class="inline-code">--&gt;</span> becomes → and <span class="inline-code">&lt;--</span> becomes ← — section 2.</li>' +
    '<li><strong>Toggle headings, and toggles in a list.</strong> <span class="inline-code">/toggle-h1</span> to <span class="inline-code">/toggle-h3</span> make a heading that folds; a list item becomes a toggle where it stands — section 4.</li>' +
    '<li><strong>Spelling: Ignore, and British English.</strong> <em>Ignore</em> leaves a word alone until you close the app; English accepts the American and the British spelling — section 2.</li>' +
    '<li><strong>A new note straight into a folder.</strong> <em>+ Add a note</em> at the top of every open folder; a right-click on a note or a folder opens its menu — section 1.</li>' +
    '<li><strong>Clear an AI tab’s session.</strong> Right-click a tab → <em>Clear session data</em> signs you out there and removes its cookies; deleting a tab asks first — sections 1 and 9.</li>' +
    '<li><strong>Your privacy, written down.</strong> What Nebula keeps on your computer, and what it never reads — section 9.</li>' +
    '<li><strong>A theme of your own.</strong> The palette button at the right of the themes opens a colour editor: the app changes as you pick, and a profile can be named and saved. Matcha and Contrast are there as ready ones — section 1.</li>' +
    '<li><strong>Fonts: search, add and keep.</strong> The Font menu has a search and <em>+ Add a font</em> for any font on your computer; words copied inside Nebula keep the font chosen for them, and words from outside take the note’s writing font — sections 3 and 7.</li>' +
    '<li><strong>Labels you can pick and follow.</strong> Typing <em>#</em> lists the labels in use; with a label chosen in <em>Filter by label</em>, a bar steps through its places in the open note — section 1.</li>' +
    '<li><strong>Pictures where you want them.</strong> A picture in the text stands at the left, in the middle or at the right of its line, two can share a line, and one can stand inside a line of words like a letter — from its bar, or by dragging it — section 7.</li>' +
    '<li><strong>A divider that splits the page.</strong> Pull a divider sideways and it stands up: the part of the note above it becomes two columns, and pulled over a column it cuts that one again — as many columns as the line has room for. A Word, OpenDocument or Rich Text file keeps them as columns — sections 4 and 8.</li>' +
    '<li><strong>Tables.</strong> <span class="inline-code">/table</span>, or the table button on the bar, makes a table: its columns numbered x1, x2… and its rows y1, y2…, with cells you can colour, merge and fill by pulling a corner, and a + to make it longer or wider — section 4.</li>' +
    '<li><strong>AI tabs that sleep.</strong> Tabs stay awake unless you say otherwise: a tab told it may sleep gives its memory back after twenty minutes unseen and loads again when you open it; a temporary chat, or words not sent yet, keep it awake all the same — section 1.</li>' +
    '<li><strong>A folder for each note.</strong> A note is a folder of its own now — its file, its pictures and its videos in it — and a picture is no longer text inside the note. A video file dropped on a note, or chosen with /video, is copied there and played, and goes along when the note is exported as a Nebula note, whatever its size — sections 7, 8 and 11.</li>' +
    '<li><strong>Black holes.</strong> Notes kept encrypted, in a section of their own under your notes: opened with a 6-digit PIN, and with a passkey — your fingerprint, your face or the computer’s own PIN — if you add one; deleting one, or taking a note out of it, asks for it again — sections 1 and 11.</li>' +
    '<li><strong>Open with Nebula.</strong> Right-click a Word, OpenDocument or Rich Text file and choose Open with → Nebula: it opens as a new note, in the Nebula that is already running. Make Nebula the default for such files and they wear a violet document icon — section 8.</li>' +
    '<li><strong>Settings.</strong> <em>Settings</em>, beside Help at the top, sets what a new note starts with — its font, its text size and its page — puts the AI panel or the black holes away, and gives Nebula’s logo colours of your own — section 1.</li>' +
    '<li><strong>A lock on opening.</strong> In Settings, a 6-digit PIN locks Nebula each time it opens, and a passkey can be added beside it; <em>File → Lock Nebula</em> shuts it at once — section 1.</li>' +
    '<li><strong>Pin your fonts.</strong> A pin beside each font in the Font menu puts it at the top of the list — section 3.</li>' +
    '<li>Recently: <strong>paper sizes and page zoom</strong>, <strong>Word and OpenDocument</strong>, <strong>folders</strong>, <strong>four languages</strong>, <strong>toggle lists</strong>, <strong>@ and #</strong> and <strong>a font for each note</strong> (0.9.3); <strong>Google sign-in in the app</strong> and <strong>Theme color</strong> (0.9.2); <strong>older notes repaired too</strong> and <strong>deleted is deleted</strong> (0.9.1).</li>' +
    '</ul>' +

    '<hr class="blk-hr">' +
    '<h2>1 · The window and your notes</h2>' +
    '<p>The six buttons on the header line move the <strong>editing bar</strong>, not the note:</p>' +
    '<ul>' +
    '<li><strong>↑</strong> bar on top (default) — press the active side again to come back to it</li>' +
    '<li><strong>↓</strong> bar under the note · <strong>←</strong> and <strong>→</strong> turn it into a vertical rail</li>' +
    '<li><strong>AI</strong> opens the side panel: Claude, Gemini, ChatGPT, Mistral, MathGPT and Copilot; <strong>↻</strong> loads the open tab again and <strong>+</strong>, at the right end, adds any site. Right-click a tab to change its name (<em>Change header</em>) or its address (<em>Change website</em>), to sign out of it and remove its cookies (<em>Clear session data</em>), or to delete it — both ask first; <em>Restore removed sites</em> brings deleted ones back. The tab strip scrolls sideways (Shift+wheel); drag the panel’s left edge to resize it. Signing in with Google stays in the app: in every tab, Google’s sign-in opens in a small window that shares the tab’s session, and when you are done it closes and the tab is signed in. No Windows “Choose a passkey” window gets in the way of typing your address. Tabs stay awake unless you tell one it may sleep: right-click it → Let it sleep when unused. Such a tab, not looked at for twenty minutes, goes to sleep to give its memory back — it turns pale, and loads again, on the page it was on, when you open it. Even then a tab that could lose something stays awake: a temporary or incognito chat, or words typed and not sent. Nebula does not read the page to tell; it goes by the tab’s address and by whether keys were pressed in it. Keep awake takes that leave back, and Put to sleep does it at once.</li>' +
    '<li><strong>−</strong> hides the bar for a clean page</li>' +
    '</ul>' +
    '<p><strong>Languages.</strong> Right beside the version number at the bottom of the sidebar stand the four languages — <strong>English</strong>, <strong>Deutsch</strong>, <strong>Polski</strong>, <strong>Türkçe</strong> — each in its own language, the one in use lit. Pick one and every menu, button and hint follows at once; with the note list folded they stand one under another as EN, DE, PL, TR. Your notes are never translated; this guide is the one page that follows the language, and only while you have not written in it. The spelling check, its red underlines and its suggestions, follow the language you pick.</p>' +
    '<p>Four themes at the bottom of the sidebar: <strong>Main</strong>, <strong>Dark</strong>, <strong>Light</strong> and <strong>White</strong> — and the palette button at their right opens <strong>your own</strong>: pick the background, the sidebar’s tone, the lines, the accent and the text, and the app changes as you do; give it a name and <em>Save this profile</em> to keep it. Matcha, dark green with white words, and Contrast, near-black on near-white, are there as ready profiles; a ready profile can be deleted like any other, and brought back. The layout and the theme both survive a restart. <span class="inline-code">F11</span> is full screen, and the View menu zooms the whole window and hides the note list.</p>' +
    '<p><strong>Settings</strong>, beside Help at the top, opens a sheet with three parts. <em>New notes</em>: the font, the text size and the page a new note starts with — the notes you have keep their own. <em>Show and hide</em>: put the AI panel away, with its button, or the black holes, with their section and their button; nothing is deleted, and both are back when the box is cleared. <em>Lock on opening</em>: set a 6-digit PIN and Nebula asks for it each time it opens; a passkey can be added beside it, and then either one opens the app — the passkey at a press of <em>Log in with passkey</em>. <em>File → Lock Nebula</em> shuts it at once. <em>Turn the lock off</em> stops the asking and keeps the lock; <em>Remove lock</em> deletes it. A recovery key, shown once, opens Nebula when the PIN is forgotten. The lock keeps the app shut on this computer — it does not encrypt the notes’ files; a black hole does that. <em>Logo</em>: Nebula’s logo in colours of your own — its background, its border, the moon and its shade, the star — or with a theme put on it: a fixed one, a ready profile like Contrast, or one you saved; <strong>+</strong> keeps the colours on it as a theme of the logo’s own, under a name, and a change made to a ready one is kept as a new theme. This window, the taskbar and the shortcuts that start Nebula — on the desktop, in the Start menu, pinned to the taskbar — wear it; the mark at the top left of the app stays in the app’s theme.</p>' +
    '<p><strong>F12</strong> takes a picture of the window: it is saved as a PNG in <em>Pictures\\Nebula</em> and copied, ready to paste anywhere. A note at the bottom says where it went.</p>' +
    '<p><strong>Try it:</strong> send the bar to the left rail, restart the app, and it is still there.</p>' +
    '<hr class="blk-hr">' +
    '<h3>Labels</h3>' +
    '<p>Press <strong>+</strong> beside the title or choose <strong>⋯ → Edit labels</strong> for any note. Search existing labels, tick them to add or remove, or type a new name and press Enter. Labels stay with the note after a restart and in a Nebula note export.</p>' +
    '<p><strong>Try it:</strong> add <em>work</em>, then type <em>#work</em> in the sidebar filter to find matching notes.</p>' +
    '<p><strong>#word in a note</strong> writes a label into the text: type <em>#</em>, a word and a space (or Enter), and the word becomes a label chip in the line. As soon as you type <em>#</em>, the labels already in use are listed: ↓ or Tab picks one, and typing on narrows the list. A chip is ordinary text — change its word and the label changes with it. It is a label of the text, not one of the note’s own labels by its title; taking a label off the title leaves the text as it is. “C#” and “#1” stay ordinary words.</p>' +
    '<p><strong>Filter by label.</strong> The button right under the filter box opens a search box and every label in use, of the titles and of the texts, in one set. Click a label and the list shows the notes that have it either way; the button then names it, and its × shows every note again. Open one of those notes and the label’s places in it are lit, the way Ctrl+F lights a word; a small bar says how many there are, and its ↑ and ↓ step from one to the next. The ⋯ beside a label offers <em>Delete label</em>: it says how many notes have it, and then takes it off every note — from the title and from the text.</p>' +
    '<p><strong>@ mentions a note.</strong> Type <em>@</em> and the start of another note’s name: a list of matching notes opens; Enter (or a click) puts a mention in the line, and a click on the mention opens that note. It keeps up with the note’s name if you rename it.</p>' +
    '<p><strong>Try it:</strong> in a note of your own, type <em>see @Wel</em> and press Enter, then click the mention.</p>' +
    '<hr class="blk-hr">' +
    '<h3>Your notes</h3>' +
    '<ul>' +
    '<li><strong>New note</strong> under the list, or <span class="inline-code">Ctrl+N</span>. The box at the top of the list filters by title and text.</li>' +
    '<li>Everything saves itself as you go; the word by the title says <em>Saving…</em> and then <em>Saved</em>. <span class="inline-code">Ctrl+S</span> saves at once.</li>' +
    '<li>Each note’s <strong>⋯</strong> menu: <em>Pin to top</em>, <em>Archive</em> (out of the list, kept), <strong>Only view</strong>, and <em>Move to trash</em>. <strong>Archive</strong> and <strong>Trash</strong> under the list open their notes, with <em>Unarchive</em> or <em>Restore</em> to bring one back.</li>' +
    '<li><strong>Only view</strong> locks a note: you can read it, scroll it, select and copy, open its links with Ctrl+click and play its videos, but no key, paste, drag or toolbar button changes it. The ⋯ menu switches it: <em>Only view mode</em> locks the note, <em>Edit mode</em> unlocks it; the 🔒 badge by the title shows it, and clicking the badge unlocks it too.</li>' +
    '<li><span class="inline-code">Ctrl+F</span> finds words in the open note and steps through every match. <span class="inline-code">Ctrl+K</span> opens the command palette: type part of any command’s name and press Enter. <span class="inline-code">Ctrl+Z</span> and <span class="inline-code">Ctrl+Y</span> undo and redo, one step at a time — a move, a paste or a run of typing each count as one.</li>' +
    '<li>Help → <em>Keyboard shortcuts</em> lists every key, and <em>What’s new</em> shows what the current version changed.</li>' +
    '</ul>' +
    '<p><strong>Try it:</strong> lock a note of your own with ⋯ → Only view, try to type in it, then click the 🔒 badge to unlock it.</p>' +
    '<hr class="blk-hr">' +
    '<h3>Page width</h3>' +
    '<p>The eight boxes beside <em>Saved</em> set the open note\u2019s page; press one and it says what it is. <strong>NW</strong>, Nebula Wide, is the page as it always was: as wide as the window, no paper drawn; its PDF is A4, landscape or portrait, chosen in the export’s preview. <strong>NN</strong>, Nebula Narrow, is A4 written close to its edges (6.35 mm margins). <strong>A3</strong>, <strong>A4</strong>, <strong>A5</strong>, <strong>B3</strong>, <strong>B4</strong> and <strong>B5</strong> are the paper sizes. In every mode but NW the line is as long as it is on that paper when printed, so the caret goes to the next line where the paper will; the paper\u2019s edges are drawn faintly on either side, and a very thin line across the page shows where the export starts a new page. Printing and PDF export use that paper. Each note keeps its own page; choosing one is not an edit.</p>' +
    '<p><strong>Try it:</strong> in a note of your own, press A5, then A3, and watch where the lines break; NW takes it back to the whole width.</p>' +
    '<p><strong>Auto order page.</strong> On every page but NW, the button beside the indent buttons (a sheet with two lines) looks for shapes and pictures that a page line falls across — the PDF would cut them or push them over — and moves each to just under the line, so the screen and the PDF break in the same place. The first line comes a little early: the PDF prints the note’s title above the writing on page one. In a note’s ⋯ menu, <em>Auto order page: not active</em> turns it on for that note, and the note does it by itself — when it opens, when its paper changes, when you let go of something and when typing settles; the button stays pressed and <em>Auto order mode is on</em> shows by the title (click it to turn it off). On NW the button is faded: there are no pages to order.</p>' +
    '<p><strong>Try it:</strong> in a note of your own on A4, drag a shape onto the thin page line and press the button; it lands just under the line.</p>' +
    '<p><strong>Page zoom.</strong> Beside the alignment buttons, after a thin line: <strong>−</strong>, the ratio, <strong>+</strong>. It brings the page closer or takes it further away — words, pictures, shapes and the page width together — from 50 % to 200 %. On the papers it is a share of the paper’s real size: at <strong>100 %</strong> a centimetre on the paper is a centimetre on your screen, whichever paper it is. On NW and NN, 100 % is the size Nebula has always shown. <strong>Fit</strong>, first in the list, makes the whole sheet as wide as the window and keeps it so when the window is made narrower or wider; beside it, what that is now as a share of the real size — Fit (62%). A note in Only view can still be zoomed. NW, NN, A4, A5 and B5 open at 100 %, A3, B4 and B3 fitted (NW has no sheet to fit); a page wider than the window scrolls sideways, its edges and lines kept. Each note keeps its own; the View menu still zooms the whole window.</p>' +
    '<p><strong>Try it:</strong> set a note to A4 and 150 %, then drag a shape — it follows the pointer exactly.</p>' +
    '<hr class="blk-hr">' +
    '<h3>Folders and the order of your notes</h3>' +
    '<p><strong>New folder</strong> — the folder button beside <em>New note</em> — asks for a name and puts the folder in the list, open. A click on a folder shows or hides the notes in it; <strong>+ Add a note</strong>, at the top of an open folder, makes a new note in it. Double-click a folder, or choose its <strong>⋯ → Rename folder</strong>, to rename it. <strong>Delete folder</strong> never deletes a note: the notes in it go back to the list. A right-click on a note or a folder opens the same menu as its ⋯ — with the note list folded, that is the way to it.</p>' +
    '<p><strong>Drag a note</strong> onto the middle of a folder to put it in, or between two notes or folders to put it there — a line shows where it will land. Dragging never pins or unpins a note: pinned notes stay at the top and can be put in any order among themselves, and a note in a folder can be pinned too (⋯ → Pin to top), staying at the top of that folder. <strong>Folders are dragged the same way</strong>: a new folder comes in at the top, and a note you change afterwards rises above it, as notes do, until you put the folder where you want it. <strong>⋯ → Move to folder</strong> moves a note without dragging. A note you never dragged still moves to the top when you change it; one you placed stays where you put it. A black hole — the round button beside New folder — is for notes that must be safe: everything in it is kept encrypted on the disk (AES-256), title and pictures included, in a folder of its own. It is opened with the 6-digit PIN chosen when it was made — typed twice then, to be sure of it. A passkey — your fingerprint, your face or the computer’s own PIN, which the system asks for in front of Nebula — can be added beside the PIN, when the black hole is made or later from its ⋯ menu, and then either opens it; after five wrong PINs each try has to wait. A hint can be kept with the PIN and is shown when it is asked for — anyone can read it, so it is a reminder and never the PIN itself. Open, it shows its notes like a folder: + Add a note writes one in it, a note dragged onto it or sent there from its ⋯ menu is moved in — and its plain file leaves the vault and every backup. The lock at its left closes it, ten minutes untouched close it too, and every black hole is locked when the app starts. The arrow beside Black holes folds the whole section away. From its ⋯ menu a black hole goes to the Trash whole, locked; there it is restored, or deleted with every note in it — which asks for its PIN or its passkey first. Taking a note out again — from the note’s ⋯ menu, or by dragging it up among the notes — asks for it too. The recovery key shown once when it is made opens it on another computer, or when the PIN is forgotten — without the PIN and without that key, nobody can open it, Nebula included. From the ⋯ menu of an open black hole a new recovery key can be made: the old one stops working at once, and the new one is shown once — write it down.</p>' +
    '<p><strong>Try it:</strong> make a folder called <em>Work</em>, drag a note onto it, then drag another note above the first one in the list.</p>' +

    '<hr class="blk-hr">' +
    '<h2>2 · Writing</h2>' +
    '<p><strong>Bold</strong> · <em>italic</em> · <span class="u-single">underline</span> · <s>strikethrough</s> · <span class="inline-code">inline code</span> · <span class="inline-eq" data-tex="E = mc^2" contenteditable="false"></span></p>' +
    '<p>Underlines come in five styles from the <em>▾</em> beside the button, and they <em>replace</em> each other rather than stacking: ' +
    '<span class="u-single">single</span> — <span class="u-double">double</span> — <span class="u-bold">bold</span> — <span class="u-wavy">wavy</span> — <span class="u-dash">dashed</span>.</p>' +
    '<p><strong>Try it:</strong> select one of those words and apply a different underline style. It must swap, never stack. “None” clears it.</p>' +
    '<h3>Leaving a format</h3>' +
    '<p>Some <span class="inline-code">inline code</span> to practise on.</p>' +
    '<p><strong>Try it:</strong> put the caret at the <em>end</em> of that code run and press Enter — the next line starts as plain text. Put it at the <em>start</em> and press Backspace — the code formatting comes off and the words stay. You are never stuck inside a format.</p>' +

    '<h3>Spelling</h3>' +
    '<p>A word the spelling check does not know gets a red wavy underline. <strong>Right-click it</strong> for its corrections — click one and the word is replaced, and one Ctrl+Z takes it back — or <em>Add to dictionary</em> so it is never marked again, or <em>Ignore</em> to leave it alone until you close the app. English accepts the American and the British spelling: <em>color</em> and <em>colour</em> both pass.</p>' +
    '<p><strong>Try it:</strong> type <em>sentense</em> in a note and right-click it.</p>' +
    '<h3>The right-click menu</h3>' +
    '<p>A right-click in a note opens one menu, the same everywhere: the formatting buttons in its first row, then <em>Cut</em> and <em>Copy</em> (grey while nothing is selected), two ways to paste — <em>Paste as Nebula format</em> (what Ctrl+V does: the words in this note’s font, size and colours) and <em>Paste original format</em> (the same, in the size they were copied in; bold, italic and underline are kept by both) — and <em>Select all</em>. On a misspelt word its corrections stand in the same menu, and in a table the table’s rows and columns. On a picture it offers <em>Copy image</em>, its caption and <em>Delete image</em>.</p>' +
    '<p><strong>Try it:</strong> select a few words in a note of your own, right-click them and press <strong>B</strong> in the menu’s first row.</p>' +
    '<h3>Arrows as you type</h3>' +
    '<p>Type <span class="inline-code">--&gt;</span> and it becomes →; type <span class="inline-code">&lt;--</span> and it becomes ←. One Ctrl+Z gives the typed characters back; in code they are left as they are.</p>' +
    '<h3>The / menu</h3>' +
    '<p>Type <span class="inline-code">/</span> at the start of a line (or after a space) and a menu of blocks opens; keep typing to narrow it, ↑ ↓ to choose, Enter to use. It turns the line you are on into <strong>Text</strong>, <strong>Heading 1–3</strong>, a <strong>bulleted</strong> or <strong>numbered</strong> list, a <strong>toggle list</strong>, a <strong>toggle heading</strong> or a <strong>quote</strong>, and it inserts a <strong>to-do</strong>, a <strong>code block</strong>, a <strong>divider</strong>, a <strong>shape</strong>, or a link as an <strong>embed</strong>, a <strong>bookmark</strong>, a <strong>URL</strong> or a <strong>mention</strong>.</p>' +
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
    '<p><strong>Try it:</strong> the <strong>Font</strong> menu shows every face in its own typeface. With text selected it restyles the selection. The button always names the font under the caret. <strong>Size</strong> accepts any number you type, not just the listed ones — try 37. <span class="inline-code">Ctrl +</span> and <span class="inline-code">Ctrl −</span> take the selected words one size up or down; with nothing selected, the line the caret is in. The field at the top of the Font menu searches the list, and <em>+ Add a font</em> shows every font on this computer: pick one and it joins your list (its × takes it off again). A pin beside each font puts it at the top of the list; press it again and the font goes back to its place. The font used last stands above <em>+ Add a font</em>, with a pin.</p>' +
    '<p><strong>A font for each note.</strong> The font and the size you picked last in a note become that note’s writing font: a new line is written in them, and the bar shows them there. What you already wrote keeps the font it was written in; <em>Serif</em> and 14 go back to the app’s own. The note’s title is written in that font too.</p>' +
    '<p><strong>Try it:</strong> in a note of your own, pick Consolas with nothing selected, press Enter and type — the new line is in Consolas; the lines above did not change.</p>' +
    '<p><strong>Try it:</strong> <em>A</em> applies the last text colour and <em>H</em> the last highlight; each <em>▾</em> opens the full list. <em>Theme color</em>, at the top, gives selected words back the theme’s own ink — also words pasted in a fixed colour that vanished in the Dark theme. Every row lines up and the list fits without scrolling.</p>' +
    '<p><strong>Try it:</strong> switch between the themes with that paragraph in view. Every colour repaints for the theme and stays readable — a colour is stored as a name, not as a fixed value picked against one background.</p>' +

    '<hr class="blk-hr">' +
    '<h2>4 · Lists, to-dos, quotes, dividers and tables</h2>' +
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
    '<p>Tab and Shift+Tab indent any block up to six levels. In a list, <strong>Tab moves the item</strong> under the one above it, and Shift+Tab brings it back — the rest of the list and the lines around it stay where they are. The outline dropdown (paragraph, H1–H3, quote) sits before the list buttons, LibreOffice-style, and <span class="inline-code">/</span> anywhere opens the block menu.</p>' +
    '<p><strong>Try it:</strong> put the caret in “second” and press Tab — it goes under “first”; Shift+Tab brings it back.</p>' +
    '<h3>Toggle lists</h3>' +
    '<div class="blk-toggle" data-open="true"><p class="toggle-title">Click the arrow to fold this away</p><div class="toggle-body"><p>Whatever is written under a toggle folds away with it: lines, lists, pictures, even another toggle.</p></div></div>' +
    '<p>The ▸ button beside the to-do (or <span class="inline-code">/toggle</span>) turns the line you are on into a toggle; pressed again on its title, it takes the toggle away. Enter in its title goes into the part that folds, Enter on an empty last line there leaves it, and Backspace at the start of the title turns it back into plain lines, nothing lost. Enter at the very start of a title puts an empty line above the toggle. Whether it is open or folded is kept with the note.</p>' +
    '<p><strong>Toggle headings.</strong> <span class="inline-code">/toggle-h1</span>, <span class="inline-code">/toggle-h2</span> and <span class="inline-code">/toggle-h3</span> make a heading that folds away what is under it; the ▸ button on a heading does the same. <strong>In a list</strong>, an item becomes a toggle where it stands — its bullet or number first, then the arrow — and a list under that item is what folds.</p>' +
    '<p><strong>Try it:</strong> put the caret in “second” above and press the ▸ button — the list stays one list.</p>' +

    '<h3>Quotes and dividers</h3>' +
    '<blockquote>A quote stands apart from the text around it.</blockquote>' +
    '<p>A quote comes from the outline dropdown or <span class="inline-code">/quote</span>. Enter on an empty line of a quote leaves it, the way a list does. A <strong>divider</strong> — the ― button, <span class="inline-code">/divider</span>, or four dashes typed on a line of their own — is a line of its own; Backspace next to it first marks it, and a second Backspace removes it, so one stray key cannot. A click on a divider picks it: Backspace or Delete then removes it, and any other key carries on in the line under it. A divider can be dragged too. Pulled up or down, a mark shows the place between two lines where it will lie. Pulled sideways it stands up: an upright mark and a tint show the part of the note it will split — everything up to the divider above, or from the line the pointer is over — and letting go makes that part two columns, what was there on the wider side and an empty line on the other; Esc gives the drag up. Drag the upright divider sideways to make one column wider; click it and press Backspace or Delete, and the two columns are one flow again. Another divider pulled sideways over a column cuts that column in two the same way — as many columns as the line has room for; each upright divider then moves by itself, and one taken away joins the two columns at its sides. A column always ends with a line to write on, under a picture too. <span class="inline-code">/paragraph</span> turns a heading or a quote back into a plain line.</p>' +
    // Tables (0.9.4, table.js).
    '<h3>Tables</h3>' +
    '<p><span class="inline-code">/table</span> or the table button on the bar asks how large the table is to be — point at a square, or type the two numbers; Enter alone makes five rows of five columns — and puts it on the line. Over its columns stand x1, x2, x3… and beside its rows y1, y2, y3…, as in a spreadsheet: a press on one selects that column or row, and the line at the right of an x is pulled to make its column wider or narrower, the line under a y to make its row higher or lower — the size shown in millimetres while you pull. Each cell is written in like a line of the note — <strong>Tab</strong> and <strong>Shift+Tab</strong> step from cell to cell (Tab in the last one makes a new row), the arrows cross from one cell into the next and out of the table, and Enter is a new line in the cell. <strong>Ctrl+A</strong> selects what the cell holds and, pressed again, every cell of the table; the bar’s left, centre and right buttons line up the words of the cell the caret is in, or of the selected cells. Pull the mouse from one cell to another — or hold Shift and click — to select cells: a background colour from the H button then colours their backs (with only the caret in a cell, that cell’s), Delete empties them, and Ctrl+C copies them as rows any spreadsheet reads; rows copied from one are pasted one cell each. At the selection’s lower right stands what can be done with it: <em>Merge</em> makes one cell of several and <em>Unmerge</em> takes it apart again; for whole rows, columns or the whole table, <em>Delete</em>. The small square at its lower left is pulled to carry the cells on over their neighbours: one cell is copied, 1, 2 goes on with 3, 4, and Day 1 with Day 2. The <strong>+</strong> along the bottom adds a row and the one at the right a column. A right-click in a cell puts a row in above or below it, or a column at its left or right, and deletes its row or its column. The corner where the numbers meet moves the table like a picture, and a right-click on it deletes the table. A table never reaches over the edge of its page or its column: where there is no room for its columns, they are drawn narrower.</p>' +
    '<p><strong>Try it:</strong> in a note of your own type <span class="inline-code">/table</span>, write 1 and 2 in the first two cells of a column, select both and pull the small square down — the column counts on. Then select two cells, press <em>Merge</em>, and give them a colour.</p>' +

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
    '<h2>7 · Links, pictures, videos and files</h2>' +
    '<p><strong>Pasted words take this note’s font.</strong> Text copied from a web page or a document arrives in the note’s writing font and colours; its paragraphs, headings, lists, links, bold and italic stay. Words copied from another Nebula note keep a font that was chosen for them — a line in Consolas stays in Consolas. A right-click pastes it the other two ways: with its original format, or as text only (section 2). <strong>Try it:</strong> copy a paragraph from any web page and paste it into a note — it looks like the rest of the note.</p>' +
    '<p><strong>Paste a web address</strong> on its own (or type <span class="inline-code">/embed</span>, <span class="inline-code">/bookmark</span>, <span class="inline-code">/url</span> or <span class="inline-code">/mention</span>) and Nebula asks how to show it:</p>' +
    '<ul>' +
    '<li><strong>Embed</strong> — the page itself, live inside the note, with its own scrolling and sign-in forms. A YouTube or Vimeo link embeds its player. If a site refuses to be shown this way, the card’s link opens it in your browser.</li>' +
    '<li><strong>Bookmark</strong> — a card with the site’s title and address. Nebula requests just the page title; if it is unavailable, the address stays as its title.</li>' +
    '<li><strong>URL</strong> — the address as a link in the line of text.</li>' +
    '<li><strong>Mention</strong> — a short @site tag in the line, for when the address itself is noise.</li>' +
    '</ul>' +
    '<p>An embed is resized from any of its four sides or corners — they light up when the pointer is over it — wider or narrower, taller or shorter; a video keeps its shape. A card is moved like a picture: take it by its title line — a video of your own by its picture too — and a mark shows the place between two lines where it will lie; a code block is taken by its top line. The ✕ on a card removes it. Bookmark requests page metadata without browser cookies. Embed loads the page; its fallback link stays available, and a failed-load message appears only if the preview reports a loading failure.</p>' +

    '<p>No mouse needed: in that menu press <strong>↓</strong> to reach the choices, <strong>←</strong> and <strong>→</strong> to move between them, and <strong>Enter</strong> to use the lit one. <strong>↑</strong> goes back to the address, <strong>Esc</strong> closes the menu and returns you to your text.</p>' +
    '<p><strong>Try it:</strong> copy any web address, paste it on an empty line, then ↓ → → Enter.</p>' +
    '<p><strong>Link any words:</strong> select them and paste a URL over them, or use the link button in the toolbar. <strong>Ctrl+click</strong> a link to open it; choosing the link button again with an empty address takes the link off.</p>' +
    '<p><strong>Videos:</strong> embed a YouTube or Vimeo link and you get the player itself, as wide as the text (up to a comfortable size) so the picture is sharp, black while it loads like on any site — a start time in the link is kept. A video file of your own — MP4, WebM, MOV, MKV, and AVI, WMV and the other kinds too — dropped on a note, or chosen from the computer with /video, is copied into the note’s folder and played from there, with its name under it and a bar of its own: back and on by ten seconds, the speed, the whole screen. A kind the app’s player cannot play is kept all the same, and its card offers to open it in another program. A file for another program shows a line with the video’s name in its place; a note exported as a Nebula note takes its videos along. In a black hole the video is sealed beside its note, like the note itself, and plays while the black hole is open.</p>' +
    '<p><strong>Pictures:</strong> paste an image and it goes on the line you are on, part of the text, so it moves with the words at any window size. Click it for its bar, where three buttons say where it lives and the current one is lit: <em>▾</em> behind the text, <em>▴</em> above the text (floating, on top), <em>≡</em> in the text. <em>Aa</em> writes a caption under it — so does a <strong>double-click</strong> on the picture — <em>✂</em> crops it (drag the frame’s edges or corners, Enter crops, Esc leaves it whole, one Ctrl+Z brings the whole picture back), <em>✕</em> deletes it, and any of its four corner handles resizes it proportionally. <strong>Ctrl+C</strong> with a picture selected (or <em>Copy image</em> on a right-click) copies the picture itself, ready for any program. In the text, Backspace at the start of the line under a picture, or Delete at the end of the line above, first selects the picture and only a second press deletes it; an empty line beside a picture simply goes. With a picture in the text selected, Enter opens a line under it and Alt+↑ / Alt+↓ move it up or down a line. On floating pictures, the opposite corner stays in place. An image dropped from a folder floats where you drop it. A picture in the text has five more buttons on its bar: left, middle and right say where it stands on its line, and the fourth puts it beside the picture before it — two pictures on one line, which get smaller in a narrow window rather than cut off. Dragging does the same: pulled sideways it snaps left, middle or right; held over another picture a mark stands at that picture’s side; held between two lines a mark lies there — let go, and it moves. The last button, a▫a, stands the picture inside a line of words, as a letter of that line: drag it and a mark shows the caret it will go to; press Enter and you type on right after it. Such a picture has no caption; the same button, or left, middle or right, takes it out of the line again.</p>' +
    '<p><strong>Try it:</strong> copy any picture, click at the end of this line and paste. Give it a caption, then make the window narrow and wide — the picture stays between the same two lines.</p>' +
    '<p><strong>Files:</strong> drag any file from Explorer or Finder onto a note, or type <span class="inline-code">/file</span> and choose one. Nebula keeps its own copy inside the note — the original stays where it was — and shows it as a card: the logo of its kind (PDF red, Word blue, Excel green…), its name and its size. A click on the card saves a copy wherever you choose; <em>Open</em> opens it in its own program — changes made there do not go back into the note; × takes it out of the note. Pictures and videos dropped on their own still go in as pictures and videos.</p>' +
    '<p><strong>Try it:</strong> in a note of your own, drag a PDF from your Downloads folder onto an empty line, then click the card and save the copy to your desktop.</p>' +

    '<hr class="blk-hr">' +
    '<h2>8 · Import, export, print and moving a note</h2>' +
    '<p>The export button (and the File menu) writes the open note as <strong>Markdown</strong>, <strong>HTML</strong>, <strong>Word</strong> (.docx, and .doc for older Word), <strong>OpenDocument</strong> (.odt, for LibreOffice), <strong>Rich Text</strong> (.rtf: TextEdit, Pages and Apple Notes open it), <strong>Evernote</strong> (.enex: Apple Notes, Evernote, Bear, Joplin and UpNote import it), <strong>PDF</strong> (on the note’s paper — A4 for NW and NN — laid out the way it looks; a preview shows the pages first, and a Nebula Wide note picks landscape or portrait in it) or a <strong>Nebula note (.json)</strong>, which takes the note’s pictures and its video files along: small videos inside the file, large ones in a folder beside it, named after it, that belongs with the file — there is no size limit. <span class="inline-code">Ctrl+P</span> prints. <strong>Import</strong> opens a Markdown, HTML, text, Word (.docx, .doc), OpenDocument (.odt) or Nebula note file as a new note; a Word, OpenDocument, Rich Text or Evernote file keeps its headings, lists, bold and italic, links and pictures (an .enex with several notes brings each in), and is set on the note\u2019s paper when it goes out (pictures keep their side and their line, columns stay columns; shapes stay behind — a word processor has no canvas); anything that could run is stripped out first. The same files open from outside the app: in Explorer or the Finder, right-click a .docx, .doc, .odt or .rtf file → Open with → Nebula (the installed app offers itself there; it never makes itself the default). The file opens as a new note in the Nebula that is already running — there is only ever one copy of the app on a vault — and the file itself is not changed. Choose Nebula and “Always” for a kind of file, and those files wear Nebula’s violet document icon. A file dropped onto the app’s icon opens the same way.</p>' +
    '<p><strong>Videos in an export.</strong> A video in the note goes out the way it shows: its picture with the play button, as wide as in the note, linked to the video — in Word it even plays, and an HTML file keeps the player. At the top of the export menu, and in the preview, <em>Videos: With / Without</em> chooses; without, it goes as a bookmark card — its title over its address, linked — like a bookmark in the note. Bookmarks, and embedded pages that no paper can show, go out as those cards too. PDF, Word, OpenDocument and Rich Text show their pages first, on the note\u2019s paper; Export writes the file.</p>' +
    '<p><strong>Try it:</strong> export a note of your own as Word (.docx), then import that file: it comes back as a new note with its headings, lists and pictures.</p>' +
    '<p><strong>Try it:</strong> in a note of your own on NW, choose export → PDF; turn the preview between Landscape and Portrait and watch the pages change, then Cancel — nothing is saved until Export.</p>' +
    '<p>To move a note to another Nebula intact, export it as a <strong>Nebula note</strong> — text, labels, shapes, arrows, pictures and embeds in one file — and import that file there. A note file copied straight out of a vault folder imports too. Markdown and HTML are for other apps; they cannot carry shapes.</p>' +

    '<hr class="blk-hr">' +
    '<h2>9 · Your privacy</h2>' +
    '<p><strong>Your notes stay on your computer.</strong> Nebula has no account, no cloud and no statistics: nothing you write is sent anywhere. The app itself goes online for three things only — to ask GitHub whether there is a newer version, to fetch the title of a page you saved as a bookmark, and to fetch the picture of a video for an export.</p>' +
    '<p><strong>AI chats are not saved by Nebula.</strong> The AI panel is a browser tab inside the app: what you write there goes straight to the service you opened — Claude, ChatGPT, Gemini and the others — and is kept in your account there, under that service’s own privacy rules. Nebula does not read a chat, does not store it, and puts nothing from it into your notes unless you copy it there yourself.</p>' +
    '<p><strong>What is kept on this computer</strong> is what any browser keeps: each tab’s sign-in (its cookies and site data), so you are still signed in tomorrow. Every tab has a session of its own, so signing in to one is not signing in to another. Right-click a tab → <em>Clear session data</em> removes that tab’s sign-in, cookies and cache.</p>' +
    '<p><strong>Try it:</strong> right-click an AI tab you are signed in to and choose <em>Clear session data</em> — the page loads again, signed out.</p>' +

    '<hr class="blk-hr">' +
    '<h2>10 · A page in a note that asks</h2>' +
    '<p>An embedded page — a meeting, a voice recorder, a news site — may ask for your <strong>microphone</strong>, your <strong>camera</strong> or to <strong>show notifications</strong>. Nebula asks you first, naming the site and what it wants, and <em>Don\'t allow</em> is the answer already chosen: a page you do not allow gets nothing. Your answer is never saved. It lasts while that page is open; a reload, another page in the embed or the note opened again asks again. A page that asks on its own, with nothing pressed in it, is not asked about at all, and some sites then never ask — open those in your browser. Everything else — what you copied, your location, your devices — an embedded page never gets.</p>' +
    '<p><strong>Try it:</strong> in a note of your own, embed a page that records your voice, press its record button and choose <em>Don\'t allow</em> — the page hears nothing. Open the note again and press it once more: Nebula asks again.</p>' +

    '<hr class="blk-hr">' +
    '<h2>11 · Where your notes live</h2>' +
    '<p>Click the version number at the bottom of the sidebar to see every folder this copy uses. Each note is a folder of its own: in it the note’s JSON file, written atomically, and its pictures and videos as files — a picture is written once, so typing saves only the words. A dated snapshot of the whole vault is kept alongside, one a day, and only the newest is kept: it copies the notes’ own files and shares their pictures and videos with the vault instead of copying them, so a video is on the disk once. On a disk that cannot share a file — a flash drive, a network folder — the copy holds them itself, so they are there twice. Of the copies made before an update and before a repair, the newest of each kind is kept. A note deleted from the Trash takes its folder with it, in every snapshot too. Black holes are beside the notes, in blackholes: one folder each, every note in it one sealed file.</p>' +
    '<p>An update replaces the application folder only. The vault is copied into Backups before anything installs, and <strong>nothing in it is ever deleted</strong>. The installed app, the portable copy, the test build and the dev build each keep their own separate notes.</p>' +
    '<p><strong>File → Open notes folder</strong> shows that folder in Explorer. Pictures taken with F12 go to <em>Pictures\\Nebula</em>, outside the vault.</p>' +
    '<p><strong>Deleted is deleted.</strong> A note in the Trash can still be restored. Deleting from it asks first — one press only arms the “Delete for good?” that does it — and then it leaves the vault and every backup with it — the daily copies, the ones taken before updates and before repairs — so it cannot be brought back from anywhere. A picture or a video taken out of a note goes the same way at the next start: out of the note’s folder and out of every backup. What you take out is gone for good, however much it is. Only where a note has lost pictures that were not taken out in Nebula — a fault, or its file changed outside the app — Nebula asks first and deletes nothing until you answer. They can then be deleted, or put back at the end of the note, from where you move them to their old place. Notes deleted before 0.9.1 are taken out of the backups the first time 0.9.1 starts.</p>' +
    '<p><strong>Older notes are brought up to date.</strong> When a version changes how notes are written, the first start after the update repairs every note you have, a few at a time while the app is idle, after copying the whole vault to <em>Backups\\pre-heal-</em> and the version number. Only how a note is built is repaired: its words, pictures, links, shapes, code and equations stay exactly as they were, and a note that could not be repaired without changing one of them is left as it is. Its date and its place in the list do not change, and opening a note is never counted as editing it.</p>' +
    '<p><strong>Try it:</strong> after the next update, open the Backups folder from the version number: beside the dated copy there is one called <em>pre-heal-</em> with the version it was taken for.</p>' +

    '<hr class="blk-hr">' +
    '<h2>12 · Code blocks</h2>' +
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
export function addGuide(store, lang = 'en') {
  // The guide in the language of the app (0.9.4); a guide under any language's
  // title is the vault's guide.
  const guide = guideFor(lang);
  const titles = guideTitles(GUIDE_NOTE);
  const live = store.notes.filter((n) => !n.deletedAt);
  const existing = live.find((n) => titles.includes(n.title));

  // The guide that is already there is the one to open — but only while it is
  // still THIS guide. `ensureGuide` never refreshes an existing one, so a vault
  // opened before a guide rewrite kept the old text for good, and asking Help
  // for the guide handed the stale copy straight back.
  //
  // A guide the user has written in is theirs: it is never overwritten. The
  // current one arrives beside it under a versioned title instead, so nothing
  // is lost either way.
  if (existing && existing.content === guide.content) {
    if (existing.archivedAt) store.unarchive(existing.id);
    return existing.id;
  }

  const title = existing ? `${guide.title} (${GUIDE_VERSION})` : guide.title;
  const already = live.find((n) => n.title === title && n.content === guide.content);
  if (already) {
    if (already.archivedAt) store.unarchive(already.id);
    return already.id;
  }

  const note = store.createNote(title);
  store.updateActive({ content: guide.content });
  store.setReadOnly?.(note.id, true);
  return note.id;
}

/** Every build starts with the same single page. */
export const SEED_NOTES = [GUIDE_NOTE];

/**
 * The guide as `lang` reads it (0.9.4, guide-i18n.js): English as written
 * above, the others translated block by block, title included.
 */
export function guideFor(lang = 'en') {
  return lang === 'en' ? GUIDE_NOTE : guideIn(GUIDE_NOTE, lang);
}

/** Whether a title is the guide's, in any language. */
export const isGuideTitle = (title) => guideTitles(GUIDE_NOTE).includes(title);

/**
 * The vault's guide follows the language of the app — while nobody has written
 * in it. "It would be better if, when you switch to Deutsch, the whole welcome
 * page switched too" (a reader, 0.9.4). A guide somebody typed in is theirs and
 * stays as it is, in whatever language it was.
 * @param {import('./notes.js').NoteStore} store
 * @returns {string[]} the ids of the notes that changed
 */
export function syncGuideLanguage(store, lang = 'en') {
  const want = guideFor(lang);
  const wanted = guideSignature(want.content);
  const changed = [];
  for (const note of store.notes) {
    if (note.deletedAt || !isGuideTitle(note.title) || typeof note.content !== 'string') continue;
    if (!guideUnedited(note.content)) continue;
    if (note.title === want.title && guideSignature(note.content) === wanted) continue;
    store.setGuide(note.id, { title: want.title, content: want.content });
    changed.push(note.id);
  }
  return changed;
}
