/**
 * Tercer nivel: la página de contenido de cada subitem del campo de cúbits (petición de
 * diseño, 25/09/2026). Se abre al pulsar una pestaña del chip —su esfera o su etiqueta— con un
 * fundido, por encima de la escena y por debajo del menú lateral, que se queda y despliega los
 * subitems del territorio.
 *
 * La maqueta es la de la diseñadora (computacion-cuantica-desktop.html): sus estilos están en
 * page.css, acotados a `.page-view`. Solo «Computación cuántica» tiene contenido propio; el
 * resto de subitems usan una página de prueba con los textos que ya había en content.js.
 *
 * Cada página tiene su dirección (`#/ciencia/computacion-cuantica`), así que el botón atrás
 * del navegador vuelve al campo de cúbits y adelante la reabre.
 */
import { $, reduced } from './dom.js';
import { DATA } from './content.js';
import { setSceneHidden } from './sphere.js';
import computacion from './pages/computacion-cuantica.js';

/** Páginas con contenido propio, por territorio y subitem. */
const PAGES = { "ciencia/computacion-cuantica": computacion };

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

/** Página de prueba: los puntos del subitem que ya había en content.js, sin maqueta propia. */
function testBody(t) {
  return `
<section class="section" aria-labelledby="pg-test">
  <div class="section-head">
    <span class="mono-label mono-label--accent">Página de prueba</span>
    <h2 id="pg-test">${t.name}</h2>
    <p>Contenido provisional. Esta página se completará con los textos definitivos.</p>
  </div>
  <div class="section-body">
    <div class="keys">${t.items
      .map((x) => `<div class="key"><h3>${x[0]}</h3><p>${x[1]}</p></div>`)
      .join("")}</div>
    ${t.note ? `<p class="mono-label">${t.note}</p>` : ""}
  </div>
</section>`;
}

function render(i, j) {
  const d = DATA[i],
    t = d.tabs[j],
    p = PAGES[`${d.id}/${slug(t.name)}`],
    n = d.tabs.length,
    nj = (j + 1) % n;
  page.style.setProperty("--q-section", d.color);
  page.setAttribute("aria-label", t.name);
  page.innerHTML = `
<div class="pg-main">
  <nav aria-label="Ruta">
    <ol class="crumbs mono-label">
      <li><span class="crumb-dot" aria-hidden="true"></span><a href="#" data-crumb="home">Universo</a></li>
      <li><a href="#" data-crumb="territory">${d.name}</a></li>
      <li><span aria-current="page">${p?.crumb || t.name}</span></li>
    </ol>
  </nav>
  <section class="hero">
    <h1 class="rise" tabindex="-1">${p ? p.title : t.name}</h1>
    <p class="lead rise rise-3">${p ? p.lead : d.summary}</p>
    <div class="sphere-wrap rise rise-4">
      <canvas class="pg-bloch" role="img" aria-label="Esfera de Bloch: representación del estado de un qubit entre |0⟩ y |1⟩"></canvas>
      <span class="sphere-caption mono-label">Fig. 01 · Esfera de Bloch</span>
    </div>
  </section>
  ${p ? p.body : testBody(t)}
  <section class="section section--wide" aria-label="Seguir explorando">
    <a class="pg-next" href="#" data-next="${nj}">
      <span class="mono-label mono-label--accent">Siguiente · ${nj + 1} / ${n}</span>
      <span class="next-title"><span>${d.tabs[nj].name}</span>${ARROW}</span>
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
  stopBloch = null;
function show(i, j) {
  clearTimeout(hideTimer);
  Object.assign(pageState, { open: true, territory: i, tab: j });
  render(i, j);
  placePage();
  page.scrollTop = 0;
  page.hidden = false;
  document.body.classList.add("in-page");
  // Lo que queda debajo no se alcanza con el tabulador, y la escena deja de dibujarse: la
  // página la tapa entera y el chip no tiene por qué seguir a 60 fps detrás.
  $("#scene").inert = true;
  setSceneHidden(true);
  stopBloch?.();
  stopBloch = bloch(page.querySelector(".pg-bloch"));
  // Un fotograma después, para que el fundido parta de transparente.
  requestAnimationFrame(() => page.classList.add("is-open"));
  hooks.change();
  page.querySelector("h1").focus({ preventScroll: true });
}

/** Cierra la página y deja a la vista el campo de cúbits, que no se ha movido. */
export function closePage({ keepHistory = false } = {}) {
  if (!pageState.open) return;
  if (!keepHistory && history.state?.page) history.replaceState(null, "", location.pathname + location.search);
  pageState.open = false;
  document.body.classList.remove("in-page");
  page.classList.remove("is-open");
  $("#scene").inert = false;
  setSceneHidden(false);
  stopBloch?.();
  stopBloch = null;
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

/**
 * Esfera de Bloch del diseño, ambiental y no interactiva: 520 puntos que giran despacio, el
 * ecuador, el eje z y el vector de estado |ψ⟩ precesando. Las etiquetas van en la tipografía
 * del sitio. Devuelve la función que la para.
 */
function bloch(cv) {
  const ctx = cv?.getContext("2d");
  if (!ctx) return () => {};
  const font = getComputedStyle(document.documentElement).getPropertyValue("--font").trim() || "sans-serif";
  const N = 520,
    pts = [],
    ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2,
      r = Math.sqrt(1 - y * y),
      t = ga * i;
    pts.push([Math.cos(t) * r, y, Math.sin(t) * r, Math.random()]);
  }
  let W = 0,
    H = 0,
    R = 0,
    cx = 0,
    cy = 0,
    raf = 0;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2),
      b = cv.getBoundingClientRect();
    W = b.width;
    H = b.height;
    cv.width = W * dpr;
    cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W, H) * 0.34;
    cx = W / 2;
    cy = H * 0.47;
  }
  const tilt = 0.32,
    ct = Math.cos(tilt),
    st = Math.sin(tilt);
  const proj = (x, y, z) => [cx + x * R, cy - (y * ct - z * st) * R, y * st + z * ct];
  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R * 1.5);
    g.addColorStop(0, "rgba(60,50,150,.42)");
    g.addColorStop(0.6, "rgba(18,16,74,.25)");
    g.addColorStop(1, "rgba(7,8,15,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const a = t * 0.00012,
      ca = Math.cos(a),
      sa = Math.sin(a);
    for (const p of pts) {
      const [sx, sy, sz] = proj(p[0] * ca + p[2] * sa, p[1], -p[0] * sa + p[2] * ca);
      const front = (sz + 1) / 2,
        tw = 0.75 + 0.25 * Math.sin(t * 0.002 + p[3] * 20),
        rim = Math.pow(1 - Math.abs(sz), 2);
      ctx.fillStyle =
        rim > 0.55 ? `rgba(180,160,230,${(0.25 + rim * 0.6) * tw})` : `rgba(143,158,251,${(0.12 + front * 0.6) * tw})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.6 + front * 1.3, 0, 6.283);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(143,158,251,.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 0; k <= 64; k++) {
      const th = (k / 64) * 6.283,
        [sx, sy] = proj(Math.cos(th), 0, Math.sin(th));
      k ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
    }
    ctx.stroke();
    const top = proj(0, 1.28, 0),
      bot = proj(0, -1.22, 0);
    ctx.strokeStyle = "rgba(189,187,202,.45)";
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.lineTo(bot[0], bot[1]);
    ctx.stroke();
    ctx.fillStyle = "#BDBBCA";
    ctx.font = `14px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText("z · |0⟩", top[0], top[1] - 8);
    ctx.fillText("|1⟩", bot[0], bot[1] + 18);
    const th = 0.95,
      ph = t * 0.0006,
      o = proj(0, 0, 0),
      v = proj(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    ctx.strokeStyle = "rgba(180,250,250,.85)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(o[0], o[1]);
    ctx.lineTo(v[0], v[1]);
    ctx.stroke();
    const gg = ctx.createRadialGradient(v[0], v[1], 0, v[0], v[1], 18);
    gg.addColorStop(0, "rgba(180,250,250,.95)");
    gg.addColorStop(0.25, "rgba(180,250,250,.5)");
    gg.addColorStop(1, "rgba(180,250,250,0)");
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(v[0], v[1], 18, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(v[0], v[1], 3, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = "#B4FAFA";
    ctx.textAlign = "left";
    ctx.fillText("|ψ⟩", v[0] + 12, v[1] - 10);
  }
  const loop = (t) => {
    draw(t);
    raf = requestAnimationFrame(loop);
  };
  const onResize = () => {
    size();
    draw(performance.now());
  };
  size();
  addEventListener("resize", onResize);
  if (reduced.matches) draw(4000);
  else raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener("resize", onResize);
  };
}

if (import.meta.env.MODE === "test") Object.assign((window.__engine ??= {}), { pageState, openPage, closePage });
