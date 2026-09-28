/**
 * De dónde salen las páginas de tercer nivel. **Es lo único que cambia al conectar Supabase.**
 *
 * Hoy son los JSON de src/paginas/, uno por página, que Vite mete en el build. Con Supabase,
 * `getPage` hará la consulta (una tabla `paginas` con `territorio`, `subitem` y el documento,
 * o los bloques en su propia tabla) y devolverá una promesa: page.js ya acepta las dos cosas,
 * y mientras llega enseña la página vacía con su cabecera.
 *
 * Devuelve el documento de la página o `null` si ese subitem aún no tiene: entonces page.js
 * enseña una página de prueba con todos los tipos de bloque.
 */
const locales = import.meta.glob("./paginas/*.json", { eager: true, import: "default" });
const paginas = new Map(Object.values(locales).map((p) => [`${p.territorio}/${p.subitem}`, p]));

export function getPage(territorio, subitem) {
  return paginas.get(`${territorio}/${subitem}`) ?? null;
}
