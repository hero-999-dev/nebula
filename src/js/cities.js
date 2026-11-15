/**
 * The cities of the World clock and the Weather widget (1.0.4).
 *
 * Nebula's own list, in the app: a city is found here, never asked of a
 * service, so choosing one sends nothing anywhere. Each has its time zone (the
 * World clock needs no more, and no network) and where it is to a hundredth
 * of a degree — the weather is asked for a tenth (electron/weather.js).
 *
 * The owner, a day after the first 170: "tüm şehirler yok … hepsi şehir olsun".
 * The list is now GeoNames' cities of 15 000 people and more (city-data.js,
 * made by scripts/build-cities.js), read only when a city is first needed.
 */
import { CITY_ROWS, CITY_ZONES } from './city-data.js';

/** Letters as they are searched by: no accents, no capitals, a dotless ı an i. */
export const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ł/gi, 'l').replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ø/gi, 'o').replace(/đ/gi, 'd').replace(/ß/g, 'ss').replace(/æ/gi, 'ae').toLowerCase().trim();

const idOf = (name) => plain(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let list = null;
let byId = null;

/** Every city, the most peopled first. Read from its lines the first time it is asked for. */
export function allCities() {
  if (list) return list;
  list = [];
  byId = new Map();
  for (const line of CITY_ROWS.split('\n')) {
    if (!line) continue;
    const [id, name, country, region, zone, lat, lon] = line.split('|');
    const city = { id: id || idOf(name), name, country, region, tz: CITY_ZONES[Number(zone)], lat: Number(lat), lon: Number(lon), key: plain(name) };
    list.push(city);
    byId.set(city.id, city);
  }
  return list;
}

/** The city of an id, or null. Nothing is read for no id at all. */
export function cityOf(id) {
  if (!id || typeof id !== 'string') return null;
  allCities();
  return byId.get(id) ?? null;
}

const namers = new Map();
/** A country's name in a language ("PL" → "Poland", "Polen", "Polonya"); its code when the language has none. */
export function countryName(code, lang = 'en') {
  let namer = namers.get(lang);
  if (namer === undefined) {
    try { namer = new Intl.DisplayNames([lang, 'en'], { type: 'region' }); } catch { namer = null; }
    namers.set(lang, namer);
  }
  try { return namer?.of(code) || code; } catch { return code; }
}

const lands = new Map();
/** The countries a typed word names, in the language and in English: three letters at least. */
function countriesOf(q, lang) {
  if (q.length < 3) return null;
  let names = lands.get(lang);
  if (!names) {
    names = new Map();
    for (const c of allCities()) {
      if (!names.has(c.country)) names.set(c.country, [plain(countryName(c.country, lang)), plain(countryName(c.country, 'en'))]);
    }
    lands.set(lang, names);
  }
  const found = new Set();
  for (const [code, both] of names) if (both.some((n) => n.startsWith(q))) found.add(code);
  return found.size ? found : null;
}

/**
 * The cities a typed word finds, the most peopled first within each kind: the
 * one called just that, those with a word that begins with it, those that hold
 * it, then the cities of a country called that. No word: the largest cities.
 * @param {string} query
 * @param {{without?: string[], limit?: number, lang?: string}} [o]
 */
export function searchCities(query, { without = [], limit = 80, lang = 'en' } = {}) {
  const q = plain(query);
  const gone = new Set(without);
  const all = allCities();
  if (!q) {
    const first = [];
    for (const c of all) {
      if (gone.has(c.id)) continue;
      first.push(c);
      if (first.length >= limit) break;
    }
    return first;
  }
  const countries = countriesOf(q, lang);
  const exact = [];
  const begins = [];
  const holds = [];
  const ofCountry = [];
  for (const c of all) {
    if (gone.has(c.id)) continue;
    const at = c.key.indexOf(q);
    if (at === 0 && c.key.length === q.length) exact.push(c);
    else if (at === 0 || (at > 0 && /[ \-'’.(]/.test(c.key[at - 1]))) { if (begins.length < limit) begins.push(c); }
    else if (at > 0) { if (holds.length < limit) holds.push(c); }
    else if (countries?.has(c.country) && ofCountry.length < limit) ofCountry.push(c);
  }
  return [...exact, ...begins, ...holds, ...ofCountry].slice(0, limit);
}

/* ---- the time somewhere ---------------------------------------------------- */

const parts = new Map();
function partsOf(tz) {
  let f = parts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    parts.set(tz, f);
  }
  return f;
}

/**
 * What a clock on the wall reads in a time zone: its time, its day, and how
 * many minutes it is ahead of UTC. null for a zone this computer does not know.
 * @returns {{time: string, day: string, offset: number} | null}
 */
export function wallTime(tz, now = Date.now()) {
  try {
    const p = {};
    for (const { type, value } of partsOf(tz).formatToParts(new Date(now))) p[type] = value;
    const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute));
    return { time: `${p.hour}:${p.minute}`, day: `${p.year}-${p.month}-${p.day}`, offset: Math.round((asUtc - Math.floor(now / 60000) * 60000) / 60000) };
  } catch {
    return null;
  }
}

/** How far ahead a clock is, in words a row has room for: "+8h", "−5h 30m", "" for none. */
export function aheadText(minutes) {
  if (!minutes) return '';
  const m = Math.abs(minutes);
  return `${minutes > 0 ? '+' : '−'}${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
}

/* ---- the weather's words ---------------------------------------------------- */

/** What a WMO weather code is called, and the drawing that goes with it. */
export function skyOf(code, night = false) {
  if (code === 0) return { word: 'Clear sky', ic: night ? 'wxMoon' : 'wxSun' };
  if (code === 1) return { word: 'Mostly clear', ic: night ? 'wxMoon' : 'wxSun' };
  if (code === 2) return { word: 'Partly cloudy', ic: 'wxPartly' };
  if (code === 3) return { word: 'Overcast', ic: 'wxCloud' };
  if (code === 45 || code === 48) return { word: 'Fog', ic: 'wxFog' };
  if (code >= 51 && code <= 57) return { word: 'Drizzle', ic: 'wxRain' };
  if (code >= 61 && code <= 67) return { word: 'Rain', ic: 'wxRain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { word: 'Snow', ic: 'wxSnow' };
  if (code >= 80 && code <= 82) return { word: 'Showers', ic: 'wxRain' };
  if (code >= 95) return { word: 'Thunderstorm', ic: 'wxStorm' };
  return { word: 'Cloudy', ic: 'wxCloud' };
}

/** Degrees as the widget shows them: whole, in °C or °F. */
export const degrees = (celsius, unit = 'c') => `${Math.round(unit === 'f' ? celsius * 9 / 5 + 32 : celsius)}°`.replace('-', '−');
