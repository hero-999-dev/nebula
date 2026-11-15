/**
 * About: which build is running and where everything it owns lives.
 *
 * This exists because "where is the app installed, and where are my notes"
 * had no answer inside the app — you had to know that Electron puts a profile
 * in %APPDATA% and that electron-builder installs per user. Each row opens the
 * folder it names, so the answer is one click rather than a path to retype.
 *
 * The renderer never sends a path to the main process: it asks for a key
 * ('exeDir' | 'userData' | 'storage' | 'backups' | 'snapshots') and main resolves it.
 */

import { formatBytes } from './settings-panel.js';

const $ = (id) => document.getElementById(id);

const CHANNEL_LABEL = {
  installed: 'Installed',
  test: 'Test build',
  portable: 'Portable',
  dev: 'Development',
};

const CHANNEL_NOTE = {
  installed: 'Updates itself from GitHub Releases.',
  test: 'A build for trying things out. Its own name, icon and notes — the installed Nebula is a separate app and is untouched.',
  portable: 'Runs from a folder and keeps its notes beside itself. Tells you about new versions but cannot install them.',
  dev: 'Running from source, on a separate profile — the installed app is untouched.',
};

/** The recordings Nebula rings with (1.0.3), with who made them; CREDITS.md says the same. */
const SOUND_CREDITS = [
  { name: 'Wind chimes', file: 'Windchimes.ogg', author: 'Esc861', year: 2009 },
  { name: 'Singing bowl', file: 'SingingBowl1.ogg', author: 'BambooBeast', year: 2008 },
];

let overlay = null;

function credits() {
  const box = document.createElement('div');
  box.className = 'about-credits';
  const head = document.createElement('p');
  head.className = 'about-note';
  head.innerHTML = '<strong>Sounds</strong> — real recordings, released into the public domain by their authors on Wikimedia Commons.';
  box.appendChild(head);
  const table = document.createElement('table');
  table.className = 'about-table';
  for (const c of SOUND_CREDITS) {
    table.appendChild(row(c.name, `“${c.file}” by ${c.author} (${c.year}), public domain — commons.wikimedia.org/wiki/File:${c.file}`));
  }
  box.appendChild(table);
  // The cities of the World clock and the Weather (1.0.4), and who answers for the weather.
  const places = document.createElement('p');
  places.className = 'about-note';
  places.innerHTML = '<strong>Cities</strong> — from GeoNames (geonames.org), under CC BY 4.0. <strong>Weather</strong> — forecast data by Open-Meteo (open-meteo.com), under CC BY 4.0.';
  box.appendChild(places);
  // The faces of the designs (1.0.4): packed with the app, each under the SIL Open Font License 1.1.
  const faces = document.createElement('p');
  faces.className = 'about-note';
  faces.innerHTML = '<strong>Fonts</strong> — the designs’ faces and the others packed with the app, under the SIL Open Font License 1.1: Fondamento (Brian J. Bonislawsky DBA Astigmatic), VT323 (The VT323 Project Authors), Oxanium (The Oxanium Project Authors), Patrick Hand (Patrick Wagesreiter), Courgette (Sorkin Type Co), Marcellus (Brian J. Bonislawsky DBA Astigmatic), Bodoni Moda (The Bodoni Moda Project Authors), Almendra (Ana Sanfelippo), Architects Daughter (Kimberly Geswein), Caveat Brush (Google Inc.), Chakra Petch (The Chakra Petch Project Authors), Cinzel (The Cinzel Project Authors), Cormorant Garamond (The Cormorant Project Authors), Courier Prime (The Courier Prime Project Authors), Cutive (The Cutive Project Authors), Cutive Mono (The Cutive Project Authors), EB Garamond (The EB Garamond Project Authors), Exo 2 (The Exo 2 Project Authors), Glass Antiqua (Denis Masharov), Grenze (The Grenze Project Authors), Handjet (The Handjet Project Authors), Inknut Antiqua (The Inknut Antiqua Project Authors), Jersey 15 (The Soft Type Project Authors), Josefin Sans (The Josefin Sans Project Authors), Jost (The Jost Project Authors), Kalam (Indian Type Foundry), Libre Baskerville (The Libre Baskerville Project Authors), Libre Caslon Text (The Libre Caslon Text Project Authors), MedievalSharp (Wojciech ’wmk69’ Kalinowski), Old Standard TT (The Old Standard Project Authors), Oldenburg (Sorkin Type Co), Pixelify Sans (The Pixelify Sans Project Authors), Poiret One (The Poiret One Project Authors), Rajdhani (Indian Type Foundry), Raleway (The Raleway Project Authors), Sedgwick Ave (The Sedgwick Ave Project Authors), Shadows Into Light Two (Kimberly Geswein), Sorts Mill Goudy (Barry Schwartz), Space Mono (The Space Mono Project Authors), Tektur (The Tektur Project Authors), Tenor Sans (Denis Masharov), Texturina (The Texturina Project Authors), Tiny5 (The Tiny5 Project Authors).';
  box.appendChild(faces);
  return box;
}

function row(label, value, revealKey) {
  const tr = document.createElement('tr');

  const th = document.createElement('th');
  th.textContent = label;
  tr.appendChild(th);

  const td = document.createElement('td');
  if (revealKey) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'about-path';
    btn.textContent = value;
    btn.title = 'Open this folder';
    btn.addEventListener('click', () => window.nebula?.reveal(revealKey));
    td.appendChild(btn);
  } else {
    td.textContent = value;
  }
  tr.appendChild(td);
  return tr;
}

function close() {
  if (overlay) overlay.hidden = true;
}

/**
 * @param {{ sounds?: boolean }} [opts] the sounds' credits too: Help → About Nebula shows them,
 *   the version line does not (the owner, 1.0.3: "versiyona basinca sounds kismi gözükmesin aboutta gözüksün")
 */
async function open({ sounds = false } = {}) {
  const body = $('about-body');
  body.innerHTML = '';

  const info = await window.nebula?.paths?.().catch(() => null);
  if (!info) {
    const p = document.createElement('p');
    p.className = 'about-note';
    p.textContent = 'Browser preview — there is no installed app and nothing is stored on disk.';
    body.appendChild(p);
  } else {
    const table = document.createElement('table');
    table.className = 'about-table';
    table.appendChild(row('Version', `v${info.version}`));
    table.appendChild(row('Build', CHANNEL_LABEL[info.channel] ?? info.channel));
    table.appendChild(row('Application', info.exeDir, 'exeDir'));
    table.appendChild(row('Notes', info.storage, 'storage'));
    table.appendChild(row('Backups', info.backups, 'backups'));
    table.appendChild(row('Snapshots', info.snapshots, 'snapshots'));
    table.appendChild(row('Profile', info.userData, 'userData'));
    // What all of it takes on the disk (1.0.4, the owner's Ideas note: "sol
    // alttan tiklandiginda nebulanin ne kadar depolama alani kullandigini
    // göstersin … ve about kisminda"). Measured after the panel is up: a large
    // vault takes a moment, and Settings → Storage has every part of it.
    const size = row('Size on this computer', '…');
    table.appendChild(size);
    void window.nebula?.storage?.usage?.().then((u) => {
      const cell = size.lastElementChild;
      if (u && typeof u.total === 'number') cell.textContent = formatBytes(u.total);
      else size.remove();
    }).catch(() => size.remove());
    body.appendChild(table);

    const note = document.createElement('p');
    note.className = 'about-note';
    note.textContent = CHANNEL_NOTE[info.channel] ?? '';
    body.appendChild(note);

    const safety = document.createElement('p');
    safety.className = 'about-note';
    safety.textContent = 'An update replaces the application folder only. Your notes stay in the profile, and the whole vault is copied into Backups before anything installs.';
    body.appendChild(safety);
  }
  if (sounds) body.appendChild(credits());

  overlay.hidden = false;
}

/**
 * @param {object} opts
 * @param {HTMLElement|null} opts.trigger   element that opens the panel (the version line)
 * @param {HTMLElement|null} opts.checkButton  "Check for updates", re-parented into the panel
 */
export function initAbout({ trigger = null, checkButton = null } = {}) {
  overlay = $('ov-about');
  if (!overlay) return null;

  $('about-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) { e.preventDefault(); close(); }
  });

  // initUpdater removes the button in a browser preview, where there is nothing
  // to update. Re-appending a detached node would put a dead control in here.
  if (checkButton?.isConnected) $('about-actions')?.appendChild(checkButton);

  if (trigger) {
    trigger.addEventListener('click', () => open());
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.title = 'About Nebula — version, folders, updates';
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }
  /** Help → About Nebula: the same panel, with the sounds' credits. */
  return { open: () => open({ sounds: true }) };
}
