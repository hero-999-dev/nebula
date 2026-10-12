/**
 * "Open with Nebula" for a copy of Nebula no installer put there (0.9.4).
 *
 * The installer writes what makes Windows offer Nebula for a .docx, a .doc, an
 * .odt and an .rtf (build/installer.nsh). A portable copy — and Nebula Test is
 * one — is only a file somebody put somewhere: nothing told Windows about it.
 * The owner, on the test build: "a right-click on a docx and the like — Open
 * with Nebula is not among the suggested ones". They had found the exe by hand
 * once, and Windows then listed it under the long sentence it read out of the
 * file.
 *
 * So a portable copy says it itself when it starts, for this user alone
 * (HKCU), the same three things the installer writes:
 *
 *   <Name>Portable.Document               what a file is when this copy opens it
 *   .docx\OpenWithProgids (and the rest)  this copy among the programs of Open with
 *   Applications\<the exe>                its name — "Nebula", nothing more — and
 *                                         the kinds of file it is suggested for
 *
 * It is OFFERED; it never makes itself the default for anything. The names are
 * this copy's own, so the installed Nebula's are not written over.
 */

import path from 'node:path';
import { DOCUMENT_EXTENSIONS } from './open-file.js';

const CLASSES = 'HKCU\\Software\\Classes';

/**
 * What is written, in this order: `[key, value name ('' is the key's own), data]`.
 * The last one — how a document of this copy is opened — is what tells a later
 * start that all of it is there.
 * @param {{exe: string, name: string}} copy the portable exe as the user starts it, and the app's name
 */
export function offerPlan({ exe, name }) {
  const file = path.win32.basename(exe);
  const progId = `${name.replace(/[^A-Za-z0-9]/g, '')}Portable.Document`;
  const app = `${CLASSES}\\Applications\\${file}`;
  const command = `"${exe}" "%1"`;
  const icon = `"${exe}",0`;
  return [
    [app, 'FriendlyAppName', name],
    [`${app}\\DefaultIcon`, '', icon],
    [`${app}\\shell\\open\\command`, '', command],
    ...DOCUMENT_EXTENSIONS.flatMap((ext) => [
      [`${app}\\SupportedTypes`, `.${ext}`, ''],
      [`${CLASSES}\\.${ext}\\OpenWithProgids`, progId, ''],
    ]),
    [`${CLASSES}\\${progId}`, '', `${name} document`],
    [`${CLASSES}\\${progId}`, 'FriendlyTypeName', `${name} document`],
    [`${CLASSES}\\${progId}\\DefaultIcon`, '', icon],
    [`${CLASSES}\\${progId}\\shell\\open\\command`, '', command],
  ];
}

/** reg.exe, asked or told one thing. @returns {Promise<{ok: boolean, out: string}>} */
async function reg(args) {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true, timeout: 8000 }, (err, stdout) => resolve({ ok: !err, out: String(stdout ?? '') }));
  });
}

/**
 * Windows is told that this copy opens documents — once: a start that finds
 * it said already, for the place the copy is in now, writes nothing.
 * @param {{exe: string, name: string, run?: typeof reg}} copy
 * @returns {Promise<'there'|'written'|'failed'>}
 */
export async function offerOpenWith({ exe, name, run = reg }) {
  try {
    const plan = offerPlan({ exe, name });
    const [lastKey, , lastData] = plan[plan.length - 1];
    const [appKey] = plan[0];
    const said = await run(['query', lastKey, '/ve']);
    const named = said.ok && said.out.includes(lastData) ? await run(['query', appKey, '/v', 'FriendlyAppName']) : null;
    if (named?.ok && new RegExp(`FriendlyAppName\\s+REG_SZ\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(named.out)) return 'there';
    for (const [key, value, data] of plan) {
      const done = await run(['add', key, ...(value ? ['/v', value] : ['/ve']), '/t', 'REG_SZ', '/d', data, '/f']);
      if (!done.ok) return 'failed';
    }
    return 'written';
  } catch {
    return 'failed';
  }
}
