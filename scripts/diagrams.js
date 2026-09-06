/**
 * The mind maps on the docs site.
 *
 * Drawn from measurements rather than by hand: every box sizes itself to its
 * longest line and every arrow attaches to a computed edge. Hand-placed
 * coordinates drift the moment a label is reworded, and the failure is silent —
 * text quietly leaves its box. Here a longer label makes a wider box.
 *
 * Colours come from the page's CSS variables, so the diagrams follow the theme.
 */

const CH = 6.45;      // average advance of the site's 12.5px sans, measured
const PAD_X = 16;
const LINE = 14.5;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * A box that fits its text.
 * @returns {{svg: string, cx: number, cy: number, w: number, h: number,
 *            left: {x,y}, right: {x,y}, top: {x,y}, bottom: {x,y}}}
 */
function node(cx, cy, title, lines = [], opts = {}) {
  const all = [title, ...lines];
  const w = opts.w ?? Math.round(Math.max(...all.map((t) => t.length * CH)) + PAD_X * 2);
  const h = Math.round(26 + lines.length * LINE + (lines.length ? 8 : 0));
  const x = Math.round(cx - w / 2);
  const y = Math.round(cy - h / 2);
  const tone = opts.tone ?? 'panel';

  let svg = `<g class="n n--${tone}">`;
  svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9"${opts.dashed ? ' stroke-dasharray="5 4"' : ''}/>`;
  svg += `<text class="t" x="${cx}" y="${y + 18}" text-anchor="middle">${esc(title)}</text>`;
  lines.forEach((l, i) => {
    svg += `<text class="s" x="${cx}" y="${y + 34 + i * LINE}" text-anchor="middle">${esc(l)}</text>`;
  });
  svg += '</g>';

  return {
    svg, cx, cy, w, h,
    left: { x, y: cy }, right: { x: x + w, y: cy },
    top: { x: cx, y }, bottom: { x: cx, y: y + h },
  };
}

/** Straight arrow between two points, with an optional label at the midpoint. */
function arrow(a, b, opts = {}) {
  const cls = `e${opts.dashed ? ' e--dashed' : ''}${opts.muted ? ' e--muted' : ''}`;
  let svg = `<line class="${cls}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" marker-end="url(#arrowhead)"/>`;
  if (opts.label) {
    const mx = (a.x + b.x) / 2 + (opts.dx ?? 0);
    const my = (a.y + b.y) / 2 + (opts.dy ?? -6);
    svg += `<text class="l" x="${mx}" y="${my}" text-anchor="middle">${esc(opts.label)}</text>`;
  }
  return svg;
}

/** Plain connector, no head — for "these belong together". */
function tie(a, b, opts = {}) {
  return `<line class="e e--tie${opts.dashed ? ' e--dashed' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
}

const caption = (x, y, text, anchor = 'start') =>
  `<text class="cap" x="${x}" y="${y}" text-anchor="${anchor}">${esc(text)}</text>`;

function figure({ id, title, blurb, width, height, body }) {
  return `<figure class="dia" id="${id}">
  <figcaption><h3>${esc(title)}</h3><p>${esc(blurb)}</p></figcaption>
  <div class="scroll"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(title)}">
    <defs><marker id="arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" class="head"/></marker></defs>
    ${body}
  </svg></div>
</figure>`;
}

/* ------------------------------------------------------------- 1. features */

function featureMap() {
  const W = 900, H = 530;
  const store = node(W / 2, 210, 'NoteStore', ['the only note state', 'notes.js'], { tone: 'accent' });

  const ring = [
    { t: 'Editor', s: ['contenteditable', 'debounced autosave'], a: -150 },
    { t: 'Toolbar + dock pad', s: ['two rows, four sides'], a: -95 },
    { t: 'Slash menu', s: ['/ inserts blocks'], a: -40 },
    { t: 'Shapes layer', s: ['floats over the note'], a: 20 },
    { t: 'Code blocks', s: ['language + colours'], a: 75 },
    { t: 'Disk mirror', s: ['one JSON per note'], a: 140 },
    { t: 'Update + About', s: ['version, folders'], a: 180 },
  ];

  let body = '';
  const rx = 330, ry = 155;
  const cy = 210;
  const nodes = ring.map(({ t, s, a }) => {
    const rad = (a * Math.PI) / 180;
    return { n: node(Math.round(W / 2 + rx * Math.cos(rad)), Math.round(cy + ry * Math.sin(rad)), t, s), a };
  });

  for (const { n, a } of nodes) {
    const from = Math.abs(a) > 90 ? store.left : store.right;
    const to = Math.abs(a) > 90 ? n.right : n.left;
    body += tie(from, to);
  }
  for (const { n } of nodes) body += n.svg;
  body += store.svg;

  // Drawn well below the ring and with no line to the hub: the gap IS the point.
  const ai = node(W / 2, H - 76, 'AI panel', ['embedded chat webviews'], { dashed: true, tone: 'muted' });
  body += ai.svg;
  body += caption(W / 2, H - 28, 'deliberately not connected - it reads and writes no note data', 'middle');

  return figure({
    id: 'map-features',
    title: 'Every feature hangs off one store',
    blurb: 'There are no per-feature stores, so two features cannot hold different ideas of the same note. Adding a feature means subscribing to this hub, not building another one beside it.',
    width: W, height: H, body,
  });
}

/* --------------------------------------------------------- 2. combinations */

function combinations() {
  const W = 1000, H = 420;
  const rows = [
    [['Shapes layer', 'wrap: through'], 'annotate a paragraph without reflowing a word'],
    [['Code block', 'language picker'], 'a snippet stays readable inside prose'],
    [['Dock pad', 'AI panel'], 'text on the left, the chat you borrow from on the right'],
    [['Six seed notes', 'manual check'], 'every feature ships with a page that exercises it'],
    [['Disk mirror', 'pre-update snapshot'], 'an update cannot be the last thing to touch a note'],
    [['Dev profile split', 'reset scripts'], 'development cannot reach the notes you keep'],
  ];

  // Fixed column widths: ragged boxes would put the "+" off-centre on every row.
  const LW = 190, RW = 230;
  let body = '';
  const rowH = 60;
  rows.forEach(([[a, b], result], i) => {
    const y = 46 + i * rowH;
    const left = node(120, y, a, [], { w: LW });
    const right = node(365, y, b, [], { w: RW });
    body += tie(left.right, { x: right.left.x - 14, y });
    body += left.svg + right.svg;
    body += `<text class="plus" x="242" y="${y + 5}" text-anchor="middle">+</text>`;
    body += arrow({ x: right.right.x + 6, y }, { x: 520, y }, {});
    body += `<text class="res" x="532" y="${y + 4}">${esc(result)}</text>`;
  });

  return figure({
    id: 'map-combinations',
    title: 'What only works in pairs',
    blurb: 'Each line is a feature that would be pointless alone. Read it as the reason the second half exists.',
    width: W, height: H, body,
  });
}

/* ---------------------------------------------------------- 3. the process */

function processMap() {
  const W = 900, H = 430;
  let body = '';

  const bands = [
    { y: 20, h: 108, label: 'Renderer — src/js', tone: 'band' },
    { y: 152, h: 62, label: 'Preload bridge — the only door', tone: 'band' },
    { y: 238, h: 108, label: 'Main process — electron/main.js', tone: 'band' },
  ];
  for (const b of bands) {
    body += `<rect class="band" x="18" y="${b.y}" width="${W - 36}" height="${b.h}" rx="12"/>`;
    body += caption(30, b.y + 17, b.label);
  }

  const editor = node(150, 88, 'editor.js', ['keystrokes']);
  const store = node(330, 88, 'NoteStore', ['note state'], { tone: 'accent' });
  const mirror = node(520, 88, 'disk-store.js', ['queue per file']);
  const ui = node(730, 88, 'updater · about', ['status, paths']);
  body += editor.svg + store.svg + mirror.svg + ui.svg;
  body += arrow(editor.right, store.left) + arrow(store.right, mirror.left);

  const bridge = node(W / 2, 183, 'window.nebula', ['storage · updates · paths · reveal — keys, never raw paths'], { tone: 'accent' });
  body += bridge.svg;
  body += arrow(mirror.bottom, { x: bridge.cx - 90, y: bridge.cy - bridge.h / 2 });
  body += arrow(ui.bottom, { x: bridge.cx + 120, y: bridge.cy - bridge.h / 2 });

  const guard = node(210, 306, 'resolveInStorage', ['rejects anything', 'outside the vault']);
  const write = node(430, 306, 'atomic write', ['temp file, then rename']);
  const snap = node(650, 306, 'snapshots', ['daily ×7 + pre-update']);
  body += guard.svg + write.svg + snap.svg;
  body += arrow({ x: bridge.cx - 120, y: bridge.cy + bridge.h / 2 }, guard.top);
  body += arrow(guard.right, write.left);
  body += arrow(write.right, snap.left);

  const disk = node(W / 2, 392, 'storage/notes/<id>.json', ['in the user profile — never beside the app'], { tone: 'accent' });
  body += disk.svg;
  body += arrow(write.bottom, { x: disk.cx - 60, y: disk.cy - disk.h / 2 });
  body += arrow(snap.bottom, { x: disk.cx + 120, y: disk.cy - disk.h / 2 });

  return figure({
    id: 'map-process',
    title: 'Three processes, one door',
    blurb: 'The renderer never touches the filesystem. It asks the bridge for a named thing; the main process decides what that name means and refuses anything outside the vault.',
    width: W, height: H, body,
  });
}

/* -------------------------------------------------------------- 4. autosave */

function autosave() {
  const W = 900, H = 250;
  let body = '';

  const steps = [
    ['keystroke', ['in one block']],
    ['400 ms quiet', ['debounce']],
    ['NoteStore', ['updateActive']],
    ['saveJson', ['localStorage']],
    ['saveHook', ['disk mirror']],
    ['queue per file', ['last state wins']],
    ['storage:write', ['temp → rename']],
  ];

  let x = 78;
  const y = 96;
  let prev = null;
  for (const [t, s] of steps) {
    const n = node(x, y, t, s);
    body += n.svg;
    if (prev) body += arrow(prev.right, n.left);
    prev = n;
    x += Math.round(n.w / 2) + 62;
  }

  const bus = node(300, 196, 'bus: note-changed', ['sidebar row, snippet, time'], { tone: 'muted' });
  body += bus.svg;
  body += arrow({ x: 300, y: y + 22 }, bus.top, { dashed: true });
  body += caption(18, 32, 'One direction only: the store changes, then everything else is told.');
  body += caption(18, 232, 'Nothing here reads the DOM to find out what a note contains.');

  return figure({
    id: 'map-autosave',
    title: 'A keystroke on its way to disk',
    blurb: 'Seven steps, each one cheap. The queue is why two fast saves cannot interleave into a half-written file.',
    width: W, height: H, body,
  });
}

/* --------------------------------------------------------------- 5. release */

function releaseFlow() {
  const W = 900, H = 400;
  let body = '';

  const push = node(110, 50, 'you say "push"', ['npm run push'], { tone: 'accent' });
  const gates = node(330, 50, 'gates', ['tests · smoke · build · docs']);
  const tag = node(540, 50, 'version + tag', ['Log.md, memory.json']);
  const gh = node(760, 50, 'git push', ['main + vX.Y.Z']);
  body += push.svg + gates.svg + tag.svg + gh.svg;
  body += arrow(push.right, gates.left) + arrow(gates.right, tag.left) + arrow(tag.right, gh.left);
  body += caption(330, 92, 'a failure here releases nothing', 'middle');

  const win = node(250, 165, 'Windows runner', ['NSIS + portable', 'asserts latest.yml']);
  const mac = node(560, 165, 'macOS runner', ['universal DMG + ZIP', 'unsigned, on purpose']);
  body += win.svg + mac.svg;
  body += arrow(gh.bottom, mac.top) + arrow({ x: gh.cx - 40, y: gh.bottom.y }, win.top);

  const rel = node(W / 2, 262, 'one GitHub Release', ['installer · portable · dmg · zip · latest.yml'], { tone: 'accent' });
  body += rel.svg;
  body += arrow(win.bottom, { x: rel.cx - 110, y: rel.cy - rel.h / 2 });
  body += arrow(mac.bottom, { x: rel.cx + 110, y: rel.cy - rel.h / 2 });

  const installed = node(200, 352, 'installed Windows app', ['sees it, one click, silent install']);
  const other = node(640, 352, 'macOS · portable', ['sees it, opens the download page']);
  body += installed.svg + other.svg;
  body += arrow({ x: rel.cx - 120, y: rel.bottom.y }, installed.top, { label: 'latest.yml', dy: -4 });
  body += arrow({ x: rel.cx + 120, y: rel.bottom.y }, other.top, { label: 'GitHub API', dy: -4 });

  return figure({
    id: 'map-release',
    title: 'From one word to an updated app',
    blurb: 'Releases are user-initiated and gated. The two paths out of a Release differ only because Apple will not let an unsigned app replace itself.',
    width: W, height: H, body,
  });
}

/* ----------------------------------------------------------- 6. data safety */

function safetyLadder() {
  const W = 900, H = 330;
  let body = '';

  const rungs = [
    ['Separate profiles', 'dev runs on .dev-profile', 'always'],
    ['Seed guard', 'an unreadable vault seeds nothing', 'always'],
    ['Pre-update snapshot', 'backups/pre-update-<version>', 'kept until you delete it'],
    ['Daily snapshot', 'backups/YYYY-MM-DD', 'newest 7'],
    ['The files themselves', 'plain JSON in your profile', 'forever'],
  ];

  const rowH = 54;
  rungs.forEach(([t, s, window], i) => {
    const y = 54 + i * rowH;
    const n = node(210, y, t, [s], { w: 330 });
    body += n.svg;
    body += `<text class="res" x="400" y="${y + 4}">${esc(window)}</text>`;
    if (i) body += tie({ x: 210, y: y - rowH + 20 }, { x: 210, y: y - 20 }, { dashed: true });
  });

  body += caption(18, 28, 'Five independent layers. Losing a note needs all five to fail at once.');
  body += caption(18, H - 14, 'An update replaces the application folder only; the profile is never touched, not even by uninstalling.');

  return figure({
    id: 'map-safety',
    title: 'What stands between you and a lost note',
    blurb: 'Each rung was added because the one above it can fail. The first two are code; the last three are copies.',
    width: W, height: H, body,
  });
}

export function buildDiagrams() {
  return [featureMap(), combinations(), processMap(), autosave(), releaseFlow(), safetyLadder()].join('\n');
}
