/**
 * El campo de cúbits: la retícula heavy-hex del IBM Quantum Heron, portada de
 * `campo-cubits`. Aquí solo hay datos y geometría; el dibujo lo hace el motor de la esfera,
 * porque la transición exige que los dos niveles vivan en el mismo lienzo.
 *
 * **Cada punto de la esfera es un cúbit.** No sobra ni se disuelve ninguno: la esfera se
 * desenrolla entera sobre el plano, que es lo que hace que la transformación se lea como una
 * sola materia que se recoloca. Para eso la retícula es mucho mayor que un Heron —22 filas ×
 * 42 columnas más sus puentes, 1.145 nodos— y los puntos que aun así sobran son motas en los
 * extremos de la primera y la última fila. Sigue siendo la retícula heavy-hex de la máquina,
 * con sus mismas reglas; lo que crece es la oblea, que ahora sigue más allá del encuadre.
 * `core` marca dónde caería el Heron de 156 cúbits, por si hace falta señalarlo.
 */
import { DATA } from './content.js';

export const ROWS = 22;
export const COLS = 42;
/** El Heron: 8 × 16 cúbits con sus 28 puentes, centrado en la oblea. */
const CORE_ROWS = 8;
const CORE_COLS = 16;
const CORE_ROW = (ROWS - CORE_ROWS) / 2; // 7
const CORE_COL = (COLS - CORE_COLS) / 2; // 13
/**
 * Escala de la retícula en el espacio local de la esfera (radio 1). La oblea entera mide
 * aproximadamente el diámetro de la esfera, para que la transformación se lea como **la
 * esfera desenrollándose** y no como puntos que salen disparados fuera del encuadre. Todo lo
 * demás —radios de los cúbits, grosor de los acopladores, distancia de la cámara— va en
 * múltiplos de esta escala, así que cambiarla no descuadra el encuadre final.
 */
export const SCALE = 0.05;
/**
 * Motas: los puntos de la esfera que no caben en la retícula (1.150 − 1.145). Se crean al
 * cargar, no al repartir, porque el circuito dimensiona sus arrays con el número de nodos en
 * cuanto se importa: si aparecieran después, sus últimos cúbits se quedarían sin sitio.
 */
const DUST = 5;
/** Punto de mira de la cámara del territorio: casi en la fila de las hijas y algo a un lado. */
const AIM_ALONG = 0.72;
const AIM_SIDE = 0.6 * SCALE;

/** ¿Hay puente entre la fila `r` y la `r + 1` en la columna `c`? Uno de cada cuatro, alternos. */
export function hasBridge(r, c) {
  return r >= 0 && r < ROWS - 1 && c % 4 === (r % 2 ? 2 : 0);
}
const inCore = (r, c) =>
  r >= CORE_ROW && r < CORE_ROW + CORE_ROWS && c >= CORE_COL && c < CORE_COL + CORE_COLS;

function heavyHex() {
  const nodes = [];
  const edges = [];
  const x0 = -(COLS - 1) / 2;
  const z0 = -((ROWS - 1) * 2) / 2;
  const rowStart = [];
  const bridgeRows = Array.from({ length: ROWS }, () => []);
  for (let r = 0; r < ROWS; r++) {
    rowStart.push(nodes.length);
    for (let c = 0; c < COLS; c++) {
      nodes.push({
        index: nodes.length,
        row: r,
        col: c,
        bridge: false,
        dust: false,
        core: inCore(r, c),
        x: (x0 + c) * SCALE,
        z: (z0 + r * 2) * SCALE,
      });
    }
    for (let c = 0; c < COLS - 1; c++) edges.push([rowStart[r] + c, rowStart[r] + c + 1]);
  }
  // Los puentes van en una segunda pasada: para unir un puente con la fila de abajo, esa
  // fila tiene que existir ya.
  for (let r = 0; r < ROWS - 1; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!hasBridge(r, c)) continue;
      const idx = nodes.length;
      nodes.push({
        index: idx,
        row: r,
        col: c,
        bridge: true,
        dust: false,
        core: inCore(r, c) && inCore(r + 1, c),
        x: (x0 + c) * SCALE,
        z: (z0 + r * 2 + 1) * SCALE,
      });
      bridgeRows[r].push(nodes[idx]);
      edges.push([rowStart[r] + c, idx]);
      edges.push([idx, rowStart[r + 1] + c]);
    }
  }
  // Motas al principio de la primera fila y al final de la última: dentro de su banda el
  // reparto va por longitud, así que se quedan con los extremos de su anillo.
  const head = Math.ceil(DUST / 2);
  const dust = [];
  for (let i = 0; i < DUST; i++) {
    const first = i < head,
      row = first ? 0 : ROWS - 1,
      col = first ? -1 - i * 2 : COLS + (i - head) * 2;
    dust.push({
      index: nodes.length,
      row,
      col,
      bridge: false,
      dust: true,
      core: false,
      x: (x0 + col) * SCALE,
      z: (z0 + row * 2) * SCALE,
    });
    nodes.push(dust[i]);
  }
  return { nodes, edges, rowStart, bridgeRows, dust, head, x0, z0 };
}

const lattice = heavyHex();
export const chip = { nodes: lattice.nodes, edges: lattice.edges };
/** Cúbits del Heron: los que cuentan como máquina (menú, circuito y recuento del rótulo). */
export const CORE_COUNT = chip.nodes.filter((n) => n.core).length;
const byCell = new Map(chip.nodes.map((n) => [`${n.row}:${n.col}:${n.bridge ? 1 : 0}`, n.index]));
const cell = (row, col, bridge = false) => byCell.get(`${row}:${col}:${bridge ? 1 : 0}`) ?? -1;
const edgeAt = new Map(chip.edges.map(([a, b], e) => [a < b ? `${a}:${b}` : `${b}:${a}`, e]));

/**
 * Reparto de los puntos de la esfera entre los nodos de la retícula.
 *
 * Es un **desenrollado**, no una búsqueda del más cercano: los puntos se ordenan por latitud
 * y se reparten por bandas —fila, banda de puentes, fila…— del polo |0⟩ al |1⟩, y dentro de
 * cada banda por longitud, columna a columna. Así la esfera se abre anillo a anillo y ninguna
 * trayectoria se cruza con otra, que es lo que hace que la transformación se lea como una
 * sola pieza desplegándose. Buscar el punto más cercano a cada nodo, que es lo que se hacía
 * cuando solo viajaban 156, dejaba a los últimos nodos con puntos del otro lado de la esfera.
 *
 * Los puntos que sobran —la retícula no cae justo en 1.150— son **motas**: nodos pegados a
 * los extremos de la primera y la última fila, sin acopladores y diminutos. Así no se
 * disuelve ni un punto.
 */
export function assignSources(points, anchors) {
  const bands = [];
  const { rowStart, bridgeRows, dust, head } = lattice;
  for (let r = 0; r < ROWS; r++) {
    const row = Array.from({ length: COLS }, (_, c) => chip.nodes[rowStart[r] + c]);
    if (r === 0) row.unshift(...dust.slice(0, head).sort((a, b) => a.col - b.col));
    if (r === ROWS - 1) row.push(...dust.slice(head).sort((a, b) => a.col - b.col));
    bands.push(row);
    if (r < ROWS - 1) bands.push(bridgeRows[r].slice().sort((a, b) => a.col - b.col));
  }

  // Latitud **ascendente**: en este motor la `y` positiva se dibuja hacia abajo (|0⟩ es
  // y = −1 y va arriba), y la fila 0 del chip cae arriba en la pantalla. Ordenando al revés,
  // el casquete de abajo se iba a la fila del fondo y todos los puntos se cruzaban por el
  // medio: la mitad de la esfera pasaba por encima de la otra mitad.
  const order = points.map((_, i) => i).sort((a, b) => points[a].y - points[b].y);
  const qubitSource = new Int16Array(chip.nodes.length);
  const pointQubit = new Int16Array(points.length).fill(-1);
  let next = 0;
  for (const band of bands) {
    const slice = order.slice(next, next + band.length);
    next += band.length;
    // Dentro de la banda, por longitud: la columna 0 se queda el punto más «al oeste».
    slice.sort((a, b) => Math.atan2(points[a].x, points[a].z) - Math.atan2(points[b].x, points[b].z));
    band.forEach((node, i) => {
      const p = slice[i];
      if (p === undefined) return;
      qubitSource[node.index] = p;
      pointQubit[p] = node.index;
    });
  }
  return { qubitSource, pointQubit, territories: buildTerritories(anchors, qubitSource, points) };
}

/**
 * Cada territorio vive en un cúbit con puente hacia la fila de arriba, y sus hijas —una por
 * pestaña de su ficha— son las columnas seguidas de esa fila, unidas por el puente. Es la
 * misma regla de `campo-cubits`. Cada territorio cae en el cúbit válido **cuyo punto de la
 * esfera está más cerca de su ancla**: así la sección nace exactamente donde acaba de
 * converger la luz, que es lo que cose los dos niveles.
 *
 * Las secciones pueden caer en cualquier parte de la oblea, no solo en el bloque central:
 * los cinco territorios están repartidos por toda la esfera y el bloque central es apenas
 * una octava parte de ella, así que encerrarlos ahí dejaba a tres secciones a más de 70°
 * de su luz. Sí se les pide **margen con el borde**: con la cámara metida en el territorio
 * se ven unas tres columnas a cada lado y unas cinco filas hacia el fondo, y una sección
 * pegada al canto dejaba media pantalla de vacío. Que el cúbit elegido no sea exactamente
 * el del ancla no se nota: el chip se ancla igualmente para que la sección nazca donde
 * acaba de converger la luz.
 */
const EDGE_COL = 6; // columnas de oblea que se reservan a cada lado de una sección
const EDGE_ROW_BACK = 5; // filas hacia el fondo
const EDGE_ROW_FRONT = 4; // filas hacia delante
function buildTerritories(anchors, qubitSource, points) {
  const used = new Set();
  return anchors.map((anchor, i) => {
    const n = DATA[i].tabs.length;
    const first = Math.floor((n - 1) / 2);
    let hub = -1,
      bestDot = -2;
    for (const node of chip.nodes) {
      if (node.dust || node.bridge || !hasBridge(node.row - 1, node.col)) continue;
      if (node.row < EDGE_ROW_BACK || node.row > ROWS - 1 - EDGE_ROW_FRONT) continue;
      const start = node.col - first;
      const cols = Array.from({ length: n }, (_, j) => start + j);
      if (start < EDGE_COL || start + n - 1 > COLS - 1 - EDGE_COL) continue;
      if (used.has(node.index) || cols.some((c) => used.has(cell(node.row - 1, c)))) continue;
      const p = points[qubitSource[node.index]],
        dt = p.x * anchor.x + p.y * anchor.y + p.z * anchor.z;
      if (dt > bestDot) {
        bestDot = dt;
        hub = node.index;
      }
    }
    const h = chip.nodes[hub];
    const cols = Array.from({ length: n }, (_, j) => h.col - first + j);
    const children = cols.map((c) => cell(h.row - 1, c));
    used.add(hub);
    children.forEach((c) => used.add(c));

    // Camino de la luz: puente hacia arriba y tramo de la fila superior.
    const path = [];
    const push = (a, b) => {
      const e = edgeAt.get(a < b ? `${a}:${b}` : `${b}:${a}`);
      if (e !== undefined) path.push(e);
    };
    const bridge = cell(h.row - 1, h.col, true),
      above = cell(h.row - 1, h.col);
    push(hub, bridge);
    push(bridge, above);
    for (let c = Math.min(h.col, cols[0]); c < Math.max(h.col, cols[n - 1]); c++) {
      push(cell(h.row - 1, c), cell(h.row - 1, c + 1));
    }
    // Saltos desde la sección a cada cúbit del camino, para que la luz viaje.
    const hops = new Map([[hub, 0]]);
    const adj = new Map();
    for (const e of path) {
      const [a, b] = chip.edges[e];
      (adj.get(a) ?? adj.set(a, []).get(a)).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)).push(a);
    }
    const queue = [hub];
    for (let q = 0; q < queue.length; q++) {
      for (const j of adj.get(queue[q]) ?? []) {
        if (hops.has(j)) continue;
        hops.set(j, hops.get(queue[q]) + 1);
        queue.push(j);
      }
    }
    // Punto de mira de la cámara: entre la sección y sus hijas, más cerca de ellas.
    const top = chip.nodes[children[0]];
    return { hub, children, path, hops, aim: { x: h.x + AIM_SIDE, z: h.z + (top.z - h.z) * AIM_ALONG } };
  });
}

/** Marco del Heron dentro de la oblea, para poder dibujar su contorno. */
export const coreBounds = {
  x0: (lattice.x0 + CORE_COL - 0.9) * SCALE,
  x1: (lattice.x0 + CORE_COL + CORE_COLS - 1 + 0.9) * SCALE,
  z0: (lattice.z0 + CORE_ROW * 2 - 1.5) * SCALE,
  z1: (lattice.z0 + (CORE_ROW + CORE_ROWS - 1) * 2 + 1.5) * SCALE,
};
