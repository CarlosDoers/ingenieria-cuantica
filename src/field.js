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
  const territories = buildTerritories(anchors, qubitSource, points);
  claimNearest(territories, anchors, points, qubitSource, pointQubit);
  return { qubitSource, pointQubit, territories };
}

/**
 * **El punto que se pulsa es el que se convierte en la sección.** La sección tiene que caer
 * lejos de los bordes de la oblea, y el punto que le tocaba por el desenrollado podía estar
 * lejísimos de su ancla: 28° en dos territorios, casi cinco puntos de distancia. Con el zoom
 * primero se veía entero: la esfera de la sección entraba al anillo desde otro sitio.
 *
 * Así que, ya elegidas, cada sección recibe el punto más cercano a su ancla y sus pestañas
 * los siguientes, en orden de oeste a este como sus columnas. Los puntos que tenían se los
 * quedan los nodos que se quedan sin el suyo: es un intercambio uno a uno, así que ningún
 * punto se pierde ni se repite. Son diez puntos de 1.150.
 */
function claimNearest(territories, anchors, points, qubitSource, pointQubit) {
  const claimed = new Set();
  const give = (node, p) => {
    const old = qubitSource[node],
      other = pointQubit[p];
    if (old === p) return;
    qubitSource[node] = p;
    pointQubit[p] = node;
    if (other >= 0) {
      qubitSource[other] = old;
      pointQubit[old] = other;
    } else pointQubit[old] = -1;
  };
  territories.forEach((t, i) => {
    const a = anchors[i],
      near = points
        .map((p, k) => [k, p.x * a.x + p.y * a.y + p.z * a.z])
        .filter(([k]) => !claimed.has(k))
        .sort((u, v) => v[1] - u[1])
        .slice(0, 1 + t.children.length)
        .map(([k]) => k);
    give(t.hub, near[0]);
    const lon = Math.atan2(a.x, a.z),
      west = (k) => {
        const d = Math.atan2(points[k].x, points[k].z) - lon;
        return Math.atan2(Math.sin(d), Math.cos(d));
      };
    near
      .slice(1)
      .sort((u, v) => west(u) - west(v))
      .forEach((k, j) => give(t.children[j], k));
    near.forEach((k) => claimed.add(k));
  });
}

/**
 * Formas de los territorios (30/09/2026): antes todos dibujaban la misma «T» —la sección, su
 * puente y las tres pestañas en la fila de arriba— y se pidió que cada uno se formara de una
 * manera. Hay formas para una a seis pestañas (`SHAPES[n]`), porque el cliente podrá añadir y
 * quitar pestañas. Cada forma dice dónde caen las pestañas (`children`, celdas `[fila, columna]`
 * relativas a la sección, de izquierda a derecha) y por dónde viaja la luz hasta ellas
 * (`walks`, recorridos de celdas contiguas; un paso de fila pasa por su puente).
 *
 * Todas respetan la retícula heavy-hex: las filas van unidas de lado a lado y entre dos filas
 * solo hay puente una de cada cuatro columnas, alternas, así que desde la sección se sube por
 * su columna y el siguiente puente hacia el fondo queda dos columnas más allá.
 *
 * **Crecen hacia la izquierda, no hacia la derecha.** Con el giro de la cámara, cada fila
 * hacia el fondo se ve una columna más a la derecha en pantalla: la fila de arriba de la «T»
 * ya ocupa desde la sección hasta dos columnas a su derecha. Una forma que además se alargue
 * a la derecha no cabe en móvil (la sección y la última etiqueta quedaban cortadas); hacia la
 * izquierda, en cambio, queda centrada sobre la sección. Y ninguna va hacia delante de la
 * sección, donde taparía su nombre.
 */
const UP = [[0, 0], [-1, 0]]; // de la sección a la fila de arriba, por su puente
const SHAPES = {
  1: [{ children: [[-1, 0]], walks: [UP] }],
  2: [
    // Las dos arriba.
    { children: [[-1, -1], [-1, 0]], walks: [[...UP, [-1, -1]]] },
    // Una a cada lado de la sección.
    { children: [[0, -1], [0, 1]], walks: [[[0, 0], [0, -1]], [[0, 0], [0, 1]]] },
    // Una arriba y otra al lado.
    { children: [[-1, 0], [0, 1]], walks: [UP, [[0, 0], [0, 1]]] },
  ],
  3: [
    // Tridente: una pestaña a cada lado de la sección y otra arriba.
    { children: [[0, -1], [-1, 0], [0, 1]], walks: [[[0, 0], [0, -1]], UP, [[0, 0], [0, 1]]] },
    // Escalera: dos en la fila de arriba, con un cúbit de paso entre ellas, y la tercera un
    // escalón más al fondo, que en pantalla queda en medio y más alta.
    { children: [[-1, -2], [-2, -2], [-1, 0]], walks: [[...UP, [-1, -1], [-1, -2], [-2, -2]]] },
    // Escuadra: las tres en la fila de arriba, hacia un lado; en pantalla, un arco sobre la
    // sección.
    { children: [[-1, -2], [-1, -1], [-1, 0]], walks: [[...UP, [-1, -1], [-1, -2]]] },
    // Gancho: dos arriba y la tercera al lado de la sección.
    { children: [[-1, -1], [-1, 0], [0, 1]], walks: [[...UP, [-1, -1]], [[0, 0], [0, 1]]] },
    // T: la de siempre.
    { children: [[-1, -1], [-1, 0], [-1, 1]], walks: [[...UP, [-1, -1]], [[-1, 0], [-1, 1]]] },
  ],
  4: [
    // Corona: una a cada lado de la sección y dos arriba.
    {
      children: [[0, -1], [-1, -1], [-1, 0], [0, 1]],
      walks: [[[0, 0], [0, -1]], [...UP, [-1, -1]], [[0, 0], [0, 1]]],
    },
    // Escuadra con la cuarta al lado de la sección.
    {
      children: [[-1, -2], [-1, -1], [-1, 0], [0, 1]],
      walks: [[...UP, [-1, -1], [-1, -2]], [[0, 0], [0, 1]]],
    },
    // Cuadro: dos a los lados de la sección y dos arriba, separadas por un cúbit de paso.
    {
      children: [[0, -1], [-1, -2], [-1, 0], [0, 1]],
      walks: [[[0, 0], [0, -1]], [...UP, [-1, -1], [-1, -2]], [[0, 0], [0, 1]]],
    },
  ],
  5: [
    // Una a cada lado de la sección y tres arriba.
    {
      children: [[0, -1], [-1, -2], [-1, -1], [-1, 0], [0, 1]],
      walks: [[[0, 0], [0, -1]], [...UP, [-1, -1], [-1, -2]], [[0, 0], [0, 1]]],
    },
  ],
  6: [
    // Lo mismo y la sexta un escalón más al fondo.
    {
      children: [[0, -1], [-1, -2], [-2, -2], [-1, -1], [-1, 0], [0, 1]],
      walks: [[[0, 0], [0, -1]], [...UP, [-1, -1], [-1, -2], [-2, -2]], [[0, 0], [0, 1]]],
    },
  ],
};
/**
 * La forma del territorio `i` con `n` pestañas: las de su número se reparten por orden de
 * territorio. Con más de seis no hay forma compacta: van en fila arriba, como la «T», y en
 * móvil las últimas se salen del encuadre.
 */
function shapeOf(i, n) {
  const list = SHAPES[n];
  if (list) return list[i % list.length];
  const first = Math.floor((n - 1) / 2),
    row = Array.from({ length: n }, (_, j) => [-1, j - first]);
  return { children: row, walks: [UP, row] };
}

/**
 * Cada territorio vive en un cúbit —su sección— y sus hijas, una por pestaña de su ficha,
 * son cúbits vecinos unidos a él por el camino de su forma (`SHAPES`). Cada territorio cae
 * en el cúbit válido **cuyo punto de la esfera está más cerca de su ancla**: así la sección
 * nace exactamente donde acaba de converger la luz, que es lo que cose los dos niveles.
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
    const shape = shapeOf(i, DATA[i].tabs.length);
    // La forma colocada con la sección en `node`: sus cúbits (celdas y puentes) y los
    // acopladores del camino, o `null` si ahí no cabe: fuera de margen, sin puente donde
    // hace falta o pisando a otro territorio.
    const place = (node) => {
      const cells = new Set([node.index]),
        path = [];
      let back = 0;
      for (const walk of shape.walks) {
        for (let k = 0; k < walk.length; k++) {
          const r = node.row + walk[k][0],
            c = node.col + walk[k][1],
            q = cell(r, c);
          if (q < 0 || c < EDGE_COL || c > COLS - 1 - EDGE_COL) return null;
          back = Math.min(back, walk[k][0]);
          cells.add(q);
          if (!k) continue;
          const pr = node.row + walk[k - 1][0],
            prev = cell(pr, node.col + walk[k - 1][1]);
          // De una fila a otra se pasa por el puente de esa columna, si lo hay.
          const via = pr === r ? [prev, q] : [prev, cell(Math.min(pr, r), c, true), q];
          if (via.includes(-1)) return null;
          for (let v = 1; v < via.length; v++) {
            const e = edgeAt.get(via[v - 1] < via[v] ? `${via[v - 1]}:${via[v]}` : `${via[v]}:${via[v - 1]}`);
            if (e === undefined) return null;
            path.push(e);
            cells.add(via[v]);
          }
        }
      }
      // El margen del fondo se cuenta desde la fila de arriba de la sección, como antes; una
      // forma que sube un escalón más necesita una fila más.
      if (node.row < EDGE_ROW_BACK - 1 - back || node.row > ROWS - 1 - EDGE_ROW_FRONT) return null;
      for (const q of cells) if (used.has(q)) return null;
      return { cells, path };
    };
    let hub = -1,
      placed = null,
      bestDot = -2;
    for (const node of chip.nodes) {
      if (node.dust || node.bridge) continue;
      const p = points[qubitSource[node.index]],
        dt = p.x * anchor.x + p.y * anchor.y + p.z * anchor.z;
      if (dt <= bestDot) continue;
      const fit = place(node);
      if (!fit) continue;
      bestDot = dt;
      hub = node.index;
      placed = fit;
    }
    const h = chip.nodes[hub],
      { path } = placed;
    const children = shape.children.map(([r, c]) => cell(h.row + r, h.col + c));
    placed.cells.forEach((q) => used.add(q));

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
    // Punto de mira de la cámara: entre la sección y el centro de sus hijas, más cerca de
    // ellas y algo a un lado. Con la «T» es el mismo de siempre.
    const n = children.length,
      cx = children.reduce((a, q) => a + chip.nodes[q].x, 0) / n,
      cz = children.reduce((a, q) => a + chip.nodes[q].z, 0) / n;
    return {
      hub,
      children,
      path,
      hops,
      aim: { x: h.x + (cx - h.x) * AIM_ALONG + AIM_SIDE, z: h.z + (cz - h.z) * AIM_ALONG },
    };
  });
}

/** Marco del Heron dentro de la oblea, para poder dibujar su contorno. */
export const coreBounds = {
  x0: (lattice.x0 + CORE_COL - 0.9) * SCALE,
  x1: (lattice.x0 + CORE_COL + CORE_COLS - 1 + 0.9) * SCALE,
  z0: (lattice.z0 + CORE_ROW * 2 - 1.5) * SCALE,
  z1: (lattice.z0 + (CORE_ROW + CORE_ROWS - 1) * 2 + 1.5) * SCALE,
};
