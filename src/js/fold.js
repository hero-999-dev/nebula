/**
 * Text folded for a case-insensitive search, one UTF-16 unit for one (hunt B19).
 *
 * `toLowerCase` turns the Turkish capital İ (U+0130) into i plus a combining
 * dot — two units for one, the only character in Unicode that grows — so
 * offsets found in the folded text stopped landing on the original, and
 * "istanbul" never found "İstanbul". İ and the dotless ı both fold to i, so a
 * search matches the word however its I was typed. Every other character keeps
 * its length under `toLowerCase`; tests/find.test.js holds that.
 */
export const fold = (text) => String(text ?? '').replace(/[İı]/g, 'i').toLowerCase();
