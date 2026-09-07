/**
 * The menu bar the app draws itself.
 *
 * It is not Electron's `Menu`: these have to sit beside the logo in the title
 * strip, which a native menu bar cannot do. The definitions here are also the
 * only list the command palette reads, so the two cannot drift apart.
 */
import { describe, it, expect, vi } from 'vitest';
import { buildMenus, commandsOf, filterCommands } from '../src/js/app-menu.js';

const menus = () => buildMenus({ actions: {}, history: {}, find: {}, palette: {}, shortcuts: {} });

describe('the five menus', () => {
  it('are File, Edit, View, Window and Help, in that order', () => {
    expect(menus().map((m) => m.title)).toEqual(['File', 'Edit', 'View', 'Window', 'Help']);
  });

  it('gives every item a label and something to run', () => {
    for (const menu of menus()) {
      for (const item of menu.items) {
        if (item.separator) continue;
        expect(item.label, `${menu.title}`).toBeTruthy();
        expect(item.id, item.label).toMatch(/^[a-z]+\.[a-z]+$/);
        expect(typeof item.run, item.label).toBe('function');
      }
    }
  });

  it('has no duplicate command ids', () => {
    const ids = commandsOf(menus()).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps zoom, and points it at the window rather than a webview', () => {
    // The stock View roles act on whatever webContents has focus, which is why
    // they appeared dead while the AI panel was in front.
    const zoom = vi.fn();
    globalThis.window = { nebula: { view: { zoom } } };
    const view = buildMenus({}).find((m) => m.title === 'View');
    const labels = view.items.filter((i) => !i.separator).map((i) => i.label);
    expect(labels).toContain('Zoom in');
    expect(labels).toContain('Zoom out');
    expect(labels).toContain('Actual size');
    view.items.find((i) => i.id === 'view.zoomin').run();
    view.items.find((i) => i.id === 'view.zoomreset').run();
    expect(zoom).toHaveBeenNthCalledWith(1, 'in');
    expect(zoom).toHaveBeenNthCalledWith(2, 'reset');
    delete globalThis.window;
  });

  it('offers Maximize in the Window menu', () => {
    const maximize = vi.fn();
    globalThis.window = { nebula: { window: { maximize } } };
    const win = buildMenus({}).find((m) => m.title === 'Window');
    expect(win.items.filter((i) => !i.separator).map((i) => i.label)).toContain('Maximize');
    win.items.find((i) => i.id === 'window.maximize').run();
    expect(maximize).toHaveBeenCalled();
    delete globalThis.window;
  });

  it('leads Help with Guide page — the way back after deleting it', () => {
    const guide = vi.fn();
    const help = buildMenus({ guide }).find((m) => m.title === 'Help');
    expect(help.items[0].id).toBe('help.guide');
    help.items[0].run();
    expect(guide).toHaveBeenCalled();
  });

  it('routes undo through the app stack, never execCommand', () => {
    const history = { undo: vi.fn(), redo: vi.fn() };
    const edit = buildMenus({ history }).find((m) => m.title === 'Edit');
    edit.items.find((i) => i.id === 'edit.undo').run();
    edit.items.find((i) => i.id === 'edit.redo').run();
    expect(history.undo).toHaveBeenCalled();
    expect(history.redo).toHaveBeenCalled();
  });
});

describe('the command palette reads the menus', () => {
  it('flattens every runnable item and tags it with its menu', () => {
    const commands = commandsOf(menus());
    expect(commands.length).toBeGreaterThan(20);
    expect(commands.every((c) => c.menu && c.label && typeof c.run === 'function')).toBe(true);
    expect(commands.some((c) => c.separator)).toBe(false);
  });

  it('matches on every word, in the label or the menu name', () => {
    const commands = commandsOf(menus());
    expect(filterCommands(commands, 'zoom').map((c) => c.label))
      .toEqual(['Zoom in', 'Zoom out']);
    expect(filterCommands(commands, 'view actual').map((c) => c.label)).toEqual(['Actual size']);
    expect(filterCommands(commands, 'ZOOM IN').map((c) => c.label)).toEqual(['Zoom in']);
    expect(filterCommands(commands, 'nothingatall')).toEqual([]);
  });

  it('shows everything when nothing is typed', () => {
    const commands = commandsOf(menus());
    expect(filterCommands(commands, '')).toHaveLength(commands.length);
    expect(filterCommands(commands, '   ')).toHaveLength(commands.length);
  });
});
