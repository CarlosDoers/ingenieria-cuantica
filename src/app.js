import { $, $$, icon, reduced } from './dom.js';
import { DATA } from './content.js';
import {
  canvas,
  consumeDragOutside,
  enterField,
  focusCamera,
  hoverFieldTab,
  leaveField,
  recenterField,
  selectLight,
  setFieldPreview,
  setFieldTab,
  unfocusCamera,
} from './sphere.js';
import { positionCard } from './card.js';
import { sound } from './audio.js';

/**
 * Pie de la escena. En el chip las indicaciones de la esfera ya no valen —ahí se arrastra
 * para girar el chip y la rueda acerca—, así que se cambian y se devuelven al volver.
 */
const sphereHint = $("#scene-instructions").innerHTML;
const chipHint = `<svg><use href="#i-touch" /></svg><span>Arrastra para girar el chip</span><span class="sep">/</span><span>Rueda para acercar</span>`;
export let selected = -1;
let activeTab = 0,
  visited = new Set(),
  kioskMode = false,
  lastActivity = Date.now();
const nodes = $("#nodes");
DATA.forEach((d, i) => {
  nodes.insertAdjacentHTML(
    "beforeend",
    `<button class="orbit-node" data-index="${i}" style="--node-color:${
      d.color
    }" aria-pressed="false" aria-label="Explorar ${
      d.name
    }" aria-controls="detail"><span class="node-name" aria-hidden="true">${icon(
      d.icon
    )}<span>${d.name}</span></span></button>`
  );
});
export const nodeEls = $$(".orbit-node");
export function announce(t) {
  $("#announcement").textContent = t;
}
export function activity() {
  lastActivity = Date.now();
  $("#idle-notice").hidden = true;
}
function renderTab(index, focus = false) {
  activeTab = index;
  const d = DATA[selected],
    t = d.tabs[index];
  $$(".tab").forEach((b, i) => {
    b.setAttribute("aria-selected", String(i === index));
    b.tabIndex = i === index ? 0 : -1;
  });
  // En el chip, cada pestaña es un cúbit: se marca la que está abierta.
  $$(".field-sub").forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
  setFieldTab(index);
  $("#tab-content").setAttribute("aria-labelledby", `tab-${index}`);
  $("#tab-content").innerHTML =
    t.items
      .map(
        (x, i) =>
          `<article class="feature"><span class="feature-symbol" aria-hidden="true">0${
            i + 1
          }</span><div><h3>${x[0]}</h3><p>${x[1]}</p></div></article>`
      )
      .join("") + (t.note ? `<p class="panel-note">${t.note}</p>` : "");
  if (focus) $(`#tab-${index}`).focus();
  activity();
  if (typeof positionCard === "function") positionCard();
}
function selectTerritory(index, { focus = true, audible = true } = {}) {
  selected = index;
  activeTab = 0;
  visited.add(index);
  const d = DATA[index];
  document.documentElement.style.setProperty("--accent", d.color);
  // En los dos primeros niveles **no hay ficha**: el cliente quiere que se vea la parte
  // visual, la esfera y el chip. Los contenidos se siguen cargando en la ficha oculta para
  // cuando haya un nivel más; `has-selection` ya no se usa porque solo servía para
  // estrechar la escena y hacerle sitio, y ese estrechamiento redimensionaba el lienzo
  // justo cuando arranca la transformación.
  $("#detail-label").textContent = `0${index + 1} / ${d.name}`;
  $("#detail-title").textContent = d.title;
  $("#detail-summary").textContent = d.summary;
  $("#tabs").innerHTML = d.tabs
    .map(
      (t, i) =>
        `<button class="tab" id="tab-${i}" role="tab" aria-controls="tab-content" aria-selected="${
          i === 0
        }" tabindex="${i === 0 ? 0 : -1}">${t.name}</button>`
    )
    .join("");
  $$(".tab").forEach((b, i) => {
    b.addEventListener("click", () => renderTab(i));
    b.addEventListener("keydown", (e) => {
      let j = i;
      if (e.key === "ArrowRight") j = (i + 1) % 3;
      else if (e.key === "ArrowLeft") j = (i + 2) % 3;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = 2;
      else return;
      e.preventDefault();
      renderTab(j, true);
    });
  });
  $("#next").innerHTML = `<span>Explorar ${DATA[
    (index + 1) % 5
  ].name.toLowerCase()}</span>${icon("arrow")}`;
  $("#progress").innerHTML =
    `<span>${visited.size}/5 explorados</span>` +
    DATA.map(
      (_, i) =>
        `<i class="${visited.has(i) ? "visited" : ""}" aria-hidden="true"></i>`
    ).join("");
  $$("[data-index]").forEach((b) =>
    b.setAttribute("aria-pressed", String(Number(b.dataset.index) === index))
  );
  renderTab(0);
  $("#detail").scrollTop = 0;
  $("#scene-state").textContent = `EXPLORANDO / ${d.name.toUpperCase()}`;
  focusCamera(index);
  selectLight(index);
  // Segundo nivel: la esfera se transforma en el campo de cúbits. Las pestañas de la ficha
  // pasan a ser las hijas del territorio en el chip, unidas a él por el puente.
  $("#field-subs").innerHTML = d.tabs
    .map((t, i) => `<button class="field-sub" type="button" data-tab="${i}" aria-pressed="${i === 0}">${t.name}</button>`)
    .join("");
  $$(".field-sub").forEach((b, i) => {
    b.addEventListener("click", () => renderTab(i));
    // Señalar una pestaña señala su cúbit en el chip, como en campo-cubits.
    b.addEventListener("pointerenter", () => hoverFieldTab(index, i));
    b.addEventListener("pointerleave", () => hoverFieldTab(-1, -1));
  });
  enterField(index);
  $("#scene-instructions").innerHTML = chipHint;
  syncRail();
  if (audible) sound("select", index);
  // Un solo aviso. Dos seguidos en el mismo tick se pisan: el lector de pantalla solo
  // llega a leer el último, y el primero se perdía siempre.
  announce(
    `Territorio ${d.name}. ${d.title}. En el chip: ${d.tabs.map((t) => t.name).join(", ")}.`
  );
  activity();
}
$$("[data-index]").forEach((b) => {
  const i = Number(b.dataset.index);
  b.addEventListener("click", () => selectTerritory(i));
  // En el chip, señalar una sección adelanta su subnivel sin abrirla.
  b.addEventListener("pointerenter", () => setFieldPreview(i));
  b.addEventListener("pointerleave", () => setFieldPreview(-1));
  b.addEventListener("focus", () => setFieldPreview(i));
  b.addEventListener("blur", () => setFieldPreview(-1));
});
/**
 * Menú lateral, como el raíl de la propuesta de Bloch: los cinco territorios siempre a la
 * vista, alternativa a buscarlos en la esfera y navegable con teclado. Arriba va «Universo»,
 * que vuelve al primer nivel: sin la ficha ya no está su X, y hacía falta una vuelta visible
 * —en un kiosco táctil no vale con Escape ni con adivinar que se puede pulsar fuera—.
 * Señalar un territorio en el menú lo destaca también en la escena.
 */
const rail = $("#rail");
rail.innerHTML =
  // La marca del activo es **una sola pieza que se desplaza** de un territorio a otro, no un
  // borde que se enciende y se apaga: el menú cuenta así de dónde vienes y a dónde vas.
  `<span class="rail-marker" aria-hidden="true"></span>` +
  // «Universo Quantum» es **el primer nivel**, la esfera, y los cinco territorios cuelgan de
  // él: va como un elemento más del menú —con su esfera por icono y algo mayor— y los
  // territorios, sangrados debajo y unidos por una línea de árbol. Antes era una etiqueta
  // pequeña en versaleta encima de la lista, y no se leía como el nivel de arriba.
  `<button class="rail-item rail-home" type="button" style="--i:0;--node-color:#9aa9ff"><span class="rail-glyph">${icon(
    "universe"
  )}</span><span class="rail-name">Universo Quantum</span></button>` +
  // Cada territorio con el mismo icono y el mismo color que lleva su punto en la esfera: el
  // menú y la escena se leen como la misma cosa.
  `<div class="rail-children">` +
  DATA.map(
    (d, i) =>
      `<button class="rail-item" type="button" data-rail="${i}" style="--i:${i + 1};--node-color:${
        d.color
      }"><span class="rail-glyph">${icon(d.icon)}</span><span class="rail-name">${d.name}</span></button>`
  ).join("") +
  `</div>`;
$$(".rail-item[data-rail]").forEach((b) => {
  const i = Number(b.dataset.rail),
    mark = (on) => {
      nodeEls[i].classList.toggle("is-hover", on);
      setFieldPreview(on ? i : -1);
    };
  b.addEventListener("click", () => {
    // Pulsar el territorio que ya está abierto recoloca la cámara si se había girado.
    if (selected !== i) selectTerritory(i, { focus: false });
    else recenterField();
  });
  b.addEventListener("pointerenter", () => mark(true));
  b.addEventListener("pointerleave", () => mark(false));
  b.addEventListener("focus", () => mark(true));
  b.addEventListener("blur", () => mark(false));
});
$(".rail-home").addEventListener("click", () => {
  if (selected >= 0) resetExperience(false);
});
function syncRail() {
  let current = null;
  $$(".rail-item").forEach((b) => {
    const on = b.dataset.rail === undefined ? selected < 0 : Number(b.dataset.rail) === selected;
    b.classList.toggle("active", on);
    if (on) {
      current = b;
      b.setAttribute("aria-current", "true");
    } else b.removeAttribute("aria-current");
  });
  rail.classList.toggle("has-selection", selected >= 0);
  syncSheet();
  if (!current) return;
  // La marca se coloca con las medidas del elemento activo, no con un índice: así no se
  // descoloca si cambian el texto o el tamaño de letra.
  rail.style.setProperty("--my", current.offsetTop + "px");
  rail.style.setProperty("--mh", current.offsetHeight + "px");
  rail.style.setProperty("--mx", current.offsetLeft + "px");
  rail.style.setProperty("--mw", current.offsetWidth + "px");
}
/**
 * Menú de móvil (petición de diseño, a partir del de aaronjcunningham.com): en vez del menú
 * lateral, un botón **abajo**, al alcance del pulgar, que abre la navegación a pantalla
 * completa. Filas con el icono del territorio, el nombre enorme en peso fino y una flecha;
 * cada fila con **su color de territorio** en la línea de debajo, que se alarga entera en la
 * activa. Entran escalonadas y salen al revés.
 *
 * Va en un `<dialog>` modal: atrapa el foco, deja el resto de la página inerte y se cierra
 * con Escape. Donde no hay `showModal` (el entorno de pruebas), se abre con el atributo.
 */
const sheet = $("#nav-sheet"),
  sheetLinks = $("#nav-sheet-links"),
  trigger = $("#nav-trigger");
const UNIVERSE_COLOR = "#9aa9ff";
sheetLinks.innerHTML =
  `<button class="sheet-link sheet-home" type="button" style="--i:0;--row:${UNIVERSE_COLOR}"><span class="sheet-glyph">${icon(
    "universe"
  )}</span><span class="sheet-name">Universo Quantum</span><span class="sheet-go" aria-hidden="true">↗</span></button>` +
  DATA.map(
    (d, i) =>
      `<button class="sheet-link" type="button" data-sheet="${i}" style="--i:${i + 1};--row:${d.color}"><span class="sheet-glyph">${icon(
        d.icon
      )}</span><span class="sheet-name">${d.name}</span><span class="sheet-go" aria-hidden="true">↗</span></button>`
  ).join("");
let sheetTimer = 0;
function openSheet() {
  clearTimeout(sheetTimer);
  syncSheet();
  sheet.classList.remove("is-closing");
  if (sheet.showModal) {
    if (!sheet.open) sheet.showModal();
  } else sheet.setAttribute("open", "");
  // El foco entra en el panel y no en su primera fila: si no, esa fila sale con el marco de
  // foco como si estuviera elegida. Con teclado, Tab entra en las filas.
  sheet.focus({ preventScroll: true });
  // Un fotograma después, para que la entrada escalonada parta del estado cerrado.
  requestAnimationFrame(() => sheet.classList.add("is-open"));
  trigger.setAttribute("aria-expanded", "true");
  activity();
}
function closeSheet(instant = false) {
  if (!sheet.hasAttribute("open")) return;
  const done = () => {
    sheet.classList.remove("is-open", "is-closing");
    if (sheet.close) sheet.close();
    else sheet.removeAttribute("open");
    trigger.setAttribute("aria-expanded", "false");
  };
  clearTimeout(sheetTimer);
  if (instant || reduced.matches) return done();
  sheet.classList.add("is-closing");
  sheetTimer = setTimeout(done, 520);
}
trigger.addEventListener("click", openSheet);
// Si la pantalla pasa a ancho de escritorio con el panel abierto —girar una tableta—, se
// cierra: ahí manda el menú lateral y el panel se quedaría tapándolo todo.
matchMedia("(max-width: 760px)").addEventListener("change", (e) => {
  if (!e.matches) closeSheet(true);
});
sheet.querySelector(".dialog-close").addEventListener("click", () => closeSheet());
// Escape cierra con la misma salida animada que el botón.
sheet.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeSheet();
});
sheet.addEventListener("close", () => trigger.setAttribute("aria-expanded", "false"));
$(".sheet-home").addEventListener("click", () => {
  if (selected >= 0) resetExperience(false);
  closeSheet();
});
$$(".sheet-link[data-sheet]").forEach((b) =>
  b.addEventListener("click", () => {
    // La transformación arranca ya, detrás del menú mientras se desvanece.
    const i = Number(b.dataset.sheet);
    if (selected !== i) selectTerritory(i, { focus: false });
    else recenterField();
    closeSheet();
  })
);
function syncSheet() {
  $$(".sheet-link").forEach((b) => {
    const on = b.dataset.sheet === undefined ? selected < 0 : Number(b.dataset.sheet) === selected;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "true");
    else b.removeAttribute("aria-current");
  });
}
addEventListener("resize", syncRail);
syncRail();
/**
 * Vuelve al universo. `restart` distingue **cerrar** de **empezar de nuevo**: cerrar la
 * ficha no debería borrar por dónde has pasado.
 *
 * Antes se hacía `visited.clear()` siempre, y esta función la llaman también la X, el clic
 * fuera y Escape, así que el contador «X/5 explorados» volvía a 1 en cuanto cerrabas una
 * ficha y nunca informaba de nada. Ahora solo lo borran el botón de reinicio y la vuelta
 * automática por inactividad, que son las dos veces que de verdad empieza otra persona.
 */
function resetExperience(focus = false, { restart = false } = {}) {
  selected = -1;
  if (restart) visited.clear();
  document.documentElement.style.setProperty("--accent", "#89b5ff");
  $("#detail-close").hidden = true;
  unfocusCamera();
  leaveField();
  $("#scene-instructions").innerHTML = sphereHint;
  $("#detail").hidden = true;
  $("#detail").style.visibility = "visible";
  $("#point-signal").style.display = "none";
  $$("[data-index]").forEach((b) => b.setAttribute("aria-pressed", "false"));
  syncRail();
  $("#scene-state").textContent = "EXPLORA LAS CONEXIONES";
  selectLight(-1);
  activity();
  announce("Has vuelto al universo. Elige uno de los cinco puntos.");
  if (focus) {
    nodeEls[0].focus({ preventScroll: true });
    if (innerWidth <= 1000)
      window.scrollTo({
        top: 0,
        behavior: reduced.matches ? "instant" : "smooth",
      });
  }
}
$("#detail-close").addEventListener("click", () => resetExperience(true));
$("#home").addEventListener("click", () => resetExperience(true));
$("#next").addEventListener("click", () =>
  selectTerritory((selected + 1) % 5, { audible: false })
);
$$("[data-dialog]").forEach((b) =>
  b.addEventListener("click", () => {
    $("#" + b.dataset.dialog).showModal();
    activity();
  })
);
$$("dialog:not(.nav-sheet)").forEach((d) => {
  d.querySelector(".dialog-close").addEventListener("click", () => d.close());
  d.addEventListener("click", (e) => {
    if (e.target === d) {
      const r = d.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        d.close();
    }
  });
});
document.addEventListener("keydown", (e) => {
  activity();
  if (
    e.key === "Escape" &&
    !document.querySelector("dialog[open]") &&
    selected >= 0
  ) {
    resetExperience(true);
  }
});
document.addEventListener(
  "click",
  (e) => {
    if (
      selected < 0 ||
      // Cualquier botón queda fuera de esto: los suyos ya deciden qué hacer, y pulsar
      // pausa o sonido desde el chip no es «pulsar en vacío» —devolvía a la esfera—.
      e.target.closest?.("#detail,#detail-close,.orbit-node,.field-sub,.rail,dialog,button")
    )
      return;
    if (e.target === canvas && consumeDragOutside()) return;
    resetExperience(false);
  },
  true
);
document.addEventListener("pointerdown", activity, { passive: true });
document.addEventListener("pointermove", activity, { passive: true });
document.addEventListener("scroll", activity, { passive: true });
function setKiosk(on) {
  kioskMode = on;
  document.body.classList.toggle("kiosk", on);
  $("#kiosk").setAttribute("aria-pressed", String(on));
  $("#kiosk").setAttribute(
    "aria-label",
    on ? "Salir del modo exposición" : "Activar modo exposición"
  );
  $("#kiosk").title = on ? "Salir del modo exposición" : "Modo exposición";
  activity();
}
$("#kiosk").addEventListener("click", async () => {
  const on = !kioskMode;
  setKiosk(on);
  if (on) {
    try {
      if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else
        announce(
          "Modo exposición activado. La pantalla completa no está disponible en este navegador."
        );
    } catch {
      announce("Modo exposición activado dentro de esta ventana.");
    }
  } else if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {}
  }
});
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && kioskMode) setKiosk(false);
});
setInterval(() => {
  if (!kioskMode || document.hidden) return;
  const idle = Date.now() - lastActivity;
  if (idle >= 90000) {
    $$("dialog[open]").forEach((d) => d.close());
    resetExperience(false, { restart: true }); // llega otra persona: recorrido a cero
    window.scrollTo(0, 0);
  } else if (idle >= 80000) {
    $("#idle-notice").hidden = false;
    $("#idle-notice").textContent = `Volvemos al inicio en ${Math.ceil(
      (90000 - idle) / 1000
    )} s. Toca la pantalla para seguir.`;
  }
}, 1000);
