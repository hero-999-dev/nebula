/**
 * A note as older versions and pasting left them, for the long-note trials.
 *
 * The trials used to run on the guide and on articles this same version had
 * just written — notes that can hold nothing an older version left behind. On
 * copies of the owner's own notes (0.9.1) most trials failed, on structures
 * none of those notes had: every word inside the font picker's spans, lines of
 * a list item joined by <br>, a paragraph ending in a no-break space right
 * above a picture and a list, anchors stamped on blocks by an arrow that is
 * long gone, an empty canvas, a picture saved selected. This note is written
 * by hand to hold exactly those structures; its words are made up.
 */

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const FONT = 'data-font-family="Noto Serif, Times New Roman, serif" style="font-size: 14px; font-family: &quot;Noto Serif&quot;, &quot;Times New Roman&quot;, serif;"';
const figure = (anchor) => `<figure class="note-image note-image--inline" contenteditable="false" data-block-type="image" data-ratio="2" style="width: 320px;" data-anchor="${anchor}"><img src="${PIXEL}" alt="Pasted image" draggable="false"><span class="image-h" title="Resize image"></span></figure>`;

export const OLD_NOTE = {
  name: 'old-note',
  title: 'An old note',
  content: [
    // An empty canvas an older version left after its last shape went, and a picture saved selected.
    '<div class="shape-layer shape-layer--behind" contenteditable="false" data-block-type="shape-layer"></div>',
    `<div class="shape-layer" contenteditable="false" data-block-type="shape-layer"><figure class="note-image sel" contenteditable="false" data-block-type="image" data-ratio="2" style="width: 200px; left: 20px; top: 900px; height: 100px;"><img src="${PIXEL}" alt="Pasted image" draggable="false"><span class="image-h" title="Resize image"></span></figure></div>`,
    '<h1 data-anchor="a-old001">Lighthouse keeping, a working list</h1>',
    '<hr class="blk-hr">',
    // A paragraph that ends in a no-break space, right above a picture that stands on its own and a list.
    '<p data-anchor="a-old002">the lamp room needs its brass polished before the inspector arrives on the first calm morning of the month&nbsp;</p>',
    figure('a-old003'),
    '<ul><li data-anchor="a-old004">wind the clockwork that turns the lens and write the hour in the log with the weather beside it</li><li data-anchor="a-old005">trim the wicks and check the spare mantles in the cupboard</li></ul>',
    // Every word in the font picker's spans, three lines of one item joined by <br>.
    `<ul><li><span ${FONT}>carry the oil up the stairs before sunset</span></li>`
      + `<li><span ${FONT}>the fog signal is tested at noon on sundays and the result goes into the second book on the shelf by the door</span><br><span ${FONT}>if the horn sounds weak the reed is cleaned with the soft brush and dried</span><br><span ${FONT}>paint the railing every spring and the shutters every other year</span></li></ul>`,
    // Enter copied an anchor onto the lines typed after it.
    '<p data-anchor="a-old006">the gallery rail is loose on the seaward side and should be tied off until the smith can come out</p>',
    '<p data-anchor="a-old006">a gull has nested on the lantern roof again this year and the chicks are loud</p>',
    '<blockquote>a light that is not kept is worse than no light at all, because ships steer by it</blockquote>',
    // A paragraph in a font right above a heading: "/h3" on a new line after it made an
    // empty heading of an empty span, and the words went into the heading below.
    `<p><span ${FONT}>the supply boat comes on thursdays unless the sea is up that week</span></p>`,
    '<h2 data-anchor="a-old007">Charts</h2>',
    '<p>the old admiralty chart hangs in the watch room and the new one is rolled up behind the desk</p>',
  ].join(''),
};
