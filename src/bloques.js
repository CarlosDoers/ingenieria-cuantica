/**
 * Bloques de las páginas de tercer nivel (28/09/2026). Una página es un documento —título,
 * entradilla, cabecera opcional y una lista ordenada de bloques— y aquí se pinta cada tipo de
 * bloque con la maqueta de la diseñadora (page.css). El formato está descrito en el README
 * («Tercer nivel: bloques»); hoy los documentos son JSON en src/paginas/ y mañana vendrán de
 * Supabase, pero esto no cambia.
 *
 * Todo lo que escribe el cliente se trata como no fiable: los textos simples se escapan y el
 * Markdown se convierte y **se sanea** (DOMPurify) antes de entrar en la página.
 */
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { reduced } from './dom.js';

export const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Solo rutas del propio sitio o direcciones http(s): nada de `javascript:` ni `data:`. */
const safeUrl = (u = "") => (/^(\/(?!\/)|https?:\/\/)/.test(String(u)) ? String(u) : "");

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  // Los enlaces externos del Markdown se abren aparte, sin dar acceso a esta ventana.
  if (node.tagName === "A" && /^https?:\/\//.test(node.getAttribute("href") || "")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
  // Las imágenes, con la misma regla que las de los bloques.
  if (node.tagName === "IMG" && !safeUrl(node.getAttribute("src"))) node.remove();
});

/**
 * El Markdown del cliente, con tres ajustes:
 * - Los títulos bajan de nivel para no competir con el de la página: `#` es un título de
 *   sección (h2) en el bloque «markdown» y un subtítulo (h3) dentro de un bloque con título.
 * - Una imagen sola en su párrafo se pinta como las figuras de los bloques, con marco y con
 *   pie numerado si lo trae: `![texto alternativo](/media/foto.jpg "Pie")`.
 * - Las tablas van en una caja que se desplaza de lado si no caben (en móvil).
 */
let nivel = 3, // el nivel que toma `#`
  figuras = null; // el contador de figuras de la página, mientras se pintan sus bloques
const parser = new Marked({
  gfm: true,
  walkTokens(t) {
    if (t.type === "heading") t.depth = Math.min(t.depth + nivel - 1, 6);
  },
  renderer: {
    paragraph({ tokens }) {
      const img = tokens.length === 1 && tokens[0].type === "image" ? tokens[0] : null;
      if (!img || !safeUrl(img.href)) return false;
      return figura(media({ tipo: "imagen", src: img.href, alt: img.text }), img.title, "", figuras);
    },
  },
});
/** Markdown de bloque (párrafos, listas, títulos, imágenes, tablas…), convertido y saneado. */
export function md(text = "", { desde = 3 } = {}) {
  nivel = desde;
  const html = parser
    .parse(String(text))
    .replace(/<table>/g, '<div class="md-tabla"><table>')
    .replace(/<\/table>/g, "</table></div>");
  return DOMPurify.sanitize(html);
}
/** Markdown de una línea (negritas, cursivas, enlaces), para textos cortos. */
export const mdInline = (text = "") => DOMPurify.sanitize(parser.parseInline(String(text)));

/**
 * Enlace de YouTube o Vimeo → dirección del reproductor incrustado. YouTube va por su dominio
 * sin cookies y Vimeo con «no rastrear». Devuelve `null` si no es un enlace reconocido.
 */
export function embedUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.slice(1);
  else if (host === "youtube.com" || host === "youtube-nocookie.com")
    id = u.searchParams.get("v") || (u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]+)/) || [])[1];
  if (id && /^[\w-]{6,20}$/.test(id))
    return { src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, proveedor: "YouTube" };
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    // Los vídeos no listados llevan un código tras el número (vimeo.com/123456/abc123) o `?h=`.
    const m = u.pathname.match(/\/(\d{5,})(?:\/([\da-f]{6,}))?/),
      h = (m && m[2]) || u.searchParams.get("h");
    if (m)
      return {
        src: `https://player.vimeo.com/video/${m[1]}?${h && /^[\da-f]+$/.test(h) ? `h=${h}&` : ""}dnt=1`,
        proveedor: "Vimeo",
      };
  }
  return null;
}

/**
 * Una imagen, un vídeo subido o un vídeo de YouTube/Vimeo, dentro de su marco.
 * - `{ tipo: "imagen", src, alt, ancho?, alto? }`
 * - `{ tipo: "video", src, poster?, automatico? }`: con `automatico` arranca solo, sin sonido
 *   y en bucle (para cabeceras); si no, con controles. Con movimiento reducido, nunca solo.
 * - `{ tipo: "enlace", url }`: dirección normal de YouTube o Vimeo, tal cual se copia.
 */
export function media(m) {
  if (!m) return "";
  // Una imagen o un vídeo sin dirección válida no se pinta: mejor nada que un marco vacío.
  const src = safeUrl(m.src);
  if (m.tipo === "imagen" && src) {
    const size = m.ancho && m.alto ? ` width="${Number(m.ancho)}" height="${Number(m.alto)}"` : "";
    return `<div class="fig-frame media-imagen"><img src="${esc(src)}" alt="${esc(m.alt)}"${size} loading="lazy" decoding="async"></div>`;
  }
  if (m.tipo === "video" && src) {
    const auto = m.automatico && !reduced.matches,
      poster = safeUrl(m.poster) ? ` poster="${esc(safeUrl(m.poster))}"` : "";
    return `<div class="fig-frame media-video"><video src="${esc(src)}"${poster} ${
      auto ? "autoplay muted loop" : "controls preload=\"metadata\""
    } playsinline></video></div>`;
  }
  if (m.tipo === "enlace") {
    const e = embedUrl(m.url);
    if (!e) return `<div class="fig-frame media-error"><p class="mono-label">Enlace de vídeo no reconocido</p></div>`;
    return `<div class="fig-frame media-enlace"><iframe src="${esc(e.src)}" title="Vídeo de ${e.proveedor}" loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>`;
  }
  return "";
}

/**
 * Figura: el marco con su pie numerado («Fig. 02 · …») y el crédito a la derecha. Sin
 * contador (Markdown fuera de una página), el pie va sin número.
 */
function figura(m, pie, credito, ctx) {
  if (!m) return "";
  const n = ctx ? `Fig. ${String(++ctx.fig).padStart(2, "0")}` : "",
    texto = [n, pie && esc(pie)].filter(Boolean).join(" · "),
    cap =
      pie || credito
        ? `<figcaption><span class="mono-label">${texto}</span>${
            credito ? `<span class="mono-label">${esc(credito)}</span>` : ""
          }</figcaption>`
        : "";
  return `<figure>${m}${cap}</figure>`;
}
const figure = (b, ctx) => figura(media(b.media), b.pie, b.credito, ctx);

/** Cabecera de sección: título y texto a la izquierda en escritorio, arriba en móvil. */
function head(b, id, { conTexto = true } = {}) {
  const t = b.titulo ? `<h2 id="${id}">${esc(b.titulo)}</h2>` : "",
    p = conTexto && b.texto ? `<div class="md">${md(b.texto)}</div>` : "";
  return t || p ? `<div class="section-head">${t}${p}</div>` : "";
}
function section(b, i, h, body, extra = "") {
  const id = `blk-${i}`;
  return `<section class="section blk blk-${esc(b.tipo)}${h ? "" : " section--wide"}${extra}"${
    b.titulo ? ` aria-labelledby="${id}"` : ""
  } data-bloque="${esc(b.tipo)}">${h}<div class="section-body">${body}</div></section>`;
}

const RENDER = {
  /** Solo texto: título opcional y cuerpo en Markdown. */
  texto: (b, i) =>
    section(
      b,
      i,
      head(b, `blk-${i}`, { conTexto: false }),
      `<div class="md">${md(b.texto, { desde: b.titulo ? 3 : 2 })}</div>`
    ),
  /**
   * Un documento Markdown entero, a todo el ancho: lo que se pega o se sube tal cual. El
   * texto se queda a un ancho cómodo de leer; las imágenes y las tablas usan todo el ancho.
   */
  markdown: (b, i) =>
    section(
      b,
      i,
      "",
      `<div class="md md-doc">${b.titulo ? `<h2 id="blk-${i}">${esc(b.titulo)}</h2>` : ""}${md(b.texto, {
        desde: b.titulo ? 3 : 2,
      })}</div>`
    ),
  /** Texto con imagen (o vídeo) a un lado; `lado: "izquierda"` la pone delante. */
  "texto-imagen": (b, i, ctx) =>
    section(b, i, head(b, `blk-${i}`), figure(b, ctx), b.lado === "izquierda" ? " section--flip" : ""),
  /** Imagen o vídeo; sin título ni texto, a todo el ancho. */
  "imagen-video": (b, i, ctx) => section(b, i, head(b, `blk-${i}`), figure(b, ctx)),
  /** Tarjetas: elementos con título y texto corto, hasta tres por fila. */
  tarjetas: (b, i) => {
    const els = b.elementos || [];
    return section(
      b,
      i,
      head(b, `blk-${i}`),
      `<div class="areas" style="--cols:${Math.min(Math.max(els.length, 1), 3)}">${els
        .map((e) => `<div class="area"><b>${esc(e.titulo)}</b><span>${mdInline(e.texto)}</span></div>`)
        .join("")}</div>`
    );
  },
  /** Pasos numerados; el último se enciende, como en el diseño. */
  pasos: (b, i) =>
    section(
      b,
      i,
      head(b, `blk-${i}`),
      `<ol class="steps">${(b.pasos || [])
        .map(
          (p, k) =>
            `<li class="step"><span class="step-dot" aria-hidden="true">${String(k + 1).padStart(2, "0")}</span><div class="step-body"><h3>${esc(
              p.titulo
            )}</h3><p>${mdInline(p.texto)}</p></div></li>`
        )
        .join("")}</ol>`
    ),
  /** Lista de datos: filas con nombre y valor. */
  datos: (b, i) =>
    section(
      b,
      i,
      head(b, `blk-${i}`),
      `<dl class="hw">${(b.filas || [])
        .map((f) => `<div class="hw-row"><dt>${esc(f.nombre)}</dt><dd class="mono-label">${esc(f.valor)}</dd></div>`)
        .join("")}</dl>`
    ),
};
export const TIPOS = Object.keys(RENDER);

/** Los bloques de una página, en orden. Un tipo desconocido se salta en vez de romperla. */
export function bloques(list = []) {
  const ctx = { fig: 0 };
  figuras = ctx; // las imágenes del Markdown se numeran con las de los bloques
  const html = list
    .map((b, i) => {
      const r = RENDER[b?.tipo];
      if (!r) {
        if (import.meta.env.DEV) console.warn("Bloque de tipo desconocido:", b?.tipo);
        return "";
      }
      return r(b, i, ctx);
    })
    .join("");
  figuras = null;
  return html;
}

if (import.meta.env.MODE === "test") {
  Object.assign((window.__engine ??= {}), { bloques, embedUrl, TIPOS });
}
