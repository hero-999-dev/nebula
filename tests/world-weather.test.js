/**
 * The World clock and the Weather widget (1.0.4) — the owner: "widgetlara world
 * clock gelsin ve farklı şehirler eklenebilsin", "widgetlara weather eklensin",
 * "en güvenli ve bilgi vermeyecek 3. parti yöntem ile çekilsin veri". The
 * cities are Nebula's own list; what the weather's request holds, and what it
 * may not, is checked here clause by clause against electron/weather.js.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { allCities, cityOf, searchCities, countryName, wallTime, aheadText, skyOf, degrees, plain } from '../src/js/cities.js';
import { placeOf, weatherUrl, readWeather, fetchWeather, forgetWeather } from '../electron/weather.js';
import { WIDGETS, WORLD_MAX, WEATHER_MAX, makeWidget, renderWidget, stateOf, stepPlace, initWidgets, pickCity, weatherReadings } from '../src/js/widgets.js';
import { ICONS } from '../src/js/icons.js';

describe('the cities', () => {
  it('are whole: a name, an id of their own, a time zone this computer knows, a place on Earth', () => {
    // The owner: "tüm şehirler yok … hepsi şehir olsun" — every city of 15 000 people and more.
    const all = allCities();
    expect(all.length).toBeGreaterThan(30000);
    expect(new Set(all.map((c) => c.id)).size).toBe(all.length);
    const bad = all.filter((c) => !/^[a-z0-9-]+$/.test(c.id) || !/^[A-Z]{2}$/.test(c.country) || !c.name || !c.tz
      || !(Math.abs(c.lat) <= 90) || !(Math.abs(c.lon) <= 180));
    expect(bad.map((c) => c.name)).toEqual([]);
    // The zones are the computer's own; one too new for it shows no time and breaks nothing.
    const zones = [...new Set(all.map((c) => c.tz))];
    expect(zones.filter((z) => wallTime(z, Date.UTC(2026, 10, 11, 12, 0))).length).toBeGreaterThan(zones.length - 5);
    expect(cityOf('warsaw').tz).toBe('Europe/Warsaw');
    expect(cityOf('nowhere')).toBeNull();
    expect(cityOf('')).toBeNull();
    expect(cityOf(undefined)).toBeNull();
    // The ids notes were written with before the whole list are the same cities still.
    const before = { 'new-york': 'America/New_York', cologne: 'Europe/Berlin', frankfurt: 'Europe/Berlin', washington: 'America/New_York', delhi: 'Asia/Kolkata', istanbul: 'Europe/Istanbul', 'hong-kong': 'Asia/Hong_Kong', luxembourg: 'Europe/Luxembourg', 'ho-chi-minh-city': 'Asia/Ho_Chi_Minh', bialystok: 'Europe/Warsaw', tokyo: 'Asia/Tokyo' };
    for (const [id, tz] of Object.entries(before)) expect(cityOf(id)?.tz, id).toBe(tz);
    expect(cityOf('new-york').name).toBe('New York');
    expect(Math.abs(cityOf('washington').lat - 38.9)).toBeLessThan(0.1);
    // Small towns too, and two of one name each with an id of its own.
    expect(searchCities('legionowo')[0].country).toBe('PL');
    const springfields = searchCities('springfield').filter((c) => c.name === 'Springfield');
    expect(springfields.length).toBeGreaterThan(2);
    expect(new Set(springfields.map((c) => c.region)).size).toBe(springfields.length);
  });

  it('are found however they are typed, those that begin with it first', () => {
    expect(searchCities('ist')[0].id).toBe('istanbul');
    expect(searchCities('İST')[0].id).toBe('istanbul');
    expect(searchCities('lodz')[0].name).toBe('Łódź');
    expect(searchCities('krakow')[0].name).toBe('Kraków');
    expect(searchCities('new yo')[0].id).toBe('new-york');
    expect(searchCities('york').map((c) => c.id)).toContain('new-york');
    expect(searchCities('york')[0].name).toBe('York');
    expect(searchCities('zzzzq')).toEqual([]);
    expect(searchCities('tokyo', { without: ['tokyo'] }).some((c) => c.id === 'tokyo')).toBe(false);
    // No word: the largest cities, as many as a list shows.
    expect(searchCities('')).toHaveLength(80);
    expect(searchCities('', { limit: 5 })).toHaveLength(5);
    expect(searchCities('')[0].id).toBe(allCities()[0].id);
    // A country typed, in the language or in English, gives its cities, the largest first.
    expect(searchCities('polonya', { lang: 'tr' })[0].id).toBe('warsaw');
    expect(searchCities('polska', { lang: 'pl' }).map((c) => c.id)).toContain('krakow');
    expect(searchCities('japan').map((c) => c.id)).toContain('tokyo');
    expect(countryName('PL', 'tr')).toBe('Polonya');
    expect(countryName('DE', 'en')).toBe('Germany');
    expect(plain('  Diyarbakır ')).toBe('diyarbakir');
  });

  it('read the wall clock of their zone, summer and winter', () => {
    const winter = Date.UTC(2026, 0, 15, 12, 0);
    const summer = Date.UTC(2026, 6, 15, 12, 0);
    expect(wallTime('Europe/Warsaw', winter)).toEqual({ time: '13:00', day: '2026-01-15', offset: 60 });
    expect(wallTime('Europe/Warsaw', summer)).toEqual({ time: '14:00', day: '2026-07-15', offset: 120 });
    expect(wallTime('Europe/Istanbul', summer).offset).toBe(180);
    expect(wallTime('Asia/Kolkata', winter)).toEqual({ time: '17:30', day: '2026-01-15', offset: 330 });
    expect(wallTime('Asia/Tokyo', Date.UTC(2026, 0, 15, 20, 0)).day).toBe('2026-01-16');
    expect(wallTime('Nowhere/At_All', winter)).toBeNull();
    expect(aheadText(0)).toBe('');
    expect(aheadText(480)).toBe('+8h');
    expect(aheadText(-330)).toBe('−5h 30m');
  });

  it('name the sky by its code, each with a drawing there is', () => {
    expect(skyOf(0).word).toBe('Clear sky');
    expect(skyOf(0, true).ic).toBe('wxMoon');
    expect(skyOf(63).word).toBe('Rain');
    expect(skyOf(75).word).toBe('Snow');
    expect(skyOf(86).word).toBe('Snow');
    expect(skyOf(96).word).toBe('Thunderstorm');
    for (let code = 0; code < 100; code += 1) expect(ICONS[skyOf(code).ic], String(code)).toBeTruthy();
    expect(degrees(11.6)).toBe('12°');
    expect(degrees(-3.2)).toBe('−3°');
    expect(degrees(0, 'f')).toBe('32°');
  });
});

describe('what the weather asks', () => {
  beforeEach(() => forgetWeather());

  it('sends a place rounded to a tenth of a degree, and nothing that is not a place', () => {
    expect(placeOf({ lat: 52.2297, lon: 21.0122 })).toEqual({ lat: 52.2, lon: 21 });
    expect(placeOf({ lat: 91, lon: 0 })).toBeNull();
    expect(placeOf({ lat: 0, lon: 181 })).toBeNull();
    expect(placeOf({ lat: 'x', lon: 1 })).toBeNull();
    expect(placeOf({ lat: null, lon: 1 })).toBeNull();
    expect(placeOf(null)).toBeNull();
    expect(placeOf({ lat: '52.23; rm', lon: 21 })).toBeNull();
  });

  it('asks one fixed host over https, with no key and no name in it', () => {
    const url = new URL(weatherUrl(placeOf({ lat: 52.2297, lon: 21.0122 })));
    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('api.open-meteo.com');
    expect(url.searchParams.get('latitude')).toBe('52.2');
    expect(url.searchParams.get('longitude')).toBe('21.0');
    expect([...url.searchParams.keys()].sort()).toEqual(['current', 'daily', 'forecast_days', 'latitude', 'longitude', 'timezone']);
    expect(url.href).not.toMatch(/key|token|user|name|city/i);
  });

  const answer = {
    current: { temperature_2m: 11.6, apparent_temperature: 9.8, relative_humidity_2m: 71, weather_code: 2, wind_speed_10m: 14.2, is_day: 1 },
    daily: { time: ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'], weather_code: [2, 61, 3, 0], temperature_2m_max: [12, 10, 8, 9], temperature_2m_min: [5, 4, 2, 1] },
    extra: '<script>alert(1)</script>',
  };
  const served = (body, init = {}) => vi.fn(async () => ({ ok: init.ok ?? true, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }));

  it('carries no cookie, no referrer and a user agent that names nothing', async () => {
    const fetchImpl = served(answer);
    const got = await fetchWeather({ lat: 52.2297, lon: 21.0122 }, { fetchImpl, now: 1000 });
    expect(got.ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(weatherUrl({ lat: 52.2, lon: 21 }));
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.redirect).toBe('error');
    expect(init.headers['User-Agent']).toBe('Mozilla/5.0');
    expect(Object.keys(init.headers).sort()).toEqual(['Accept', 'User-Agent']);
    expect(init.method).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('gives the window numbers only, read field by field', async () => {
    const got = await fetchWeather({ lat: 52.23, lon: 21.01 }, { fetchImpl: served(answer), now: 1000 });
    expect(got).toEqual({
      ok: true,
      at: 1000,
      weather: {
        temp: 11.6, feels: 9.8, humidity: 71, wind: 14.2, code: 2, night: false,
        days: [{ d: '2026-11-11', code: 2, max: 12, min: 5 }, { d: '2026-11-12', code: 61, max: 10, min: 4 }, { d: '2026-11-13', code: 3, max: 8, min: 2 }, { d: '2026-11-14', code: 0, max: 9, min: 1 }],
      },
    });
    expect(readWeather({ current: { temperature_2m: '11', weather_code: 2 } })).toBeNull();
    expect(readWeather({ current: { temperature_2m: 900, weather_code: 2 } })).toBeNull();
    expect(readWeather({})).toBeNull();
    expect(readWeather(null)).toBeNull();
    // A day that is not whole is left out; what is missing of now is null, never a guess.
    const thin = readWeather({ current: { temperature_2m: 3, weather_code: 71, is_day: 0 }, daily: { time: ['2026-11-11', '<b>'], weather_code: [1, 1], temperature_2m_max: [1, 1], temperature_2m_min: [0, 0] } });
    expect(thin).toEqual({ temp: 3, feels: null, humidity: null, wind: null, code: 71, night: true, days: [{ d: '2026-11-11', code: 1, max: 1, min: 0 }] });
  });

  it('answers { ok: false } to anything else, and asks a place once in ten minutes', async () => {
    expect(await fetchWeather({ lat: 999, lon: 0 }, { fetchImpl: served(answer) })).toEqual({ ok: false });
    expect(await fetchWeather({ lat: 1, lon: 1 }, { fetchImpl: served(answer, { ok: false }) })).toEqual({ ok: false });
    expect(await fetchWeather({ lat: 1, lon: 1 }, { fetchImpl: served('not json') })).toEqual({ ok: false });
    expect(await fetchWeather({ lat: 1, lon: 1 }, { fetchImpl: served(`{"pad":"${'x'.repeat(70000)}"}`) })).toEqual({ ok: false });
    expect(await fetchWeather({ lat: 1, lon: 1 }, { fetchImpl: vi.fn(async () => { throw new Error('offline'); }) })).toEqual({ ok: false });
    const fetchImpl = served(answer);
    await fetchWeather({ lat: 2.04, lon: 2 }, { fetchImpl, now: 0 });
    await fetchWeather({ lat: 1.96, lon: 2.01 }, { fetchImpl, now: 9 * 60000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await fetchWeather({ lat: 2, lon: 2 }, { fetchImpl, now: 11 * 60000 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('the World clock', () => {
  it('is a widget one chooses, with a drawing of its own', () => {
    for (const kind of ['world', 'weather']) {
      const spec = WIDGETS.find((w) => w.kind === kind);
      expect(spec).toBeTruthy();
      expect(ICONS[spec.ic]).toBeTruthy();
    }
  });

  it('adds cities, each once, as many as it holds, and takes them away', () => {
    let s = { cities: [], city: null, unit: 'c' };
    s = stepPlace(s, 'city+tokyo');
    s = stepPlace(s, 'city+new-york');
    expect(s.cities).toEqual(['tokyo', 'new-york']);
    expect(stepPlace(s, 'city+tokyo')).toBeNull();
    expect(stepPlace(s, 'city+no-such-city')).toBeNull();
    expect(stepPlace(s, 'city-del-tokyo').cities).toEqual(['new-york']);
    expect(stepPlace(s, 'city-del-warsaw')).toBeNull();
    const full = { ...s, cities: allCities().slice(0, WORLD_MAX).map((c) => c.id) };
    expect(stepPlace(full, `city+${allCities()[WORLD_MAX].id}`)).toBeNull();
    expect(stepPlace(s, 'nonsense')).toBeNull();
  });

  it('shows here and every city, and keeps only cities it knows', () => {
    const fig = makeWidget('world');
    expect(fig.querySelectorAll('.wg-wrow')).toHaveLength(1);
    expect(fig.querySelector('[data-k="city-add"]')).toBeTruthy();
    fig.dataset.wgCities = 'tokyo,no-such-city,tokyo,warsaw';
    renderWidget(fig);
    expect(stateOf(fig).cities).toEqual(['tokyo', 'warsaw']);
    const rows = [...fig.querySelectorAll('.wg-wrow')];
    expect(rows.map((r) => r.querySelector('.wg-wcity').textContent)).toEqual(['Local time', 'Tokyo', 'Warsaw']);
    for (const r of rows) expect(r.querySelector('.wg-wtime').textContent).toMatch(/^\d\d:\d\d$/);
    expect(rows[1].querySelector('[data-k="city-del-tokyo"]')).toBeTruthy();
    expect(rows[0].querySelector('.wg-wdel')).toBeNull();
    // As high as its lines: the ratio falls as cities come.
    const two = Number(fig.dataset.ratio);
    fig.dataset.wgCities = 'tokyo';
    renderWidget(fig);
    expect(Number(fig.dataset.ratio)).toBeGreaterThan(two);
    // Full: nothing more to add.
    fig.dataset.wgCities = allCities().slice(0, WORLD_MAX + 3).map((c) => c.id).join(',');
    renderWidget(fig);
    expect(fig.querySelector('[data-k="city-add"]')).toBeNull();
    expect(fig.querySelectorAll('.wg-wrow')).toHaveLength(WORLD_MAX + 1);
  });
});

describe('in the note', () => {
  let editor;
  beforeEach(() => {
    localStorage.clear();
    const { readings, failed, asking } = weatherReadings();
    readings.clear(); failed.clear(); asking.clear();
    document.body.innerHTML = '<div id="editor" contenteditable="true"></div>';
    editor = document.getElementById('editor');
  });
  afterEach(() => { delete window.nebula; document.getElementById('city-menu')?.remove(); });

  const reading = { temp: 11.6, feels: 9.8, humidity: 71, wind: 16.09, code: 2, night: false, days: [{ d: '2026-11-11', code: 2, max: 12, min: 5 }, { d: '2026-11-12', code: 61, max: 10, min: 4 }, { d: '2026-11-13', code: 3, max: 8, min: 2 }, { d: '2026-11-14', code: 0, max: 9, min: 1 }] };
  const settled = () => new Promise((r) => setTimeout(r, 0));

  it('a city is searched and taken from the list, and removed by its ×', async () => {
    initWidgets(editor);
    const fig = makeWidget('world');
    editor.append(fig);
    fig.querySelector('[data-k="city-add"]').click();
    const menu = document.getElementById('city-menu');
    expect(menu).toBeTruthy();
    const q = menu.querySelector('input');
    q.value = 'toky';
    q.dispatchEvent(new Event('input'));
    expect(menu.querySelector('[data-city]').dataset.city).toBe('tokyo');
    expect(menu.querySelector('[data-city] .city-menu__cc').textContent).toBe('Japan');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settled();
    expect(fig.dataset.wgCities).toBe('tokyo');
    expect(document.getElementById('city-menu')).toBeNull();
    fig.querySelector('[data-k="city-del-tokyo"]').click();
    expect(fig.dataset.wgCities).toBeUndefined();
    // Left with Escape: nothing chosen.
    const left = pickCity({ left: 0, top: 0, bottom: 0 });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(await left).toBeNull();
  });

  it('a note that cannot be written keeps its cities', () => {
    initWidgets(editor);
    const fig = makeWidget('world');
    fig.dataset.wgCities = 'tokyo';
    renderWidget(fig);
    editor.append(fig);
    editor.dataset.readonly = 'true';
    fig.querySelector('[data-k="city-del-tokyo"]').click();
    fig.querySelector('[data-k="city-add"]').click();
    expect(fig.dataset.wgCities).toBe('tokyo');
    expect(document.getElementById('city-menu')).toBeNull();
  });

  it('the weather asks nothing before a city is chosen, then only that city’s place', async () => {
    const get = vi.fn(async () => ({ ok: true, at: Date.now(), weather: reading }));
    window.nebula = { weather: { get } };
    initWidgets(editor);
    const fig = makeWidget('weather');
    editor.append(fig);
    expect(get).not.toHaveBeenCalled();
    expect(fig.querySelector('.wg-wxnote').textContent).toMatch(/Open-Meteo/);
    fig.dataset.wgCity = 'warsaw';
    renderWidget(fig);
    await settled();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]).toEqual([{ lat: 52.23, lon: 21.01 }]);
    expect(fig.querySelector('.wg-wxtemp').textContent).toBe('12°');
    expect(fig.querySelector('.wg-wxword').textContent).toBe('Partly cloudy');
    expect([...fig.querySelectorAll('.wg-wxday-t')].map((d) => d.textContent)).toEqual(['10° 4°', '8° 2°', '9° 1°']);
    expect(fig.querySelector('.wg-wxby').textContent).toBe('Open-Meteo');
    // Drawn again, a fresh reading is not asked for again.
    renderWidget(fig);
    await settled();
    expect(get).toHaveBeenCalledTimes(1);
    // °F is worked out here: the same question is asked whatever the unit.
    fig.querySelector('[data-k="unit"]').click();
    expect(fig.dataset.wgUnit).toBe('f');
    expect(fig.querySelector('.wg-wxtemp').textContent).toBe('53°');
    expect(fig.querySelector('.wg-wxbits').textContent).toContain('10 mph');
    expect(get).toHaveBeenCalledTimes(1);
    // ↻ asks now, also in a note that cannot be written.
    editor.dataset.readonly = 'true';
    fig.querySelector('[data-k="refresh"]').click();
    await settled();
    expect(get).toHaveBeenCalledTimes(2);
    // The reading is kept for the next time the note is opened.
    expect(JSON.parse(localStorage.getItem('nebula:weather')).warsaw.weather.temp).toBe(11.6);
  });

  it('the weather holds several cities: the one added is shown, a press shows another, × takes one away', async () => {
    // The owner: "bir de weathera birden fazla şehir eklensin".
    const get = vi.fn(async () => ({ ok: true, at: Date.now(), weather: reading }));
    window.nebula = { weather: { get } };
    initWidgets(editor);
    const fig = makeWidget('weather');
    editor.append(fig);
    fig.dataset.wgCity = 'warsaw';
    renderWidget(fig);
    await settled();
    expect(stateOf(fig).cities).toEqual(['warsaw']);
    fig.querySelector('[data-k="city-add"]').click();
    const q = document.querySelector('#city-menu input');
    q.value = 'tokyo';
    q.dispatchEvent(new Event('input'));
    // The cities it holds already are not offered again.
    expect(document.querySelector('#city-menu [data-city="warsaw"]')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settled();
    await settled();
    expect(fig.dataset.wgCities).toBe('warsaw,tokyo');
    expect(fig.dataset.wgCity).toBe('tokyo');
    expect(fig.querySelector('.wg-wxname').textContent).toBe('Tokyo');
    expect(fig.querySelector('.wg-wxcc').textContent).toBe('Japan');
    expect([...fig.querySelectorAll('.wg-wxrow')].map((r) => r.textContent)).toEqual(['Warsaw12°×']);
    // Each city is its own question, asked once.
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[1]).toEqual([{ lat: 35.69, lon: 139.69 }]);
    fig.querySelector('[data-k="city=warsaw"]').click();
    expect(fig.dataset.wgCity).toBe('warsaw');
    expect(fig.querySelector('.wg-wxname').textContent).toBe('Warsaw');
    expect(get).toHaveBeenCalledTimes(2);
    // ↻ asks for every city of the widget.
    fig.querySelector('[data-k="refresh"]').click();
    await settled();
    expect(get).toHaveBeenCalledTimes(4);
    // The shown one taken away: the next is shown, and one city is written as one.
    fig.querySelector('[data-k="city-del-warsaw"]').click();
    expect(fig.dataset.wgCity).toBe('tokyo');
    expect(fig.dataset.wgCities).toBeUndefined();
    fig.querySelector('[data-k="city-del-tokyo"]').click();
    expect(fig.dataset.wgCity).toBeUndefined();
    expect(fig.querySelector('.wg-wxpick')).toBeTruthy();
    // As many as it holds, no more — and nothing changes in a note that cannot be written.
    fig.dataset.wgCities = allCities().slice(0, WEATHER_MAX + 3).map((c) => c.id).join(',');
    renderWidget(fig);
    expect(stateOf(fig).cities).toHaveLength(WEATHER_MAX);
    expect(fig.querySelector('[data-k="city-add"]')).toBeNull();
    expect(fig.querySelectorAll('.wg-wxrow')).toHaveLength(WEATHER_MAX - 1);
    editor.dataset.readonly = 'true';
    const shown = stateOf(fig).city;
    fig.querySelector('.wg-wxgo').click();
    fig.querySelector('.wg-wxrow .wg-wdel').click();
    expect(stateOf(fig).city).toBe(shown);
    expect(stateOf(fig).cities).toHaveLength(WEATHER_MAX);
  });

  it('says so when the weather cannot be fetched, and does not ask over and over', async () => {
    const get = vi.fn(async () => ({ ok: false }));
    window.nebula = { weather: { get } };
    const fig = makeWidget('weather');
    fig.dataset.wgCity = 'tokyo';
    editor.append(fig);
    renderWidget(fig);
    await settled();
    expect(fig.querySelector('.wg-wxnote').textContent).toBe('The weather could not be fetched');
    renderWidget(fig);
    renderWidget(fig);
    await settled();
    expect(get).toHaveBeenCalledTimes(1);
    // A city Nebula does not know is no city: nothing is asked for it.
    fig.dataset.wgCity = 'no-such-city';
    renderWidget(fig);
    expect(stateOf(fig).city).toBeNull();
    expect(get).toHaveBeenCalledTimes(1);
  });
});
