/**
 * Part 5 of the owner's Ideas note (0.9.4): where a picture in the text
 * stands, pictures side by side, and a divider that splits the page into two
 * columns. The dragging itself is in tests/e2e/layout.mjs.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { alignOf, setAlign, putBeside, leaveRow, rowOf, inRow, tidyRows, pictureBefore, inText, ROW, inWord, putInLine, leaveLine } from '../src/js/image-place.js';
import JSZip from 'jszip';
import {
  cleanSplit, sectionOf, splitAt, unsplit, healColumns, setSplit, MIN_SPLIT, MAX_SPLIT,
  splitsOf, cleanSplits, splitPoint, splitColumn, moveRule, removeRule, leastShare, MAX_COLS, MIN_COL,
} from '../src/js/columns.js';
import { migrateNote } from '../src/js/migrate.js';
import { healHtml } from '../src/js/heal.js';
import { toMarkdown } from '../src/js/export.js';
import { readBlocks, flatBlocks, toDocx, toOdt, toDoc, toEnex, previewDocument } from '../src/js/office.js';
import { serializeNote } from '../src/js/note-markup.js';

/** Three columns, the middle one empty: dividers at 30 and 60 of the line. */
const THREE = '<div class="blk-cols" data-block-type="columns" data-split="30,60" style="--split: 30%;"><div class="blk-col"><p>a</p></div><hr class="blk-vr"><div class="blk-col" style="--w: 30%;"><p><br></p></div><hr class="blk-vr"><div class="blk-col"><p>c</p></div></div>';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const pic = (id) => `<figure class="note-image note-image--inline" contenteditable="false" id="${id}" style="width: 200px;"><img src="${PNG}" alt=""></figure>`;

let root;
const $ = (id) => root.querySelector(`#${id}`);
const order = () => [...root.children].map((e) => e.id || e.tagName.toLowerCase()).join(',');
function note(html) {
  root = document.createElement('div');
  root.innerHTML = html;
  document.body.replaceChildren(root);
  return root;
}

describe('a picture in the text, on its line', () => {
  beforeEach(() => note(`<p id="a">one</p>${pic('p1')}${pic('p2')}<p id="b">two</p>${pic('p3')}<div class="shape-layer"><figure class="note-image" id="free"></figure></div>`));

  it('stands at the left unless it is told otherwise', () => {
    expect(alignOf($('p1'))).toBe('left');
    expect(setAlign($('p1'), 'center')).toBe(true);
    expect($('p1').className).toBe('note-image note-image--inline note-image--center');
    expect(setAlign($('p1'), 'right')).toBe(true);
    expect($('p1').classList.contains('note-image--center')).toBe(false);
    expect(alignOf($('p1'))).toBe('right');
    expect(setAlign($('p1'), 'right')).toBe(false);          // already there
    expect(setAlign($('p1'), 'left')).toBe(true);
    expect($('p1').className).toBe('note-image note-image--inline');
  });

  it('only when it is in the text, and only to a place there is', () => {
    expect(inText($('free'))).toBe(false);
    expect(setAlign($('free'), 'center')).toBe(false);
    expect(setAlign($('p1'), 'justify')).toBe(false);
    expect($('p1').className).toBe('note-image note-image--inline');
  });

  it('goes beside another picture, before it or after it, and both lose their own alignment', () => {
    setAlign($('p1'), 'center');
    expect(putBeside($('p3'), $('p1'), 'after')).toBe(true);
    expect(order()).toBe('a,p1,p3,p2,b,div');
    expect($('p1').classList.contains(ROW) && $('p3').classList.contains(ROW)).toBe(true);
    expect(alignOf($('p1'))).toBe('left');
    expect(rowOf($('p3')).map((e) => e.id)).toEqual(['p1', 'p3']);
    expect(inRow($('p2'))).toBe(false);
    putBeside($('p3'), $('p1'), 'before');
    expect(order()).toBe('a,p3,p1,p2,b,div');
    expect(putBeside($('p1'), $('p1'))).toBe(false);
    expect(putBeside($('free'), $('p1'))).toBe(false);
  });

  it('leaves its row for a line of its own under it, and a row of one is no row', () => {
    putBeside($('p2'), $('p1'), 'after');
    putBeside($('p3'), $('p2'), 'after');
    expect(rowOf($('p1'))).toHaveLength(3);
    leaveRow($('p1'));                                        // from the middle or the start: under the row
    expect(order()).toBe('a,p2,p3,p1,b,div');
    expect($('p1').classList.contains(ROW)).toBe(false);
    expect(rowOf($('p2'))).toHaveLength(2);
    leaveRow($('p3'));
    expect($('p2').classList.contains(ROW)).toBe(false);      // nobody left to share the line with
    expect(root.querySelector(`.${ROW}`)).toBeNull();
  });

  it('each picture of a row knows how many share the line, so a third fits as two do', () => {
    const shares = () => ['p1', 'p2', 'p3'].map((id) => $(id).style.getPropertyValue('--row') || '-').join(' ');
    putBeside($('p2'), $('p1'), 'after');
    expect(shares()).toBe('2 2 -');
    putBeside($('p3'), $('p2'), 'after');
    expect(shares()).toBe('3 3 3');
    leaveRow($('p3'));
    expect(shares()).toBe('2 2 -');
    // A row written by the first test build has the class and no count: it is counted on load.
    $('p1').style.removeProperty('--row');
    tidyRows(root);
    expect(shares()).toBe('2 2 -');
    leaveRow($('p2'));
    expect(shares()).toBe('- - -');
    expect($('p1').getAttribute('style')).toBe('width: 200px;');
  });

  it('and what the others take of the line, so one beside a narrow picture may have the room that is left', () => {
    const beside = () => ['p1', 'p2', 'p3'].map((id) => $(id).style.getPropertyValue('--beside') || '-').join(' ');
    $('p1').style.width = '651px';
    $('p2').style.width = '759px';
    $('p3').style.width = '300.4px';
    putBeside($('p2'), $('p1'), 'after');
    expect(beside()).toBe('771px 663px -');                   // the other's width and its gap of 12
    // While one is resized the other is told (rich-paste.js calls this on every move).
    $('p2').style.width = '868px';
    tidyRows(root);
    expect(beside()).toBe('880px 663px -');
    putBeside($('p3'), $('p2'), 'after');
    expect(beside()).toBe('1193px 976px 1543px');
    leaveRow($('p3'));
    leaveRow($('p2'));
    expect(beside()).toBe('- - -');
    expect($('p1').getAttribute('style')).toBe('width: 651px;');
  });

  it('aligning a picture in a row takes it out of the row first', () => {
    putBeside($('p2'), $('p1'), 'after');
    setAlign($('p2'), 'right');
    expect($('p2').className).toBe('note-image note-image--inline note-image--right');
    expect($('p1').classList.contains(ROW)).toBe(false);
  });

  it('a row is tidied when its other picture goes — deleted, cut, set floating', () => {
    putBeside($('p2'), $('p1'), 'after');
    $('p1').remove();
    tidyRows(root);
    expect($('p2').classList.contains(ROW)).toBe(false);
    expect(pictureBefore($('p2'))).toBeNull();
    expect(pictureBefore($('p3'))).toBeNull();                // a line of words stands between
  });
});

describe('where a divider may stand', () => {
  it('is a whole share of the line, never a sliver, a little sticky at the half and the thirds', () => {
    expect(cleanSplit(49.4)).toBe(50);
    expect(cleanSplit(52)).toBe(50);
    expect(cleanSplit(34.6)).toBe(33);
    expect(cleanSplit(66)).toBe(67);
    expect(cleanSplit(41.2)).toBe(41);
    expect(cleanSplit(3)).toBe(MIN_SPLIT);
    expect(cleanSplit(140)).toBe(MAX_SPLIT);
    expect(cleanSplit('nonsense')).toBe(50);
  });
});

describe('the part a divider splits', () => {
  beforeEach(() => note('<div class="shape-layer"></div><p id="a">a</p><hr class="blk-hr" id="h0"><h2 id="b">b</h2><p id="c">c</p><p id="d">d</p><hr class="blk-hr" id="h"><p id="e">e</p><p id="f">f</p><hr class="blk-hr" id="h9"><p id="g">g</p>'));
  const ids = (els) => els.map((e) => e.id).join(',');

  it('is everything up to the divider above — pulled straight sideways, or upward', () => {
    expect(ids(sectionOf($('h')))).toBe('b,c,d');
    expect(ids(sectionOf($('h'), 'above'))).toBe('b,c,d');
  });

  it('or down to the divider below, with the pointer held lower', () => {
    expect(ids(sectionOf($('h'), 'below'))).toBe('e,f');
  });

  it('starts at the line the pointer is over, so less can be taken', () => {
    expect(ids(sectionOf($('h'), 'above', $('c')))).toBe('c,d');
    expect(ids(sectionOf($('h'), 'below', $('e')))).toBe('e');
    expect(ids(sectionOf($('h'), 'above', $('a')))).toBe('b,c,d');   // a line of another part does not count
  });

  it('is the other side where its own is empty, and stops at columns too', () => {
    expect(ids(sectionOf($('h0'), 'below'))).toBe('b,c,d');
    expect(ids(sectionOf($('h9')))).toBe('e,f');
    expect(ids(sectionOf($('h9'), 'below'))).toBe('g');
    splitAt(sectionOf($('h')), $('h'), 50);
    expect(ids(sectionOf($('h9')))).toBe('e,f');
    $('e').remove(); $('f').remove();
    expect(ids(sectionOf($('h9')))).toBe('g');                         // nothing between it and the columns: the part under it
  });
});

describe('splitting', () => {
  beforeEach(() => note('<p id="a">a</p><hr class="blk-hr" id="h0"><h2 id="b">b</h2><p id="c">c</p><p id="blank"><br></p><hr class="blk-hr" id="h"><p id="e">e</p>'));

  it('makes two columns with the divider upright between them, what was there at the left', () => {
    const { cols, empty } = splitAt(sectionOf($('h')), $('h'), 50);
    expect(order()).toBe('a,h0,div,blank,e');
    expect(cols.className).toBe('blk-cols');
    expect(cols.dataset.split).toBe('50');
    expect(cols.style.getPropertyValue('--split')).toBe('50%');
    expect([...cols.children].map((e) => `${e.tagName}.${e.className}`)).toEqual(['DIV.blk-col', 'HR.blk-vr', 'DIV.blk-col']);
    expect([...cols.children[0].children].map((e) => e.id)).toEqual(['b', 'c']);   // the empty line at the end stays a line under the columns
    expect(empty).toBe(cols.children[2]);
    expect(empty.innerHTML).toBe('<p><br></p>');
    expect(root.querySelector('#h')).toBeNull();               // the dragged divider is the upright one now
    expect(root.querySelectorAll('hr')).toHaveLength(2);
  });

  it('gives what was there the wider side', () => {
    const { cols, empty } = splitAt(sectionOf($('h')), $('h'), 30);
    expect(cols.dataset.split).toBe('30');
    expect(empty).toBe(cols.children[0]);
    expect([...cols.children[2].children].map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('with nothing to split still makes two columns to write in, and a line under them at the end of the note', () => {
    note('<hr class="blk-hr" id="h">');
    const { cols } = splitAt([], $('h'), 50);
    expect(cols.children[0].innerHTML).toBe('<p><br></p>');
    expect(cols.children[2].innerHTML).toBe('<p><br></p>');
    expect(order()).toBe('div,p');
  });

  it('is taken back by deleting the divider: one flow, left first, no empty column left behind', () => {
    const before = root.innerHTML.replace('<hr class="blk-hr" id="h">', '');
    const { cols } = splitAt(sectionOf($('h')), $('h'), 50);
    const first = unsplit(cols);
    expect(first.id).toBe('b');
    expect(root.innerHTML).toBe(before);
    // Both written in: left, then right.
    note('<p id="x">x</p><hr class="blk-hr" id="h">');
    const made = splitAt(sectionOf($('h')), $('h'), 60);
    made.empty.innerHTML = '<p id="y">y</p><ul><li>z</li></ul>';
    unsplit(made.cols);
    expect(root.innerHTML).toBe('<p id="x">x</p><p id="y">y</p><ul><li>z</li></ul><p><br></p>');
  });

  it('moves the divider between a fifth and four fifths', () => {
    const { cols } = splitAt([], $('h'), 50);
    expect(setSplit(cols, 5)).toBe(20);
    expect(cols.style.getPropertyValue('--split')).toBe('20%');
    expect(setSplit(cols, 71.4)).toBe(71);
  });
});

describe('columns put right', () => {
  const COLS = '<div class="blk-cols" data-block-type="columns" data-split="40" style="--split: 40%;"><div class="blk-col"><p id="l">left</p></div><hr class="blk-vr"><div class="blk-col"><p id="r">right</p></div></div>';

  it('leaves well-made columns exactly as they are', () => {
    note(`<p>a</p>${COLS}<p>b</p>`);
    const before = root.innerHTML;
    expect(healColumns(root)).toBe(0);
    expect(root.innerHTML).toBe(before);
  });

  it('gives an emptied column its line back, and the divider its place', () => {
    note('<div class="blk-cols" data-split="40"><div class="blk-col"></div><div class="blk-col">loose words<br></div></div>');
    expect(healColumns(root)).toBe(1);
    const cols = root.firstElementChild;
    expect([...cols.children].map((e) => e.className)).toEqual(['blk-col', 'blk-vr', 'blk-col']);
    expect(cols.children[0].innerHTML).toBe('<p><br></p>');
    expect(cols.children[2].innerHTML).toBe('<p>loose words</p>');
    expect(cols.style.getPropertyValue('--split')).toBe('40%');
    expect(healColumns(root)).toBe(0);                          // and once is enough
  });

  it('puts a block that lost a column back into one flow, losing no word', () => {
    note('<p>a</p><div class="blk-cols"><div class="blk-col"><p>only</p><p>one</p></div><hr class="blk-vr"></div><p>b</p>');
    healColumns(root);
    expect(root.innerHTML).toBe('<p>a</p><p>only</p><p>one</p><p>b</p>');
    note('<div class="blk-col"><p>stray</p></div><hr class="blk-vr"><p>b</p>');
    healColumns(root);
    expect(root.innerHTML).toBe('<p>stray</p><p>b</p>');
  });

  it('takes words typed between the columns into the left one, and a split out of range back in', () => {
    note('<div class="blk-cols" data-split="97">typed here<div class="blk-col"><p>l</p></div><hr class="blk-vr"><hr class="blk-vr"><div class="blk-col"><p>r</p></div></div>');
    healColumns(root);
    const cols = root.firstElementChild;
    expect(cols.children).toHaveLength(3);
    expect(cols.children[0].textContent).toBe('ltyped here');
    expect(cols.dataset.split).toBe('80');
  });

  it('does not let columns stand inside columns', () => {
    note(`<div class="blk-cols" data-split="50"><div class="blk-col">${COLS}</div><hr class="blk-vr"><div class="blk-col"><p>x</p></div></div>`);
    healColumns(root);
    expect(root.querySelectorAll('.blk-cols')).toHaveLength(1);
    expect(root.querySelector('.blk-col').textContent).toBe('leftright');
  });

  it('survives the migration of old notes untouched, empty columns included', () => {
    const html = `<p>a</p>${COLS.replace('<p id="r">right</p>', '<p><br></p><p><br></p>')}<p>b</p>`;
    note(html);
    migrateNote(root);
    expect(root.innerHTML).toBe(html);
    const healed = healHtml(html);
    expect(healed.safe).toBe(true);
    expect(healed.changed).toBe(false);
  });

  it('is saved without the pick: an armed upright divider is the screen’s, not the note’s', () => {
    note(COLS);
    root.querySelector('hr').classList.add('armed');
    expect(serializeNote(root)).toBe(COLS);
  });
});

describe('columns in a file for another program', () => {
  const html = '<p>above</p><div class="blk-cols" data-split="50" style="--split: 50%;"><div class="blk-col"><h2>Left</h2><p>one</p></div><hr class="blk-vr"><div class="blk-col"><p>two</p><ul><li>three</li></ul></div></div><p>below</p>';

  it('are one flow in Markdown, a rule between what was left and what was right', () => {
    expect(toMarkdown(html)).toBe('above\n\n## Left\n\none\n\n---\n\ntwo\n\n- three\n\nbelow\n');
  });

  it('and for a format with no columns: left, a rule, right', () => {
    const blocks = flatBlocks(readBlocks(html));
    expect(blocks.map((b) => b.type)).toEqual(['para', 'heading', 'para', 'hr', 'para', 'list', 'para']);
    expect(blocks[4].runs[0].text).toBe('two');
    expect(toEnex(html, 'T')).toMatch(/<div>one<\/div><hr\/><div>two<\/div>/);
  });

  it('are columns in Word, OpenDocument and Rich Text, each with its share of the line', async () => {
    const blocks = readBlocks(html);
    expect(blocks.map((b) => b.type)).toEqual(['para', 'columns', 'para']);
    expect(blocks[1].cols.map((c) => [c.share, c.blocks.map((b) => b.type).join()])).toEqual([[50, 'heading,para'], [50, 'para,list']]);
    const three = readBlocks(THREE);
    expect(three[0].cols.map((c) => c.share)).toEqual([30, 30, 40]);
    expect(three[0].cols[1].blocks).toEqual([{ type: 'para', runs: [] }]);   // a column nobody wrote in: its empty line

    const docx = await (await JSZip.loadAsync(await toDocx(THREE, 'T'))).file('word/document.xml').async('string');
    const grid = [...docx.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]));
    expect(grid).toHaveLength(3);
    expect(grid[0]).toBe(grid[1]);
    expect(Math.round((grid[2] / grid[0]) * 30)).toBe(40);
    expect(docx.match(/<w:tc>/g)).toHaveLength(3);
    expect(docx).toMatch(/<w:insideV w:val="single"/);
    // Every cell ends with a paragraph, the empty one too, and so does the document.
    expect(docx).not.toMatch(/<\/w:tcPr><\/w:tc>/);
    expect(docx).toMatch(/<\/w:tbl><w:p\/><w:sectPr>/);
    expect(new DOMParser().parseFromString(docx, 'application/xml').querySelector('parsererror')).toBeNull();

    const odt = await (await JSZip.loadAsync(await toOdt(THREE, 'T'))).file('content.xml').async('string');
    expect(odt.match(/<table:table-cell /g)).toHaveLength(3);
    expect(odt.match(/style:family="table-column"/g)).toHaveLength(3);
    expect(odt).toMatch(/table:style-name="ColFirst"[^>]*><text:p text:style-name="Standard">a<\/text:p>/);
    expect(new DOMParser().parseFromString(odt, 'application/xml').querySelector('parsererror')).toBeNull();

    const rtf = toDoc(THREE, 'T');
    expect(rtf.match(/\\cellx\d+/g)).toHaveLength(3);
    expect(rtf.match(/\\cell\}/g)).toHaveLength(3);
    expect(rtf).toMatch(/\\pard\\intbl[^{}]* \{a\}\\cell\}/);
    expect(rtf).toMatch(/\\row\}\n\}$/);
    // Braces balance: a reader that loses count shows nothing after the table.
    const plain = rtf.replace(/\\[\\{}]/g, '');
    expect(plain.split('{').length).toBe(plain.split('}').length);
    expect(previewDocument(THREE, 'T')).toMatch(/<table class="cols"><tr><td style="width:30%"><p>a<\/p><\/td><td style="width:30%"><p><br><\/p><\/td><td style="width:40%">/);
  });
});

describe('more than two columns', () => {
  const two = () => note('<p id="top">top</p><div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;"><div class="blk-col" id="L"><p>left</p><hr class="blk-hr" id="in"><p>more</p></div><hr class="blk-vr"><div class="blk-col" id="R"><p>right</p></div></div><p id="end">end</p>');
  const shape = () => [...root.querySelector('.blk-cols').children].map((e) => (e.matches('hr') ? '|' : e.textContent || '·')).join('');

  it('knows where the dividers of a block stand, and puts places that cannot be right', () => {
    expect(splitsOf(note('<div class="blk-cols" data-split="33,67"></div>').firstElementChild)).toEqual([33, 67]);
    expect(splitsOf(note('<div class="blk-cols" data-split="40"></div>').firstElementChild)).toEqual([40]);
    expect(splitsOf(note('<div class="blk-cols"></div>').firstElementChild)).toEqual([]);
    expect(cleanSplits([40], 2)).toEqual([40]);
    expect(cleanSplits([97], 2)).toEqual([MAX_SPLIT]);
    expect(cleanSplits([33, 67], 3)).toEqual([33, 67]);
    expect(cleanSplits([50], 3)).toEqual([33, 67]);              // one place for three columns: evenly
    expect(cleanSplits([], 4)).toEqual([25, 50, 75]);
    expect(cleanSplits([2, 3], 3)).toEqual([MIN_COL, 2 * MIN_COL]);
    expect(cleanSplits([95, 99], 3)).toEqual([100 - 2 * MIN_COL, 100 - MIN_COL]);
  });

  it('cuts a column in two where the pointer is: what it held keeps the wider part', () => {
    two();
    expect(splitPoint($('R'), 80)).toBe(80);
    expect(splitPoint($('R'), 74)).toBe(75);                    // the middle of the column is a little sticky
    expect(splitPoint($('R'), 99)).toBe(100 - MIN_COL);
    const made = splitColumn($('R'), 80, $('in'));
    expect(shape()).toBe('leftmore|right|·');
    expect(made.empty).toBe(made.cols.lastElementChild);
    expect(made.cols.dataset.split).toBe('50,80');
    expect($('R').style.getPropertyValue('--w')).toBe('30%');
    expect(root.querySelector('#in')).toBeNull();               // the divider that was dragged is the upright one now
    expect(healColumns(root)).toBe(0);
    // Cut near its left edge, the new column stands at the left of what was there.
    splitColumn($('L'), 4, null, 15);
    expect(shape()).toBe('·|leftmore|right|·');
    expect(made.cols.dataset.split).toBe('15,50,80');
    expect($('L').style.getPropertyValue('--w')).toBe('35%');
    expect(healColumns(root)).toBe(0);
  });

  it('holds as many columns as the line has room for: none is made narrower than its least', () => {
    two();
    // No count stops it: a column is cut for as long as both parts keep the least share.
    for (let i = 0; i < 40; i += 1) {
      const widest = [...root.querySelectorAll('.blk-col')].map((col, n, all) => {
        const at = [0, ...splitsOf(root.querySelector('.blk-cols')), 100];
        return { col, w: at[n + 1] - at[n], mid: (at[n] + at[n + 1]) / 2, all };
      }).sort((a, b) => b.w - a.w)[0];
      if (!splitColumn(widest.col, widest.mid)) break;
    }
    const made = root.querySelectorAll('.blk-col').length;
    expect(made).toBeGreaterThan(4);
    expect(made).toBeLessThanOrEqual(MAX_COLS);
    const at = [0, ...splitsOf(root.querySelector('.blk-cols')), 100];
    expect(Math.min(...at.slice(1).map((p, i) => p - at[i]))).toBeGreaterThanOrEqual(MIN_COL);
    expect(healColumns(root)).toBe(0);
    // On the screen the least is a few words' room, which a narrow line makes a larger share of it.
    expect(leastShare(1000)).toBe(8);
    expect(leastShare(400)).toBe(20);
    expect(leastShare(100_000)).toBe(MIN_COL);
    expect(leastShare(0)).toBe(MIN_COL);
    two();
    expect(splitPoint($('L'), 10, 20)).toBe(20);
    expect(splitPoint($('L'), 10, 26)).toBeNull();              // half the line is too narrow for two of 26
    expect(splitPoint($('R'), 97, 20)).toBe(80);
    expect(splitPoint($('R'), 97)).toBe(100 - MIN_COL);
  });

  it('gives a column left with nothing a line when the divider dragged out was all it held', () => {
    note('<div class="blk-cols" data-split="50"><div class="blk-col" id="L"><hr class="blk-hr" id="in"></div><hr class="blk-vr"><div class="blk-col" id="R"><p>right</p></div></div>');
    splitColumn($('R'), 75, $('in'));
    expect($('L').innerHTML).toBe('<p><br></p>');
  });

  it('moves one upright divider between its neighbours, and the others stay', () => {
    note(THREE);
    const [first, second] = root.querySelectorAll('hr.blk-vr');
    expect(moveRule(second, 71)).toBe(71);
    expect(root.firstElementChild.dataset.split).toBe('30,71');
    expect(moveRule(second, 5)).toBe(30 + MIN_COL);
    expect(moveRule(first, 90)).toBe(30);                        // it cannot pass the one at its right, less a column
    expect(moveRule(second, 99)).toBe(100 - MIN_COL);
    expect(root.firstElementChild.dataset.split).toBe(`30,${100 - MIN_COL}`);
    expect(root.querySelectorAll('.blk-col')[1].style.getPropertyValue('--w')).toBe(`${70 - MIN_COL}%`);
    // With a least share of its own (a narrow line), it stops sooner; where there is no room at all it stays.
    expect(moveRule(second, 99, 20)).toBe(80);
    expect(moveRule(second, 31, 20)).toBe(50);
    expect(moveRule(second, 99, 40)).toBe(50);
  });

  it('joins the two columns at the sides of an upright divider taken away', () => {
    note(THREE);
    const cols = root.firstElementChild;
    const [first] = root.querySelectorAll('hr.blk-vr');
    removeRule(first);
    expect(shape()).toBe('a|c');                                // the empty column left no line behind
    expect(cols.dataset.split).toBe('60');
    expect(cols.querySelector('.blk-col[style]')).toBeNull();
    expect(healColumns(root)).toBe(0);
    removeRule(root.querySelector('hr.blk-vr'));                // the last one ends the columns
    expect(root.innerHTML).toBe('<p>a</p><p>c</p>');
  });

  it('gives a column that ends with a picture, a divider or a code block a line to write on under it', () => {
    note(`<div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;"><div class="blk-col">${pic('p1')}</div><hr class="blk-vr"><div class="blk-col"><p>words</p>${pic('p2')}</div></div>`);
    expect(healColumns(root)).toBe(1);
    const [left, right] = root.querySelectorAll('.blk-col');
    expect([...left.children].map((e) => e.tagName)).toEqual(['FIGURE', 'P']);
    expect([...right.children].map((e) => e.tagName)).toEqual(['P', 'FIGURE', 'P']);
    expect(left.lastElementChild.innerHTML).toBe('<br>');
    expect(healColumns(root)).toBe(0);
    note('<div class="blk-cols" data-block-type="columns" data-split="50" style="--split: 50%;"><div class="blk-col"><p>a</p><hr class="blk-hr"></div><hr class="blk-vr"><div class="blk-col"><p>b</p></div></div>');
    healColumns(root);
    expect([...root.querySelector('.blk-col').children].map((e) => e.tagName)).toEqual(['P', 'HR', 'P']);
  });

  it('puts three and more columns right, and takes one too many into the last', () => {
    note('<div class="blk-cols" data-split="33,67"><div class="blk-col"><p>a</p></div><div class="blk-col"></div><hr class="blk-vr"><hr class="blk-vr"><div class="blk-col"><p>c</p></div></div>');
    expect(healColumns(root)).toBe(1);
    expect(shape()).toBe('a|·|c');
    expect(root.querySelectorAll('.blk-col')[1].style.getPropertyValue('--w')).toBe('34%');
    expect(healColumns(root)).toBe(0);
    const col = (t) => `<div class="blk-col"><p>${t}</p></div>`;
    note(`<div class="blk-cols" data-split="50">${['a', 'b', 'c', 'd', 'e'].map(col).join('<hr class="blk-vr">')}</div>`);
    healColumns(root);
    expect(shape()).toBe('a|b|c|d|e');
    expect(root.firstElementChild.dataset.split).toBe('20,40,60,80');
    expect(healColumns(root)).toBe(0);
    note(`<div class="blk-cols" data-split="50">${Array.from({ length: MAX_COLS + 2 }, (_, i) => col(`c${i}`)).join('<hr class="blk-vr">')}</div>`);
    healColumns(root);
    expect(root.querySelectorAll('.blk-col')).toHaveLength(MAX_COLS);
    expect(root.querySelector('.blk-col:last-child').textContent).toBe(`c${MAX_COLS - 1}c${MAX_COLS}c${MAX_COLS + 1}`);
    expect(healColumns(root)).toBe(0);
  });

  it('survives saving, migration and healing as it is', () => {
    note(THREE);
    healColumns(root);
    const html = root.innerHTML;
    expect(serializeNote(root)).toBe(html);
    migrateNote(root);
    expect(root.innerHTML).toBe(html);
    const healed = healHtml(html);
    expect(healed.safe).toBe(true);
    expect(healed.changed).toBe(false);
    expect(toMarkdown(html)).toBe('a\n\n---\n\n---\n\nc\n');
  });
});

describe('where a picture stands, in a file for a word processor', () => {
  const at = (cls) => `<figure class="note-image note-image--inline${cls}" contenteditable="false" style="width: 120px;"><img src="${PNG}" alt=""><figcaption class="image-caption">cap</figcaption></figure>`;
  const html = `<p>t</p>${at('')}${at(' note-image--center')}${at(' note-image--right')}<div class="image-layer"><figure class="note-image" style="left: 10px; top: 20px; width: 120px;"><img src="${PNG}" alt=""></figure></div>`;

  it('reads the side of a picture in the text; one floating on the page stays in the middle', () => {
    expect(readBlocks(html).filter((b) => b.type === 'image').map((b) => b.align)).toEqual(['left', 'center', 'right', 'center']);
  });

  it('is written at that side by Word, OpenDocument and Rich Text, its caption with it', async () => {
    const docx = await (await JSZip.loadAsync(await toDocx(html, 'T'))).file('word/document.xml').async('string');
    expect([...docx.matchAll(/<w:p><w:pPr><w:jc w:val="(\w+)"\/><\/w:pPr><w:r><w:drawing>/g)].map((m) => m[1])).toEqual(['left', 'center', 'right', 'center']);
    expect([...docx.matchAll(/<w:pStyle w:val="Caption"\/><w:jc w:val="(\w+)"\/>/g)].map((m) => m[1])).toEqual(['left', 'center', 'right']);
    const odt = await (await JSZip.loadAsync(await toOdt(html, 'T'))).file('content.xml').async('string');
    expect([...odt.matchAll(/<text:p text:style-name="([\w]+)"><draw:frame/g)].map((m) => m[1])).toEqual(['Standard', 'Centered', 'Flush_20_Right', 'Centered']);
    expect([...odt.matchAll(/<text:p text:style-name="(Caption\w*)">/g)].map((m) => m[1])).toEqual(['Caption_20_Left', 'Caption', 'Caption_20_Right']);
    const rtf = toDoc(html, 'T');
    expect([...rtf.matchAll(/\\pard\\(q[lcr])\{\\pict/g)].map((m) => m[1])).toEqual(['ql', 'qc', 'qr', 'qc']);
    expect([...previewDocument(html, 'T').matchAll(/<p class="(\w+)"><img/g)].map((m) => m[1])).toEqual(['left', 'center', 'right', 'center']);
  });

  it('keeps pictures that share a line on one line, each no wider than its share', async () => {
    const row = `${at(' note-image--row')}${at(' note-image--row')}${at(' note-image--row')}<p>after</p>${at('')}`;
    const docx = await (await JSZip.loadAsync(await toDocx(row, 'T'))).file('word/document.xml').async('string');
    const lines = docx.split('<w:p>').filter((p) => p.includes('<w:drawing>')).map((p) => p.match(/<w:drawing>/g).length);
    expect(lines).toEqual([3, 1]);
    expect(docx).toMatch(/cap<\/w:t><\/w:r><w:r>.*? · <\/w:t><\/w:r><w:r>.*?cap/);
    const odt = await (await JSZip.loadAsync(await toOdt(row, 'T'))).file('content.xml').async('string');
    expect(odt).toMatch(/<text:p text:style-name="Standard">(<draw:frame.*?<\/draw:frame> ?){3}<\/text:p>/);
    // On a line too narrow for the three, each takes its share of it.
    const narrow = await (await JSZip.loadAsync(await toDocx(row, 'T', { w: 100, h: 148, margin: 10 }))).file('word/document.xml').async('string');
    const widths = [...narrow.matchAll(/<wp:extent cx="(\d+)"/g)].map((m) => Number(m[1]) / 9525);
    expect(widths.slice(0, 3).every((w) => w < 120 && Math.abs(w - ((80 * 96) / 25.4 - 1) / 3 + 12) < 0.01)).toBe(true);
    expect(widths[3]).toBe(120);
  });
});

describe('a picture standing in a line of words', () => {
  const captioned = '<figure class="note-image note-image--inline note-image--center" contenteditable="false" data-block-type="image" data-ratio="1" id="p1" style="width: 80px;"><img src="x.png" alt=""><span class="image-h" data-corner="se"></span><figcaption class="image-caption">cap</figcaption></figure>';

  it('goes to the end of the line before it, as a character of that line', () => {
    note(`<p id="a">one</p>${captioned}<p id="b">two</p>`);
    const span = putInLine($('p1'));
    expect(span.tagName).toBe('SPAN');
    expect(inWord(span)).toBe(true);
    expect(inText(span)).toBe(true);
    expect(span.parentElement).toBe($('a'));
    expect(order()).toBe('a,b');
    // It keeps what it is — its width, its shape, its handles — but not what only a block has.
    expect(span.outerHTML).toBe('<span class="note-image note-image--inline note-image--inword" contenteditable="false" data-ratio="1" id="p1" style="width: 80px;"><img src="x.png" alt=""><span class="image-h" data-corner="se"></span></span>');
    expect($('a').firstChild.nodeValue).toBe('one');
    // Read back from a file it is still in its paragraph: a figure would have ended it.
    const again = document.createElement('div');
    again.innerHTML = root.innerHTML;
    expect(again.innerHTML).toBe(root.innerHTML);
    expect(again.querySelector('#a > #p1')).not.toBeNull();
  });

  it('takes the place of an empty line’s break, or the start of the line after it, or a line of its own', () => {
    note(`<p id="a"><br></p>${pic('p1')}<p id="b">two</p>`);
    putInLine($('p1'));
    expect($('a').innerHTML).toBe($('p1').outerHTML);
    note(`<ul><li>x</li></ul>${pic('p1')}<p id="b">two</p>`);
    putInLine($('p1'));
    expect($('b').firstChild).toBe($('p1'));
    expect($('b').textContent).toBe('two');
    note(`<hr>${pic('p1')}<hr>`);
    putInLine($('p1'));
    expect(root.innerHTML).toBe(`<hr><p>${$('p1').outerHTML}</p><hr>`);
  });

  it('moves to a caret, and the line it was alone on is an empty line again', () => {
    note(`<p id="a">${pic('p1').replace('<figure', '<span').replace('</figure>', '</span>').replace('note-image--inline', 'note-image--inline note-image--inword')}</p><p id="b">hello world</p>`);
    const r = document.createRange();
    r.setStart($('b').firstChild, 5);
    putInLine($('p1'), r);
    expect($('a').innerHTML).toBe('<br>');
    expect([...$('b').childNodes].map((n) => n.nodeValue ?? n.id)).toEqual(['hello', 'p1', ' world']);
  });

  it('has no side, no row and no picture before it while it stands in a line', () => {
    note(`<p id="a">one</p>${pic('p1')}${pic('p2')}`);
    const span = putInLine($('p1'));
    expect(setAlign(span, 'right')).toBe(false);
    expect(putBeside(span, $('p2'))).toBe(false);
    expect(putBeside($('p2'), span)).toBe(false);
    expect(pictureBefore(span)).toBeNull();
    expect(inRow(span)).toBe(false);
    tidyRows(root);
    expect(span.classList.contains(ROW)).toBe(false);
  });

  it('leaves its line for a line of its own under it — in its place, when it stood there alone', () => {
    note(`<p id="a">one</p>${pic('p1')}<p id="b">two</p>`);
    const before = root.innerHTML;
    const figure = leaveLine(putInLine($('p1')));
    expect(figure.tagName).toBe('FIGURE');
    expect(inWord(figure)).toBe(false);
    expect(figure.dataset.blockType).toBe('image');
    expect(order()).toBe('a,p1,b');
    expect($('a').innerHTML).toBe('one');
    expect(before).toContain(figure.innerHTML);
    note(`<hr>${pic('p1')}<hr>`);
    leaveLine(putInLine($('p1')));
    expect(order()).toBe('hr,p1,hr');
    // Out of a list item it stands under the list, not inside it.
    note(`<ul id="l"><li>x ${pic('p1').replace('<figure', '<span').replace('</figure>', '</span>').replace('note-image--inline', 'note-image--inline note-image--inword')}</li><li>y</li></ul>`);
    leaveLine($('p1'));
    expect(order()).toBe('l,p1');
    expect($('l').textContent).toBe('x y');
  });

  it('is a picture of its line in Markdown, Word, OpenDocument, Rich Text and Evernote', async () => {
    const html = `<p>before <span class="note-image note-image--inline note-image--inword" contenteditable="false" data-ratio="1" style="width: 40px;"><img src="${PNG}" alt=""><span class="image-h" data-corner="se"></span></span> after</p>`;
    expect(toMarkdown(html)).toBe(`before ![](${PNG}) after\n`);
    const blocks = readBlocks(html);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].runs.map((r) => (r.pic ? 'PIC' : r.text))).toEqual(['before ', 'PIC', ' after']);
    const docx = await (await JSZip.loadAsync(await toDocx(html, 'T'))).file('word/document.xml').async('string');
    expect(docx).toMatch(/<w:p><w:r><w:t xml:space="preserve">before <\/w:t><\/w:r><w:r><w:drawing>.*?<\/w:drawing><\/w:r><w:r><w:t xml:space="preserve"> after<\/w:t><\/w:r><\/w:p>/);
    expect(docx).toMatch(new RegExp(`<wp:extent cx="${40 * 9525}" cy="${40 * 9525}"/>`));
    const odt = await (await JSZip.loadAsync(await toOdt(html, 'T'))).file('content.xml').async('string');
    expect(odt).toMatch(/<text:p text:style-name="Standard">before <draw:frame[^>]*text:anchor-type="as-char"[^>]*>.*?<\/draw:frame> after<\/text:p>/);
    expect(toDoc(html, 'T')).toMatch(/\{before \}\{\\pict\\pngblip[^}]*\}\{ after\}\\par\}/);
    expect(toEnex(html, 'T')).toMatch(/<div>before <en-media type="image\/png" hash="[0-9a-f]{32}"\/> after<\/div>/);
    expect(previewDocument(html, 'T')).toMatch(/<p>before <img [^>]*style="width:40px;height:40px"[^>]*> after<\/p>/);
  });
});
