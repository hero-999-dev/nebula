/**
 * "Open with Nebula" (0.9.4).
 *
 * The owner's Ideas note: "an Open with Nebula entry in Windows and on the
 * Mac — for a docx, a doc, an odt and the other files (not PDF yet)". The
 * operating system starts the app with the file's path (Windows: an argument;
 * a Mac: the `open-file` event), or hands it to the copy already running
 * (`second-instance`). Either way the file comes in the way File → Import
 * brings one: read here, parsed and sanitised in the window, added as a new
 * note. The file itself is never changed.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { inlinePictures, stageTravelled } from './note-media.js';

/** What the installer offers Nebula for, and what a path handed to the app may end in. */
export const DOCUMENT_EXTENSIONS = ['docx', 'doc', 'odt', 'rtf'];
/** Everything File → Import reads: these open too when they are handed over. */
export const OPENABLE = /\.(docx|doc|odt|rtf|md|markdown|html|htm|txt|json|enex)$/i;
/** A document is read whole into memory to be parsed. A note file may carry its videos: it may be larger. */
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_NOTE_BYTES = 420 * 1024 * 1024;

/**
 * The files among a command line's arguments. The first argument is the
 * program; in a development run the second is the app's own script, which is
 * no document; switches begin with a dash.
 * @param {string[]} argv
 * @param {string} [cwd] what a relative path is relative to (a second instance's working directory)
 */
export function filesFromArgv(argv, cwd = process.cwd()) {
  const out = [];
  for (const arg of (Array.isArray(argv) ? argv : []).slice(1)) {
    const text = String(arg ?? '');
    if (!text || text.startsWith('-') || !OPENABLE.test(text)) continue;
    // The app's own package.json, in a run from the project folder, is not a note.
    if (/(^|[\\/])package\.json$/i.test(text)) continue;
    out.push(path.resolve(cwd, text));
  }
  return [...new Set(out)];
}

/**
 * A file read for the window, as File → Import hands one over:
 * `{ok, name, text}` or, for Word, OpenDocument and Rich Text, `{ok, name, bytes}`.
 * @param {string} file @param {string|null} [notesDir] the vault's notes, where a note file's videos are put
 */
export async function readNoteFile(file, notesDir = null) {
  try {
    const name = path.basename(file);
    if (!OPENABLE.test(name)) return { ok: false, name, error: 'not a file Nebula reads' };
    const stat = await fs.stat(file);
    if (!stat.isFile()) return { ok: false, name, error: 'not a file' };
    if (stat.size > (/\.json$/i.test(name) ? MAX_NOTE_BYTES : MAX_BYTES)) return { ok: false, name, error: 'too large' };
    // Word and OpenDocument (0.9.3): the bytes go to the window, which reads
    // them (office.js) and sanitises the result like any HTML file. The old
    // binary .doc is read to its text here (word-extractor), as paragraphs.
    if (/\.(docx|odt|doc|rtf)$/i.test(name)) {
      const bytes = await fs.readFile(file);
      if (/\.doc$/i.test(name) && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
        const { default: WordExtractor } = await import('word-extractor');
        const doc = await new WordExtractor().extract(bytes);
        const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const html = String(doc.getBody() ?? '').split(/\r?\n/).map((line) => `<p>${esc(line) || '<br>'}</p>`).join('');
        return { ok: true, name: name.replace(/\.doc$/i, '.html'), text: html };
      }
      return { ok: true, name, bytes: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
    }
    const text = await fs.readFile(file, 'utf8');
    // A note file taken out of a vault names its pictures; with the note's
    // folder lying beside it they come along (note-media.js).
    // Its videos become files at once — those an export wrote into it, and
    // those lying in the folder beside it (stageTravelled).
    if (!/\.json$/i.test(name)) return { ok: true, name, text };
    // The folder beside the file — or the file's own folder, when it is a note read out of a vault's folder for it.
    const here = path.dirname(file);
    const whole = inlinePictures(inlinePictures(text, here), path.dirname(here));
    return { ok: true, name, text: notesDir ? await stageTravelled(whole, notesDir, file) : whole };
  } catch (err) {
    return { ok: false, name: path.basename(String(file ?? '')), error: err.message };
  }
}
