/**
 * Copy for Discord (1.0.4, src/js/discord-copy.js): the entry in a note's
 * menu, and the card at the bottom right that copies a long note part by part
 * and its pictures one at a time. Nothing is sent; the clipboard here is a
 * stand-in.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import { initDiscordCopy } from '../src/js/discord-copy.js';
import { initNoteActions } from '../src/js/note-actions.js';
import { NoteStore } from '../src/js/notes.js';
import { GUIDE_NOTE } from '../src/js/seed-notes.js';
import { STRINGS, t } from '../src/js/i18n.js';
import { emit } from '../src/js/bus.js';

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

const LONG = Array.from({ length: 45 }, (_, i) => `<p>Paragraph ${i} ${'lorem ipsum dolor sit amet '.repeat(4).trim()}</p>`).join('');
const PICTURES = '<figure class="note-image"><img src="data:image/png;base64,AAAA" alt=""></figure>'
  + '<figure class="note-image"><img src="nebula-media://note/a/p.jpg" alt=""></figure>';

const setUp = (notes, { image = async () => true, locked = () => false, text = async () => {} } = {}) => {
  const store = new NoteStore({ allowSeed: false });
  // Not saved: a black hole's note never goes into the browser's own store.
  store.notes = notes.map((note, i) => ({ createdAt: 1, updatedAt: 5 + i, ...note }));
  const said = [];
  const clip = { text: vi.fn(text), image: image ? vi.fn(image) : null };
  const saveNow = vi.fn(async () => {});
  const discord = initDiscordCopy({ store, saveNow, say: (words) => said.push(words), locked, clip });
  return { store, said, clip, saveNow, discord };
};
const card = () => document.getElementById('discord-copy');
const words = () => card().querySelector('.uc-text').textContent;
const nextButton = () => card().querySelector('[data-discord="next"]');
const leftLines = () => card().querySelector('.discord-left');

describe('Copy for Discord', () => {
  it('puts a short note on the clipboard and says so on a card with nothing more to press', async () => {
    const { clip, saveNow, discord } = setUp([{ id: 'a', title: 'Mine', content: '<p>hello <strong>there</strong></p>' }]);
    expect(await discord.copy('a')).toBe(true);
    // What is being typed is written first.
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(clip.text).toHaveBeenCalledTimes(1);
    expect(clip.text).toHaveBeenCalledWith('# Mine\n\nhello **there**');
    expect(card().hidden).toBe(false);
    expect(words()).toBe('Copied for Discord. Paste it there.');
    expect(nextButton().hidden).toBe(true);
    expect(leftLines().hidden).toBe(true);
    expect(discord.pending).toBe(0);
  });

  it('copies a note longer than one message part by part, each on the card’s button', async () => {
    const { clip, discord } = setUp([{ id: 'a', title: 'Long', content: LONG }]);
    await discord.copy('a');
    const parts = () => clip.text.mock.calls.map(([part]) => part);
    expect(parts().length).toBe(1);
    expect(words()).toBe('Part 1 of 3 copied. Paste it in Discord, then press Next part.');
    expect(nextButton().hidden).toBe(false);
    expect(nextButton().textContent).toBe('Next part');
    expect(discord.pending).toBe(2);

    nextButton().click();
    await vi.waitFor(() => expect(words()).toBe('Part 2 of 3 copied. Paste it in Discord, then press Next part.'));
    nextButton().click();
    await vi.waitFor(() => expect(words()).toBe('Part 3 of 3 copied. Paste it in Discord.'));
    expect(nextButton().hidden).toBe(true);
    expect(parts().length).toBe(3);
    for (const part of parts()) expect(part.length).toBeLessThanOrEqual(2000);
    for (let i = 0; i < 45; i += 1) expect(parts().join('\n')).toContain(`Paragraph ${i} lorem`);
    // Nothing more to copy: the button's handler copies nothing again.
    expect(await discord.next()).toBe(false);
    expect(parts().length).toBe(3);
  });

  it('copies the pictures one at a time after the text, and passes over one the clipboard cannot take', async () => {
    const image = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { clip, discord } = setUp([{ id: 'a', title: '', content: `<p>words</p>${PICTURES}` }], { image });
    await discord.copy('a');
    expect(words()).toBe('Copied for Discord. Paste it there.');
    expect(nextButton().textContent).toBe('Copy picture 1 of 2');
    expect(clip.image).not.toHaveBeenCalled();

    expect(await discord.next()).toBe(true);
    expect(clip.image).toHaveBeenLastCalledWith('data:image/png;base64,AAAA');
    expect(words()).toBe('Picture 1 of 2 copied. Paste it in Discord.');
    expect(nextButton().textContent).toBe('Copy picture 2 of 2');

    expect(await discord.next()).toBe(false);
    expect(clip.image).toHaveBeenLastCalledWith('nebula-media://note/a/p.jpg');
    expect(words()).toBe('Picture 2 of 2 could not be copied.');
    expect(nextButton().hidden).toBe(true);
  });

  it('copies the pictures of a note with no words', async () => {
    const { clip, discord } = setUp([{ id: 'a', title: '', content: PICTURES }]);
    expect(await discord.copy('a')).toBe(true);
    expect(clip.text).not.toHaveBeenCalled();
    expect(words()).toBe('Picture 1 of 2 copied. Paste it in Discord.');
  });

  it('says on the card what the text could not carry', async () => {
    const content = '<p>words</p><div class="shape-layer"><div class="shape rect"></div><svg><path class="arrow-line"></path></svg></div>'
      + '<figure class="note-image note-widget" data-widget="clock"><div>12:00</div></figure>'
      + '<div class="link-block link-attach" data-name="plan.pdf"><a href="nebula-media://note/a/plan.pdf">plan.pdf</a></div>';
    const { discord } = setUp([{ id: 'a', title: '', content }]);
    await discord.copy('a');
    expect(leftLines().hidden).toBe(false);
    expect([...leftLines().childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.nodeValue)).toEqual([
      'Shapes and arrows not in the copy: 2',
      'Widgets not in the copy: 1',
      'Files not in the copy: 1',
    ]);
  });

  it('counts the pictures with what stays behind where no picture can be put on the clipboard', async () => {
    const { discord } = setUp([{ id: 'a', title: '', content: `<p>words</p>${PICTURES}` }], { image: null });
    await discord.copy('a');
    expect(nextButton().hidden).toBe(true);
    expect(leftLines().textContent).toBe('Pictures not in the copy: 2');
  });

  it('copies nothing of a black hole’s note, the guide, a note in the Trash, or anything while Nebula is locked', async () => {
    const notes = [
      { id: 'h', title: 'Sealed', content: '<p>secret</p>', hole: 'z' },
      { id: 'g', title: GUIDE_NOTE.title, content: '<p>guide</p>' },
      { id: 't', title: 'Gone', content: '<p>gone</p>', deletedAt: 9 },
      { id: 'a', title: 'Mine', content: '<p>mine</p>' },
    ];
    const { clip, discord, store } = setUp(notes);
    for (const id of ['h', 'g', 't', 'nobody']) {
      expect(discord.can(store.get(id))).toBe(false);
      expect(await discord.copy(id)).toBe(false);
    }
    expect(discord.can(store.get('a'))).toBe(true);
    expect(clip.text).not.toHaveBeenCalled();
    expect(card()).toBeNull();

    const shut = setUp(notes, { locked: () => true });
    expect(shut.discord.can(shut.store.get('a'))).toBe(false);
    expect(await shut.discord.copy('a')).toBe(false);
    expect(shut.clip.text).not.toHaveBeenCalled();
  });

  it('takes the lock screen in the document as locked', async () => {
    const store = new NoteStore({ allowSeed: false });
    store.notes = [{ id: 'a', title: 'Mine', content: '<p>mine</p>', createdAt: 1, updatedAt: 5 }];
    const discord = initDiscordCopy({ store, say: () => {}, clip: { text: async () => {}, image: null } });
    expect(discord.can(store.get('a'))).toBe(true);
    const screen = document.createElement('div');
    screen.id = 'app-lock';
    document.body.append(screen);
    expect(discord.can(store.get('a'))).toBe(false);
  });

  it('says so where the note has nothing to copy, and shows no card', async () => {
    const { clip, said, discord } = setUp([{ id: 'a', title: '', content: '<p><br></p>' }]);
    expect(await discord.copy('a')).toBe(false);
    expect(said).toEqual(['There is nothing in this note to copy']);
    expect(clip.text).not.toHaveBeenCalled();
    expect(card()).toBeNull();
  });

  it('says so where the clipboard refuses, and tries the same part again on the same button', async () => {
    const first = setUp([{ id: 'a', title: 'Mine', content: '<p>x</p>' }], { text: async () => { throw new Error('denied'); } });
    expect(await first.discord.copy('a')).toBe(false);
    expect(first.said).toEqual(['Could not copy to the clipboard']);
    expect(card()).toBeNull();

    document.body.innerHTML = '';
    const text = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined);
    const { clip, said, discord } = setUp([{ id: 'a', title: 'Long', content: LONG }], { text });
    await discord.copy('a');
    expect(await discord.next()).toBe(false);
    expect(said).toEqual(['Could not copy to the clipboard']);
    expect(words()).toBe('Part 1 of 3 copied. Paste it in Discord, then press Next part.');
    expect(await discord.next()).toBe(true);
    expect(words()).toBe('Part 2 of 3 copied. Paste it in Discord, then press Next part.');
    // The part that failed is the one sent again.
    expect(clip.text.mock.calls[2][0]).toBe(clip.text.mock.calls[1][0]);
  });

  it('closed, the card keeps nothing of the note', async () => {
    const { clip, discord } = setUp([{ id: 'a', title: 'Long', content: LONG }]);
    await discord.copy('a');
    card().querySelector('[data-discord="close"]').click();
    expect(card().hidden).toBe(true);
    expect(discord.pending).toBe(0);
    expect(await discord.next()).toBe(false);
    expect(clip.text).toHaveBeenCalledTimes(1);
  });

  it('lets go of a note that is deleted, or put into a black hole, while its card is up', async () => {
    const gone = setUp([{ id: 'a', title: 'Long', content: LONG }, { id: 'b', title: 'Other', content: '<p>x</p>' }]);
    await gone.discord.copy('a');
    // Another note's deletion is not this card's.
    emit('note-changed', { id: 'b', deleted: true });
    expect(gone.discord.pending).toBe(2);
    emit('note-changed', { id: 'a', deleted: true });
    expect(card().hidden).toBe(true);
    expect(gone.discord.pending).toBe(0);

    document.body.innerHTML = '';
    const moved = setUp([{ id: 'a', title: 'Long', content: LONG }]);
    await moved.discord.copy('a');
    moved.store.get('a').hole = 'z';
    expect(await moved.discord.next()).toBe(false);
    expect(card().hidden).toBe(true);
    expect(moved.clip.text).toHaveBeenCalledTimes(1);
  });

  it('starts over with the note asked for last', async () => {
    const { clip, discord } = setUp([{ id: 'a', title: 'Long', content: LONG }, { id: 'b', title: '', content: '<p>short</p>' }]);
    await discord.copy('a');
    await discord.copy('b');
    expect(clip.text).toHaveBeenLastCalledWith('short');
    expect(words()).toBe('Copied for Discord. Paste it there.');
    expect(nextButton().hidden).toBe(true);
  });
});

describe('the entry in a note’s menu', () => {
  it('stands before Archive, on a note that may be shared only, and hands the note over', () => {
    const page = fs.readFileSync('src/index.html', 'utf8');
    const holder = document.createElement('div');
    holder.innerHTML = /<div class="note-menu" id="note-menu" hidden>[\s\S]*?<\/div>/.exec(page)[0];
    document.body.append(holder);
    const store = new NoteStore({ allowSeed: false });
    store.notes = [
      { id: 'a', title: 'Mine', content: '<p>x</p>', createdAt: 1, updatedAt: 5 },
      { id: 'h', title: 'Sealed', content: '', hole: 'z', createdAt: 1, updatedAt: 6 },
    ];
    const asked = [];
    let changed = 0;
    const discord = initDiscordCopy({ store, say: () => {}, clip: { text: async () => {}, image: null } });
    const actions = initNoteActions({ store, onChanged: () => { changed += 1; }, canDiscord: (note) => discord.can(note), onDiscord: (id) => asked.push(id) });
    const entry = holder.querySelector('[data-note-act="discord"]');
    expect(entry.textContent).toBe('Copy for Discord');
    expect(entry.hidden).toBe(true);
    expect(entry.nextElementSibling.dataset.noteAct).toBe('archive');

    const more = actions.moreButton('a');
    const sealed = actions.moreButton('h');
    holder.append(more, sealed);
    more.click();
    expect(entry.hidden).toBe(false);
    entry.click();
    expect(asked).toEqual(['a']);
    // Copying changes no note: the list is not drawn again.
    expect(changed).toBe(0);
    expect(holder.querySelector('#note-menu').hidden).toBe(true);

    sealed.click();
    expect(entry.hidden).toBe(true);
  });

  it('is hidden where nobody says a note may be shared', () => {
    const page = fs.readFileSync('src/index.html', 'utf8');
    const holder = document.createElement('div');
    holder.innerHTML = /<div class="note-menu" id="note-menu" hidden>[\s\S]*?<\/div>/.exec(page)[0];
    document.body.append(holder);
    const store = new NoteStore({ allowSeed: false });
    store.notes = [{ id: 'a', title: 'Mine', content: '', createdAt: 1, updatedAt: 5 }];
    store.save();
    const actions = initNoteActions({ store });
    const more = actions.moreButton('a');
    holder.append(more);
    more.click();
    expect(holder.querySelector('[data-note-act="discord"]').hidden).toBe(true);
  });
});

describe('the words in every language', () => {
  it('has the menu entry, the card and the toasts in German, Polish and Turkish', () => {
    for (const key of ['Copy for Discord', 'Copied for Discord. Paste it there.', 'Next part', 'There is nothing in this note to copy', 'Could not copy to the clipboard']) {
      expect(STRINGS[key], key).toHaveLength(3);
      for (const said of STRINGS[key]) expect(said && said !== key, key).toBe(true);
    }
  });

  it('has the numbered lines of the card, the numbers kept', () => {
    const lines = [
      'Part 2 of 3 copied. Paste it in Discord, then press Next part.',
      'Part 3 of 3 copied. Paste it in Discord.',
      'Picture 1 of 2 copied. Paste it in Discord.',
      'Picture 2 of 2 could not be copied.',
      'Copy picture 1 of 2',
      'Shapes and arrows not in the copy: 4',
      'Widgets not in the copy: 4',
      'Files not in the copy: 4',
      'Pictures not in the copy: 4',
    ];
    for (const line of lines) {
      for (const lang of ['de', 'pl', 'tr']) {
        const said = t(line, lang);
        expect(said, `${lang}: ${line}`).not.toBe(line);
        for (const number of line.match(/\d+/g)) expect(said, `${lang}: ${line}`).toContain(number);
      }
    }
  });
});
