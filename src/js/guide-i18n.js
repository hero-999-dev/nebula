/**
 * The guide in the language of the app (0.9.4).
 *
 * A reader's word on the first translated release: "it would be better if,
 * when you switch to Deutsch, the whole welcome page and its information
 * switched too". Notes are never translated — the guide is the one page that
 * is the app's own, and only while nobody has written in it (its words still
 * match a guide that shipped: seed-notes.js `guideUnedited`).
 *
 * The English guide (seed-notes.js) is the source. A translation holds one
 * entry for each block of it that has words, in order — `node
 * scripts/guide-blocks.js` lists them with their numbers — plus the page's
 * title and the three words inside the demo shapes. Dividers, the shapes'
 * stage, the shape layers and the code samples are taken from the English as
 * they are. A translation that is a block short or long is not used at all:
 * the page stays English rather than half of each (tests/guide-i18n.test.js
 * fails until the count is right).
 */
import de from './guide-de.js';
import pl from './guide-pl.js';
import tr from './guide-tr.js';

/** @type {Record<string, {title: string, shapes: string[], blocks: string[]}>} */
export const GUIDE_LANGS = { de, pl, tr };

const NOT_WORDS = 'hr, .guide-stage, .shape-layer, .image-layer, .blk-code';

function parse(html) {
  return new DOMParser().parseFromString(`<!doctype html><body>${String(html ?? '')}</body>`, 'text/html').body;
}

const wordBlocks = (body) => [...body.children].filter((el) => !el.matches(NOT_WORDS));

/** The English guide's blocks that have words, as HTML, in order. */
export function guideBlocks(html) {
  return wordBlocks(parse(html)).map((el) => el.outerHTML);
}

/**
 * The guide as `lang` reads it.
 * @param {{title: string, content: string, readOnly?: boolean}} guide the English guide
 * @param {string} lang 'en' | 'de' | 'pl' | 'tr'
 * @returns {{title: string, content: string, readOnly?: boolean}}
 */
export function guideIn(guide, lang) {
  const pack = GUIDE_LANGS[lang];
  if (!pack) return guide;
  const body = parse(guide.content);
  const blocks = wordBlocks(body);
  if (pack.blocks.length !== blocks.length) return guide;
  const holder = body.ownerDocument.createElement('div');
  for (let i = 0; i < blocks.length; i += 1) {
    // null: the same in every language (font names, the code languages).
    if (pack.blocks[i] === null) continue;
    holder.innerHTML = pack.blocks[i];
    // One element for one element, of the same kind: a list stays a list.
    if (holder.children.length !== 1 || holder.firstElementChild.tagName !== blocks[i].tagName) return guide;
    blocks[i].replaceWith(holder.firstElementChild);
  }
  const shapeWords = [...body.querySelectorAll('.shape-text')];
  if (pack.shapes.length === shapeWords.length) shapeWords.forEach((el, i) => { el.textContent = pack.shapes[i]; });
  return { ...guide, title: pack.title, content: body.innerHTML };
}

/**
 * A title the guide stood under in a build and stands under no longer: the
 * Polish one declined the app's name ("Witaj w Nebuli") — the owner: "do not
 * change the Nebula name". A vault's guide still under it is still the guide.
 */
const FORMER_TITLES = ['Witaj w Nebuli – przewodnik'];

/** The guide's title in every language — how a vault's guide is recognised. */
export function guideTitles(guide) {
  return [guide.title, ...Object.values(GUIDE_LANGS).map((pack) => pack.title), ...FORMER_TITLES];
}
