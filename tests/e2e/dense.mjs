/**
 * The simple checks, run again inside long notes (owner, 0.8.9).
 *
 * Most checks try one tool on an empty note. The owner meets their bugs in
 * long notes, where a tool lands between headings, lists, quotes, images and
 * code. So each long note here is opened as it is, and at real places inside
 * it — the middle of the longest paragraph, a list item, a quote, the end of a
 * paragraph — a tool is used with the keyboard and mouse, checked, taken back
 * with Ctrl+Z, brought back with Ctrl+Y, and then deleted the way a person
 * deletes: Backspace or Delete, one press at a time. After every trial the
 * note must be exactly what it was, and no press may eat text that was there
 * before.
 *
 * The guide is always one of the notes. `runDenseChecks(check, { docs })`
 * takes more: the local page rebuild passes the articles it wrote.
 *
 *   node tests/e2e/dense.mjs [note.json ...]   the guide, plus these notes
 */
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/** In the page: the note as structure and text, without what only the UI changes (selection, inline geometry). */
function signatureSource() {
  window.__denseSig = (rootEl) => {
    const out = [];
    const walk = (n) => {
      // Chromium turns a space next to a deleted letter into a no-break space; it looks and prints the same.
      if (n.nodeType === 3) { const t = n.data.replace(/​/g, '').replace(/ /g, ' '); if (t) out.push(JSON.stringify(t)); return; }
      if (n.nodeType !== 1) return;
      // The painted layer of a code block is redrawn from its source; the source is compared.
      if (n.matches('.code-paint, .katex')) return;
      // Code is coloured by spans that are redrawn after every restore: its text is what counts.
      if (n.matches('.code-src')) { out.push(`<code.code-src>${JSON.stringify(n.textContent)}</>`); return; }
      const cls = [...n.classList].filter((c) => !['sel', 'arrow-target', 'active', 'editing'].includes(c)).sort().join('.');
      out.push(`<${n.tagName.toLowerCase()}${cls ? `.${cls}` : ''}>`);
      n.childNodes.forEach(walk);
      out.push('</>');
    };
    // Adjacent text nodes are one run of text: typing and deleting splits them without changing the note.
    const copy = rootEl.cloneNode(true); copy.normalize();
    copy.childNodes.forEach(walk);
    return out.join('');
  };
  window.__denseText = (rootEl) => rootEl.textContent.replace(/​/g, '').replace(/ /g, ' ');
}

/** Places in the open note where the trials happen. */
function findSites() {
  const ed = document.getElementById('editor');
  const top = [...ed.children];
  const prose = (el) => el.matches('p') && el.textContent.trim().length > 60 && !el.querySelector('img, .link-block, .blk-code, .inline-eq');
  const pick = (list) => list.sort((a, b) => b.textContent.length - a.textContent.length)[0];
  const mark = (el, name) => { if (el) el.dataset.denseSite = name; return el ? name : null; };
  document.querySelectorAll('[data-dense-site]').forEach((el) => delete el.dataset.denseSite);
  const sites = [
    mark(pick(top.filter(prose)), 'long paragraph'),
    mark(pick([...ed.querySelectorAll(':scope > ul > li, :scope > ol > li')].filter((li) => li.textContent.trim().length > 30 && !li.querySelector('ul, ol, img'))), 'list item'),
    mark(pick([...ed.querySelectorAll(':scope > blockquote')].filter((q) => q.textContent.trim().length > 30)), 'quote'),
    mark(top.filter(prose).find((p) => p.nextElementSibling?.matches('h1, h2, h3') && !p.dataset.denseSite), 'paragraph before a heading'),
  ];
  return sites.filter(Boolean);
}

export async function runDenseChecks(check, { docs = [] } = {}) {
  const { GUIDE_NOTE } = await import(pathToFileURL(path.join(root, 'src/js/seed-notes.js')).href);
  const all = [{ name: 'guide', title: GUIDE_NOTE.title, content: GUIDE_NOTE.content }, ...docs];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nebula-dense-'));
  const notesDir = path.join(profile, 'storage', 'notes');
  fs.mkdirSync(notesDir, { recursive: true });
  const now = Date.now();
  all.forEach((d, i) => {
    d.id = `n-dense-${i}`;
    // Notes are opened by title: two articles of a series share one.
    if (all.findIndex((o) => o.title === d.title) !== i) d.title = `${d.title} (${d.name})`;
    fs.writeFileSync(path.join(notesDir, `${d.id}.json`), JSON.stringify({ id: d.id, title: d.title, content: d.content, createdAt: now - i, updatedAt: now - i }));
  });

  let app;
  try {
    app = await electron.launch({
      args: [path.join(root, 'dist-electron/main.js'), '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'],
      env: { ...process.env, NEBULA_USER_DATA: profile },
    });
    const win = await app.firstWindow();
    win.setDefaultTimeout(10000);
    const errors = [];
    win.on('pageerror', (e) => errors.push(e.message));
    await app.evaluate(({ dialog, BrowserWindow }) => { dialog.showMessageBox = async () => ({ response: 0 }); BrowserWindow.getAllWindows()[0].setSize(1280, 1000); });
    await win.waitForFunction(() => document.querySelector('.note-row'), null, { polling: 50 });
    await win.waitForFunction(() => !document.getElementById('ov-whats-new')?.hidden, null, { polling: 50, timeout: 4000 }).catch(() => {});
    await win.evaluate(() => document.querySelector('#whats-new-close')?.click());
    await win.evaluate(signatureSource);

    /** Where two signatures part, for the failure message. */
    const diff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `was …${a.slice(Math.max(0, i - 60), i + 60)}… now …${b.slice(Math.max(0, i - 60), i + 60)}…`; };
    const sig = () => win.evaluate(() => window.__denseSig(document.getElementById('editor')));
    const text = () => win.evaluate(() => window.__denseText(document.getElementById('editor')));
    const press = async (key, n = 1) => { for (let i = 0; i < n; i++) await win.keyboard.press(key); };

    for (const doc of all) {
      const open = async () => {
        await win.evaluate((title) => [...document.querySelectorAll('.note-row')].find((r) => r.querySelector('.nr-title')?.textContent === title)?.click(), doc.title);
        await win.waitForFunction((title) => document.getElementById('title').value === title, doc.title, { polling: 50 });
        await win.waitForTimeout(400);
      };
      await open();
      const baseHtml = await win.evaluate(() => document.getElementById('editor').innerHTML);
      const sites = await win.evaluate(findSites);
      const base = await sig();
      const baseText = await text();
      const results = {};   // op -> [failures]
      const record = (op, site, ok, detail) => { (results[op] ||= { runs: 0, fails: [] }).runs++; if (!ok) results[op].fails.push(`${site}: ${detail}`); };

      /** Put the note back as it was opened (only after a trial left it wrong). */
      const restore = async () => {
        await win.evaluate((html) => { const ed = document.getElementById('editor'); ed.innerHTML = html; ed.dispatchEvent(new Event('input', { bubbles: true })); }, baseHtml);
        await win.keyboard.press('Control+s');
        await win.waitForTimeout(300);
        const other = all.find((d) => d !== doc);
        if (other) {
          await win.evaluate((title) => [...document.querySelectorAll('.note-row')].find((r) => r.querySelector('.nr-title')?.textContent === title)?.click(), other.title);
          await win.waitForTimeout(300);
        }
        await open();
        await win.evaluate(findSites);
      };

      /** Click into a site with the mouse: `where` is 'middle' (just after a space near the middle) or 'end'. */
      const clickInto = (site, where) => win.evaluate(({ site, where }) => {
        const el = document.querySelector(`[data-dense-site="${site}"]`);
        if (!el) return null;
        el.scrollIntoView({ block: 'center' });
        // 'middle' is plain text right in the line, not inside a bold or a link: a format
        // toggled there would switch that format off, which is a different trial.
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('[contenteditable="false"]') || (where === 'middle' && n.parentElement !== el) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
        const nodes = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) if (n.data.trim()) nodes.push(n);
        if (!nodes.length) return null;
        let node; let offset;
        if (where === 'end') { node = nodes.at(-1); offset = node.data.replace(/\s+$/, '').length; }
        else {
          // The start of a word near the middle of the longest plain run: letters on both sides.
          node = nodes.reduce((a, b) => (b.data.length > a.data.length ? b : a));
          const mid = Math.floor(node.data.length / 2);
          const starts = [...node.data.matchAll(/ (?=\S)/g)].map((m) => m.index + 1).filter((i) => i > 1 && i < node.data.length - 1);
          if (!starts.length) return null;
          offset = starts.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
        }
        // The mouse clicks on the word itself (a click at a line wrap can land on either line);
        // the caret is then put exactly where the trial needs it, as a second click would.
        const word = document.createRange();
        word.setStart(node, Math.max(0, offset - 2)); word.setEnd(node, Math.max(1, offset - 1));
        const rect = word.getClientRects()[0] || word.getBoundingClientRect();
        el.__denseCaret = { node, offset };
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, before: node.data.slice(Math.max(0, offset - 12), offset), siteText: el.textContent };
      }, { site, where });

      const place = async (site, where) => {
        const at = await clickInto(site, where);
        if (!at) return null;
        await win.mouse.click(at.x, at.y);
        await win.evaluate((site) => {
          const { node, offset } = document.querySelector(`[data-dense-site="${site}"]`).__denseCaret;
          const r = document.createRange(); r.setStart(node, offset); r.collapse(true);
          getSelection().removeAllRanges(); getSelection().addRange(r);
        }, site);
        const ok = await win.evaluate(() => document.activeElement?.id === 'editor' || !!document.activeElement?.closest?.('#editor'));
        return ok ? at : null;
      };

      /** Backspace (or Delete) one press at a time until the note is back; no press may lose old text. */
      const deleteBack = async (key, max, siteText) => {
        let prev = await sig();
        for (let i = 1; i <= max; i++) {
          await win.keyboard.press(key);
          const [s, t] = await Promise.all([sig(), text()]);
          if (process.env.DENSE_TRACE === 'keys') console.log(`      ${key} ${i}: caret ${await caretAt()}`);
          if (s === base) return { ok: true, presses: i };
          const before = prev; prev = s;
          if (!t.includes(siteText.trim().slice(0, 40)) || t.length < baseText.length - 0) {
            const lost = t.length < baseText.length;
            if (lost) return { ok: false, presses: i, why: `press ${i} of ${key} removed text that was there before; before that press: ${diff(base, before)}` };
          }
        }
        return { ok: false, presses: max, why: `${max} presses of ${key} did not bring the note back: ${diff(base, prev)}` };
      };

      /** Ctrl+Z until the note is back, then Ctrl+Y the same number of times and expect the tool's result again. */
      const undoRedo = async (after) => {
        let n = 0;
        while (n < 6) { await press('Control+z'); n++; if (await sig() === base) break; }
        if (await sig() !== base) return `Ctrl+Z ${n}× did not bring the note back: ${diff(base, await sig())}`;
        await trace(`after ${n}× Ctrl+Z`);
        for (let i = 0; i < n; i++) await press('Control+y');
        await win.waitForTimeout(80);
        if (await sig() !== after) return `Ctrl+Y ${n}× did not bring the ${n > 1 ? 'steps' : 'step'} back: ${diff(after, await sig())}`;
        return null;
      };

      /**
       * One trial: place the caret, use the tool, check it, undo and redo it,
       * delete it with keys, and expect the note as it was.
       */
      /** Click the object the trial added (the newest one), the way a person picks it before Delete. */
      const clickObject = async (selector) => {
        const box = await win.evaluate((sel) => {
          const all = [...document.querySelectorAll(`#editor ${sel}`)];
          const el = all.find((e) => e.dataset.denseNew) || all.at(-1);
          el?.scrollIntoView({ block: 'center' });
          const r = el?.getBoundingClientRect();
          return r ? { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 20) } : null;
        }, selector);
        if (box) { await win.mouse.click(box.x, box.y); await win.waitForTimeout(60); }
      };
      const TRACE = process.env.DENSE_TRACE;
      const caretAt = () => win.evaluate(() => { const s = getSelection(); if (!s.rangeCount) return 'no caret'; const r = s.getRangeAt(0); const n = r.startContainer; const t = n.nodeType === 3 ? n.data : n.textContent; return n.nodeType === 3 ? `…${t.slice(Math.max(0, r.startOffset - 15), r.startOffset)}|${t.slice(r.startOffset, r.startOffset + 15)}…` : `<${n.nodeName} @${r.startOffset}>`; });
      const trace = async (step, site) => { if (TRACE) console.log(`    [${step}] caret ${await caretAt()}${site && TRACE === 'html' ? `
      ${await win.evaluate((st) => document.querySelector(`[data-dense-site="${st}"]`)?.innerHTML.slice(0, 400), site)}` : ''}`); };
      const trial = async (op, site, where, { act, expect, del, max }) => {
        if (process.env.DENSE_ONLY && !op.includes(process.env.DENSE_ONLY)) return;
        if (TRACE) console.log(`  ${op} @ ${site}`);
        const at = await place(site, where);
        if (!at) return record(op, site, false, 'could not click into the site');
        await trace('placed');
        const why = await act(at);
        await trace('after the tool', site);
        const after = await sig();
        const seen = why || await expect(at);
        if (seen !== true) { record(op, site, false, `${seen || 'the tool did nothing'}; ${diff(base, after)}`); await restore(); return; }
        const undo = await undoRedo(after);
        if (undo) { record(op, site, false, undo); await restore(); return; }
        await trace('after undo+redo', site);
        const done = await del(at, max);
        if (!done.ok) { record(op, site, false, done.why); await restore(); return; }
        // The caret is still where the tool was: typing goes into that same place.
        await win.keyboard.insertText('q');
        // The letter lands in the line the trial was in — for an object, which goes under the
        // whole list or quote, in that list or quote.
        const back = await win.evaluate(({ site }) => {
          let el = document.querySelector(`[data-dense-site="${site}"]`);
          while (el && el.parentElement?.id !== 'editor') el = el.parentElement;
          return el?.textContent ?? '';
        }, { site });
        await press('Backspace');
        const clean = await sig() === base;
        record(op, site, back.includes('q') && clean, back.includes('q') ? (clean ? '' : 'the note changed after typing one letter and deleting it') : `after deleting, typing went somewhere else: ${diff(base, await sig())}`);
        if (!clean) await restore();
      };

      /** Does the site hold an element matching `selector` whose text includes `words`? */
      const siteHas = (site, selector, words = '') => win.evaluate(({ site, selector, words }) => {
        const el = document.querySelector(`[data-dense-site="${site}"]`);
        return !!el && [...el.querySelectorAll(selector)].some((n) => n.textContent.includes(words));
      }, { site, selector, words });
      /** Is the block right under the site a `selector`? */
      const under = (site, selector) => win.evaluate(({ site, selector }) => {
        const n = document.querySelector(`[data-dense-site="${site}"]`)?.nextElementSibling;
        return !!n && (n.matches(selector) || !!n.querySelector(selector));
      }, { site, selector });
      const bs = (n) => async (_at, max) => deleteBack('Backspace', Math.max(max ?? 0, n + 4), _at.siteText);

      const WORD = 'zebra ';
      for (const site of sites) {
        const where = 'middle';
        await trial('typing a word', site, where, {
          act: async () => { await win.keyboard.type(WORD, { delay: 10 }); },
          expect: async () => (await win.evaluate((s) => document.querySelector(`[data-dense-site="${s}"]`)?.textContent.includes('zebra '), site)) || 'the word did not land in the line clicked',
          del: bs(WORD.length),
        });
        for (const [op, key, tags] of [['bold', 'Control+b', 'b, strong'], ['italic', 'Control+i', 'i, em'], ['underline', 'Control+u', 'u, .u-single']]) {
          if (op === 'italic' && site === 'quote') continue;   // quotes are italic already: Ctrl+I there takes italic off
          await trial(`${op} typing`, site, where, {
            act: async () => { await press(key); await win.keyboard.type('kalin', { delay: 10 }); await press(key); },
            expect: async () => (await siteHas(site, tags, 'kalin')) || `the typed word is not ${op}`,
            del: bs(5),
          });
        }
        await trial('Enter splits the line', site, where, {
          act: async () => { await press('Enter'); },
          expect: async () => (await sig()) !== base || 'Enter changed nothing',
          del: bs(1),
        });
        await trial('slash menu, then Escape', site, where, {
          act: async () => {
            await win.keyboard.type('/', { delay: 10 });
            const shown = await win.waitForFunction(() => !document.getElementById('slash-menu').hidden, null, { polling: 50, timeout: 1500 }).then(() => true).catch(() => false);
            if (!shown) return 'the slash menu did not open after a space';
            await press('Escape');
            return null;
          },
          expect: async () => (await win.evaluate(() => document.getElementById('slash-menu').hidden)) || 'Escape left the menu open',
          del: bs(1),
        });
        for (const kind of ['url', 'mention']) {
          await trial(`pasted link as ${kind === 'url' ? 'URL' : 'Mention'}`, site, where, {
            act: async () => {
              await app.evaluate(({ clipboard }) => clipboard.writeText('https://example.com/dense'));
              await press('Control+v');
              const btn = await win.waitForFunction((k) => { const b = document.querySelector(`#link-menu [data-link-kind="${k}"]`); if (!b || !b.offsetParent) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, kind, { polling: 50, timeout: 2000 }).then((h) => h.jsonValue()).catch(() => null);
              if (!btn) return 'pasting a URL did not offer the link menu';
              await win.mouse.click(btn.x, btn.y);
              await win.waitForTimeout(80);
              return null;
            },
            expect: async () => (await siteHas(site, `.link-${kind}`)) || `no ${kind} link in the line`,
            del: bs(kind === 'url' ? 'https://example.com/dense'.length : '@example.com'.length),
          });
        }
        await trial('pasted image, then Delete', site, where, {
          act: async () => {
            await app.evaluate(({ clipboard, nativeImage }, b64) => clipboard.writeImage(nativeImage.createFromBuffer(Buffer.from(b64, 'base64'))), PIXEL);
            await press('Control+v');
            const added = await win.waitForFunction(() => { const el = document.querySelector('#editor .note-image.sel'); if (el) el.dataset.denseNew = '1'; return !!el; }, null, { polling: 50, timeout: 3000 }).then(() => true).catch(() => false);
            return added ? null : 'the pasted image did not arrive selected';
          },
          // Pasted, an image goes into the text right under the caret's line (rich-paste placeInText).
          expect: async () => (await win.evaluate((st) => {
            let top = document.querySelector(`[data-dense-site="${st}"]`);
            while (top && top.parentElement?.id !== 'editor') top = top.parentElement;
            return !!top?.nextElementSibling?.matches('.note-image');
          }, site)) || 'the image did not go right under the line the caret was in',
          del: async (at) => { await clickObject('.note-image'); return deleteBack('Delete', 3, at.siteText); },
        });
        await trial('/shape, then Delete', site, where, {
          act: async () => {
            await win.keyboard.type('/shape', { delay: 10 });
            await win.waitForFunction(() => !document.getElementById('slash-menu').hidden, null, { polling: 50, timeout: 1500 }).catch(() => {});
            await press('Enter');
            const ok = await win.waitForFunction(() => { const el = document.querySelector('#editor .shape.sel'); if (el) el.dataset.denseNew = '1'; return !!el; }, null, { polling: 50, timeout: 2000 }).then(() => true).catch(() => false);
            return ok ? null : '/shape did not add a selected shape';
          },
          expect: async () => true,
          del: async (at) => { await clickObject('.shape'); return deleteBack('Delete', 3, at.siteText); },
        });
      }

      // Blocks start on a new line at the end of a paragraph, and are removed with Backspace.
      const ends = sites.filter((s) => s === 'long paragraph' || s === 'paragraph before a heading');
      const BLOCKS = [
        ['Heading 2', 'h2', 'Baslik', 'h2'], ['Heading 3', 'h3', 'Baslik', 'h3'], ['Quote', 'quote', 'Alinti', 'blockquote'],
        ['Bulleted list', 'bullet', 'madde', 'ul'], ['Numbered list', 'numbered', 'madde', 'ol'], ['To-do', 'todo', 'yapilacak', '.blk-todo'],
        ['Code block', 'code', 'let a = 1', '.blk-code'], ['Divider', 'divider', '', 'hr'],
      ];
      for (const site of ends) {
        for (const [label, id, words, selector] of BLOCKS) {
          await trial(`/${id} on a new line`, site, 'end', {
            act: async () => {
              await press('Enter');
              await win.keyboard.type(`/${id}`, { delay: 10 });
              const shown = await win.waitForFunction(() => !document.getElementById('slash-menu').hidden, null, { polling: 50, timeout: 1500 }).then(() => true).catch(() => false);
              if (!shown) return `the slash menu did not open for /${id}`;
              await press('Enter');
              await win.waitForTimeout(120);
              if (words) await win.keyboard.type(words, { delay: 10 });
              return null;
            },
            expect: async () => (await under(site, selector)) || `no ${label} right under the line`,
            del: bs(words.length + 3),
            max: words.length + 6,
          });
        }
      }

      for (const [op, r] of Object.entries(results)) {
        check(`long note "${doc.name}": ${op} (${r.runs} places), undone, redone and deleted with keys`, r.fails.length === 0, r.fails.slice(0, 3).join(' | '));
      }
      // What was saved is the note that was opened.
      await win.keyboard.press('Control+s');
      await win.waitForFunction(() => document.getElementById('savestate').textContent === 'Saved', null, { polling: 50, timeout: 8000 }).catch(() => {});
      const saved = fs.readdirSync(notesDir).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(notesDir, f), 'utf8')); } catch { return null; } }).find((n) => n?.id === doc.id)?.content ?? '';
      const same = await win.evaluate(({ saved, baseHtml }) => {
        const a = document.createElement('div'); a.innerHTML = saved;
        const b = document.createElement('div'); b.innerHTML = baseHtml;
        return window.__denseSig(a) === window.__denseSig(b);
      }, { saved, baseHtml });
      check(`long note "${doc.name}": after every trial the saved note is the note that was opened`, same);
    }
    check('the long-note trials ran without a page error', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('long-note trials ran to the end', false, err.message.split('\n').slice(0, 3).join(' | '));
  } finally {
    await app?.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const docs = process.argv.slice(2).map((file) => {
    const note = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { name: path.basename(path.dirname(file)), title: note.title, content: note.content };
  });
  let failed = 0;
  await runDenseChecks((name, ok, detail = '') => { console.log(`${ok ? '+' : 'x'} ${name} ${detail}`); if (!ok) failed++; }, { docs });
  process.exitCode = failed ? 1 : 0;
}
