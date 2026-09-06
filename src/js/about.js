/**
 * About: which build is running and where everything it owns lives.
 *
 * This exists because "where is the app installed, and where are my notes"
 * had no answer inside the app — you had to know that Electron puts a profile
 * in %APPDATA% and that electron-builder installs per user. Each row opens the
 * folder it names, so the answer is one click rather than a path to retype.
 *
 * The renderer never sends a path to the main process: it asks for a key
 * ('exeDir' | 'userData' | 'storage' | 'backups') and main resolves it.
 */

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

let overlay = null;

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

async function open() {
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
    table.appendChild(row('Profile', info.userData, 'userData'));
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

  overlay.hidden = false;
}

/**
 * @param {object} opts
 * @param {HTMLElement|null} opts.trigger   element that opens the panel (the version line)
 * @param {HTMLElement|null} opts.checkButton  "Check for updates", re-parented into the panel
 */
export function initAbout({ trigger = null, checkButton = null } = {}) {
  overlay = $('ov-about');
  if (!overlay) return;

  $('about-close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) { e.preventDefault(); close(); }
  });

  // initUpdater removes the button in a browser preview, where there is nothing
  // to update. Re-appending a detached node would put a dead control in here.
  if (checkButton?.isConnected) $('about-actions')?.appendChild(checkButton);

  if (trigger) {
    trigger.addEventListener('click', open);
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.title = 'About Nebula — version, folders, updates';
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  }
}
