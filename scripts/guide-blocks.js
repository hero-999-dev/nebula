/**
 * The guide's translatable blocks, numbered — what a translation file
 * (src/js/guide-<lang>.js) holds one entry for, in this order.
 *
 *   node scripts/guide-blocks.js            every block, as the English has it
 *   node scripts/guide-blocks.js --check    which translations are short or long
 *
 * A block is a top-level element of the guide that holds words: a heading, a
 * paragraph, a list, a quote, a to-do, a toggle. Dividers, the shapes' stage,
 * code samples and the shape layers are not translated (the three words inside
 * the shapes are `shapes` in each file).
 */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const { GUIDE_NOTE, GUIDE_VERSION, guideFor, guideSignature } = await import('../src/js/seed-notes.js');
const { guideBlocks, GUIDE_LANGS } = await import('../src/js/guide-i18n.js');

const blocks = guideBlocks(GUIDE_NOTE.content);
if (process.argv.includes('--signatures')) {
  // What GUIDE_SIGNATURES in seed-notes.js must hold for this version.
  for (const lang of ['en', ...Object.keys(GUIDE_LANGS)]) {
    const guide = guideFor(lang);
    console.log(`  '${GUIDE_VERSION}${lang === 'en' ? '' : ` ${lang}`}': '${guideSignature(guide.content)}',   // ${guide.title}`);
  }
} else if (process.argv.includes('--check')) {
  for (const [lang, pack] of Object.entries(GUIDE_LANGS)) {
    console.log(`${lang}: ${pack.blocks.length} of ${blocks.length} blocks, ${pack.shapes.length} shape words`);
  }
} else {
  blocks.forEach((html, i) => console.log(`${String(i).padStart(3, '0')} ${html}`));
  console.log(`\n${blocks.length} blocks`);
}
