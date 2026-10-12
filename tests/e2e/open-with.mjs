/**
 * 0.9.4 — part 9 of the owner's Ideas note, in the real app on a throwaway
 * profile: "Open with Nebula". The app is started the way the operating system
 * starts it for a file — with the file's path — and, while it runs, a second
 * copy is started with another file, as a double-click on one does.
 *
 *   node tests/e2e/open-with.mjs          (after npm run build)
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const electronPath = createRequire(import.meta.url)('electron');

/** The smallest Word file there is: two paragraphs, the second bold. */
async function docx(file) {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Quarterly numbers</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Up by a third</w:t></w:r></w:p></w:body></w:document>');
  fs.writeFileSync(file, await zip.generateAsync({ type: 'nodebuffer' }));
}

export async function runOpenWithChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-openwith-'));
  const desk = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-desk-'));
  fs.mkdirSync(path.join(profile, 'storage', 'notes'), { recursive: true });
  fs.writeFileSync(path.join(profile, 'storage', 'notes', 'n-own.json'), JSON.stringify({ id: 'n-own', title: 'My own note', content: '<p>already here</p>', createdAt: 1, updatedAt: 1 }));
  const report = path.join(desk, 'Report.docx');
  const letter = path.join(desk, 'Letter.rtf');
  const scan = path.join(desk, 'Scan.pdf');
  await docx(report);
  fs.writeFileSync(letter, '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0 Dear {\\b reader}, hello from a letter.\\par A second line.\\par}');
  fs.writeFileSync(scan, '%PDF-1.4 not for Nebula');
  const before = { report: fs.readFileSync(report), letter: fs.readFileSync(letter) };
  const env = { ...process.env, NEBULA_USER_DATA: profile };
  const main = path.join(root, 'dist-electron/main.js');
  let app;
  try {
    // Started for a file, as "Open with Nebula" starts it.
    app = await electron.launch({ args: [main, report, scan], env });
    let win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    const titles = () => win.evaluate(() => [...document.querySelectorAll('#note-list .note-row')].map((r) => r.title));
    const until = async (what) => { for (let i = 0; i < 60; i += 1) { if (await what()) return true; await win.waitForTimeout(100); } return !!(await what()); };
    const openNote = () => win.evaluate(() => ({ title: document.getElementById('title').value, text: document.getElementById('editor').innerText, bold: [...document.querySelectorAll('#editor b, #editor strong')].map((b) => b.textContent).join('|') }));

    check('started with a Word file, the app opens it as a new note', await until(async () => (await titles()).includes('Report')), JSON.stringify(await titles()));
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    const first = await openNote();
    check('the note is open, named after the file, with its words and its bold', first.title === 'Report' && /Quarterly numbers/.test(first.text) && /Up by a third/.test(first.bold), JSON.stringify(first));
    check('the notes that were there are still there, and a kind of file Nebula does not read made no note', (await titles()).includes('My own note') && !(await titles()).some((t) => /Scan/.test(t)), JSON.stringify(await titles()));
    check('the file itself is as it was', fs.readFileSync(report).equals(before.report));
    const vault = path.join(profile, 'storage', 'notes');
    check('the note is the vault’s own now: saved as a note file', await until(() => fs.readdirSync(vault).filter((id) => fs.existsSync(path.join(vault, id, `${id}.json`)))
      .some((id) => { const n = JSON.parse(fs.readFileSync(path.join(vault, id, `${id}.json`), 'utf8')); return n.title === 'Report' && /Quarterly numbers/.test(n.content); })));

    // While it runs: another file opened with Nebula goes to the running copy.
    const second = spawn(electronPath, [main, letter], { env, stdio: 'ignore' });
    const exited = new Promise((resolve) => second.on('exit', (code) => resolve(code)));
    check('a file opened while Nebula runs arrives in the running app as a new note', await until(async () => (await titles()).includes('Letter')), JSON.stringify(await titles()));
    const code = await Promise.race([exited, new Promise((r) => setTimeout(() => r('still running'), 15_000))]);
    check('and the second copy goes away by itself: one app, one vault', code !== 'still running' && (await app.windows()).length === 1, String(code));
    const letterNote = await openNote();
    check('a Rich Text file reads as written', letterNote.title === 'Letter' && /Dear reader, hello from a letter\./.test(letterNote.text.replace(/\s+/g, ' ')) && /reader/.test(letterNote.bold) && /A second line\./.test(letterNote.text), JSON.stringify(letterNote));
    check('its file is as it was too', fs.readFileSync(letter).equals(before.letter));

    // A second copy with no file: nothing new, the same window.
    const third = spawn(electronPath, [main], { env, stdio: 'ignore' });
    await new Promise((resolve) => { third.on('exit', resolve); setTimeout(resolve, 15_000); });
    await win.waitForTimeout(500);
    check('started again with no file, it is still the one app with the same notes', (await app.windows()).length === 1 && (await titles()).filter((t) => t === 'Letter' || t === 'Report').length === 2, JSON.stringify(await titles()));

    // The next start: the files are not opened again.
    await app.close();
    app = await electron.launch({ args: [main], env });
    win = await app.firstWindow();
    win.setDefaultTimeout(10_000);
    win.on('pageerror', (e) => errors.push(e.message));
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
    await win.waitForTimeout(1200);
    const again = await titles();
    check('at the next start each is there once — a file is opened when it is handed over, not again', again.filter((t) => t === 'Report').length === 1 && again.filter((t) => t === 'Letter').length === 1, JSON.stringify(again));

    check('no page errors in the Open with Nebula checks', errors.length === 0, errors.join(' | '));
  } finally {
    try { await app?.close(); } catch { /* closed */ }
    for (const dir of [profile, desk]) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* a handle still open */ } }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  await runOpenWithChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failed += 1; });
  process.exitCode = failed ? 1 : 0;
}
