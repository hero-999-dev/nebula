/**
 * The throwaway profiles the Electron checks make in the temp folder.
 *
 * Each check removes its own in a `finally` — which a run that is killed never
 * reaches: a wait that timed out, a machine short of memory. By 0.9.1, 158 had
 * piled up, two of them holding copies of the owner's own notes from the
 * old-notes trials, where a note deleted later would have lived on. Every run
 * now first clears what earlier runs left behind. Only profiles older than
 * three hours go, so a run going on in parallel keeps its own.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The prefixes the checks give fs.mkdtempSync, which then appends six characters. */
const PROFILE = /^nebula-(table-edges|rich-paste|shortcuts|findings|openwith|recovery|reported|settings|viewsnap|aisleep|deleted|folders|rebuild|canvas|export|layout|office|dense|edges|guide|holes|ideas|probe|purge|shots|smoke|table|desk|v090|v093|v094|web)-[A-Za-z0-9]{6}$/;

export function sweepStaleProfiles(maxAgeMs = 3 * 60 * 60 * 1000) {
  const tmp = os.tmpdir();
  let removed = 0;
  let names = [];
  try { names = fs.readdirSync(tmp); } catch { return 0; }
  for (const name of names) {
    if (!PROFILE.test(name)) continue;
    const dir = path.join(tmp, name);
    try {
      if (Date.now() - fs.statSync(dir).mtimeMs < maxAgeMs) continue;
      fs.rmSync(dir, { recursive: true, force: true });
      removed += 1;
    } catch { /* in use or already gone */ }
  }
  return removed;
}

/**
 * The note files of a vault's notes folder, whichever way they are kept: a
 * folder for each note since 0.9.4 (notes/<id>/<id>.json, its pictures and
 * videos beside it), one file a note before (notes/<id>.json).
 * @param {string} notesDir @returns {string[]} full paths
 */
export function noteFilesIn(notesDir) {
  let entries = [];
  try { entries = fs.readdirSync(notesDir, { withFileTypes: true }); } catch { return []; }
  return entries
    .map((e) => (e.isDirectory() ? path.join(notesDir, e.name, `${e.name}.json`) : path.join(notesDir, e.name)))
    .filter((file) => file.endsWith('.json') && fs.existsSync(file));
}

/** Those notes, read; a file that cannot be read is left out. */
export function readNotesIn(notesDir) {
  return noteFilesIn(notesDir).map((file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }).filter(Boolean);
}

/** Where one note's file is now. */
export function noteFileOf(notesDir, id) {
  const inFolder = path.join(notesDir, id, `${id}.json`);
  return fs.existsSync(inFolder) ? inFolder : path.join(notesDir, `${id}.json`);
}
