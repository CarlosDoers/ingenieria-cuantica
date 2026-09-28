/**
 * Tercer nivel: la página de contenido de cada subitem del campo de cúbits (petición de
 * diseño, 25/09/2026). Se abre al pulsar una pestaña del chip —su esfera o su etiqueta— con un
 * fundido, por encima de la escena y por debajo del menú lateral, que se queda y despliega los
 * subitems del territorio.
 *
 * Desde el 28/09/2026 la página es **datos**: un documento con título, entradilla, cabecera
 * opcional (imagen o vídeo) y una lista de bloques (bloques.js), pensado para que lo edite el
 * cliente desde un backoffice sobre Supabase. De dónde sale el documento lo decide
 * fuente-paginas.js; los subitems que aún no tienen el suyo enseñan una página de prueba con
 * todos los tipos de bloque.
 *
 * Cada página tiene su dirección (`#/ciencia/computacion-cuantica`), así que el botón atrás
 * del navegador vuelve al campo de cúbits y adelante la reabre.
 */
import { $, reduced } from './dom.js';
import { DATA } from './content.js';
import { setSceneHidden } from './sphere.js';
import { getPage } from './fuente-paginas.js';
import { bloques, esc, media } from './bloques.js';

export const slug = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const pageState = { open: false, territory: -1, tab: -1 };
const page = $("#page");
/** Quien usa la página: `app.js` le dice cómo volver al universo y cómo abrir un territorio. */
const hooks = { home() {}, territory() {}, change() {} };
export function setPageHooks(h) {
  Object.assign(hooks, h);
}

const ARROW = `<svg class="arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8"/></svg>`;

/**
 * Página de prueba para los subitems sin documento propio: la muestra de todos los tipos de
 * bloque, con los textos que ya había para ese subitem en content.js donde encajan y
 * contenido de ejemplo donde no. Las imágenes y el vídeo son capturas del propio proyecto.
 */
function demoPage(d, t) {
  const items = t.items || [];
  const lista = items.map((x) => `- **${x[0]}.** ${x[1]}`).join("\n");
  return {
    etiqueta: "Página de prueba · muestra de bloques",
    titulo: t.name,
    entradilla: d.summary,
    cabecera: { tipo: "video", src: "/media/muestra-particulas.mp4", poster: "/media/muestra-particulas.jpg", automatico: true },
    bloques: [
      {
        tipo: "texto",
        titulo: "Bloque de texto",
        texto: `${items[0]?.[1] ?? ""}\n\nEl texto se escribe en **Markdown**: admite *cursivas*, negritas, [enlaces](https://www.ehu.eus) y listas.\n\n${lista}${
          t.note ? `\n\n${t.note}` : ""
        }`,
      },
      {
        tipo: "tarjetas",
        titulo: "Bloque de tarjetas",
        texto: "Varios elementos con título y texto corto, hasta tres por fila.",
        elementos: items.map((x) => ({ titulo: x[0], texto: x[1] })),
      },
      {
        tipo: "texto-imagen",
        titulo: "Bloque de texto con imagen",
        texto: "La imagen —o un vídeo— acompaña al texto, a su derecha o a su izquierda.\n\nEn móvil va siempre debajo del texto.",
        media: {
          tipo: "imagen",
          src: "/media/muestra-campo.jpg",
          alt: "Campo de cúbits con un territorio abierto y sus pestañas encendidas.",
          ancho: 1600,
          alto: 1000,
        },
        pie: "Imagen a la derecha",
      },
      {
        tipo: "pasos",
        titulo: "Bloque de pasos",
        texto: "Una secuencia numerada.",
        pasos: items.map((x) => ({ titulo: x[0], texto: x[1] })),
      },
      {
        tipo: "texto-imagen",
        lado: "izquierda",
        titulo: "La imagen, a la izquierda",
        texto: "El mismo bloque con la imagen delante del texto.",
        media: {
          tipo: "imagen",
          src: "/media/muestra-esfera.jpg",
          alt: "La esfera de puntos con los cinco territorios.",
          ancho: 1600,
          alto: 1000,
        },
        pie: "Imagen a la izquierda",
      },
      {
        tipo: "imagen-video",
        titulo: "Bloque de imagen o vídeo",
        texto: "Una imagen, un vídeo subido o un enlace de YouTube o Vimeo.",
        media: { tipo: "video", src: "/media/muestra-particulas.mp4", poster: "/media/muestra-particulas.jpg" },
        pie: "Vídeo subido, con sus controles",
      },
      {
        tipo: "datos",
        titulo: "Bloque de datos",
        texto: "Filas con un nombre y un valor.",
        filas: items.map((x) => ({ nombre: x[0], valor: "Dato de ejemplo" })),
      },
      {
        tipo: "markdown",
        texto: `# Bloque de Markdown

Un documento entero, pegado o subido como archivo \`.md\`, a todo el ancho. El texto se queda a un ancho cómodo de leer y las imágenes y las tablas ocupan todo el bloque.

## Un subtítulo

${lista}

> ${items[0]?.[1] ?? "Una cita destacada."}

![La esfera de puntos con los cinco territorios.](/media/muestra-esfera.jpg "Imagen dentro del Markdown")

### Una tabla

| Elemento | Descripción |
| --- | --- |
${items.map((x) => `| ${x[0]} | ${x[1]} |`).join("\n")}

---

Y un último párrafo tras un separador, con un [enlace](https://www.ehu.eus).`,
      },
    ],
  };
}

/** Cabecera de la página: etiqueta, título, entradilla y, si la hay, su imagen o vídeo. */
function hero(doc) {
  const m = media(doc.cabecera);
  return `
  <section class="hero${m ? " has-media" : ""}">
    <div class="hero-text">
      ${doc.etiqueta ? `<span class="mono-label mono-label--accent rise">${esc(doc.etiqueta)}</span>` : ""}
      <h1 class="rise" tabindex="-1">${esc(doc.titulo)}</h1>
      ${doc.entradilla ? `<p class="lead rise rise-3">${esc(doc.entradilla)}</p>` : ""}
    </div>
    ${m ? `<div class="hero-media rise rise-4">${m}</div>` : ""}
  </section>`;
}

function render(i, j, doc) {
  const d = DATA[i],
    t = d.tabs[j],
    n = d.tabs.length,
    nj = (j + 1) % n;
  page.style.setProperty("--q-section", d.color);
  page.setAttribute("aria-label", t.name);
  page.innerHTML = `
<div class="pg-main">
  <nav aria-label="Ruta">
    <ol class="crumbs mono-label">
      <li><span class="crumb-dot" aria-hidden="true"></span><a href="#" data-crumb="home">Universo</a></li>
      <li><a href="#" data-crumb="territory">${esc(d.name)}</a></li>
      <li><span aria-current="page">${esc(doc?.miga || t.name)}</span></li>
    </ol>
  </nav>
  ${hero(doc || { titulo: t.name })}
  ${doc ? bloques(doc.bloques) : ""}
  <section class="section section--wide" aria-label="Seguir explorando">
    <a class="pg-next" href="#" data-next="${nj}">
      <span class="mono-label mono-label--accent">Siguiente · ${nj + 1} / ${n}</span>
      <span class="next-title"><span>${esc(d.tabs[nj].name)}</span>${ARROW}</span>
    </a>
  </section>
</div>`;
}

const route = (i, j) => `#/${DATA[i].id}/${slug(DATA[i].tabs[j].name)}`;

/** Abre (o cambia) la página del subitem `j` del territorio `i`. */
export function openPage(i, j, { push = true } = {}) {
  if (push) history.pushState({ page: [i, j] }, "", route(i, j));
  show(i, j);
}

let hideTimer = 0,
  loadToken = 0;
function show(i, j) {
  clearTimeout(hideTimer);
  stopMedia();
  Object.assign(pageState, { open: true, territory: i, tab: j });
  const d = DATA[i],
    t = d.tabs[j],
    found = getPage(d.id, slug(t.name)),
    token = ++loadToken;
  if (found && typeof found.then === "function") {
    // Con la base de datos: la cabecera ya, y el contenido cuando llegue (si sigue abierta).
    render(i, j, null);
    found.then((doc) => {
      if (token === loadToken && pageState.open) render(i, j, doc || demoPage(d, t));
    });
  } else render(i, j, found || demoPage(d, t));
  placePage();
  page.scrollTop = 0;
  page.hidden = false;
  document.body.classList.add("in-page");
  // Lo que queda debajo no se alcanza con el tabulador, y la escena deja de dibujarse: la
  // página la tapa entera y el chip no tiene por qué seguir a 60 fps detrás.
  $("#scene").inert = true;
  setSceneHidden(true);
  // Un fotograma después, para que el fundido parta de transparente.
  requestAnimationFrame(() => page.classList.add("is-open"));
  hooks.change();
  page.querySelector("h1").focus({ preventScroll: true });
}

/** Para los vídeos al salir: los subidos se pausan y los de YouTube/Vimeo se descargan. */
function stopMedia() {
  page.querySelectorAll("video").forEach((v) => v.pause());
  page.querySelectorAll("iframe").forEach((f) => f.remove());
}

/** Cierra la página y deja a la vista el campo de cúbits, que no se ha movido. */
export function closePage({ keepHistory = false } = {}) {
  if (!pageState.open) return;
  if (!keepHistory && history.state?.page) history.replaceState(null, "", location.pathname + location.search);
  pageState.open = false;
  loadToken++;
  document.body.classList.remove("in-page");
  page.classList.remove("is-open");
  $("#scene").inert = false;
  setSceneHidden(false);
  stopMedia();
  const hide = () => {
    if (!pageState.open) page.hidden = true;
  };
  if (reduced.matches) hide();
  else hideTimer = setTimeout(hide, 450);
  hooks.change();
}

// Atrás y adelante del navegador.
addEventListener("popstate", (e) => {
  const p = e.state?.page;
  if (p) {
    hooks.territory(p[0]);
    show(p[0], p[1]);
  } else closePage({ keepHistory: true });
});

page.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-crumb], a[data-next]");
  if (!a) return;
  e.preventDefault();
  if (a.dataset.next) openPage(pageState.territory, Number(a.dataset.next));
  else if (a.dataset.crumb === "territory") closePage();
  else hooks.home();
});

/** La página empieza donde acaba la cabecera, que en móvil es más baja. */
function placePage() {
  page.style.setProperty("--page-top", Math.round($("header").getBoundingClientRect().bottom) + "px");
}
addEventListener("resize", () => pageState.open && placePage());

if (import.meta.env.MODE === "test") {
  Object.assign((window.__engine ??= {}), { pageState, openPage, closePage });
}
