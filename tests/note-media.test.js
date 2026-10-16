// @vitest-environment node
/**
 * A note's pictures and videos as files in its own folder (0.9.4): what the
 * main process does at the disk. Real folders, in the system's temp directory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  externalize, inlinePictures, referencesOf, rehome, sweepNote, removeNoteFolder, tidyVault, addVideo, noteFile, noteIds, moveNotesIn, snapshotVault, missingMedia, shred, unnamedOf, readReleased, writeReleased, noteReleases, releaseAdded, RELEASED_FILE,
  mediaUrl, mediaPath, parseMediaUrl, mimeOf, byteRange, isVideoName, pictureDataUrl, travelWhole, addAttachment, attachmentExt, isAttachmentName, isPicture, isKeptFile, travelFolder, stageTravelled, VIDEO_EXTENSIONS, stageVideos,
} from '../electron/note-media.js';
import { readNoteFile } from '../electron/open-file.js';
import { purgeNoteFromBackups, purgeDeletedFromBackups, shredTree, staleLabelled, pruneLabelled, oldWayCopies, dropOldWayCopies, purgeUnnamedFromBackups } from '../electron/backup-purge.js';

const b64 = (seed, bytes = 600) => Buffer.alloc(bytes, seed).toString('base64');
const PNG = `data:image/png;base64,${b64(1)}`;
const JPG = `data:image/jpeg;base64,${b64(2)}`;
const note = (id, content) => JSON.stringify({ id, title: id, content, createdAt: 1, updatedAt: 1 }, null, 2);

let root;
let notes;
const files = (id) => { try { return fs.readdirSync(path.join(notes, id)).sort(); } catch { return null; } };

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-media-'));
  notes = path.join(root, 'storage', 'notes');
  fs.mkdirSync(notes, { recursive: true });
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

describe('a picture leaves the text for the note’s folder', () => {
  it('as a file named by what it is, the text keeping its name', () => {
    const text = note('n1', `<p>one</p><img src="${PNG}"><p>two</p><img src="${JPG}">`);
    const out = externalize(text, 'n1', notes);
    expect(out.files).toBe(2);
    expect(out.text).not.toContain('data:image');
    expect(out.text.length).toBeLessThan(text.length / 4);
    const names = files('n1');
    expect(names).toHaveLength(2);
    expect(names.map((n) => path.extname(n)).sort()).toEqual(['.jpg', '.png']);
    for (const name of names) expect(out.text).toContain(mediaUrl('n1', name));
    expect(fs.readFileSync(path.join(notes, 'n1', names.find((n) => n.endsWith('.png')))).equals(Buffer.alloc(600, 1))).toBe(true);
    expect(JSON.parse(out.text).content).toMatch(/^<p>one<\/p><img src="nebula-media:\/\/note\/n1\/[0-9a-f]{24}\.png"><p>two<\/p>/);
  });

  it('once: the same picture twice is one file, and a second save writes nothing', () => {
    const text = note('n1', `<img src="${PNG}"><img src="${PNG}">`);
    expect(externalize(text, 'n1', notes).files).toBe(1);
    expect(files('n1')).toHaveLength(1);
    const again = externalize(text, 'n1', notes);
    expect(again.files).toBe(0);
    expect(again.text).toBe(externalize(text, 'n1', notes).text);
  });

  it('and comes back into the text exactly as it was', () => {
    const text = note('n1', `<p>a</p><img alt="x" src="${PNG}"><figure><img src="${JPG}"></figure>`);
    const stored = externalize(text, 'n1', notes).text;
    expect(inlinePictures(stored, notes)).toBe(text);
  });

  it('a note without pictures, a tiny picture and a made-up id are left alone', () => {
    const plain = note('n1', '<p>words</p>');
    expect(externalize(plain, 'n1', notes)).toEqual({ text: plain, files: 0 });
    const icon = note('n1', '<img src="data:image/png;base64,AAAA">');
    expect(externalize(icon, 'n1', notes).text).toBe(icon);
    expect(externalize(note('x', `<img src="${PNG}">`), '../x', notes).files).toBe(0);
    expect(files('n1')).toBeNull();
  });

  it('a name whose file is not there stays a name — nothing is invented, nothing dropped', () => {
    const stored = note('n1', `<img src="${mediaUrl('n1', 'aaaaaaaaaaaaaaaaaaaaaaaa.png')}">`);
    expect(inlinePictures(stored, notes)).toBe(stored);
  });
});

describe('what a note’s folder holds', () => {
  it('follows the note: what it no longer names is swept — pictures, and with `videos` the videos too (the app sweeps both at a start)', () => {
    const stored = externalize(note('n1', `<img src="${PNG}"><img src="${JPG}">`), 'n1', notes).text;
    fs.writeFileSync(path.join(notes, 'n1', 'vid-abc-1234.mp4'), 'video');
    const [jpg] = files('n1').filter((n) => n.endsWith('.jpg'));
    const without = stored.replace(mediaUrl('n1', jpg), 'gone');
    expect(sweepNote(notes, 'n1', without)).toBe(1);
    expect(files('n1')).toHaveLength(2);
    expect(files('n1')).toContain('vid-abc-1234.mp4');          // an undo may still bring the video back
    expect(sweepNote(notes, 'n1', without, { videos: true })).toBe(1);
    expect(files('n1')).toEqual([files('n1')[0]]);
    expect(files('n1')[0]).toMatch(/\.png$/);
  });

  it('is removed when it holds nothing, and whole when the note is deleted', () => {
    externalize(note('n1', `<img src="${PNG}">`), 'n1', notes);
    sweepNote(notes, 'n1', note('n1', '<p>no pictures now</p>'));
    expect(files('n1')).toBeNull();
    externalize(note('n2', `<img src="${PNG}"><img src="${JPG}">`), 'n2', notes);
    expect(removeNoteFolder(notes, 'n2')).toBe(2);
    expect(files('n2')).toBeNull();
    expect(removeNoteFolder(notes, '..')).toBe(0);
  });

  it('leaves a file it does not know alone', () => {
    externalize(note('n1', `<img src="${PNG}">`), 'n1', notes);
    fs.writeFileSync(path.join(notes, 'n1', 'readme.txt'), 'mine');
    sweepNote(notes, 'n1', note('n1', '<p>x</p>'), { videos: true });
    expect(files('n1')).toEqual(['readme.txt']);
  });
});

describe('each note owns what it shows', () => {
  it('a note naming another note’s file gets a copy of its own', () => {
    fs.mkdirSync(path.join(notes, 'a'));
    fs.writeFileSync(path.join(notes, 'a', 'vid-1-aa.mp4'), 'the video');
    const copy = note('b', `<video src="${mediaUrl('a', 'vid-1-aa.mp4')}"></video>`);
    const out = rehome(copy, 'b', notes);
    expect(out).toContain(mediaUrl('b', 'vid-1-aa.mp4'));
    expect(out).not.toContain(mediaUrl('a', 'vid-1-aa.mp4'));
    expect(fs.readFileSync(path.join(notes, 'b', 'vid-1-aa.mp4'), 'utf8')).toBe('the video');
    expect(referencesOf(out, 'b')).toEqual({ own: new Set(['vid-1-aa.mp4']), others: [] });
    // Deleting the first leaves the second whole.
    removeNoteFolder(notes, 'a');
    expect(files('b')).toEqual(['vid-1-aa.mp4']);
  });

  it('a name whose file is nowhere is left as it is', () => {
    const text = note('b', `<video src="${mediaUrl('a', 'vid-1-aa.mp4')}"></video>`);
    expect(rehome(text, 'b', notes)).toBe(text);
  });

  // Hunt B5: the window still held a pasted card naming note a; a was deleted,
  // b was typed in and saved — and b's own copy, no longer named, went at the next start.
  it('a name whose copy the note already holds is the note’s own, though the other note is gone', () => {
    fs.mkdirSync(path.join(notes, 'b'));
    fs.writeFileSync(path.join(notes, 'b', 'att-1-aaaaaaaa.pdf'), 'the file');
    const stale = note('b', `<div class="link-attach" data-src="${mediaUrl('a', 'att-1-aaaaaaaa.pdf')}"></div>`);
    const out = rehome(stale, 'b', notes);
    expect(out).toContain(mediaUrl('b', 'att-1-aaaaaaaa.pdf'));
    expect(out).not.toContain(mediaUrl('a', 'att-1-aaaaaaaa.pdf'));
    expect(files('a')).toBeNull();
  });

  it('and at a start that note keeps its file instead of losing it', () => {
    fs.mkdirSync(path.join(notes, 'b'));
    fs.writeFileSync(path.join(notes, 'b', 'att-1-aaaaaaaa.pdf'), 'the file');
    fs.writeFileSync(noteFile(notes, 'b'), note('b', `<div class="link-attach" data-src="${mediaUrl('a', 'att-1-aaaaaaaa.pdf')}"></div>`));
    tidyVault(notes);
    expect(files('b')).toContain('att-1-aaaaaaaa.pdf');
    expect(fs.readFileSync(noteFile(notes, 'b'), 'utf8')).toContain(mediaUrl('b', 'att-1-aaaaaaaa.pdf'));
  });
});

describe('at a start', () => {
  it('every note still holding pictures is written the new way, the others untouched', () => {
    const old = note('n1', `<p>hello</p><img src="${PNG}">`);
    const plain = note('n2', '<p>plain</p>');
    fs.writeFileSync(path.join(notes, 'n1.json'), old);
    fs.writeFileSync(path.join(notes, 'n2.json'), plain);
    fs.writeFileSync(path.join(notes, 'broken.json'), '{ not json');
    fs.mkdirSync(path.join(notes, 'broken'));
    fs.writeFileSync(path.join(notes, 'broken', 'aaaaaaaaaaaaaaaaaaaaaaaa.png'), 'kept');
    expect(tidyVault(notes)).toEqual({ inside: 3, moved: 1, swept: 0, held: [] });
    // Every note is a folder with its file in it: nothing lies flat any more.
    expect(fs.readdirSync(notes).sort()).toEqual(['broken', 'n1', 'n2']);
    const stored = fs.readFileSync(noteFile(notes, 'n1'), 'utf8');
    expect(stored).not.toContain('data:image');
    expect(inlinePictures(stored, notes)).toBe(old);
    expect(files('n1')).toHaveLength(2);                                  // its file and its picture
    expect(fs.readFileSync(noteFile(notes, 'n2'), 'utf8')).toBe(plain);
    expect(files('broken')).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaa.png', 'broken.json']);   // a note that cannot be read keeps everything
    expect(fs.readFileSync(noteFile(notes, 'broken'), 'utf8')).toBe('{ not json');
    expect(tidyVault(notes)).toEqual({ inside: 0, moved: 0, swept: 0, held: [] });  // and once is enough
  });

  it('a copy cut short in a saved note’s folder goes — it would lie there for good, and in every backup', () => {
    fs.mkdirSync(path.join(notes, 'n1'));
    fs.writeFileSync(noteFile(notes, 'n1'), note('n1', `<div class="link-attach" data-src="${mediaUrl('n1', 'att-1-aaaaaaaa.pdf')}"></div>`));
    fs.writeFileSync(path.join(notes, 'n1', 'att-1-aaaaaaaa.pdf'), 'kept');
    const cut = ['att-2-bbbbbbbb.zip.tmp-4242', 'vid-3-cccccccc.mp4.tmp-4242', 'aaaaaaaaaaaaaaaaaaaaaaaa.png.tmp-1-2-x1y2z3', 'n1.json.tmp-4242-1700000000000-abc123'];
    for (const name of cut) fs.writeFileSync(path.join(notes, 'n1', name), 'half');
    fs.writeFileSync(path.join(notes, 'n1', 'notes.txt.tmp-4242'), 'not ours');   // nothing this app writes: left alone
    tidyVault(notes);
    expect(files('n1').sort()).toEqual(['att-1-aaaaaaaa.pdf', 'n1.json', 'notes.txt.tmp-4242']);
    expect(JSON.parse(fs.readFileSync(noteFile(notes, 'n1'), 'utf8')).id).toBe('n1');
  });

  it('a note’s file lies in the note’s folder — moved there from a vault that kept it beside', () => {
    expect(noteFile(notes, 'n1')).toBe(path.join(notes, 'n1', 'n1.json'));
    fs.writeFileSync(path.join(notes, 'n1.json'), note('n1', '<p>one</p>'));
    fs.mkdirSync(path.join(notes, 'n2'));
    fs.writeFileSync(noteFile(notes, 'n2'), note('n2', '<p>two</p>'));
    fs.mkdirSync(path.join(notes, 'incoming-abc123'));                   // a folder that is no note
    fs.writeFileSync(path.join(notes, 'meta.txt'), 'not a note');
    fs.writeFileSync(path.join(notes, 'Shopping list.json'), note('Shopping list', '<p>eggs</p>'));   // a name no folder is made for
    expect([...noteIds(notes)].sort()).toEqual(['Shopping list', 'n1', 'n2']);   // all three ways are notes
    expect(noteIds(path.join(notes, 'nowhere'))).toBeNull();              // could not be read is not "no notes"
    expect(moveNotesIn(notes)).toBe(1);
    expect(fs.existsSync(path.join(notes, 'n1.json'))).toBe(false);
    expect(fs.readFileSync(noteFile(notes, 'n1'), 'utf8')).toBe(note('n1', '<p>one</p>'));
    expect([...noteIds(notes)].sort()).toEqual(['Shopping list', 'n1', 'n2']);
    expect(fs.existsSync(path.join(notes, 'Shopping list.json'))).toBe(true);   // it stays where it lies, and is still a note
    expect(moveNotesIn(notes)).toBe(0);
  });

  it('where a note has both, the one written last is the note', () => {
    const at = (file, seconds) => fs.utimesSync(file, seconds, seconds);
    for (const id of ['newer', 'older']) fs.mkdirSync(path.join(notes, id));
    // A flat file written after the one in the folder (a tool, an older build): it is the note.
    fs.writeFileSync(noteFile(notes, 'newer'), note('newer', '<p>in the folder, first</p>'));
    fs.writeFileSync(path.join(notes, 'newer.json'), note('newer', '<p>flat, later</p>'));
    at(noteFile(notes, 'newer'), 1000);
    at(path.join(notes, 'newer.json'), 2000);
    // A flat file left behind from before: it goes.
    fs.writeFileSync(noteFile(notes, 'older'), note('older', '<p>in the folder, later</p>'));
    fs.writeFileSync(path.join(notes, 'older.json'), note('older', '<p>flat, first</p>'));
    at(noteFile(notes, 'older'), 2000);
    at(path.join(notes, 'older.json'), 1000);
    expect(moveNotesIn(notes)).toBe(1);
    expect(fs.readFileSync(noteFile(notes, 'newer'), 'utf8')).toContain('flat, later');
    expect(fs.readFileSync(noteFile(notes, 'older'), 'utf8')).toContain('in the folder, later');
    expect(fs.readdirSync(notes).sort()).toEqual(['newer', 'older']);
  });

  it('a video no note names any more leaves its folder', () => {
    fs.mkdirSync(path.join(notes, 'n1'));
    fs.writeFileSync(noteFile(notes, 'n1'), note('n1', `<video src="${mediaUrl('n1', 'vid-1-aa.mp4')}"></video>`));
    fs.writeFileSync(path.join(notes, 'n1', 'vid-1-aa.mp4'), 'shown');
    fs.writeFileSync(path.join(notes, 'n1', 'vid-2-bb.mp4'), 'taken out');
    expect(tidyVault(notes).swept).toBe(1);
    expect(files('n1')).toEqual(['n1.json', 'vid-1-aa.mp4']);            // the note's own file is never swept
  });
});

describe('a note that travels', () => {
  const VIDEO = 'vid-m1abc-0a1b2c3d.mp4';
  const film = Buffer.alloc(5000, 9);
  const withVideo = () => {
    const stored = externalize(note('n1', `<img src="${PNG}"><video src="${mediaUrl('n1', VIDEO)}"></video>`), 'n1', notes).text;
    fs.writeFileSync(path.join(notes, 'n1', VIDEO), film);
    return stored;
  };

  it('one picture is written out on request, and only a picture that is there', () => {
    const stored = externalize(note('n1', `<img src="${PNG}">`), 'n1', notes).text;
    const [name] = files('n1');
    expect(pictureDataUrl(notes, mediaUrl('n1', name))).toBe(PNG);
    expect(stored).toContain(mediaUrl('n1', name));
    expect(pictureDataUrl(notes, mediaUrl('n1', 'aaaaaaaaaaaaaaaaaaaaaaaa.png'))).toBeNull();
    expect(pictureDataUrl(notes, 'nebula-media://note/n1/../secret.png')).toBeNull();
    fs.writeFileSync(path.join(notes, 'n1', VIDEO), film);
    expect(pictureDataUrl(notes, mediaUrl('n1', VIDEO))).toBeNull();       // a video is not handed about as text
  });

  it('carries its pictures and its videos inside it, as one file', async () => {
    const out = await travelWhole(withVideo(), notes);
    expect(out.left).toBe(0);
    expect(out.beside).toEqual([]);
    expect(out.text).not.toContain('nebula-media://');
    const content = JSON.parse(out.text).content;
    expect(content).toBe(`<img src="${PNG}"><video src="data:video/mp4;base64,${film.toString('base64')}"></video>`);
  });

  it('hands a video that is too much for the file over to be put beside it — no video is too large to travel', async () => {
    const out = await travelWhole(withVideo(), notes, { budget: 1000 });
    expect(out.left).toBe(0);
    expect(out.beside.map((v) => v.name)).toEqual([VIDEO]);
    expect(out.text).toContain(mediaUrl('n1', VIDEO));                   // still named as the note's own file
    expect(out.text).not.toContain('nebula-media://note/n1/' + files('n1').find((f) => f.endsWith('.png')));
    // Written beside the exported file, it is found again by the import: on a computer that has nothing of n1.
    const away = path.join(root, 'away');
    fs.mkdirSync(away);
    const file = path.join(away, 'Trip.json');
    fs.writeFileSync(file, out.text);
    fs.mkdirSync(travelFolder(file));
    expect(path.basename(travelFolder(file))).toBe('Trip videos');
    expect(await out.beside[0].put(path.join(travelFolder(file), VIDEO))).toBe(true);
    removeNoteFolder(notes, 'n1');
    const arrived = await stageTravelled(inlinePictures(out.text, away), notes, file);
    const ref = /nebula-media:\/\/note\/(incoming-[a-z0-9]+)\/(vid-[a-z0-9]+-[0-9a-f]{8}\.mp4)/.exec(arrived);
    expect(ref?.[2]).toBe(VIDEO);
    expect(fs.readFileSync(path.join(notes, ref[1], ref[2])).equals(film)).toBe(true);
    expect(arrived).not.toContain(mediaUrl('n1', VIDEO));
    // And a video that is not there to be carried is counted, not invented.
    expect((await travelWhole(JSON.stringify({ id: 'gone', content: '<video src="nebula-media://note/gone/vid-abc-12345678.mp4"></video>' }), notes)).left).toBe(1);
  });

  it('takes the videos of a note in a black hole along: small ones inside the file, large ones beside it', async () => {
    const sealedRef = `nebula-media://hole/bh-1/n1/${VIDEO}`;
    const text = JSON.stringify({ id: 'n1', title: 'T', content: `<video src="${sealedRef}"></video>` });
    const calls = [];
    const sealed = {
      size: (hole, id, name) => (hole === 'bh-1' && id === 'n1' && name === VIDEO ? film.length : null),
      read: async () => film,
      write: async (hole, id, name, dest) => { calls.push([hole, id, name]); fs.writeFileSync(dest, film); return true; },
    };
    const inside = await travelWhole(text, notes, { sealed });
    expect(JSON.parse(inside.text).content).toBe(`<video src="data:video/mp4;base64,${film.toString('base64')}"></video>`);
    const beside = await travelWhole(text, notes, { sealed, budget: 10 });
    expect(beside.text).not.toContain('nebula-media://hole/');
    expect(JSON.parse(beside.text).content).toBe(`<video src="${mediaUrl('n1', VIDEO)}"></video>`);
    const dest = path.join(root, VIDEO);
    expect(await beside.beside[0].put(dest)).toBe(true);
    expect(calls).toEqual([['bh-1', 'n1', VIDEO]]);
    expect(fs.readFileSync(dest).equals(film)).toBe(true);
    // Locked, or with nobody to open it: it is left, and counted.
    expect((await travelWhole(text, notes)).left).toBe(1);
  });

  it('holds every kind of video file, and tells the player what each is', () => {
    for (const ext of ['mp4', 'm4v', 'webm', 'ogv', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'm2ts', 'mts']) {
      expect(VIDEO_EXTENSIONS).toContain(ext);
      expect(isVideoName(`vid-abc-12345678.${ext}`)).toBe(true);
      expect(mimeOf(`x.${ext}`)).toMatch(/^video\//);
    }
    expect(isVideoName('notes.txt')).toBe(false);
    expect(isVideoName('vid-abc-12345678.ts')).toBe(false);              // a TypeScript file far more often than a video
  });

  it('arriving, its videos become files at once, the window is handed names — and the note’s first save takes them home', async () => {
    const travelling = (await travelWhole(withVideo(), notes)).text;
    removeNoteFolder(notes, 'n1');                                       // another computer: nothing of n1 is here
    const arrived = stageVideos(travelling, notes);
    expect(arrived).not.toContain('data:video');
    expect(arrived).toContain(PNG);                                      // pictures stay in the text until the save
    const ref = /nebula-media:\/\/note\/(incoming-[a-z0-9]+)\/(vid-[a-z0-9]+-[0-9a-f]{8}\.mp4)/.exec(arrived);
    expect(ref).not.toBeNull();
    expect(fs.readFileSync(path.join(notes, ref[1], ref[2])).equals(film)).toBe(true);
    // Saved as the note it has become here.
    const saved = rehome(externalize(arrived.replace('"id": "n1"', '"id": "n9"'), 'n9', notes).text, 'n9', notes);
    expect(saved).toContain(mediaUrl('n9', ref[2]));
    expect(saved).not.toContain('incoming-');
    expect(fs.readFileSync(path.join(notes, 'n9', ref[2])).equals(film)).toBe(true);
    fs.writeFileSync(noteFile(notes, 'n9'), saved);
    // The next start clears what waited, and keeps what the note has: its file, its picture, its video.
    tidyVault(notes);
    expect(fs.existsSync(path.join(notes, ref[1]))).toBe(false);
    expect(files('n9')).toHaveLength(3);
    expect(stageVideos(note('x', '<p>no video</p>'), notes)).toBe(note('x', '<p>no video</p>'));
  });

  it('a note file read for the window: pictures from the folder beside it, videos staged in the vault', async () => {
    const out = path.join(root, 'elsewhere');
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'Trip.json'), (await travelWhole(withVideo(), notes)).text);
    const res = await readNoteFile(path.join(out, 'Trip.json'), notes);
    expect(res.ok).toBe(true);
    expect(res.text).toContain(PNG);
    expect(res.text).toMatch(/nebula-media:\/\/note\/incoming-[a-z0-9]+\/vid-/);
    expect(res.text.length).toBeLessThan(3000);
  });

  it('a note file read out of its own folder in another vault brings the pictures and videos lying beside it', async () => {
    const stored = withVideo();
    const away = path.join(root, 'other-vault', 'notes', 'n1');
    fs.mkdirSync(away, { recursive: true });
    for (const name of files('n1')) fs.copyFileSync(path.join(notes, 'n1', name), path.join(away, name));
    fs.writeFileSync(path.join(away, 'n1.json'), stored);
    removeNoteFolder(notes, 'n1');                                       // this vault has nothing of it
    const res = await readNoteFile(path.join(away, 'n1.json'), notes);
    expect(res.ok).toBe(true);
    expect(res.text).toContain(PNG);
    const ref = /nebula-media:\/\/note\/(incoming-[a-z0-9]+)\/(vid-[a-z0-9]+-[0-9a-f]{8}\.mp4)/.exec(res.text);
    expect(ref?.[2]).toBe(VIDEO);
    expect(fs.readFileSync(path.join(notes, ref[1], ref[2])).equals(film)).toBe(true);
  });
});

describe('a backup of the vault', () => {
  const VIDEO = 'vid-m1abc-0a1b2c3d.mp4';
  const film = Buffer.alloc(40_000, 7);
  const vault = () => path.join(root, 'storage');
  const backup = (name) => path.join(root, 'backups', name);
  const make = () => {
    fs.mkdirSync(path.join(notes, 'n1'), { recursive: true });
    fs.writeFileSync(noteFile(notes, 'n1'), externalize(note('n1', `<img src="${PNG}"><video src="${mediaUrl('n1', VIDEO)}"></video>`), 'n1', notes).text);
    fs.writeFileSync(path.join(notes, 'n1', VIDEO), film);
    fs.mkdirSync(path.join(vault(), 'blackholes', 'bh-1'), { recursive: true });
    fs.writeFileSync(path.join(vault(), 'blackholes', 'bh-1', 'n2.bh'), 'sealed note');
    fs.writeFileSync(path.join(vault(), 'blackholes', 'bh-1', `n2~${VIDEO}.bhv`), 'sealed video');
    fs.writeFileSync(path.join(vault(), 'meta.json'), '{"schemaVersion":3}');
  };

  it('copies the notes’ own files and shares what never changes: a picture or a video is on the disk once', () => {
    make();
    const done = snapshotVault(vault(), backup('2026-10-07'));
    expect(done).toEqual({ copied: 3, shared: 3, taken: 0 });                       // n1.json, n2.bh, meta.json — the picture, the video, the sealed video
    const there = path.join(backup('2026-10-07'), 'notes', 'n1');
    expect(fs.readFileSync(path.join(there, VIDEO)).equals(film)).toBe(true);
    expect(fs.statSync(path.join(there, VIDEO)).nlink).toBe(2);           // two names, one file
    expect(fs.statSync(path.join(there, VIDEO)).ino).toBe(fs.statSync(path.join(notes, 'n1', VIDEO)).ino);
    expect(fs.statSync(path.join(there, 'n1.json')).nlink).toBe(1);       // a note's own file is a copy: the next save must not reach it
    // A second day shares the same bytes again.
    snapshotVault(vault(), backup('2026-10-08'));
    expect(fs.statSync(path.join(notes, 'n1', VIDEO)).nlink).toBe(3);
    // The note is written again: the backups keep the words they copied.
    const kept = fs.readFileSync(path.join(there, 'n1.json'), 'utf8');
    fs.writeFileSync(noteFile(notes, 'n1'), note('n1', '<p>all new</p>'));
    expect(fs.readFileSync(path.join(there, 'n1.json'), 'utf8')).toBe(kept);
  });

  it('a copy cut short is never backed up, and goes from a backup that took one before', () => {
    make();
    const cut = `${VIDEO.replace('m1abc', 'm2abc')}.tmp-4242`;
    fs.writeFileSync(path.join(notes, 'n1', cut), Buffer.alloc(30_000, 1));
    expect(snapshotVault(vault(), backup('2026-10-07'))).toEqual({ copied: 3, shared: 3, taken: 0 });   // as without it
    expect(fs.existsSync(path.join(backup('2026-10-07'), 'notes', 'n1', cut))).toBe(false);
    // A backup an older version made, which copied it in full.
    fs.copyFileSync(path.join(notes, 'n1', cut), path.join(backup('2026-10-07'), 'notes', 'n1', cut));
    fs.writeFileSync(path.join(backup('2026-10-07'), 'notes', 'n1', 'notes.txt.tmp-4242'), 'not ours');
    expect(purgeUnnamedFromBackups(notes, path.join(root, 'backups'))).toBe(1);
    expect(fs.existsSync(path.join(backup('2026-10-07'), 'notes', 'n1', cut))).toBe(false);
    expect(fs.existsSync(path.join(backup('2026-10-07'), 'notes', 'n1', 'notes.txt.tmp-4242'))).toBe(true);
    expect(fs.existsSync(path.join(backup('2026-10-07'), 'notes', 'n1', VIDEO))).toBe(true);   // what the note names stays
  });

  it('a video or a picture taken out of its note leaves the vault at the next start, and every backup with it', () => {
    make();
    const png = files('n1').find((name) => name.endsWith('.png'));
    snapshotVault(vault(), backup('2026-10-07'));
    snapshotVault(vault(), backup('pre-update-0.9.4-1790000000000'));
    snapshotVault(vault(), backup('kept-by-hand'));
    const witness = path.join(root, 'witness.mp4');                        // the test's own name for the bytes
    fs.linkSync(path.join(notes, 'n1', VIDEO), witness);
    const inCopies = (name) => ['2026-10-07', 'pre-update-0.9.4-1790000000000', 'kept-by-hand'].filter((b) => fs.existsSync(path.join(backup(b), 'notes', 'n1', name)));
    // Nothing is taken out yet: nothing goes.
    expect(purgeUnnamedFromBackups(notes, path.join(root, 'backups'))).toBe(0);
    // The note is written without its video; the picture stays in it.
    const kept = JSON.parse(fs.readFileSync(noteFile(notes, 'n1'), 'utf8'));
    kept.content = kept.content.replace(/<video[^>]*><\/video>/, '');
    fs.writeFileSync(noteFile(notes, 'n1'), JSON.stringify(kept, null, 2));
    expect(tidyVault(notes).swept).toBe(1);                                // the next start: out of the note's folder
    expect(fs.existsSync(path.join(notes, 'n1', VIDEO))).toBe(false);
    expect(inCopies(VIDEO).length).toBe(3);                                // the backups shared it, and still hold it
    expect(purgeUnnamedFromBackups(notes, path.join(root, 'backups'))).toBe(3);
    expect(inCopies(VIDEO)).toEqual([]);                                   // the daily copy, the one before an update, a person's own
    expect(inCopies(png).length).toBe(3);                                  // what the note still shows stays
    expect(fs.statSync(witness).nlink).toBe(1);                            // no place of the app's holds the bytes any more
    for (const b of ['2026-10-07', 'kept-by-hand']) expect(fs.readFileSync(path.join(backup(b), 'notes', 'n1', 'n1.json'), 'utf8')).toContain(VIDEO);   // the copy's own words are its own
    expect(purgeUnnamedFromBackups(notes, path.join(root, 'backups'))).toBe(0);
  });

  it('what a note still names stays in the backups even when the vault has lost the file; an unreadable note is not judged', () => {
    make();
    const png = files('n1').find((name) => name.endsWith('.png'));
    snapshotVault(vault(), backup('2026-10-07'));
    const there = path.join(backup('2026-10-07'), 'notes', 'n1');
    // The vault loses the file, the note goes on naming it: this is what the backup is for.
    fs.rmSync(path.join(notes, 'n1', VIDEO));
    expect(purgeUnnamedFromBackups(notes, path.join(root, 'backups'))).toBe(0);
    expect(fs.readFileSync(path.join(there, VIDEO)).equals(film)).toBe(true);
    // A note whose file cannot be read: nothing of it is touched in the backups.
    fs.writeFileSync(noteFile(notes, 'n1'), '{ not a note');
    expect(purgeUnnamedFromBackups(notes, path.join(root, 'backups'))).toBe(0);
    expect(fs.readdirSync(there).sort()).toEqual([VIDEO, 'n1.json', png].sort());
    // A note that is gone from the vault is the other purge's; a file that is no picture or video is nobody's; no vault, no backups: nothing.
    fs.mkdirSync(path.join(backup('2026-10-07'), 'notes', 'gone'), { recursive: true });
    fs.writeFileSync(path.join(backup('2026-10-07'), 'notes', 'gone', 'aaaaaaaaaaaaaaaaaaaaaaaa.png'), 'p');
    fs.writeFileSync(noteFile(notes, 'n1'), note('n1', '<p>words only</p>'));
    fs.writeFileSync(path.join(there, 'notes.txt'), 'a person put this here');
    expect(purgeUnnamedFromBackups(notes, path.join(root, 'backups'))).toBe(2);
    expect(fs.readdirSync(there).sort()).toEqual(['n1.json', 'notes.txt']);
    expect(fs.existsSync(path.join(backup('2026-10-07'), 'notes', 'gone', 'aaaaaaaaaaaaaaaaaaaaaaaa.png'))).toBe(true);
    expect(purgeUnnamedFromBackups(path.join(root, 'nowhere'), path.join(root, 'backups'))).toBe(0);
    expect(purgeUnnamedFromBackups(notes, path.join(root, 'nowhere'))).toBe(0);
  });

  it('a note deleted for good takes its pictures and videos out of every place, bytes and all', () => {
    make();
    snapshotVault(vault(), backup('2026-10-07'));
    snapshotVault(vault(), backup('2026-10-08'));
    // Another name for the same bytes, kept by the test: what is left of them once the note is gone?
    const witness = path.join(root, 'witness.mp4');
    fs.linkSync(path.join(notes, 'n1', VIDEO), witness);
    removeNoteFolder(notes, 'n1');
    expect(fs.readFileSync(witness).equals(film)).toBe(true);             // the backups still hold it
    purgeNoteFromBackups(path.join(root, 'backups'), 'n1');
    expect(fs.existsSync(path.join(backup('2026-10-07'), 'notes', 'n1'))).toBe(false);
    expect(fs.existsSync(path.join(backup('2026-10-08'), 'notes', 'n1'))).toBe(false);
    // The test's own name was never the app's to shred; every place of the app's is gone.
    expect(fs.statSync(witness).nlink).toBe(1);
    fs.rmSync(witness);
    // And with no other name left, the last place shreds the bytes: nothing of them is readable while it goes.
    make();
    snapshotVault(vault(), backup('2026-10-09'));
    removeNoteFolder(notes, 'n1');
    const last = path.join(backup('2026-10-09'), 'notes', 'n1', VIDEO);
    expect(fs.statSync(last).nlink).toBe(1);
    const fd = fs.openSync(last, 'r');
    purgeNoteFromBackups(path.join(root, 'backups'), 'n1');
    const seen = Buffer.alloc(film.length);
    try { fs.readSync(fd, seen, 0, seen.length, 0); } catch { /* gone already */ }
    fs.closeSync(fd);
    expect(seen.equals(film)).toBe(false);
  });

  it('of the copies made before an update and before a repair, only the newest of each kind is kept', () => {
    expect(staleLabelled(['2026-10-06', '2026-10-07', 'pre-heal-0.9.1', 'pre-heal-0.9.3', 'pre-heal-0.9.4', 'pre-heal-0.10.0', 'pre-note-folders', 'before-guide-cleanup-2026-09-07T12-22-57']).sort())
      .toEqual(['pre-heal-0.9.1', 'pre-heal-0.9.3', 'pre-heal-0.9.4']);           // 0.10.0 is newer than 0.9.4, whatever the letters say
    expect(staleLabelled(['pre-update-0.9.3-1790000000000', 'pre-update-0.9.2-1795000000000', 'pre-update-0.9.4-1791000000000']).sort())
      .toEqual(['pre-update-0.9.3-1790000000000', 'pre-update-0.9.4-1791000000000']);   // by when it was made
    expect(staleLabelled(['pre-heal-0.9.4', 'pre-update-0.9.4-1791000000000'])).toEqual([]);   // one of each kind: both stay
    expect(staleLabelled(['my-own-copy', 'pre-heal-', '2026-10-07'])).toEqual([]);              // a label of another kind is nobody's to prune
    const dir = path.join(root, 'backups');
    for (const name of ['2026-10-07', 'pre-heal-0.9.1', 'pre-heal-0.9.4', 'mine']) {
      fs.mkdirSync(path.join(dir, name, 'notes'), { recursive: true });
      fs.writeFileSync(path.join(dir, name, 'notes', 'n.json'), name);
    }
    fs.writeFileSync(path.join(dir, 'pre-heal-0.9.0'), 'a file, not a copy of the vault');
    expect(pruneLabelled(dir)).toEqual(['pre-heal-0.9.1']);
    expect(fs.readdirSync(dir).sort()).toEqual(['2026-10-07', 'mine', 'pre-heal-0.9.0', 'pre-heal-0.9.4']);
    expect(pruneLabelled(dir)).toEqual([]);
    expect(pruneLabelled(path.join(dir, 'nowhere'))).toEqual([]);
  });

  it('the copy put aside before the move goes once every picture a note names is in its folder — not before', () => {
    make();
    expect(missingMedia(notes)).toBe(0);
    expect(missingMedia(path.join(notes, 'nowhere'))).toBeNull();
    const aside = backup('pre-note-folders');
    fs.mkdirSync(path.join(aside, 'notes', 'old'), { recursive: true });
    fs.writeFileSync(path.join(aside, 'notes', 'n1.json'), note('n1', `<img src="${PNG}">`));
    fs.writeFileSync(path.join(aside, 'notes', 'old', 'x.png'), 'p');
    fs.rmSync(path.join(notes, 'n1', VIDEO));
    expect(missingMedia(notes)).toBe(1);                                   // something is missing: the copy stays
    fs.writeFileSync(path.join(notes, 'n1', VIDEO), film);
    expect(missingMedia(notes)).toBe(0);
    expect(shredTree(aside)).toBe(2);
    expect(fs.existsSync(aside)).toBe(false);
    expect(shredTree(aside)).toBe(0);
  });
});

describe('what the person took out is gone; what went some other way is asked about', () => {
  const pic = (seed) => `data:image/png;base64,${b64(seed)}`;
  const withPictures = (id, count) => {
    fs.mkdirSync(path.join(notes, id), { recursive: true });
    const content = Array.from({ length: count }, (_, i) => `<img src="${pic(40 + i)}">`).join('');
    fs.writeFileSync(noteFile(notes, id), externalize(note(id, `<p>words</p>${content}`), id, notes).text);
    return files(id).filter((name) => name.endsWith('.png'));
  };
  const text = (id) => fs.readFileSync(noteFile(notes, id), 'utf8');
  /** The note's text showing only the first `keep` of its pictures. */
  const showing = (id, keep) => {
    const stored = JSON.parse(text(id));
    let seen = 0;
    stored.content = stored.content.replace(/<img[^>]*>/g, (img) => { seen += 1; return seen <= keep ? img : ''; });
    return JSON.stringify(stored, null, 2);
  };
  /** As the app writes a note: the write is looked at, then made. */
  const throughTheApp = (released, id, next) => { noteReleases(released, id, text(id), next); fs.writeFileSync(noteFile(notes, id), next); };
  const pngs = (id, base = notes) => { try { return fs.readdirSync(path.join(base, id)).filter((name) => name.endsWith('.png')).length; } catch { return null; } };
  const backups = () => path.join(root, 'backups');
  const copy = () => path.join(backups(), '2026-10-07', 'notes');

  it('a write through the app says what it took out; an undo takes that back', () => {
    const names = withPictures('n1', 3);
    const released = new Map();
    expect(noteReleases(released, 'n1', text('n1'), text('n1'))).toBe(false);          // words typed: nothing
    expect(noteReleases(released, 'n1', text('n1'), showing('n1', 1))).toBe(true);
    expect([...released.get('n1')].sort()).toEqual(names.filter((name) => !showing('n1', 1).includes(name)).sort());
    expect(released.get('n1').size).toBe(2);
    expect(noteReleases(released, 'n1', showing('n1', 1), showing('n1', 1))).toBe(false);
    expect(noteReleases(released, 'n1', showing('n1', 1), text('n1'))).toBe(true);     // Ctrl+Z: all three named again
    expect(released.has('n1')).toBe(false);
    expect(noteReleases(released, '../n1', text('n1'), showing('n1', 0))).toBe(false);
  });

  it('the list is kept for the next start, and only what a note’s file could be named is read from it', () => {
    const file = path.join(root, 'storage', RELEASED_FILE);
    expect(readReleased(file)).toBeNull();                                               // a vault no build has kept one for
    writeReleased(file, new Map([['n1', new Set(['bbbbbbbbbbbbbbbbbbbbbbbb.png', 'aaaaaaaaaaaaaaaaaaaaaaaa.png'])], ['empty', new Set()]]));
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ v: 1, notes: { n1: ['aaaaaaaaaaaaaaaaaaaaaaaa.png', 'bbbbbbbbbbbbbbbbbbbbbbbb.png'] } });
    expect([...readReleased(file).get('n1')]).toHaveLength(2);
    fs.writeFileSync(file, JSON.stringify({ v: 1, notes: { n1: ['../../x.png', 'ok.png', 7], '../up': ['a.png'], n2: 'nope' } }));
    expect([...readReleased(file)].map(([id, names]) => `${id}:${[...names]}`)).toEqual(['n1:ok.png']);
    // A list that is there and cannot be read — cut off by a crash — is an empty list, never none:
    // nothing was taken out, so everything unnamed is asked about instead of deleted.
    fs.writeFileSync(file, '{ broken');
    expect(readReleased(file)).toEqual(new Map());
    fs.writeFileSync(file, '');
    expect(readReleased(file)).toEqual(new Map());
  });

  it('however many the person took out, they go at the next start without a question — from the folder and the backups', () => {
    withPictures('all', 6);
    withPictures('some', 6);
    snapshotVault(path.join(root, 'storage'), path.join(backups(), '2026-10-07'));
    const released = new Map();
    throughTheApp(released, 'all', showing('all', 0));                                   // every one of six
    throughTheApp(released, 'some', showing('some', 2));                                 // four of six
    const done = tidyVault(notes, { released });
    expect(done.held).toEqual([]);
    expect(done.swept).toBe(10);
    expect([pngs('all'), pngs('some')]).toEqual([0, 2]);
    expect(purgeUnnamedFromBackups(notes, backups(), { keep: new Map() })).toBe(10);
    expect([pngs('all', copy()), pngs('some', copy())]).toEqual([0, 2]);
  });

  it('a file copied for the window and never named — another note opened meanwhile — goes without a question (hunt B18)', async () => {
    withPictures('n1', 1);
    const src = path.join(root, 'plan.pdf');
    fs.writeFileSync(src, '%PDF-1.4');
    const res = await addAttachment(notes, 'n1', src);
    const name = res.url.split('/').pop();
    // Left as it was, the start asks about "pictures no longer shown" that never were in the note.
    expect(tidyVault(notes, { released: new Map() }).held).toEqual([{ id: 'n1', files: [name] }]);
    const released = new Map();
    expect(releaseAdded(released, notes, 'n1', res.url)).toBe(true);
    expect(releaseAdded(released, notes, 'n1', res.url)).toBe(false);                    // once
    expect(tidyVault(notes, { released }).held).toEqual([]);
    expect(fs.existsSync(path.join(notes, 'n1', name))).toBe(false);
    expect(pngs('n1')).toBe(1);                                                          // the note's own picture stays
    // Never a file the note names, another note's, a note's own file, or a climb out.
    const named = await addAttachment(notes, 'n1', src);
    fs.writeFileSync(noteFile(notes, 'n1'), note('n1', `<div data-src="${named.url}"></div>`));
    expect(releaseAdded(released, notes, 'n1', named.url)).toBe(false);
    expect(releaseAdded(released, notes, 'n2', named.url)).toBe(false);
    expect(releaseAdded(released, notes, 'n1', mediaUrl('n1', 'n1.json'))).toBe(false);
    expect(releaseAdded(released, notes, 'n1', mediaUrl('n1', '../n2/x.pdf'))).toBe(false);
    expect(releaseAdded(released, notes, '../n1', named.url)).toBe(false);
    expect([...released.get('n1')]).toEqual([name]);                                     // only the first
  });

  it('a file nothing in the app took out stays, in the folder and the backups, and is named to be asked about — even one', () => {
    withPictures('fault', 3);
    withPictures('both', 4);
    withPictures('fine', 2);
    snapshotVault(path.join(root, 'storage'), path.join(backups(), '2026-10-07'));
    const released = new Map();
    fs.writeFileSync(noteFile(notes, 'fault'), showing('fault', 2));                     // written behind the app's back: one picture gone
    throughTheApp(released, 'both', showing('both', 3));                                 // the person takes one out …
    fs.writeFileSync(noteFile(notes, 'both'), showing('both', 1));                       // … and two more go some other way

    const done = tidyVault(notes, { released });
    expect(done.held.map((h) => `${h.id}:${h.files.length}`).sort()).toEqual(['both:2', 'fault:1']);
    expect(done.swept).toBe(1);                                                          // the one the person took out
    expect([pngs('fault'), pngs('both'), pngs('fine')]).toEqual([3, 3, 2]);
    const keep = new Map(done.held.map((h) => [h.id, h.files]));
    expect(purgeUnnamedFromBackups(notes, backups(), { keep })).toBe(1);
    expect([pngs('fault', copy()), pngs('both', copy()), pngs('fine', copy())]).toEqual([3, 3, 2]);
    // Unanswered, it is asked again at the next start — the new list is empty, and they are still not on it.
    expect(tidyVault(notes, { released: new Map() }).held.map((h) => `${h.id}:${h.files.length}`).sort()).toEqual(['both:2', 'fault:1']);

    // The answer "delete them", for one note: the files asked about and no others, out of its folder and the backups.
    const asked = new Set(done.held.find((h) => h.id === 'both').files);
    expect(sweepNote(notes, 'both', text('both'), { videos: true, only: asked })).toBe(2);
    expect(purgeUnnamedFromBackups(notes, backups(), { only: new Map([['both', asked]]) })).toBe(2);
    expect([pngs('both'), pngs('both', copy()), pngs('fault'), pngs('fault', copy())]).toEqual([1, 1, 3, 3]);
  });

  it('a vault no list was kept for sweeps as it always did; the answer deletes only what was asked about', () => {
    const names = withPictures('n1', 5);
    fs.writeFileSync(noteFile(notes, 'n1'), showing('n1', 0));
    expect(tidyVault(notes).held).toEqual([]);                                           // no list: everything unnamed goes
    expect(pngs('n1')).toBe(0);
    // Asked about, and a file comes into the folder afterwards — a picture pasted and taken out again, an undo away: it stays.
    withPictures('n2', 3);
    fs.writeFileSync(noteFile(notes, 'n2'), showing('n2', 0));
    const held = tidyVault(notes, { released: new Map() }).held[0];
    expect(held.files).toHaveLength(3);
    fs.writeFileSync(path.join(notes, 'n2', 'ffffffffffffffffffffffff.png'), 'later');
    expect(sweepNote(notes, 'n2', text('n2'), { videos: true, only: new Set(held.files) })).toBe(3);
    expect(files('n2')).toEqual(['ffffffffffffffffffffffff.png', 'n2.json']);
    expect(names).toHaveLength(5);
  });
});

describe('a daily copy on a disk that cannot share a file', () => {
  const VIDEO = 'vid-m1abc-0a1b2c3d.mp4';
  const film = Buffer.alloc(40_000, 7);
  const vault = () => path.join(root, 'storage');
  const copy = (name) => path.join(root, 'backups', name);
  const make = () => {
    fs.mkdirSync(path.join(notes, 'n1'), { recursive: true });
    fs.writeFileSync(noteFile(notes, 'n1'), externalize(note('n1', `<img src="${PNG}"><video src="${mediaUrl('n1', VIDEO)}"></video>`), 'n1', notes).text);
    fs.writeFileSync(path.join(notes, 'n1', VIDEO), film);
  };
  // What an exFAT flash drive or a network folder holds: a copy made of copies, each file its own bytes.
  const unshared = (name) => fs.cpSync(vault(), copy(name), { recursive: true });

  it('takes the pictures and videos over from the copy before it instead of copying them again', () => {
    make();
    unshared('2026-10-06');
    const png = files('n1').find((name) => name.endsWith('.png'));
    const was = fs.statSync(path.join(copy('2026-10-06'), 'notes', 'n1', VIDEO)).ino;
    // No second name can be given here: the vault's file is already there under that name (as where a disk refuses).
    fs.mkdirSync(path.join(copy('2026-10-07'), 'notes', 'n1'), { recursive: true });
    const real = fs.linkSync;
    fs.linkSync = () => { throw Object.assign(new Error('EPERM: operation not permitted, link'), { code: 'EPERM' }); };
    let done;
    try { done = snapshotVault(vault(), copy('2026-10-07'), copy('2026-10-06')); } finally { fs.linkSync = real; }
    expect(done).toEqual({ copied: 1, shared: 0, taken: 2 });             // the note's own file — the picture, the video
    const there = path.join(copy('2026-10-07'), 'notes', 'n1');
    expect(fs.statSync(path.join(there, VIDEO)).ino).toBe(was);           // the very file the old copy held, moved
    expect(fs.readFileSync(path.join(there, VIDEO)).equals(film)).toBe(true);
    expect(fs.existsSync(path.join(there, png))).toBe(true);
    expect(fs.existsSync(path.join(copy('2026-10-06'), 'notes', 'n1', VIDEO))).toBe(false);   // the old copy, on its way out, holds it no longer
    expect(fs.statSync(path.join(notes, 'n1', VIDEO)).nlink).toBe(1);     // the vault's own is its own
    expect(fs.readFileSync(path.join(notes, 'n1', VIDEO)).equals(film)).toBe(true);
  });

  it('copies what the copy before does not hold, or holds in another size; without a copy before, everything', () => {
    make();
    unshared('2026-10-06');
    fs.writeFileSync(path.join(copy('2026-10-06'), 'notes', 'n1', VIDEO), 'cut short');
    const png = files('n1').find((name) => name.endsWith('.png'));
    fs.rmSync(path.join(copy('2026-10-06'), 'notes', 'n1', png));
    const real = fs.linkSync;
    fs.linkSync = () => { throw new Error('EPERM'); };
    try {
      expect(snapshotVault(vault(), copy('2026-10-07'), copy('2026-10-06'))).toEqual({ copied: 3, shared: 0, taken: 0 });
      expect(snapshotVault(vault(), copy('pre-update-0.9.4-1'))).toEqual({ copied: 3, shared: 0, taken: 0 });
    } finally { fs.linkSync = real; }
    expect(fs.readFileSync(path.join(copy('2026-10-07'), 'notes', 'n1', VIDEO)).equals(film)).toBe(true);
    expect(fs.readFileSync(path.join(copy('2026-10-06'), 'notes', 'n1', VIDEO), 'utf8')).toBe('cut short');
  });

  it('where the disk shares, nothing is taken from the copy before: both hold the file under a name of their own', () => {
    make();
    snapshotVault(vault(), copy('2026-10-06'));
    expect(snapshotVault(vault(), copy('2026-10-07'), copy('2026-10-06'))).toEqual({ copied: 1, shared: 2, taken: 0 });
    expect(fs.statSync(path.join(notes, 'n1', VIDEO)).nlink).toBe(3);
  });
});

describe('the copies kept the old way go at once', () => {
  const backups = () => path.join(root, 'backups');
  const copy = (name) => path.join(backups(), name);
  // As a version before 0.9.4 made it: each note's file lying flat, its pictures in its text.
  const oldWay = (name, id = 'n1') => {
    fs.mkdirSync(path.join(copy(name), 'notes'), { recursive: true });
    fs.writeFileSync(path.join(copy(name), 'notes', `${id}.json`), note(id, `<img src="${PNG}">`));
    fs.writeFileSync(path.join(copy(name), 'meta.json'), '{"schemaVersion":1}');
  };
  const inVault = (id, content) => {
    fs.mkdirSync(path.join(notes, id), { recursive: true });
    fs.writeFileSync(noteFile(notes, id), externalize(note(id, content), id, notes).text);
  };
  const now = () => new Promise((resolve) => { resolve(); });
  const left = () => fs.readdirSync(backups()).sort();

  it('the daily ones and the ones put aside before an update or a repair; a copy kept the new way stays', async () => {
    inVault('n1', `<img src="${PNG}">`);
    oldWay('2026-10-01');
    oldWay('2026-10-02');
    oldWay('pre-update-0.9.3-1790000000000');
    oldWay('pre-heal-0.9.3');
    snapshotVault(path.join(root, 'storage'), copy('2026-10-07'));       // the new way: the note in its folder, its picture shared
    expect(oldWayCopies(backups()).sort()).toEqual(['2026-10-01', '2026-10-02', 'pre-heal-0.9.3', 'pre-update-0.9.3-1790000000000']);

    const gone = await dropOldWayCopies(backups(), { pause: now });
    expect(gone.sort()).toEqual(['2026-10-01', '2026-10-02', 'pre-heal-0.9.3', 'pre-update-0.9.3-1790000000000']);
    expect(left()).toEqual(['2026-10-07']);
    const png = files('n1').find((name) => name.endsWith('.png'));
    expect(fs.statSync(path.join(copy('2026-10-07'), 'notes', 'n1', png)).ino).toBe(fs.statSync(path.join(notes, 'n1', png)).ino);
    expect(fs.readFileSync(noteFile(notes, 'n1'), 'utf8')).toContain('nebula-media://note/n1/');   // the vault is not touched
    expect(await dropOldWayCopies(backups(), { pause: now })).toEqual([]);                           // a second time there is nothing to do
  });

  it('is nobody’s to remove: a copy under a label a person made, the copy put aside for the move, a copy whose only flat file is no note id', async () => {
    oldWay('before-my-holiday');
    oldWay('pre-note-folders');
    oldWay('2026-10-03', 'Shopping list');
    fs.mkdirSync(copy('2026-10-04'), { recursive: true });                // no notes in it at all
    expect(oldWayCopies(backups())).toEqual([]);
    expect(await dropOldWayCopies(backups(), { pause: now })).toEqual([]);
    expect(left()).toEqual(['2026-10-03', '2026-10-04', 'before-my-holiday', 'pre-note-folders']);
    expect(oldWayCopies(path.join(root, 'nowhere'))).toEqual([]);
    expect(await dropOldWayCopies(path.join(root, 'nowhere'), { pause: now })).toEqual([]);
  });

  it('a copy the app was closed over is finished at the next start, and is never taken for a copy meanwhile', async () => {
    oldWay('2026-10-01');
    oldWay('pre-update-0.9.3-1790000000000');
    oldWay('pre-update-0.9.4-1790000009999');
    // Closed after the first file of the first copy: it lies there under the name of one on its way out.
    let turns = 0;
    const closed = () => { turns += 1; if (turns === 2) throw new Error('the app is closed'); return now(); };
    await expect(dropOldWayCopies(backups(), { pause: closed })).rejects.toThrow('closed');
    expect(left()).toEqual(['going-2026-10-01', 'pre-update-0.9.3-1790000000000', 'pre-update-0.9.4-1790000009999']);
    // Meanwhile: the one on its way out is no copy of any kind — the newest of the updates' copies is still the newest.
    expect(staleLabelled(left())).toEqual(['pre-update-0.9.3-1790000000000']);
    expect((await dropOldWayCopies(backups(), { pause: now })).sort()).toEqual(['2026-10-01', 'pre-update-0.9.3-1790000000000', 'pre-update-0.9.4-1790000009999']);
    expect(left()).toEqual([]);
  });

  it('overwrites what it removes, and lets go of a picture it shares without touching the vault’s', async () => {
    inVault('n1', `<img src="${PNG}">`);
    const png = files('n1').find((name) => name.endsWith('.png'));
    const picture = fs.readFileSync(path.join(notes, 'n1', png));
    // A copy from a test build: the note's file flat, its picture a file shared with the vault.
    fs.mkdirSync(path.join(copy('2026-10-05'), 'notes', 'n1'), { recursive: true });
    fs.writeFileSync(path.join(copy('2026-10-05'), 'notes', 'n1.json'), fs.readFileSync(noteFile(notes, 'n1')));
    fs.linkSync(path.join(notes, 'n1', png), path.join(copy('2026-10-05'), 'notes', 'n1', png));
    expect(await dropOldWayCopies(backups(), { pause: now })).toEqual(['2026-10-05']);
    expect(left()).toEqual([]);
    expect(fs.readFileSync(path.join(notes, 'n1', png)).equals(picture)).toBe(true);
    expect(fs.statSync(path.join(notes, 'n1', png)).nlink).toBe(1);
  });
});

describe('a video dropped into a note', () => {
  it('is copied into the note’s folder under a name of its own', async () => {
    const source = path.join(root, 'My Clip.MP4');
    fs.writeFileSync(source, 'moving pictures');
    const res = await addVideo(notes, 'n1', source);
    expect(res.ok).toBe(true);
    expect(res.name).toBe('My Clip.MP4');
    const named = parseMediaUrl(res.url);
    expect(named.id).toBe('n1');
    expect(named.file).toMatch(/^vid-[a-z0-9]+-[0-9a-f]{8}\.mp4$/);
    expect(fs.readFileSync(mediaPath(notes, 'n1', named.file), 'utf8')).toBe('moving pictures');
    expect(fs.existsSync(source)).toBe(true);                    // a copy: the file stays where it was
  });

  it('only a video, only a file, only into a note', async () => {
    const text = path.join(root, 'notes.txt');
    fs.writeFileSync(text, 'x');
    expect((await addVideo(notes, 'n1', text)).ok).toBe(false);
    expect((await addVideo(notes, 'n1', path.join(root, 'missing.mp4'))).ok).toBe(false);
    expect((await addVideo(notes, '../n1', text.replace('.txt', '.mp4'))).ok).toBe(false);
    expect(files('n1')).toBeNull();
  });
});

describe('a file attached to a note (0.9.6)', () => {
  const ATT = 'att-m1abc-0a1b2c3d.pdf';
  it('is copied into the note’s folder under a name of its own; the name it came with goes back for the card', async () => {
    const source = path.join(root, 'Quarterly Report.PDF');
    fs.writeFileSync(source, 'pages');
    const res = await addAttachment(notes, 'n1', source);
    expect(res).toMatchObject({ ok: true, name: 'Quarterly Report.PDF', size: 5 });
    const named = parseMediaUrl(res.url);
    expect(named.id).toBe('n1');
    expect(named.file).toMatch(/^att-[a-z0-9]+-[0-9a-f]{8}\.pdf$/);
    expect(fs.readFileSync(mediaPath(notes, 'n1', named.file), 'utf8')).toBe('pages');
    expect(fs.existsSync(source)).toBe(true);                    // a copy: the file stays where it was
  });

  it('any file, kept under its own ending when that is a plain one — `bin` otherwise; never outside a note', async () => {
    expect(attachmentExt('C:\\x\\a.XLSX')).toBe('xlsx');
    expect(attachmentExt('/x/README')).toBe('bin');
    expect(attachmentExt('/x/a.tar.gz')).toBe('gz');
    expect(attachmentExt('/x/a.verylong')).toBe('bin');
    expect(attachmentExt('/x/a.p-q')).toBe('bin');
    const odd = path.join(root, 'README');
    fs.writeFileSync(odd, 'x');
    expect(parseMediaUrl((await addAttachment(notes, 'n1', odd)).url).file).toMatch(/^att-[a-z0-9]+-[0-9a-f]{8}\.bin$/);
    expect((await addAttachment(notes, '../n1', odd)).ok).toBe(false);
    expect((await addAttachment(notes, 'n1', path.join(root, 'missing.pdf'))).ok).toBe(false);
    expect((await addAttachment(notes, 'n1', root)).ok).toBe(false);          // a folder is not a file
    expect((await addAttachment(notes, 'n1', '')).ok).toBe(false);
  });

  it('does not bring back the folder of a note deleted while it was being copied', async () => {
    const source = path.join(root, 'big.pdf');
    fs.writeFileSync(source, 'pages');
    fs.mkdirSync(path.join(notes, 'n1'));
    fs.writeFileSync(noteFile(notes, 'n1'), note('n1', '<p>x</p>'));
    // The note is deleted while the copy runs: copyFile is where the wait is.
    const copy = fs.promises.copyFile;
    fs.promises.copyFile = async (...args) => { fs.rmSync(path.join(notes, 'n1'), { recursive: true, force: true }); fs.mkdirSync(path.join(notes, 'n1')); return copy(...args); };
    try {
      expect(await addAttachment(notes, 'n1', source)).toMatchObject({ ok: false, error: 'no note' });
    } finally { fs.promises.copyFile = copy; }
    expect(fs.existsSync(path.join(notes, 'n1'))).toBe(false);
    // A note not saved yet has no file to lose: its first file is copied as ever.
    expect((await addAttachment(notes, 'n2', source)).ok).toBe(true);
  });

  it('a new note left before its first save while its file was copied leaves nothing at the next start', () => {
    fs.mkdirSync(path.join(notes, 'n3'));
    fs.writeFileSync(path.join(notes, 'n3', ATT), 'orphan');
    fs.writeFileSync(path.join(notes, 'n3', 'vid-m1abc-0a1b2c3d.mp4.tmp-42'), 'cut short');
    // Not abandoned: a note that is there but cannot be read, a flat note file, anything else in the folder.
    fs.mkdirSync(path.join(notes, 'n4'));
    fs.writeFileSync(noteFile(notes, 'n4'), '{ not json');
    fs.writeFileSync(path.join(notes, 'n4', ATT), 'kept');
    fs.mkdirSync(path.join(notes, 'n5'));
    fs.writeFileSync(path.join(notes, 'n5', ATT), 'kept');
    fs.writeFileSync(path.join(notes, 'n5', 'mine.txt'), 'not ours');
    expect(tidyVault(notes).swept).toBe(2);
    expect(fs.existsSync(path.join(notes, 'n3'))).toBe(false);
    expect(fs.existsSync(path.join(notes, 'n4', ATT))).toBe(true);
    expect(fs.existsSync(path.join(notes, 'n5', ATT))).toBe(true);
  });

  it('is neither a picture nor a video, whatever its ending — it is kept, never shown or played', () => {
    expect(isAttachmentName(ATT)).toBe(true);
    expect(isAttachmentName('att-m1abc-0a1b2c3d.png')).toBe(true);
    expect(isAttachmentName('att-m1abc-0a1b2c3dXpng')).toBe(false);
    expect(isAttachmentName('vid-m1abc-0a1b2c3d.mp4')).toBe(false);
    expect(isPicture('att-m1abc-0a1b2c3d.png')).toBe(false);
    expect(isVideoName('att-m1abc-0a1b2c3d.mp4')).toBe(false);
    expect(isKeptFile('att-m1abc-0a1b2c3d.png')).toBe(true);
    expect(isKeptFile('vid-m1abc-0a1b2c3d.mp4')).toBe(true);
    expect(isKeptFile('0123456789abcdef01234567.png')).toBe(false);       // a picture is swept by its own rule
    fs.mkdirSync(path.join(notes, 'n1'), { recursive: true });
    fs.writeFileSync(path.join(notes, 'n1', 'att-m1abc-0a1b2c3d.png'), Buffer.alloc(900, 1));
    expect(pictureDataUrl(notes, mediaUrl('n1', 'att-m1abc-0a1b2c3d.png'))).toBeNull();
  });

  it('stays while its note names it, and leaves the folder at the next start once it does not', () => {
    fs.mkdirSync(path.join(notes, 'n1'));
    fs.writeFileSync(noteFile(notes, 'n1'), note('n1', `<div class="link-block link-attach" data-src="${mediaUrl('n1', ATT)}"></div>`));
    fs.writeFileSync(path.join(notes, 'n1', ATT), 'kept');
    fs.writeFileSync(path.join(notes, 'n1', 'att-m1abc-0a1b2c3e.zip'), 'taken out');
    expect(unnamedOf(notes, 'n1', fs.readFileSync(noteFile(notes, 'n1'), 'utf8'))).toEqual([]);    // only a start sweeps it, as a video
    expect(tidyVault(notes).swept).toBe(1);
    expect(files('n1')).toEqual([ATT, 'n1.json']);
  });

  it('is shared by the backups as a video is — and travels beside the note, never inside it', async () => {
    fs.mkdirSync(path.join(notes, 'n1'), { recursive: true });
    const text = note('n1', `<div class="link-attach" data-src="${mediaUrl('n1', ATT)}"></div>`);
    fs.writeFileSync(noteFile(notes, 'n1'), text);
    fs.writeFileSync(path.join(notes, 'n1', ATT), Buffer.alloc(300, 4));
    snapshotVault(path.join(root, 'storage'), path.join(root, 'backups', '2026-10-15'));
    expect(fs.statSync(path.join(notes, 'n1', ATT)).nlink).toBe(2);
    const out = await travelWhole(text, notes);
    expect(out.left).toBe(0);
    expect(out.beside.map((v) => v.name)).toEqual([ATT]);
    expect(out.text).toContain(mediaUrl('n1', ATT));
  });
});

describe('the address of a note’s file', () => {
  it('names a note and a file, and nothing outside the vault', () => {
    expect(parseMediaUrl('nebula-media://note/n-17_Ab/0123456789abcdef01234567.png')).toEqual({ id: 'n-17_Ab', file: '0123456789abcdef01234567.png' });
    expect(parseMediaUrl('nebula-media://note/n1/vid-1-aa.mp4#t=3')).toEqual({ id: 'n1', file: 'vid-1-aa.mp4' });
    expect(parseMediaUrl('nebula-media://note/n1/../../secret.txt')).toBeNull();
    expect(parseMediaUrl('nebula-media://note/n1/sub/x.png')).toBeNull();
    expect(parseMediaUrl('nebula-media://other/n1/x.png')).toBeNull();
    expect(parseMediaUrl('file:///C:/x.png')).toBeNull();
    expect(mediaPath(notes, 'n1', 'x.png')).toBe(path.join(notes, 'n1', 'x.png'));
    expect(mediaPath(notes, '..', 'x.png')).toBeNull();
    expect(mediaPath(notes, 'n1', '..\\x.png')).toBeNull();
    expect(mediaPath(notes, 'n1', 'x')).toBeNull();
  });

  it('says what kind of file it is, and which part of it a player asked for', () => {
    expect(mimeOf('a.png')).toBe('image/png');
    expect(mimeOf('a.JPG')).toBe('image/jpeg');
    expect(mimeOf('vid-1.webm')).toBe('video/webm');
    expect(isVideoName('clip.mov') && !isVideoName('clip.png')).toBe(true);
    expect(byteRange('bytes=0-99', 1000)).toEqual([0, 99]);
    expect(byteRange('bytes=500-', 1000)).toEqual([500, 999]);
    expect(byteRange('bytes=-200', 1000)).toEqual([800, 999]);
    expect(byteRange('bytes=900-5000', 1000)).toEqual([900, 999]);
    expect(byteRange('bytes=1000-', 1000)).toBeNull();
    expect(byteRange('bytes=5-2', 1000)).toBeNull();
    expect(byteRange(null, 1000)).toBeNull();
    expect(byteRange('items=0-1', 1000)).toBeNull();
  });
});

describe('deleted is deleted, folders too', () => {
  const backups = () => path.join(root, 'backups');
  const backUp = (name) => fs.cpSync(path.join(root, 'storage'), path.join(backups(), name), { recursive: true });

  it('a note deleted from the vault leaves every backup with its folder', () => {
    for (const id of ['keep', 'gone']) {
      const stored = externalize(note(id, `<img src="${id === 'keep' ? PNG : JPG}">`), id, notes).text;
      fs.writeFileSync(path.join(notes, `${id}.json`), stored);
    }
    backUp('2026-10-05');
    backUp('pre-note-folders');
    expect(purgeNoteFromBackups(backups(), 'gone')).toBe(4);       // its file and its picture, twice
    for (const name of ['2026-10-05', 'pre-note-folders']) {
      const dir = path.join(backups(), name, 'notes');
      expect(fs.readdirSync(dir).sort()).toEqual(['keep', 'keep.json']);
      expect(fs.readdirSync(path.join(dir, 'keep'))).toHaveLength(1);
    }
  });

  it('and the folders of notes deleted earlier go with their files', () => {
    for (const id of ['keep', 'gone']) {
      fs.writeFileSync(path.join(notes, `${id}.json`), externalize(note(id, `<img src="${id === 'keep' ? PNG : JPG}">`), id, notes).text);
    }
    backUp('2026-10-05');
    fs.rmSync(path.join(notes, 'gone.json'));
    removeNoteFolder(notes, 'gone');
    expect(purgeDeletedFromBackups(notes, backups())).toEqual({ refused: false, removed: 2 });
    expect(fs.readdirSync(path.join(backups(), '2026-10-05', 'notes')).sort()).toEqual(['keep', 'keep.json']);
  });

  it('a vault whose note files lie in their folders counts as holding those notes: its backups are not emptied', () => {
    for (const id of ['keep', 'gone']) {
      fs.writeFileSync(path.join(notes, `${id}.json`), externalize(note(id, `<img src="${id === 'keep' ? PNG : JPG}">`), id, notes).text);
    }
    tidyVault(notes);                                                    // every note file into its folder
    expect(fs.readdirSync(notes).sort()).toEqual(['gone', 'keep']);
    backUp('2026-10-06');                                                // a backup made the new way
    removeNoteFolder(notes, 'gone');                                     // deleted: its folder, file and all
    expect(fs.readdirSync(notes)).toEqual(['keep']);
    expect(purgeDeletedFromBackups(notes, backups())).toEqual({ refused: false, removed: 2 });   // gone's file and picture
    expect(fs.readdirSync(path.join(backups(), '2026-10-06', 'notes'))).toEqual(['keep']);
    expect(fs.readdirSync(path.join(backups(), '2026-10-06', 'notes', 'keep')).sort()).toHaveLength(2);
    // And a note deleted from the vault leaves such a backup whole, its file with its folder.
    expect(purgeNoteFromBackups(backups(), 'keep')).toBe(2);
    expect(fs.readdirSync(path.join(backups(), '2026-10-06', 'notes'))).toEqual([]);
  });
});
