/**
 * build-site.js — the project's documentation as one HTML file.
 *
 *   npm run site   ->  site/index.html
 *
 * Everything is inlined at build time: no fetch, no CDN, no stylesheet beside
 * it. That is the requirement, not a preference — the page has to open by
 * double-clicking it from a USB drive with no network, and `fetch()` of a
 * sibling file is blocked under file://. The same file is what gets published
 * to the web mirror, so what you read locally is what everyone else reads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.js';
import { renderMarkdown } from './markdown.js';
import { buildDiagrams } from './diagrams.js';

const OUT_DIR = path.join(ROOT, 'site');
const OUT = path.join(OUT_DIR, 'index.html');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const memory = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'memory.json'), 'utf8')); } catch { return {}; }
})();

/** Tab order is reading order for someone who has never seen the project. */
const DOCS = [
  { id: 'readme', label: 'README', file: 'README.md' },
  { id: 'handover', label: 'Handover', file: 'HANDOVER.md' },
  { id: 'agents', label: 'Agent rules', file: 'AGENTS.md' },
  { id: 'prompt', label: 'Prompt', file: 'Prompt.md' },
  { id: 'tests', label: 'Tests', file: 'tests.md' },
  { id: 'updating', label: 'Updating', file: 'docs/UPDATING.md' },
  { id: 'release', label: 'Releasing', file: 'docs/RELEASE.md' },
  { id: 'log', label: 'Log', file: 'Log.md' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Which rows of memory.json's path table reach the published page.
 *
 * An allow-list, not a deny-list: this file becomes a public web page, and
 * `flashMirror` names a specific machine and a specific removable drive. That
 * belongs in the repository, where it is operationally useful, and not on the
 * internet. A new path added to memory.json stays private until it is named here.
 */
const PUBLISHED_PATHS = ['repo', 'installedApp', 'installedProfile', 'notes', 'backups', 'devProfile'];

const panels = [];
const tabs = [];

/* ------------------------------------------------------------- overview tab */

const overview = `
<div class="hero">
  <h1>Nebula <span class="ver">v${esc(pkg.version)}</span></h1>
  <p class="lede">${esc(pkg.description.replace(/^Nebula — /, ''))}</p>
  <p class="links">
    <a class="cta" href="https://github.com/hero-999-dev/nebula/releases/latest">Download</a>
    <a href="https://github.com/hero-999-dev/nebula">Source</a>
  </p>
</div>
<div class="cards">
  <div class="card"><h3>What it is</h3><p>An Electron note app for Windows and macOS. One window: a list of notes, a title, an editor. Everything else serves the editor.</p></div>
  <div class="card"><h3>Where your notes are</h3><p>One JSON file per note in your user profile, written atomically. Not beside the app — an update or an uninstall cannot touch them.</p></div>
  <div class="card"><h3>How it updates</h3><p>The installed Windows app sees a new release, downloads it when you press Update, and installs silently. macOS is unsigned, so it points you at the download instead.</p></div>
  <div class="card"><h3>Quality</h3><p>${esc(String(memory.quality?.unitTests ?? '—'))} unit tests and ${esc(String(memory.quality?.smokeChecks ?? '—'))} Electron checks that drive the real app on throwaway profiles.</p></div>
</div>
<h2 id="phase">Right now</h2>
<p>${esc(memory.currentPhase ?? '')}</p>
<p class="dim">Next: ${esc(memory.next ?? '')}</p>
<h2 id="invariants">Rules the code is held to</h2>
<ul>${(memory.invariants ?? []).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
<h2 id="where">Where everything lives</h2>
<div class="scroll"><table><thead><tr><th>What</th><th>Windows</th></tr></thead><tbody>
${Object.entries(memory.paths ?? {}).filter(([k]) => PUBLISHED_PATHS.includes(k))
  .map(([k, v]) => `<tr><td>${esc(k)}</td><td><code>${esc(v)}</code></td></tr>`).join('')}
</tbody></table></div>`;

tabs.push({ id: 'overview', label: 'Overview' });
panels.push({ id: 'overview', html: overview, outline: [
  { level: 2, text: 'Right now', id: 'phase' },
  { level: 2, text: 'Rules the code is held to', id: 'invariants' },
  { level: 2, text: 'Where everything lives', id: 'where' },
] });

/* --------------------------------------------------------------- doc tabs */

for (const doc of DOCS) {
  const full = path.join(ROOT, doc.file);
  if (!fs.existsSync(full)) {
    console.warn(`  skip ${doc.file} (not found)`);
    continue;
  }
  const { html, outline } = renderMarkdown(fs.readFileSync(full, 'utf8'));
  tabs.push({ id: doc.id, label: doc.label });
  panels.push({ id: doc.id, html, outline });
}

/* --------------------------------------------------------------- diagrams */

tabs.push({ id: 'maps', label: 'Mind maps' });
panels.push({
  id: 'maps',
  html: `<h1>Mind maps</h1><p class="lede">How the parts fit, what only works in pairs, and what happens between a keystroke and a file.</p>${buildDiagrams()}`,
  outline: [
    { level: 2, text: 'Every feature hangs off one store', id: 'map-features' },
    { level: 2, text: 'What only works in pairs', id: 'map-combinations' },
    { level: 2, text: 'Three processes, one door', id: 'map-process' },
    { level: 2, text: 'A keystroke on its way to disk', id: 'map-autosave' },
    { level: 2, text: 'From one word to an updated app', id: 'map-release' },
    { level: 2, text: 'What stands between you and a lost note', id: 'map-safety' },
  ],
});

/* ------------------------------------------------------------------ page */

const nav = tabs.map((t, i) =>
  `<button class="tab${i === 0 ? ' on' : ''}" data-tab="${t.id}" type="button">${esc(t.label)}</button>`).join('');

// Every panel ships its own outline, but only the open tab's is in the layout.
// Rendering them all visible turns the page into eight side-by-side columns.
const outlines = panels.map((p, i) => {
  const items = (p.outline ?? []).filter((h) => h.level === 2 || h.level === 3)
    .map((h) => `<a class="lv${h.level}" href="#${h.id}">${esc(h.text)}</a>`).join('');
  const visible = i === 0 && items;
  return `<nav class="outline" data-outline="${p.id}"${visible ? '' : ' hidden'}>${items}</nav>`;
}).join('');

const sections = panels.map((p, i) =>
  `<section class="panel" data-panel="${p.id}"${i === 0 ? '' : ' hidden'}>${p.html}</section>`).join('\n');

const page = `<!doctype html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nebula v${esc(pkg.version)} — documentation</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23a280e5' d='M15.82 4.4A9 9 0 1 0 15.82 19.6A7.6 7.6 0 0 1 15.82 4.4Z'/%3E%3Cpath fill='%23a280e5' d='M17.6 7.2l.85 1.55 1.55.85-1.55.85-.85 1.55-.85-1.55-1.55-.85 1.55-.85z'/%3E%3C/svg%3E">
<style>
:root{
  --bg:#f6f1e7; --panel:#fdfbf6; --sunken:#efe8d8; --ink:#201e1a; --soft:#55503f;
  --faint:#8a8371; --rule:#ddd3bf; --accent:#c15f3c; --accent-soft:#e8cdbd;
  --serif:"Charter","Iowan Old Style","Palatino Linotype",Georgia,serif;
  --sans:"Inter","Segoe UI",system-ui,sans-serif;
  --mono:"Cascadia Code",Consolas,ui-monospace,monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --bg:#17140f; --panel:#201c15; --sunken:#100e0a; --ink:#ede4d3; --soft:#b4a88e;
    --faint:#776f5c; --rule:#35301f; --accent:#e8a87c; --accent-soft:#4a3524;
    color-scheme: dark;
  }
}
:root[data-theme="dark"]{
  --bg:#17140f; --panel:#201c15; --sunken:#100e0a; --ink:#ede4d3; --soft:#b4a88e;
  --faint:#776f5c; --rule:#35301f; --accent:#e8a87c; --accent-soft:#4a3524;
  color-scheme: dark;
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--bg);color:var(--ink);font:15px/1.6 var(--sans)}
header{position:sticky;top:0;z-index:10;background:var(--panel);border-bottom:1px solid var(--rule)}
.bar{display:flex;align-items:center;gap:14px;padding:10px 20px;max-width:1180px;margin:0 auto}
.brand{display:flex;align-items:center;gap:8px;font-family:var(--serif);font-size:18px}
.brand svg{width:22px;height:22px;color:var(--accent)}
.tabs{display:flex;flex-wrap:wrap;gap:4px;margin-left:auto}
.tab{font:inherit;font-size:13px;padding:6px 11px;border:1px solid transparent;border-radius:8px;background:none;color:var(--soft);cursor:pointer}
.tab:hover{background:var(--sunken);color:var(--ink)}
.tab.on{background:var(--accent);border-color:var(--accent);color:var(--panel)}
#theme{font:inherit;font-size:13px;padding:6px 10px;border:1px solid var(--rule);border-radius:8px;background:var(--panel);color:var(--soft);cursor:pointer}
main{display:flex;gap:34px;max-width:1180px;margin:0 auto;padding:26px 20px 80px}
.panel{flex:1;min-width:0}
.outline{position:sticky;top:70px;align-self:flex-start;width:210px;flex:none;display:flex;flex-direction:column;gap:2px;font-size:12.5px;border-left:1px solid var(--rule);padding-left:14px}
.outline a{color:var(--faint);text-decoration:none;padding:2px 0}
.outline a:hover{color:var(--accent)}
.outline a.lv3{padding-left:12px;font-size:12px}
.outline[hidden]{display:none}
h1{font-family:var(--serif);font-size:31px;margin:0 0 10px;letter-spacing:-.01em}
h2{font-family:var(--serif);font-size:22px;margin:34px 0 10px;padding-top:8px;border-top:1px solid var(--rule)}
h3{font-size:15.5px;margin:22px 0 6px}
h4{font-size:14px;margin:18px 0 4px;color:var(--soft)}
p{margin:0 0 12px}
a{color:var(--accent)}
ul,ol{margin:0 0 12px;padding-left:22px}
li{margin:3px 0}
li.task{list-style:none;margin-left:-18px}
li.task .box{display:inline-block;width:14px;height:14px;line-height:13px;text-align:center;border:1px solid var(--rule);border-radius:4px;margin-right:7px;font-size:11px;color:var(--accent);vertical-align:-2px}
code{font-family:var(--mono);font-size:.88em;background:var(--sunken);padding:1px 5px;border-radius:5px}
pre.code{background:var(--sunken);border:1px solid var(--rule);border-radius:9px;padding:12px 14px;overflow:auto;margin:0 0 14px}
pre.code code{background:none;padding:0;font-size:12.5px;line-height:1.55}
blockquote{margin:0 0 14px;padding:2px 0 2px 14px;border-left:3px solid var(--accent-soft);color:var(--soft)}
hr{border:0;border-top:1px solid var(--rule);margin:24px 0}
table{border-collapse:collapse;width:100%;font-size:13.5px;margin:0 0 14px}
th,td{text-align:left;vertical-align:top;padding:7px 12px 7px 0;border-bottom:1px solid var(--rule)}
th{color:var(--faint);font-weight:600;white-space:nowrap}
.scroll{overflow-x:auto;max-width:100%}
.dim{color:var(--faint)}
.hero{padding:8px 0 4px}
.ver{font-family:var(--mono);font-size:16px;color:var(--faint);vertical-align:6px}
.lede{font-size:17px;color:var(--soft);max-width:66ch}
.links{display:flex;gap:12px;align-items:center;margin-top:16px}
.cta{background:var(--accent);color:var(--panel);text-decoration:none;padding:8px 16px;border-radius:9px;font-size:14px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:12px;margin:26px 0 8px}
.card{background:var(--panel);border:1px solid var(--rule);border-radius:11px;padding:14px 16px}
.card h3{margin:0 0 6px;font-size:13.5px;color:var(--accent)}
.card p{margin:0;font-size:13.5px;color:var(--soft)}
/* diagrams */
.dia{margin:0 0 34px;padding:0}
.dia figcaption h3{margin:0 0 2px;font-size:16px;font-family:var(--serif)}
.dia figcaption p{color:var(--soft);font-size:13.5px;max-width:74ch;margin:0 0 12px}
.dia svg{max-width:100%;height:auto;background:var(--panel);border:1px solid var(--rule);border-radius:12px}
.dia .n rect{fill:var(--panel);stroke:var(--rule);stroke-width:1.2}
.dia .n--accent rect{fill:var(--accent-soft);stroke:var(--accent)}
.dia .n--muted rect{fill:var(--sunken)}
.dia .n .t{fill:var(--ink);font:600 12.5px var(--sans)}
.dia .n .s{fill:var(--faint);font:11.5px var(--sans)}
.dia .band{fill:var(--sunken);stroke:var(--rule);stroke-dasharray:4 4}
.dia .e{stroke:var(--faint);stroke-width:1.3;fill:none}
.dia .e--dashed{stroke-dasharray:5 4}
.dia .e--muted{stroke:var(--rule)}
.dia .e--tie{stroke:var(--rule);stroke-width:1.4}
.dia .head{fill:var(--faint)}
.dia .l{fill:var(--faint);font:11px var(--sans)}
.dia .cap{fill:var(--faint);font:11.5px var(--sans)}
.dia .plus{fill:var(--accent);font:600 15px var(--sans)}
.dia .res{fill:var(--soft);font:12.5px var(--sans)}
@media (max-width:900px){ .outline{display:none} main{padding-top:18px} }
</style>
</head>
<body>
<header>
  <div class="bar">
    <span class="brand">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M15.82 4.4A9 9 0 1 0 15.82 19.6A7.6 7.6 0 0 1 15.82 4.4Z"/>
        <path d="M17.6 7.2l.85 1.55 1.55.85-1.55.85-.85 1.55-.85-1.55-1.55-.85 1.55-.85z"/>
      </svg>
      <span>Nebula</span>
    </span>
    <nav class="tabs">${nav}</nav>
    <button id="theme" type="button" title="Light / dark">Theme</button>
  </div>
</header>
<main>
${sections}
${outlines}
</main>
<script>
(function(){
  var tabs = document.querySelectorAll('.tab');
  function show(id){
    document.querySelectorAll('.panel').forEach(function(p){ p.hidden = p.dataset.panel !== id; });
    document.querySelectorAll('.outline').forEach(function(o){
      o.hidden = o.dataset.outline !== id || !o.children.length;
    });
    tabs.forEach(function(t){ t.classList.toggle('on', t.dataset.tab === id); });
    try { location.hash = id; } catch (e) {}
    window.scrollTo(0, 0);
  }
  tabs.forEach(function(t){ t.addEventListener('click', function(){ show(t.dataset.tab); }); });

  var start = (location.hash || '').replace('#','');
  if (!start || !document.querySelector('[data-panel="' + start + '"]')) start = tabs[0].dataset.tab;
  show(start);

  var root = document.documentElement;
  var KEY = 'nebula-docs-theme';
  try { if (localStorage.getItem(KEY)) root.dataset.theme = localStorage.getItem(KEY); } catch (e) {}
  document.getElementById('theme').addEventListener('click', function(){
    var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch (e) {}
  });
})();
</script>
</body>
</html>`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, page, 'utf8');

const kb = (page.length / 1024).toFixed(0);
console.log(`site/index.html  ${kb} KB  ${tabs.length} tabs  6 diagrams`);
