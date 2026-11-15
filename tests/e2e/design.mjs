/**
 * 1.0.4 — the designs (the owner: "theme organizer üstünde design
 * olsun": Nebula's own, Medieval, Pixel, Neon; the whole interface follows,
 * and the worlds of the Universe are disks, cubes, or glow), then five more —
 * Blueprint, Ink, Art Deco, Clockwork (Steampunk is part of it now) — and what the owner asked
 * for with them: the foot in one row, the Universe folded away, No style, a
 * table picked by its corner. The real app on a throwaway profile.
 *
 *   node tests/e2e/design.mjs          (after npm run build)
 *
 * NEBULA_SHOTS=<an empty folder> also keeps a picture of each design there —
 * for looking at, not for the checks.
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** What each design brings: its faces, and what it is called in the picker. */
const FACES = {
  // One face each, for the words and the heads alike (the owner's picks, 1.0.4); the code stays Cascadia.
  medieval: { text: 'Fondamento', head: 'Fondamento', mono: null },
  pixel: { text: 'VT323', head: 'VT323', mono: null },
  neon: { text: 'Oxanium', head: 'Oxanium', mono: null },
  blueprint: { text: 'Patrick Hand', head: 'Patrick Hand', mono: null },
  ink: { text: 'Courgette', head: 'Courgette', mono: null },
  deco: { text: 'Marcellus', head: 'Marcellus', mono: null },
  clockwork: { text: 'Bodoni Moda', head: 'Bodoni Moda', mono: null },
};
const DESIGNS = Object.keys(FACES);

export async function runDesignChecks(check) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-design-'));
  const storage = path.join(profile, 'storage');
  const notes = path.join(storage, 'notes');
  fs.mkdirSync(notes, { recursive: true });
  fs.writeFileSync(path.join(storage, 'projects.json'), JSON.stringify({ projects: [{ id: 'j-thesis', name: 'Thesis', createdAt: 1 }] }));
  fs.writeFileSync(path.join(storage, 'folders.json'), JSON.stringify({ folders: [
    { id: 'f-work', name: 'Work', createdAt: 1 },
    { id: 'f-home', name: 'Home', createdAt: 2 },
    { id: 'f-read', name: 'Reading', createdAt: 3, project: 'j-thesis' },
    { id: 'f-draft', name: 'Drafts', createdAt: 4, project: 'j-thesis' },
  ] }));
  const write = (id, extra = {}) => fs.writeFileSync(path.join(notes, `${id}.json`), JSON.stringify({
    id, title: id, createdAt: 1, updatedAt: 1,
    content: `<h1>${id}</h1><p>The words of ${id}, with <strong>weight</strong>, <em>slope</em> and <code>code</code>.</p><h2>A smaller head</h2><ul><li>one</li><li>two</li></ul><blockquote><p>said once</p></blockquote>`,
    ...extra,
  }));
  write('alpha', { folder: 'f-work', labels: ['idea'], updatedAt: 9 });
  write('beta', { folder: 'f-work', updatedAt: 8 });
  write('gamma', { folder: 'f-home', labels: ['idea', 'later'], updatedAt: 7 });
  write('delta', { folder: 'f-read', updatedAt: 6 });
  write('epsilon', { folder: 'f-read', updatedAt: 5 });
  write('zeta', { folder: 'f-draft', updatedAt: 4 });
  write('eta', { updatedAt: 3 });
  write('theta', { updatedAt: 2 });
  write('iota', { updatedAt: 1, content: '<p>above</p><div class="blk-table"><table><tbody><tr><td>a1</td><td>b1</td></tr><tr><td>a2</td><td>b2</td></tr></tbody></table></div><p>below</p>' });

  const shots = process.env.NEBULA_SHOTS || '';
  let app;
  const errors = [];
  try {
    app = await electron.launch({ args: [path.join(root, 'dist-electron/main.js')], env: { ...process.env, NEBULA_USER_DATA: profile } });
    let win = await app.firstWindow();
    const listen = (w) => {
      w.on('pageerror', (e) => errors.push(String(e)));
      w.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    };
    listen(win);
    win.setDefaultTimeout(10_000);
    await win.setViewportSize?.({ width: 1500, height: 900 }).catch(() => {});
    const ready = async () => {
      await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50, timeout: 20_000 });
      await win.waitForTimeout(600);
      await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    };
    await ready();
    const shot = async (name) => { if (shots) await win.screenshot({ path: path.join(shots, `${name}.png`) }); };

    const openSettings = async () => {
      await win.evaluate(() => document.querySelector('#app-menu [data-cmd="settings.open"]')?.click());
      await win.waitForFunction(() => !document.getElementById('ov-settings').hidden, null, { timeout: 5000 });
      await win.evaluate(() => document.getElementById('set-tab-look').click());
      await win.waitForTimeout(150);
    };
    const closeSettings = async () => {
      await win.evaluate(() => document.getElementById('settings-close')?.click());
      await win.waitForTimeout(150);
    };
    const pick = async (design) => {
      await win.evaluate((d) => document.querySelector(`#design-pick [data-design="${d}"]`).click(), design);
      await win.evaluate(() => document.fonts.ready.then(() => true));
      await win.waitForTimeout(350);
    };
    /** What the page wears now. */
    const worn = () => win.evaluate(() => {
      const rootEl = document.documentElement;
      const cs = getComputedStyle(rootEl);
      // The first face named, past "Nebula Signs": that one holds three signs only (+ − ×), for Clockwork.
      const first = (el, prop = 'fontFamily') => (el ? getComputedStyle(el)[prop].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).find((s) => s !== 'Nebula Signs') ?? '' : '');
      return {
        design: rootEl.dataset.design ?? null,
        stored: localStorage.getItem('nebula:design'),
        on: [...document.querySelectorAll('#design-pick [data-design]')].filter((b) => b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.design),
        paper: cs.getPropertyValue('--paper').trim(),
        clay: cs.getPropertyValue('--clay').trim(),
        mono: cs.getPropertyValue('--mono').split(',')[0].trim().replace(/^["']|["']$/g, ''),
        body: first(document.body),
        title: first(document.querySelector('.title-input')),
        row: first(document.querySelector('.note-row')),
        radius: parseFloat(getComputedStyle(document.querySelector('.note-row')).borderTopLeftRadius) || 0,
      };
    });

    /**
     * How much room everything takes (the owner: "hiçbir temada bölümlerin yükseklikleri ve genişlikleri
     * değişmesin"): the height of every part that can be seen — the window and Settings over it — by a
     * path that is the same under every design, and the width of the sections. The laid-out box, not the
     * drawn one: a thing nudged with a transform takes no more room.
     */
    const SECTIONS = ['#titlebar', '#side', 'main.main', '#editor', '#ov-settings .modal', '#design-pick', '#theme-row', '#theme-editor', '#set-mix-styles',
      '#design-pick [data-design]', '.note-row', '.set-panel:not([hidden])'];
    const room = async () => {
      await win.evaluate(() => document.fonts.ready.then(() => true));
      await win.waitForTimeout(200);
      return win.evaluate((sections) => {
        const heights = {};
        const name = (el) => {
          let s = el.tagName.toLowerCase();
          if (el.id) return s + '#' + el.id;
          const cls = [...el.classList].filter((c) => !/^(on|active|open|hover|is-|picked|sel)/.test(c)).slice(0, 3).join('.');
          if (cls) s += '.' + cls;
          const sibs = el.parentElement ? [...el.parentElement.children].filter((k) => k.tagName === el.tagName) : [];
          if (sibs.length > 1) s += ':' + (sibs.indexOf(el) + 1);
          return s;
        };
        const box = (el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          const w = parseFloat(cs.width), h = parseFloat(cs.height);
          const laid = cs.display !== 'inline' && Number.isFinite(w) && Number.isFinite(h) && !(el instanceof SVGElement);
          return { cs, seen: (r.width > 0 || r.height > 0) && cs.display !== 'none' && cs.visibility !== 'hidden', w: laid ? w : r.width, h: laid ? h : r.height };
        };
        const walk = (el, at) => {
          if (el.matches('#editor *, canvas, svg *')) return;
          const b = box(el);
          if (!b.seen) return;
          const key = at ? at + ' > ' + name(el) : name(el);
          heights[key] = Math.round(b.h * 10) / 10;
          for (const k of el.children) walk(k, key);
        };
        for (const el of document.querySelectorAll('#titlebar, #side, main.main, #ov-settings .modal')) walk(el, '');
        const widths = {};
        for (const sel of sections) [...document.querySelectorAll(sel)].forEach((el, i) => { const b = box(el); if (b.seen) widths[`${sel}:${i}`] = Math.round(b.w * 10) / 10; });
        return { heights, widths };
      }, SECTIONS);
    };
    const unlike = (a, b) => Object.keys({ ...a, ...b }).filter((k) => !(Math.abs((a[k] ?? -1) - (b[k] ?? -1)) <= 0.5));

    // ── The picker: over the Theme organizer, eight designs, Nebula's own worn. ──
    await openSettings();
    const picker = await win.evaluate(() => {
      const heads = [...document.querySelectorAll('.set-panel:not([hidden]) .set-head, #ov-settings .set-head')].filter((h) => h.offsetParent);
      const names = heads.map((h) => h.textContent.trim());
      const buttons = [...document.querySelectorAll('#design-pick [data-design]')];
      return {
        names,
        designs: buttons.map((b) => b.dataset.design),
        seen: buttons.every((b) => b.offsetWidth > 40 && b.offsetHeight > 40),
        // The owner: "logoları silelim design'dan" — a tile is its name and nothing drawn.
        named: buttons.every((b) => !b.querySelector('.dp-world, svg, canvas, img') && b.children.length === 1 && b.querySelector('.dp-name')?.textContent.trim().length > 2),
      };
    });
    check('Settings → Appearance has Design, over the Theme organizer', picker.names.indexOf('Design') >= 0 && picker.names.indexOf('Design') < picker.names.indexOf('Theme organizer'), JSON.stringify(picker.names));
    check('with eight designs, each a button with its name and no drawing', picker.designs.join() === ['nebula', ...DESIGNS].join() && picker.seen && picker.named, JSON.stringify(picker));
    // The owner: "design soldan sağa tek satır olsun" — one row of eight, left to right, each name inside its button.
    const grid = await win.evaluate(() => {
      const buttons = [...document.querySelectorAll('#design-pick [data-design]')];
      const r = buttons.map((b) => b.getBoundingClientRect());
      const spill = buttons.filter((b) => b.querySelector('.dp-name').getBoundingClientRect().width > b.clientWidth - 6).map((b) => b.dataset.design);
      return {
        tops: [...new Set(r.map((b) => Math.round(b.top)))].length, lefts: [...new Set(r.map((b) => Math.round(b.left)))].length,
        widths: [...new Set(r.map((b) => Math.round(b.width)))].length, inOrder: r.every((b, i) => i === 0 || b.left > r[i - 1].right), spill,
        within: r.at(-1).right <= document.querySelector('.set-panel:not([hidden])').getBoundingClientRect().right + 0.5,
      };
    });
    check('the eight stand in one row, left to right, all one width, each name inside its button', grid.tops === 1 && grid.lefts === 8 && grid.widths === 1 && grid.inOrder && grid.within && grid.spill.length === 0, JSON.stringify(grid));
    const own = await worn();
    check('Nebula’s own is worn at first: no attribute, its button on', own.design === null && own.on.join() === 'nebula', JSON.stringify(own));
    await shot('0-nebula-settings');
    const ownRoom = await room();
    check('there is room to measure: the window, Settings and the sections', Object.keys(ownRoom.heights).length > 300 && Object.keys(ownRoom.widths).length >= SECTIONS.length, JSON.stringify({ heights: Object.keys(ownRoom.heights).length, widths: Object.keys(ownRoom.widths).length }));

    // ── Each design: worn, kept, its faces loaded, its own colours under Main, and no room taken or given. ──
    const seen = { nebula: own };
    for (const design of DESIGNS) {
      await pick(design);
      const w = await worn();
      const got = await room();
      const high = unlike(ownRoom.heights, got.heights);
      const wide = unlike(ownRoom.widths, got.widths);
      check(`${design}: every part is as high as under Nebula’s own (${Object.keys(ownRoom.heights).length} of them)`, high.length === 0, JSON.stringify(high.slice(0, 4).map((k) => [k.split(' > ').slice(-2).join(' > '), ownRoom.heights[k], got.heights[k]])));
      check(`${design}: every section is as wide as under Nebula’s own`, wide.length === 0, JSON.stringify(wide.map((k) => [k, ownRoom.widths[k], got.widths[k]])));
      seen[design] = w;
      const f = FACES[design];
      check(`${design}: worn on the page, kept, and its button alone is on`, w.design === design && w.stored === design && w.on.join() === design, JSON.stringify(w));
      check(`${design}: the interface is in its face (${f.text})`, w.body === f.text && w.row === f.text, JSON.stringify({ body: w.body, row: w.row }));
      check(`${design}: the note’s title is in ${f.head}`, w.title === f.head, w.title);
      if (f.mono) check(`${design}: code and the Universe are in ${f.mono}`, w.mono === f.mono, w.mono);
      // A face is loaded for the letters the page has asked of it, so it is asked about those.
      const loaded = await win.evaluate((faces) => faces.map((n) => [n, document.fonts.check(`16px "${n}"`, 'Nebula')]), [...new Set([f.text, f.head, f.mono].filter(Boolean))]);
      check(`${design}: its faces are there, from the app itself`, loaded.every(([, ok]) => ok), JSON.stringify(loaded));
      check(`${design}: Main is the design’s own colours`, w.paper !== own.paper && w.clay !== own.clay, JSON.stringify({ paper: w.paper, clay: w.clay, own: own.paper }));
      await shot(`1-${design}-settings`);
    }
    check('Pixel has square corners, Nebula’s own does not', seen.pixel.radius === 0 && seen.nebula.radius > 0, JSON.stringify({ pixel: seen.pixel.radius, nebula: seen.nebula.radius }));
    check('no two designs share a paper', new Set(DESIGNS.map((d) => seen[d].paper)).size === DESIGNS.length, JSON.stringify(DESIGNS.map((d) => seen[d].paper)));

    // Every face is a file of the app: each one a design writes in has loaded, none
    // failed, and no style sheet of the page names a font on the net.
    const faces = await win.evaluate(() => {
      const all = [...document.fonts];
      const urls = [];
      for (const sheet of document.styleSheets) {
        let rules = [];
        try { rules = [...sheet.cssRules]; } catch { /* not ours to read */ }
        for (const r of rules) if (r.constructor.name === 'CSSFontFaceRule') urls.push(r.style.getPropertyValue('src'));
      }
      return {
        loaded: [...new Set(all.filter((f) => f.status === 'loaded').map((f) => f.family.replace(/^["']|["']$/g, '')))],
        failed: all.filter((f) => f.status === 'error').map((f) => f.family),
        remote: urls.filter((u) => /url\(\s*["']?(https?:)?\/\//i.test(u)).length,
        count: urls.length,
      };
    });
    const asked = [...new Set(DESIGNS.flatMap((d) => [FACES[d].text, FACES[d].head, FACES[d].mono]).filter(Boolean))];
    check(`the ${asked.length} faces the designs write in have loaded and none failed`, asked.length === 7 && asked.every((n) => faces.loaded.includes(n)) && faces.failed.length === 0, JSON.stringify(faces));
    check('the faces are files of the app, never fetched from the net', faces.count >= 44 && faces.remote === 0, JSON.stringify({ count: faces.count, remote: faces.remote }));

    // ── A theme goes on working under a design; Medieval’s Light is its parchment. ──
    const themed = await win.evaluate((designs) => {
      const rootEl = document.documentElement;
      const paper = () => getComputedStyle(rootEl).getPropertyValue('--paper').trim();
      const was = { theme: rootEl.dataset.theme, design: rootEl.dataset.design };
      const out = {};
      for (const theme of ['dark', 'light']) {
        rootEl.dataset.theme = theme;
        delete rootEl.dataset.design;
        out[theme] = { nebula: paper() };
        for (const d of designs) { rootEl.dataset.design = d; out[theme][d] = paper(); }
      }
      if (was.theme === undefined) delete rootEl.dataset.theme; else rootEl.dataset.theme = was.theme;
      rootEl.dataset.design = was.design;
      return out;
    }, DESIGNS);
    check('Dark keeps its own colours under every design', DESIGNS.every((d) => themed.dark[d] === themed.dark.nebula), JSON.stringify(themed.dark));
    const lightOwn = DESIGNS.filter((d) => themed.light[d] !== themed.light.nebula);
    check('Light is the design’s own in Medieval (parchment) and Ink (paper), and Light’s own in the rest', lightOwn.join() === 'medieval,ink' && themed.light.medieval !== themed.light.ink, JSON.stringify(themed.light));

    // ── A design chosen is seen in its own colours (the owner: "her design'ın main'i olsun, şu an
    // göremiyorum"): whatever theme was worn, choosing a design puts Main on; the themes are a press away. ──
    const press = async (theme) => {
      await win.evaluate((name) => document.querySelector(`#theme-pick [data-theme="${name}"]`).click(), theme);
      await win.waitForTimeout(150);
    };
    const wearing = () => win.evaluate(() => {
      const rootEl = document.documentElement;
      return {
        design: rootEl.dataset.design ?? null, theme: rootEl.dataset.theme, profile: rootEl.dataset.profile ?? null, stored: localStorage.getItem('nebula:theme'),
        on: [...document.querySelectorAll('#theme-pick .on')].map((b) => b.dataset.theme).join(), paper: getComputedStyle(rootEl).getPropertyValue('--paper').trim(),
      };
    });
    const isMain = (w, design) => w.design === design && w.theme === 'main' && w.profile === null && w.stored === 'main' && w.on === 'main' && w.paper === seen[design].paper;
    await press('dark');
    const dark = await wearing();
    check('Dark is worn under Clockwork, in Dark’s colours', dark.design === 'clockwork' && dark.theme === 'dark' && dark.paper === themed.dark.nebula, JSON.stringify(dark));
    await pick('medieval');
    const fromDark = await wearing();
    check('Dark worn and Medieval chosen: Main is put on and kept, in Medieval’s own colours', isMain(fromDark, 'medieval'), JSON.stringify(fromDark));
    await press('matcha');
    const matcha = await wearing();
    await pick('pixel');
    const fromMatcha = await wearing();
    check('Matcha worn and Pixel chosen: its colours are taken off, Pixel’s own are seen', matcha.profile !== null && matcha.paper !== fromMatcha.paper && isMain(fromMatcha, 'pixel'), JSON.stringify({ matcha, fromMatcha }));
    await press('dark');
    const under = await wearing();
    check('a theme pressed after it is worn under the design', under.design === 'pixel' && under.theme === 'dark' && under.stored === 'dark' && under.paper === dark.paper, JSON.stringify(under));
    await pick('nebula');
    const home = await wearing();
    check('Nebula’s own chosen: its Main, the violet', home.design === null && home.theme === 'main' && home.stored === 'main' && home.paper === own.paper, JSON.stringify(home));
    await pick(DESIGNS.at(-1));

    // ── The Universe under each design. ──
    await closeSettings();
    await win.click('.galaxy-mini .galaxy-full');
    await win.waitForTimeout(900);
    const listed = await win.evaluate(() => [...document.querySelectorAll('.split-map .galaxy-list button')].map((b) => b.textContent));
    check('the map holds a project, its folders and the notes', ['Thesis (project)', 'Work (folder)', 'Reading (folder)', 'alpha (note)'].every((x) => listed.includes(x)), JSON.stringify(listed));
    /** What the big map has drawn: how many colours, and how its ink is spread. */
    const mapInk = () => win.evaluate(() => {
      const c = document.querySelector('.split-map canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const colours = new Set();
      const bg = `${d[0]},${d[1]},${d[2]}`;
      let ink = 0;
      for (let i = 0; i < d.length; i += 4) {
        const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
        if (k !== bg) ink++;
        if (i % 64 === 0) colours.add(k);
      }
      return { colours: colours.size, ink: ink / (d.length / 4), w: c.width, h: c.height };
    });
    const setDesign = async (design) => {
      await openSettings();
      await pick(design);
      await closeSettings();
      await win.waitForTimeout(900);
    };
    /** How many frames the page gets through in a second and a half, the map turning. */
    const frames = () => win.evaluate(() => new Promise((done) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(tick); else done(Math.round(n / 1.5)); };
      requestAnimationFrame(tick);
    }));
    const inks = {};
    const pace = {};
    // The last one worn in the settings is the first here; Nebula's own is the last.
    for (const design of [...DESIGNS].reverse().concat('nebula')) {
      if (design !== DESIGNS.at(-1)) await setDesign(design);
      inks[design] = await mapInk();
      pace[design] = await frames();
      check(`${design}: the Universe draws its worlds`, inks[design].colours > 6 && inks[design].ink > 0.004, JSON.stringify(inks[design]));
      await shot(`2-${design}-universe`);
    }
    // A glow spreads the ink: under Neon more of the sky is lit than under Nebula's own.
    check('Neon lights more of the sky than Nebula’s own', inks.neon.ink > inks.nebula.ink * 1.15, JSON.stringify({ neon: inks.neon.ink, nebula: inks.nebula.ink }));
    // The glow is the dearest thing a design draws: the page still turns over under it.
    check('no design holds the page up: twenty frames a second at the least, the map open', Object.values(pace).every((f) => f >= 20), JSON.stringify(pace));
    console.log(`  frames a second, the big map open: ${JSON.stringify(pace)}`);

    // ── Follow on the big map, as the Universe widget has it (the owner: "universe takip modu, widget'taki olduğu gibi"). ──
    const following = () => win.evaluate(() => {
      const b = document.querySelector('.split-map .galaxy-follow');
      return b ? { on: b.classList.contains('on'), pressed: b.getAttribute('aria-pressed'), title: b.title, next: b.nextElementSibling?.className ?? '' } : null;
    });
    const idle = await following();
    check('the big map has Follow before Fit, and it is off', !!idle && !idle.on && idle.pressed === 'false' && /galaxy-whole/.test(idle.next), JSON.stringify(idle));
    // A body is picked from the map's own list, as the keyboard picks it.
    await win.evaluate(() => [...document.querySelectorAll('.split-map .galaxy-list button')].find((b) => b.textContent === 'Work (folder)').focus());
    await win.waitForTimeout(1100);
    await win.click('.split-map .galaxy-follow');
    await win.waitForTimeout(1200);
    const riding = await following();
    check('a body picked and Follow pressed: the map follows it', !!riding && riding.on && riding.pressed === 'true' && riding.title === 'Stop following', JSON.stringify(riding));
    await shot('3-follow');
    await win.click('.split-map .galaxy-whole');
    await win.waitForTimeout(300);
    const loose = await following();
    check('Fit lets go of it, and the button says so', !!loose && !loose.on && loose.pressed === 'false' && loose.title === 'Follow the body picked', JSON.stringify(loose));
    const back = await worn();
    check('back to Nebula’s own: the attribute is gone, the choice is kept', back.design === null && back.stored === 'nebula' && back.paper === own.paper && back.body === own.body, JSON.stringify(back));

    // ── A note's page under each design (the map away), and the frames keep still. ──
    await win.evaluate(() => document.querySelector('.split-map .split-close')?.click());
    await win.waitForTimeout(400);
    await win.evaluate(() => document.querySelector('.note-row')?.click());
    await win.waitForTimeout(500);
    check('the map is put away and a note is on the page', await win.evaluate(() => !document.body.classList.contains('map-full') && !!document.querySelector('.editor')?.offsetParent));
    await shot('3-nebula-note');
    if (shots) {
      // Medieval's parchment (its Light), for looking at.
      await openSettings();
      await pick('medieval');
      await win.evaluate(() => [...document.querySelectorAll('#ov-settings button')].find((b) => b.textContent.trim() === 'Light')?.click());
      await win.waitForTimeout(400);
      await shot('4-medieval-light-settings');
      await closeSettings();
      await shot('4-medieval-light-note');
      await openSettings();
      await win.evaluate(() => [...document.querySelectorAll('#ov-settings button')].find((b) => b.textContent.trim() === 'Main')?.click());
      await pick('nebula');
      await closeSettings();
    }
    // Neon the last: it is the one kept across the reload below.
    for (const design of [...DESIGNS.filter((d) => d !== 'neon'), 'neon']) {
      await setDesign(design);
      await shot(`3-${design}-note`);
      // The owner: "her designde ortalanması lazım her şeyin" — New note and its three small buttons in one row.
      const foot = await win.evaluate(() => {
        const kids = [...document.querySelectorAll('.new-row > *')].filter((k) => k.offsetParent).map((k) => k.getBoundingClientRect());
        const row = document.querySelector('.new-row').getBoundingClientRect();
        return { n: kids.length, drop: Math.round(Math.max(...kids.map((k) => k.top)) - Math.min(...kids.map((k) => k.top))), left: Math.round(kids[0].left - row.left), right: Math.round(row.right - kids.at(-1).right) };
      });
      check(`${design}: the foot’s buttons stand in one row, end to end`, foot.n >= 2 && foot.drop < 6 && foot.left <= 1 && foot.right <= 1, JSON.stringify(foot));
      const fit = await win.evaluate(() => {
        const over = (sel) => [...document.querySelectorAll(sel)].some((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible');
        const side = document.querySelector('.side')?.getBoundingClientRect();
        const bar = document.querySelector('.titlebar')?.getBoundingClientRect();
        return { sideIn: !!side && side.right <= innerWidth && side.width > 120, barIn: !!bar && bar.height > 20 && bar.height < 80, spill: over('.note-row, .btn, .set-head'), page: document.documentElement.scrollWidth <= innerWidth + 1 };
      });
      check(`${design}: the window still fits — the sidebar, the title bar, no spill`, fit.sideIn && fit.barIn && !fit.spill && fit.page, JSON.stringify(fit));
    }

    // ── A table picked by its corner, and Delete (the owner: "noktaya tıklayınca tüm table seçilmiyor"). ──
    await win.evaluate(() => [...document.querySelectorAll('.note-row')].find((r) => r.title === 'iota')?.click());
    await win.waitForFunction(() => document.querySelector('#editor .blk-table .tbl-corner'), null, { polling: 50 });
    await win.waitForTimeout(300);
    await win.click('#editor .tbl-corner');
    await win.waitForTimeout(150);
    const tablePicked = await win.evaluate(() => ({ picked: !!document.querySelector('#editor .tbl-corner.picked'), cells: document.querySelectorAll('#editor td.sel, #editor td.selected').length }));
    check('a click on a table’s corner picks the table, and no cell', tablePicked.picked && tablePicked.cells === 0, JSON.stringify(tablePicked));
    await win.keyboard.press('Escape');
    await win.waitForTimeout(100);
    await win.keyboard.press('Delete');
    await win.waitForTimeout(150);
    check('let go with Escape, Delete leaves the table alone', await win.evaluate(() => !document.querySelector('#editor .tbl-corner.picked') && !!document.querySelector('#editor .blk-table')));
    await win.click('#editor .tbl-corner');
    await win.waitForTimeout(150);
    await win.keyboard.press('Delete');
    await win.waitForTimeout(250);
    const tableGone = await win.evaluate(() => ({ table: !!document.querySelector('#editor .blk-table'), words: document.querySelector('#editor').textContent.replace(/\s+/g, ' ').trim() }));
    // (The Delete after Escape was the note's own key: it took the letter after the caret, the first of "above".)
    check('picked, Delete takes the whole table away and leaves the lines round it', !tableGone.table && tableGone.words.includes('bove') && tableGone.words.includes('below') && !tableGone.words.includes('a1'), JSON.stringify(tableGone));

    // ── The Universe under the list folds away, and stays so (the owner: "universe’e daraltma eklensin"). ──
    const mini = () => win.evaluate(() => {
      const m = document.querySelector('.galaxy-mini');
      const c = m.querySelector('canvas');
      const b = m.querySelector('.galaxy-fold');
      return { folded: m.classList.contains('folded'), canvas: !!c && c.offsetHeight > 0, h: Math.round(m.getBoundingClientRect().height), title: b.title, open: b.getAttribute('aria-expanded') };
    });
    const open = await mini();
    await win.click('.galaxy-mini .galaxy-fold');
    await win.waitForTimeout(300);
    const shut = await mini();
    check('the Universe under the list is open at first, its button says Hide', !open.folded && open.canvas && open.title === 'Hide the Universe' && open.open === 'true', JSON.stringify(open));
    check('a press folds it to its head: no map, less room, the button says Show', shut.folded && !shut.canvas && shut.h < open.h / 2 && shut.title === 'Show the Universe' && shut.open === 'false', JSON.stringify(shut));
    await shot('5-neon-folded');

    // ── The design, and the fold, are there after a restart of the page, before anything paints. ──
    await win.reload();
    await ready();
    const after = await worn();
    check('the design is kept across a reload', after.design === 'neon' && after.stored === 'neon' && after.body === 'Oxanium', JSON.stringify(after));
    const still = await mini();
    check('and so is the fold', still.folded && !still.canvas, JSON.stringify(still));
    await win.click('.galaxy-mini .galaxy-fold');
    await win.waitForTimeout(500);
    const again = await mini();
    check('pressed again, the Universe is back with its map', !again.folded && again.canvas && again.h === open.h, JSON.stringify(again));
    await openSettings();
    const afterOn = await worn();
    check('and the picker shows it', afterOn.on.join() === 'neon', JSON.stringify(afterOn.on));

    // ── No style: the way back from a style (the owner: "remove style yok, seçtikten sonra değiştiremiyorsun"). ──
    const tiles = () => win.evaluate(() => {
      const all = [...document.querySelectorAll('#set-mix-styles .set-mix-style')];
      return { n: all.length, horizon: all.some((b) => b.dataset.mixStyle === 'horizon'), first: all[0]?.dataset.mixStyle, name: all[0]?.textContent.trim(), on: all.filter((b) => b.classList.contains('on')).map((b) => b.dataset.mixStyle) };
    });
    const bare = await tiles();
    check('the styles begin with No style, and it is the one worn while none is', bare.first === 'none' && bare.name === 'No style' && bare.on.join() === 'none' && bare.n === 15 && !bare.horizon, JSON.stringify(bare));
    await win.evaluate(() => document.querySelectorAll('#set-mix-styles .set-mix-style')[3].click());
    await win.waitForTimeout(900);
    const styled = await tiles();
    check('a style pressed is worn, and No style is not', styled.on.length === 1 && styled.on[0] !== 'none', JSON.stringify(styled));
    await win.evaluate(() => document.querySelector('#set-mix-styles [data-mix-style="none"]').click());
    await win.waitForTimeout(900);
    const off = await tiles();
    check('No style takes it off again', off.on.join() === 'none', JSON.stringify(off));

    // ── Blueprint with No style: the grid goes on under the note (the owner: "no style deyince arkadaki çizgiler kayboluyor"). ──
    await pick('blueprint');
    const ground = () => win.evaluate(() => {
      const of = (sel) => { const cs = getComputedStyle(document.querySelector(sel)); return { image: cs.backgroundImage, size: cs.backgroundSize, fixed: cs.backgroundAttachment }; };
      return { backdrop: document.getElementById('app').classList.contains('has-backdrop'), shell: of('.edit-shell'), frame: of('.editor-frame') };
    });
    const lines = await ground();
    check('Blueprint, No style: the note’s frame draws the grid of the ground, both from the window’s corner',
      !lines.backdrop && /gradient/.test(lines.frame.image) && lines.frame.image === lines.shell.image && lines.frame.size === lines.shell.size && /^fixed/.test(lines.frame.fixed) && /^fixed/.test(lines.shell.fixed), JSON.stringify(lines));
    await closeSettings();
    await shot('4-blueprint-no-style');
    await openSettings();

    // ── Ink: the brush's hand for everything, and no bright stroke along the top. ──
    await pick('ink');
    const inkTop = await win.evaluate(() => ({
      strip: getComputedStyle(document.querySelector('.titlebar')).backgroundImage,
      dialog: getComputedStyle(document.querySelector('#ov-settings .modal')).backgroundImage,
      head: getComputedStyle(document.querySelector('#ov-settings .set-head')).textTransform,
      weight: getComputedStyle(document.querySelector('.title-input')).fontWeight,
      line: parseFloat(getComputedStyle(document.querySelector('.title-input')).webkitTextStrokeWidth) > 0,
      cut: document.fonts.check('600 20px Courgette'),
    }));
    check('Ink paints no stroke along the top of the window or of a dialog', inkTop.strip === 'none' && inkTop.dialog === 'none', JSON.stringify(inkTop));
    check('Ink’s heads are the script as it is written: no capitals put on, and its one cut answers for bold with a line round the letter, never fattened', inkTop.head === 'none' && inkTop.line && inkTop.cut, JSON.stringify(inkTop));
    await shot('4-ink-settings');

    // ── The picker: each name as it is spelt, in its design's face (the owner: "BLUEPRINT falan büyük harf gerek yok"). ──
    const names = await win.evaluate(() => [...document.querySelectorAll('#design-pick [data-design]')].map((b) => {
      const n = b.querySelector('.dp-name');
      const cs = getComputedStyle(n);
      return { design: b.dataset.design, text: n.textContent.trim(), transform: cs.textTransform, caps: cs.fontVariantCaps, face: cs.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '') };
    }));
    check('no name in the picker is set in capitals', names.length === DESIGNS.length + 1 && names.every((n) => n.transform === 'none' && n.caps === 'normal' && n.text !== n.text.toUpperCase()), JSON.stringify(names));
    check('each name is in its design’s face', names.filter((n) => n.design !== 'nebula').every((n) => [FACES[n.design].head, FACES[n.design].text].includes(n.face)), JSON.stringify(names.map((n) => [n.design, n.face])));
    await pick('nebula');
    await closeSettings();

    check('no error on the page through all of it', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failed = 0;
  const check = (name, ok, detail = '') => {
    if (!ok) failed++;
    console.log(`${ok ? '+' : 'x'} ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  };
  await runDesignChecks(check);
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
}
