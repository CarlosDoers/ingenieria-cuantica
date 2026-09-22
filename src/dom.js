/**
 * Lo mínimo que comparten todos los módulos y que no depende de ninguno.
 *
 * Va aparte a propósito: si viviera en `app.js`, los demás se lo pedirían dentro del ciclo
 * de importación y lo encontrarían todavía sin inicializar. Aquí no hay ciclo posible.
 */
export const $ = (s) => document.querySelector(s);
export const $$ = (s) => Array.from(document.querySelectorAll(s));
export const icon = (n) => `<svg aria-hidden="true"><use href="#i-${n}"/></svg>`;
export const reduced = matchMedia("(prefers-reduced-motion: reduce)");
