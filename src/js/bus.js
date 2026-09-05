/** App-wide event bus — future modules subscribe instead of wiring through main.js. */
const PREFIX = 'nebula:';

export function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(PREFIX + name, { detail }));
}

export function on(name, handler) {
  const wrapped = (e) => handler(e.detail ?? {});
  document.addEventListener(PREFIX + name, wrapped);
  return () => document.removeEventListener(PREFIX + name, wrapped);
}
