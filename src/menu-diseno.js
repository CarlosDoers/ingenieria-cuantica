/**
 * Menú lateral de la diseñadora: **el menú principal** desde el 02/10/2026. El anterior —en
 * filas con su línea debajo— sigue como alternativa con `?menu=clasico`. Medidas del Figma
 * «Universo Quantum» (nodo 115:124). Tres estados:
 *
 * - **Reposo**: los cinco nombres en mayúsculas, muy juntos, sin iconos ni líneas.
 * - **Señalado**: el nombre entre corchetes finos; los demás se apagan y se desenfocan.
 * - **Abierto**: el nombre en negrita y del color de sus esferas en el campo, entre
 *   corchetes, con sus subitems debajo en mayúsculas pequeñas; los demás, apagados.
 *
 * Debajo, el botón «Menú» del diseño pliega y despliega el menú; empieza desplegado.
 *
 * Transiciones (estilos en menu-diseno.css):
 * - Los corchetes son **una sola pieza** que se desliza, con un leve rebote, al nombre que se
 *   señala y cambia de ancho por el camino; al salir, vuelve al abierto. Al aparecer se abren
 *   desde dentro del texto.
 * - Al abrir un territorio, sus letras se barajan un instante y se resuelven en el nombre:
 *   el estado se mide.
 * - Los subitems se despliegan abriendo el hueco sin saltos y entran uno tras otro.
 */
import { DATA } from './content.js';
import { reduced } from './dom.js';

/** El menú de la diseñadora, salvo que se pida el anterior con `?menu=clasico`. */
export const MENU_DISENO = new URLSearchParams(location.search).get("menu") !== "clasico";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function menuDiseno(rail) {
  rail.dataset.variant = "diseno";
  const list = rail.querySelector(".rail-children");
  const items = [...rail.querySelectorAll(".rail-item[data-rail]")];
  // Cada nombre, en su propio texto y con una marca de línea base detrás: con ella se sabe
  // dónde caen de verdad las mayúsculas (ver `caps`).
  const BASE = `<i class="dz-base" aria-hidden="true"></i>`;
  items.forEach((b, i) => {
    b.querySelector(".rail-name").innerHTML = `<span class="dz-txt"></span>${BASE}`;
    b.querySelector(".dz-txt").textContent = DATA[i].short || DATA[i].name;
    // El nombre completo, para quien no lo lee en pantalla.
    b.setAttribute("aria-label", DATA[i].name);
  });
  rail.querySelectorAll(".rail-sub").forEach((b) => b.insertAdjacentHTML("beforeend", BASE));
  // Subitems: cada grupo, en un envoltorio para poder abrir su hueco poco a poco (filas de
  // rejilla de 0fr a 1fr) y con su orden para escalonar la entrada.
  rail.querySelectorAll(".rail-subs").forEach((g) => {
    const inner = document.createElement("div");
    inner.className = "dz-subs";
    [...g.children].forEach((b, j) => {
      b.style.setProperty("--j", j);
      inner.append(b);
    });
    g.append(inner);
  });

  // Los corchetes: una pieza, que sigue a su objetivo con un muelle.
  const frame = document.createElement("span");
  frame.className = "dz-frame";
  frame.setAttribute("aria-hidden", "true");
  frame.innerHTML = `<i class="dz-l"></i><i class="dz-r"></i>`;
  list.prepend(frame);

  let selected = -1,
    hovered = -1,
    shown = false,
    running = false,
    last = 0,
    settleUntil = 0;
  // Posición y tamaño, cada uno con su velocidad: x, y, ancho, alto.
  const pos = { x: 0, y: 0, w: 0, h: 0 },
    vel = { x: 0, y: 0, w: 0, h: 0 };
  /**
   * Dónde están las mayúsculas de un texto: de su altura de mayúscula a su línea base, en px
   * de pantalla. Los corchetes se centran en ellas y no en la caja de la línea, porque Area
   * reserva mucho sitio encima de las mayúsculas: centrados en la línea, el texto se quedaba
   * bajo, con hueco arriba y justo abajo. La altura de mayúscula se mide con la propia fuente.
   */
  const capCache = new Map(),
    meter = document.createElement("canvas").getContext("2d");
  function caps(el) {
    const cs = getComputedStyle(el),
      font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    let h = capCache.get(font);
    if (h === undefined) {
      // Sin lienzo, la proporción habitual de la altura de mayúscula.
      if (meter) meter.font = font;
      h = meter?.measureText("H")?.actualBoundingBoxAscent || parseFloat(cs.fontSize) * 0.7;
      capCache.set(font, h);
    }
    const base = el.querySelector(".dz-base").getBoundingClientRect().top;
    return { top: base - h, bottom: base, h };
  }
  const target = () => {
    const i = hovered >= 0 ? hovered : selected;
    if (i < 0) return null;
    const box = list.getBoundingClientRect(),
      name = items[i].querySelector(".rail-name"),
      r = name.getBoundingClientRect(),
      c = caps(name),
      // Como en el diseño: corchetes un 55 % más altos que las mayúsculas, a 3,5 px del texto.
      pad = c.h * 0.28;
    return { x: r.left - box.left - 7, y: c.top - box.top - pad, w: r.width + 14, h: c.h + pad * 2 };
  };
  /** Lo mismo para los corchetes pequeños del subitem abierto, que van en CSS. */
  function subCaps() {
    const sub = rail.querySelector(".rail-sub");
    if (!sub) return;
    const c = caps(sub),
      top = c.top - sub.getBoundingClientRect().top;
    rail.style.setProperty("--dz-sub-top", top.toFixed(2) + "px");
    rail.style.setProperty("--dz-sub-h", c.h.toFixed(2) + "px");
  }
  function place() {
    frame.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    frame.style.width = pos.w + "px";
    frame.style.height = pos.h + "px";
  }
  function frameLoop(now) {
    const t = target();
    const dt = last ? Math.min((now - last) / 1000, 0.04) : 0.016;
    last = now;
    if (!t) {
      running = false;
      last = 0;
      return;
    }
    let moving = false;
    if (reduced.matches) Object.assign(pos, t);
    else
      for (const k of ["x", "y", "w", "h"]) {
        // Muelle algo vivo: llega con un pequeño rebote.
        const a = (t[k] - pos[k]) * 260 - vel[k] * 22;
        vel[k] += a * dt;
        pos[k] += vel[k] * dt;
        if (Math.abs(t[k] - pos[k]) > 0.2 || Math.abs(vel[k]) > 0.5) moving = true;
      }
    place();
    // Mientras se mueva, o mientras algo del menú se esté recolocando, sigue.
    if (moving || now < settleUntil) requestAnimationFrame(frameLoop);
    else {
      running = false;
      last = 0;
    }
  }
  function update() {
    const t = target();
    if (!t) {
      frame.classList.remove("is-on");
      shown = false;
      return;
    }
    if (!shown) {
      // Aparece en su sitio, sin venir de ninguna parte, y se abre desde dentro.
      Object.assign(pos, t);
      Object.assign(vel, { x: 0, y: 0, w: 0, h: 0 });
      place();
      frame.classList.remove("is-on");
      void frame.offsetWidth;
      frame.classList.add("is-on");
      shown = true;
    }
    // El menú sube y los subitems se despliegan durante algo más de medio segundo.
    settleUntil = performance.now() + 700;
    if (!running) {
      running = true;
      requestAnimationFrame(frameLoop);
    }
  }
  addEventListener("resize", update);
  // Las fuentes del kit llegan de la red después de pintar: cambian el ancho de los nombres y
  // la altura de sus mayúsculas.
  const refit = () => {
    capCache.clear();
    subCaps();
    update();
  };
  document.fonts?.ready.then(refit);
  document.fonts?.addEventListener?.("loadingdone", refit);
  subCaps();

  /** Al abrir un territorio, sus letras se barajan y se resuelven de izquierda a derecha. */
  function measure(i) {
    if (reduced.matches) return;
    const name = items[i].querySelector(".dz-txt"),
      text = DATA[i].short || DATA[i].name,
      start = performance.now(),
      DUR = 420;
    const step = (now) => {
      const p = (now - start) / DUR;
      if (p >= 1 || selected !== i) {
        name.textContent = text;
        return;
      }
      name.textContent = [...text]
        .map((c, k) => (c === " " || k / text.length < p ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
        .join("");
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /**
   * El botón «Menú» de debajo (02/10/2026, del diseño): pliega y despliega el menú. Empieza
   * desplegado. Va fuera del menú, en su mismo contenedor, para no moverse con él.
   */
  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "dz-fab";
  fab.setAttribute("aria-controls", rail.id || "rail");
  fab.innerHTML = `<span class="dz-fab-orb" aria-hidden="true"><span class="dz-fab-core"></span></span><span class="dz-fab-label" aria-hidden="true">Menú</span>`;
  rail.after(fab);
  function setOpen(open) {
    rail.classList.toggle("is-collapsed", !open);
    fab.classList.toggle("is-collapsed", !open);
    fab.setAttribute("aria-expanded", String(open));
    fab.setAttribute("aria-label", open ? "Plegar el menú" : "Desplegar el menú");
    if (open) update();
  }
  fab.addEventListener("click", () => setOpen(rail.classList.contains("is-collapsed")));
  setOpen(true);

  return {
    sync(s) {
      if (s !== selected && s >= 0) measure(s);
      selected = s;
      update();
    },
    hover(i) {
      hovered = i;
      update();
    },
  };
}
