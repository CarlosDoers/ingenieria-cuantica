import { $, $$, icon, reduced } from './dom.js';
import { DATA } from './content.js';
import {
  canvas,
  consumeDragOutside,
  focusCamera,
  selectLight,
  unfocusCamera,
} from './sphere.js';
import { openPointCard, positionCard } from './card.js';
import { sound } from './audio.js';

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
  $("#detail").hidden = false;
  $(".experience").classList.add("has-selection");
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
  openPointCard();
  if (audible) sound("select", index);
  if (focus) $("#detail-title").focus({ preventScroll: true });
  // Un solo aviso. Dos seguidos en el mismo tick se pisan: el lector de pantalla solo
  // llega a leer el último, y el primero se perdía siempre.
  announce(
    `Territorio ${d.name}. ${d.title}` +
      (focus ? " Ficha conectada al punto seleccionado." : "")
  );
  activity();
}
$$("[data-index]").forEach((b) =>
  b.addEventListener("click", () => selectTerritory(Number(b.dataset.index)))
);
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
  $("#detail").hidden = true;
  $("#detail").style.visibility = "visible";
  $("#point-signal").style.display = "none";
  $(".experience").classList.remove("has-selection");
  $$("[data-index]").forEach((b) => b.setAttribute("aria-pressed", "false"));
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
$("#reset").addEventListener("click", () => resetExperience(true, { restart: true }));
$("#next").addEventListener("click", () =>
  selectTerritory((selected + 1) % 5, { audible: false })
);
$$("[data-dialog]").forEach((b) =>
  b.addEventListener("click", () => {
    $("#" + b.dataset.dialog).showModal();
    activity();
  })
);
$$("dialog").forEach((d) => {
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
      e.target.closest?.("#detail,#detail-close,.orbit-node,dialog")
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
