/**
 * A calendar's events ring at their time whichever note is open (the owner,
 * 2026-11-05: "baska nota calendar ekledim orada alarm vakti geldi sag altta
 * pop up ciksin … o pop upa basinca o calendara gitsin").
 *
 * Every few seconds the notes' calendars are read (the open note from the
 * page, so what was just typed counts; the others from their saved markup,
 * read again only when the note changed). An event whose moment passed since
 * the last look rings, and a card in the bottom-right corner says what it is.
 * Clicking the card opens the note, turns its calendar to that day and shows it.
 */
import { parseEvents, eventAt, showCalendarDay } from './widgets.js';
import { ring, stopRing, soundOf } from './alarm-sound.js';
import { cornerStack, placeCorner, showWidget } from './corner.js';
import { t } from './i18n.js';
import { icon } from './icons.js';

const EVERY = 5000;
/* An app that was asleep longer than this does not ring what it missed; the card still says so. */
const LATE = 10 * 60000;

/** The events with an alarm in a run of calendars. Pure — tested. */
export function alarmsIn(cals) {
  const out = [];
  for (const { note, cal, raw } of cals) {
    for (const e of parseEvents(raw)) {
      const at = eventAt(e);
      if (at != null) out.push({ note, cal, event: e, at, key: `${note}|${cal}|${e.d}|${e.t}|${e.x}` });
    }
  }
  return out;
}

/** Which of them fall due in (from, to], each once. Pure — tested. */
export function dueAlarms(list, from, to, fired = new Set()) {
  return list.filter((a) => a.at > from && a.at <= to && !fired.has(a.key));
}

/** A note's calendars in its saved markup: their ids and events. */
function calendarsOf(html) {
  if (!html || !html.includes('data-wg-events')) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll('.note-widget[data-widget="calendar"][data-wg-events]')]
    .map((fig) => ({ cal: fig.dataset.wgId ?? '', raw: fig.dataset.wgEvents }));
}

/**
 * @param {{ store: object, openNote: (id: string) => void }} deps
 */
export function initReminders({ store, openNote }) {
  const read = new Map();          // note id -> { at: updatedAt, cals }
  const fired = new Set();
  let last = Date.now();
  const cards = [];

  function looked() {
    const cals = [];
    const open = store.activeId;
    for (const note of store.live()) {
      if (note.id === open) continue;
      let seen = read.get(note.id);
      if (!seen || seen.at !== note.updatedAt) {
        seen = { at: note.updatedAt, cals: calendarsOf(note.content) };
        read.set(note.id, seen);
      }
      for (const c of seen.cals) cals.push({ note: note.id, ...c });
    }
    if (open) {
      for (const fig of document.querySelectorAll('#editor .note-widget[data-widget="calendar"][data-wg-events]')) {
        cals.push({ note: open, cal: fig.dataset.wgId ?? '', raw: fig.dataset.wgEvents });
      }
    }
    return cals;
  }

  function check() {
    const now = Date.now();
    const from = Math.max(last, now - LATE);
    last = now;
    for (const a of dueAlarms(alarmsIn(looked()), from, now, fired)) {
      fired.add(a.key);
      show(a);
    }
  }

  function show(a) {
    const card = document.createElement('div');
    card.className = 'update-card corner-card alarm-card';
    card.setAttribute('role', 'alert');
    card.tabIndex = 0;
    card.innerHTML = `<span class="corner-card__ic" aria-hidden="true">${icon('calendar', 'ic')}</span><span class="corner-card__body">`
      + '<span class="corner-card__head"></span><span class="corner-card__text" data-no-i18n></span><span class="corner-card__note" data-no-i18n></span></span>'
      + '<button type="button" class="btn ghost corner-card__key"></button>';
    card.querySelector('.corner-card__head').textContent = `${t('Alarm')} · ${a.event.t}`;
    card.querySelector('.corner-card__text').textContent = a.event.x || t('Calendar');
    card.querySelector('.corner-card__note').textContent = store.get(a.note)?.title || t('Untitled');
    card.querySelector('.corner-card__key').textContent = t('Stop');
    const close = () => {
      card.remove();
      cards.splice(cards.indexOf(card), 1);
      if (!cards.length) stopRing();
      placeCorner();
    };
    const go = () => {
      close();
      stopRing();
      if (store.activeId !== a.note) openNote(a.note);
      requestAnimationFrame(() => {
        const figs = [...document.querySelectorAll('#editor .note-widget[data-widget="calendar"]')];
        const fig = figs.find((f) => f.dataset.wgId === a.cal) ?? figs[0];
        if (!fig) return;
        showCalendarDay(fig, a.event.d);
        showWidget(fig);
      });
    };
    card.addEventListener('click', (e) => { if (e.target.closest('.corner-card__key')) close(); else go(); });
    card.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); go(); } });
    cornerStack().prepend(card);
    cards.push(card);
    placeCorner();
    void ring({ id: soundOf('alarm'), times: 12 });
  }

  const timer = setInterval(check, EVERY);
  return { check, stop: () => clearInterval(timer) };
}
