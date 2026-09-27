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
const PROFILE = /^nebula-(canvas|deleted|dense|edges|export|findings|guide|ideas|purge|rebuild|recovery|reported|rich-paste|shots|smoke|v090|viewsnap|web|probe)-[A-Za-z0-9]{6}$/;

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
