/**
 * The weather of a place, fetched by the main process (1.0.4).
 *
 * The owner: "en güvenli ve bilgi vermeyecek 3. parti yöntem ile çekilsin veri"
 * — so what leaves the machine is as little as a forecast can be asked with:
 *
 *   - Open-Meteo: no key, no account, nothing to sign in to;
 *   - https only, one fixed host, a fixed list of fields — the same question
 *     whoever asks it, in °C and km/h whatever the widget shows;
 *   - no cookies, no referrer, no origin, a user agent that names nothing;
 *   - the place is a city chosen from Nebula's own list, never where the
 *     computer is, and its coordinates are rounded to a tenth of a degree
 *     (some 11 km) before they go;
 *   - asked only when a Weather widget is in sight, and at most once in ten
 *     minutes for a place.
 *
 * What cannot be hidden is the address the request comes from: the service
 * sees an IP address ask for a city's weather, as any site one opens does.
 *
 * Only numbers come back to the window: what is read is checked field by
 * field, and anything else answers { ok: false }.
 */

const HOST = 'https://api.open-meteo.com/v1/forecast';
const FIELDS = 'current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto';
const MAX_BYTES = 65536;
const TIMEOUT_MS = 8000;
const KEEP_MS = 10 * 60000;

const tenth = (v) => Math.round(Number(v) * 10) / 10;

/** The coordinates as they are sent, or null when they are not a place on Earth. */
export function placeOf(raw) {
  const lat = Number(raw?.lat);
  const lon = Number(raw?.lon);
  if (raw?.lat == null || raw?.lon == null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: tenth(lat), lon: tenth(lon) };
}

export const weatherUrl = (place) => `${HOST}?latitude=${place.lat.toFixed(1)}&longitude=${place.lon.toFixed(1)}&${FIELDS}`;

const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

/** What a forecast says, as plain numbers; null when it is not one. */
export function readWeather(json) {
  const c = json?.current;
  const d = json?.daily;
  const temp = num(c?.temperature_2m, -100, 70);
  const code = num(c?.weather_code, 0, 99);
  if (temp == null || code == null) return null;
  const days = [];
  const n = Array.isArray(d?.time) ? Math.min(d.time.length, 4) : 0;
  for (let i = 0; i < n; i += 1) {
    const day = d.time[i];
    const max = num(d.temperature_2m_max?.[i], -100, 70);
    const min = num(d.temperature_2m_min?.[i], -100, 70);
    const dayCode = num(d.weather_code?.[i], 0, 99);
    if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || max == null || min == null || dayCode == null) continue;
    days.push({ d: day, code: dayCode, max, min });
  }
  return {
    temp,
    feels: num(c.apparent_temperature, -100, 70),
    humidity: num(c.relative_humidity_2m, 0, 100),
    wind: num(c.wind_speed_10m, 0, 500),
    code,
    night: c.is_day === 0,
    days,
  };
}

const kept = new Map();      // "lat,lon" -> { at, answer }

/**
 * @param {{lat: number, lon: number}} raw
 * @returns {Promise<{ok: true, at: number, weather: object} | {ok: false}>}
 */
export async function fetchWeather(raw, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const place = placeOf(raw);
  if (!place) return { ok: false };
  const key = `${place.lat},${place.lon}`;
  const old = kept.get(key);
  if (old && now - old.at < KEEP_MS) return old.answer;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(weatherUrl(place), {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      cache: 'no-store',
    });
    if (!response.ok) return { ok: false };
    const text = await response.text();
    if (text.length > MAX_BYTES) return { ok: false };
    const weather = readWeather(JSON.parse(text));
    if (!weather) return { ok: false };
    const answer = { ok: true, at: now, weather };
    kept.set(key, { at: now, answer });
    if (kept.size > 40) kept.delete(kept.keys().next().value);
    return answer;
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** For tests: nothing kept from an earlier one. */
export const forgetWeather = () => kept.clear();
