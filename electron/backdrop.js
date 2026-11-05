/**
 * The pictures behind the note (1.0.3, src/js/backdrop.js): JPEGs in the
 * profile, on this computer. They belong to no note, so no note, backup of
 * notes or export carries them.
 *
 * The owner's Ideas note: "arkaya custom foto - transparent". Every photo
 * chosen is kept, to be put on again from its little picture beside Choose a
 * picture (the owner's Bug Find note, 2026-11-04: "bu seçilen fotolar choose a
 * picture yanında çok küçük önizlemelerle kaydedilsin, çarpıya basınca
 * kaldırılsın"): photos/<id>.jpg, and in worn.txt the one behind the note now.
 * Taking it off keeps it; only its × deletes it, and the last one deleted takes
 * the folder with it.
 */

import fs from 'node:fs';
import path from 'node:path';

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const PICTURE_MAX = 12_000_000;
/** How many photos are kept at most. */
export const PHOTOS_MAX = 12;
/** The one picture 1.0.3's first test builds kept: taken into the photos the first time they are read. */
const LEGACY = 'picture.jpg';
const PHOTOS = 'photos';
const WORN = 'worn.txt';
const ID = /^p\d{13}-[a-z0-9]{4}$/;

/** The JPEG out of a `data:image/jpeg;base64,…` address of a reasonable weight; null otherwise. */
export function jpegOf(dataUrl) {
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!m || m[1].length > PICTURE_MAX * 1.4) return null;
  const bytes = Buffer.from(m[1], 'base64');
  if (bytes.length > PICTURE_MAX || !bytes.subarray(0, 3).equals(JPEG)) return null;
  return bytes;
}

export const isPhotoId = (id) => typeof id === 'string' && ID.test(id);
const newId = () => `p${String(Date.now()).padStart(13, '0')}-${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;
const fileOf = (dir, id) => path.join(dir, PHOTOS, `${id}.jpg`);
const addressOf = (bytes) => `data:image/jpeg;base64,${bytes.toString('base64')}`;

/** The one picture an earlier build kept, made the first of the photos and worn. */
function adoptLegacy(dir) {
  const legacy = path.join(dir, LEGACY);
  if (!fs.existsSync(legacy)) return;
  const id = newId();
  fs.mkdirSync(path.join(dir, PHOTOS), { recursive: true });
  fs.renameSync(legacy, fileOf(dir, id));
  fs.writeFileSync(path.join(dir, WORN), id);
}

/** The ids of the photos kept, the oldest first. */
function ids(dir) {
  adoptLegacy(dir);
  try {
    return fs.readdirSync(path.join(dir, PHOTOS))
      .map((f) => f.replace(/\.jpg$/, ''))
      .filter(isPhotoId)
      .sort();
  } catch {
    return [];
  }
}

/** The id of the photo worn now, or null. */
export function wornPhoto(dir) {
  const all = ids(dir);
  try {
    const id = fs.readFileSync(path.join(dir, WORN), 'utf8').trim();
    return all.includes(id) ? id : null;
  } catch {
    return null;
  }
}

/** Every photo kept, the oldest first: [{ id, picture }]. */
export function listPhotos(dir) {
  return ids(dir).flatMap((id) => {
    try { return [{ id, picture: addressOf(fs.readFileSync(fileOf(dir, id))) }]; } catch { return []; }
  });
}

/** The photo worn now as an address, or null. */
export function readBackdrop(dir) {
  const id = wornPhoto(dir);
  if (!id) return null;
  try { return addressOf(fs.readFileSync(fileOf(dir, id))); } catch { return null; }
}

/** Keeps a new photo; it is not worn until `wearPhoto` says so. */
export function addPhoto(dir, dataUrl) {
  const bytes = jpegOf(dataUrl);
  if (!bytes) return { ok: false, error: 'picture' };
  if (ids(dir).length >= PHOTOS_MAX) return { ok: false, error: 'full' };
  const id = newId();
  fs.mkdirSync(path.join(dir, PHOTOS), { recursive: true });
  fs.writeFileSync(fileOf(dir, id), bytes);
  return { ok: true, id };
}

/** Puts a kept photo behind the note, or none (null): the photos stay either way. */
export function wearPhoto(dir, id) {
  if (id === null) {
    fs.rmSync(path.join(dir, WORN), { force: true });
    return { ok: true };
  }
  if (!isPhotoId(id) || !ids(dir).includes(id)) return { ok: false, error: 'missing' };
  fs.writeFileSync(path.join(dir, WORN), id);
  return { ok: true };
}

/** Deletes a photo for good; the last one takes the folder with it. */
export function removePhoto(dir, id) {
  if (!isPhotoId(id)) return { ok: false, error: 'missing' };
  const worn = wornPhoto(dir);
  fs.rmSync(fileOf(dir, id), { force: true });
  if (worn === id) fs.rmSync(path.join(dir, WORN), { force: true });
  if (ids(dir).length === 0) fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true, worn: worn === id };
}
