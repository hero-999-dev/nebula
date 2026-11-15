/**
 * What is being pulled, shown at the pointer (1.0.4).
 *
 * The owner: "while I drag there is no feedback; in the AI chats there is a
 * preview — let something say what I picked and am dragging." A card, a code
 * block or a table taken by the mouse (block-drag.js), and a picture or a
 * widget in the text (rich-paste.js), stays where it is until
 * the button is let go, and only the mark between two blocks moved. Now a
 * veil lies over the block and a small chip with its name goes with the
 * pointer.
 *
 * Neither is part of the note, and the block gets no class of its own: a
 * note saved in the middle of a pull is saved as it was. Both take no mouse.
 * Once the system's own drag takes a file out of the window (file-attach.js)
 * they are taken down: that drag has a picture of its own.
 */

import { t } from './i18n.js';

/** How far from the pointer's tip the chip hangs. */
const AWAY = { x: 14, y: 16 };

let chip = null;
let veil = null;
let pulled = null;

/**
 * The name a pulled block is known by: a file's name, a card's title, or what it is.
 * @param {HTMLElement} block
 */
export function ghostName(block) {
  if (block.matches('.blk-table')) return t('Table');
  if (block.matches('.blk-code')) return t('Code block');
  if (block.matches('.note-video')) return t('Video');
  if (block.matches('.note-image')) return t('Widget');
  const named = block.dataset.name || block.querySelector('.link-card__title')?.textContent || '';
  return named.trim() || t('Link');
}

/**
 * The chip for that block, at the pointer; called again, it only follows.
 * @param {HTMLElement} block
 */
export function showGhost(block, x, y) {
  if (pulled !== block) {
    hideGhost();
    pulled = block;
    veil = document.createElement('div');
    veil.className = 'carry-veil';
    chip = document.createElement('div');
    chip.className = 'carry-ghost';
    chip.dataset.noI18n = '';
    for (const el of [veil, chip]) el.setAttribute('aria-hidden', 'true');
    // A picture is shown small, itself (the owner: "files have the preview, pictures do not").
    const picture = block.matches('.note-image') ? block.querySelector(':scope > img') : null;
    if (picture?.getAttribute('src')) {
      const small = document.createElement('img');
      small.className = 'carry-ghost__pic';
      small.alt = '';
      small.draggable = false;
      small.src = picture.getAttribute('src');
      chip.classList.add('carry-ghost--pic');
      chip.append(small);
    } else {
      // A file keeps the badge of its kind.
      const badge = block.querySelector(':scope > .attach-icon');
      if (badge) chip.append(badge.cloneNode(true));
      const name = document.createElement('span');
      name.className = 'carry-ghost__name';
      name.textContent = ghostName(block);
      chip.append(name);
    }
    document.body.append(veil, chip);
  }
  // The note may scroll under the pointer: the veil stays on its block.
  const box = block.getBoundingClientRect();
  veil.style.left = `${box.left}px`;
  veil.style.top = `${box.top}px`;
  veil.style.width = `${box.width}px`;
  veil.style.height = `${box.height}px`;
  chip.style.left = `${x + AWAY.x}px`;
  chip.style.top = `${y + AWAY.y}px`;
}

export function hideGhost() {
  chip?.remove();
  veil?.remove();
  chip = null;
  veil = null;
  pulled = null;
}
