/**
 * The cities of the World clock and the Weather, made from GeoNames.
 *
 *   node scripts/build-cities.js <path to cities15000.txt>
 *
 * Reads GeoNames' "cities15000" (every city of 15 000 people or more, and the
 * capitals: geonames.org, CC BY 4.0 — credited in CREDITS.md and in About) and
 * writes src/js/city-data.js: one line a city, the most peopled first.
 *
 *   id | name | country | region | time zone's number | latitude | longitude
 *
 * The id is left empty where it is the name written plainly. A city keeps its
 * id for good — notes hold it — so the names below, which Nebula has called
 * these cities since before this list, are given first and by hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// name | country | latitude | longitude — the city as English calls it, and where to find it.
const OWN_NAMES = `
Abu Dhabi|AE|24.45|54.38
Accra|GH|5.60|-0.19
Adana|TR|37.00|35.32
Addis Ababa|ET|9.03|38.74
Adelaide|AU|-34.93|138.60
Algiers|DZ|36.75|3.06
Almaty|KZ|43.24|76.89
Amman|JO|31.95|35.93
Amsterdam|NL|52.37|4.90
Anchorage|US|61.22|-149.90
Ankara|TR|39.93|32.86
Antalya|TR|36.90|30.70
Athens|GR|37.98|23.73
Atlanta|US|33.75|-84.39
Auckland|NZ|-36.85|174.76
Baghdad|IQ|33.31|44.37
Baku|AZ|40.41|49.87
Bangkok|TH|13.76|100.50
Barcelona|ES|41.39|2.17
Beijing|CN|39.90|116.41
Beirut|LB|33.89|35.50
Belgrade|RS|44.79|20.45
Bengaluru|IN|12.97|77.59
Berlin|DE|52.52|13.40
Bern|CH|46.95|7.45
Białystok|PL|53.13|23.16
Bogotá|CO|4.71|-74.07
Boston|US|42.36|-71.06
Brasília|BR|-15.79|-47.88
Bratislava|SK|48.15|17.11
Bremen|DE|53.08|8.80
Brisbane|AU|-27.47|153.03
Brussels|BE|50.85|4.35
Bucharest|RO|44.43|26.10
Budapest|HU|47.50|19.04
Buenos Aires|AR|-34.60|-58.38
Bursa|TR|40.19|29.06
Bydgoszcz|PL|53.12|18.01
Cairo|EG|30.04|31.24
Calgary|CA|51.05|-114.07
Cape Town|ZA|-33.92|18.42
Caracas|VE|10.48|-66.90
Casablanca|MA|33.57|-7.59
Chicago|US|41.88|-87.63
Chișinău|MD|47.01|28.86
Cologne|DE|50.94|6.96
Colombo|LK|6.93|79.86
Copenhagen|DK|55.68|12.57
Dallas|US|32.78|-96.80
Damascus|SY|33.51|36.29
Dar es Salaam|TZ|-6.79|39.21
Delhi|IN|28.61|77.21
Denver|US|39.74|-104.99
Dhaka|BD|23.81|90.41
Diyarbakır|TR|37.91|40.24
Doha|QA|25.29|51.53
Dortmund|DE|51.51|7.47
Dresden|DE|51.05|13.74
Dubai|AE|25.20|55.27
Dublin|IE|53.35|-6.26
Düsseldorf|DE|51.23|6.78
Edinburgh|GB|55.95|-3.19
Erzurum|TR|39.90|41.27
Eskişehir|TR|39.78|30.52
Frankfurt|DE|50.11|8.68
Gaziantep|TR|37.07|37.38
Gdańsk|PL|54.35|18.65
Geneva|CH|46.20|6.14
Hamburg|DE|53.55|9.99
Hanoi|VN|21.03|105.85
Hanover|DE|52.37|9.74
Havana|CU|23.11|-82.37
Helsinki|FI|60.17|24.94
Ho Chi Minh City|VN|10.82|106.63
Hong Kong|HK|22.32|114.17
Honolulu|US|21.31|-157.86
Houston|US|29.76|-95.37
Islamabad|PK|33.68|73.05
Istanbul|TR|41.01|28.98
Izmir|TR|38.42|27.14
Jakarta|ID|-6.21|106.85
Jerusalem|IL|31.77|35.21
Johannesburg|ZA|-26.20|28.05
Kabul|AF|34.56|69.21
Karachi|PK|24.86|67.01
Kathmandu|NP|27.72|85.32
Katowice|PL|50.26|19.02
Kayseri|TR|38.73|35.48
Kinshasa|CD|-4.44|15.27
Kolkata|IN|22.57|88.36
Konya|TR|37.87|32.48
Kraków|PL|50.06|19.94
Kuala Lumpur|MY|3.14|101.69
Kuwait City|KW|29.38|47.99
Kyiv|UA|50.45|30.52
Lagos|NG|6.52|3.38
Lahore|PK|31.55|74.34
Leipzig|DE|51.34|12.37
Lima|PE|-12.05|-77.04
Lisbon|PT|38.72|-9.14
Ljubljana|SI|46.06|14.51
Łódź|PL|51.76|19.46
London|GB|51.51|-0.13
Los Angeles|US|34.05|-118.24
Lublin|PL|51.25|22.57
Luxembourg|LU|49.61|6.13
Madrid|ES|40.42|-3.70
Manchester|GB|53.48|-2.24
Manila|PH|14.60|120.98
Melbourne|AU|-37.81|144.96
Mersin|TR|36.80|34.63
Mexico City|MX|19.43|-99.13
Miami|US|25.76|-80.19
Milan|IT|45.46|9.19
Minsk|BY|53.90|27.57
Montevideo|UY|-34.90|-56.16
Montreal|CA|45.50|-73.57
Moscow|RU|55.76|37.62
Mumbai|IN|19.08|72.88
Munich|DE|48.14|11.58
Nairobi|KE|-1.29|36.82
New York|US|40.71|-74.01
Nicosia|CY|35.19|33.38
Nuremberg|DE|49.45|11.08
Osaka|JP|34.69|135.50
Oslo|NO|59.91|10.75
Ottawa|CA|45.42|-75.70
Paris|FR|48.86|2.35
Perth|AU|-31.95|115.86
Phoenix|US|33.45|-112.07
Poznań|PL|52.41|16.93
Prague|CZ|50.08|14.44
Reykjavik|IS|64.15|-21.94
Riga|LV|56.95|24.11
Rio de Janeiro|BR|-22.91|-43.17
Riyadh|SA|24.71|46.68
Rome|IT|41.90|12.50
Rzeszów|PL|50.04|22.00
Samsun|TR|41.29|36.33
San Francisco|US|37.77|-122.42
Santiago|CL|-33.45|-70.67
São Paulo|BR|-23.55|-46.63
Sarajevo|BA|43.86|18.41
Seattle|US|47.61|-122.33
Seoul|KR|37.57|126.98
Shanghai|CN|31.23|121.47
Singapore|SG|1.35|103.82
Skopje|MK|42.00|21.43
Sofia|BG|42.70|23.32
Stockholm|SE|59.33|18.07
Stuttgart|DE|48.78|9.18
Sydney|AU|-33.87|151.21
Szczecin|PL|53.43|14.55
Taipei|TW|25.03|121.57
Tallinn|EE|59.44|24.75
Tashkent|UZ|41.30|69.24
Tbilisi|GE|41.72|44.79
Tehran|IR|35.69|51.39
Tirana|AL|41.33|19.82
Tokyo|JP|35.68|139.69
Toronto|CA|43.65|-79.38
Trabzon|TR|41.00|39.72
Tunis|TN|36.81|10.18
Ulaanbaatar|MN|47.89|106.91
Vancouver|CA|49.28|-123.12
Vienna|AT|48.21|16.37
Vilnius|LT|54.69|25.28
Warsaw|PL|52.23|21.01
Washington|US|38.91|-77.04
Wellington|NZ|-41.29|174.78
Wrocław|PL|51.11|17.03
Yerevan|AM|40.18|44.51
Zagreb|HR|45.81|15.98
Zurich|CH|47.38|8.54
`;

// The same letters cities.js searches by; kept in step with its `plain`.
const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/ł/gi, 'l').replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ø/gi, 'o').replace(/đ/gi, 'd').replace(/ß/g, 'ss').replace(/æ/gi, 'ae').toLowerCase().trim();
const slug = (name) => plain(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const source = process.argv[2];
if (!source || !fs.existsSync(source)) {
  console.error('Give the path to GeoNames\' cities15000.txt (download.geonames.org/export/dump/cities15000.zip).');
  process.exit(1);
}

const rows = [];
for (const line of fs.readFileSync(source, 'utf8').split('\n')) {
  const f = line.split('\t');
  if (f.length < 18) continue;
  const lat = Number(f[4]);
  const lon = Number(f[5]);
  const name = f[1].trim();
  // A separator of this file, or a place with no zone or no country, is no line of it.
  if (!name || /[|\n`\\]/.test(name) || !/^[A-Z]{2}$/.test(f[8]) || !f[17] || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  rows.push({ gid: Number(f[0]), name, ascii: f[2].trim(), lat, lon, cc: f[8], region: /^[A-Z]{2,3}$/.test(f[10]) ? f[10] : '', pop: Number(f[14]) || 0, tz: f[17], id: '' });
}
rows.sort((a, b) => b.pop - a.pop || a.gid - b.gid);

const taken = new Set();
const report = [];
for (const line of OWN_NAMES.trim().split('\n')) {
  const [name, cc, lat, lon] = line.split('|');
  const near = rows.filter((r) => r.cc === cc && !r.id && Math.abs(r.lat - Number(lat)) < 0.5 && Math.abs(r.lon - Number(lon)) < 0.5);
  const key = plain(name);
  const far = (r) => Math.hypot(r.lat - Number(lat), r.lon - Number(lon));
  const hit = near.find((r) => plain(r.name) === key || plain(r.ascii) === key)
    ?? near.filter((r) => far(r) < 0.2)[0];   // the most peopled close by: Köln for Cologne, not a quarter of it
  if (!hit) { console.error(`No city of GeoNames for ${name} (${cc}).`); process.exit(1); }
  if (plain(hit.name) !== key) report.push(`${name} <- ${hit.name}`);
  hit.name = name;
  hit.id = slug(name);
  taken.add(hit.id);
}

for (const r of rows) {
  if (r.id) continue;
  const base = slug(r.name) || slug(r.ascii);
  const tries = base
    ? [base, `${base}-${r.cc.toLowerCase()}`, r.region ? `${base}-${r.cc.toLowerCase()}-${r.region.toLowerCase()}` : '', `${base}-${r.gid.toString(36)}`]
    : [`g${r.gid.toString(36)}`];
  r.id = tries.find((id) => id && !taken.has(id));
  if (!r.id) { console.error(`No id left for ${r.name} (${r.gid}).`); process.exit(1); }
  taken.add(r.id);
}

const zones = [...new Set(rows.map((r) => r.tz))].sort();
const zoneAt = new Map(zones.map((z, i) => [z, i]));
const lines = rows.map((r) => [r.id === slug(r.name) ? '' : r.id, r.name, r.cc, r.region, zoneAt.get(r.tz), r.lat.toFixed(2).replace(/\.?0+$/, ''), r.lon.toFixed(2).replace(/\.?0+$/, '')].join('|'));

const out = `/**
 * The cities Nebula knows (${rows.length}) — written by scripts/build-cities.js, not by hand.
 *
 * From GeoNames' "cities15000" (geonames.org), under CC BY 4.0: every city of
 * 15 000 people or more and the capitals, the most peopled first.
 *
 *   id | name | country | region | time zone's number | latitude | longitude
 */

export const CITY_ZONES = ${JSON.stringify(zones)};

export const CITY_ROWS = \`
${lines.join('\n')}
\`;
`;
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'js', 'city-data.js');
fs.writeFileSync(target, out);
console.log(`${rows.length} cities, ${zones.length} time zones, ${(out.length / 1024).toFixed(0)} KB.`);
console.log(`Named by hand over another name: ${report.join('; ') || 'none'}`);
