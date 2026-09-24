import { $, $$, reduced } from './dom.js';
import { SCALE, assignSources, chip } from './field.js';
import { circuit, circuitStatus, resetCircuit, stepCircuit } from './circuit.js';
import { DATA } from './content.js';
import { activity, nodeEls, selected } from './app.js';
import { positionCard } from './card.js';
import { sound } from './audio.js';
import { drawBackdrop } from './background.js';

/* V3 · Original pulse restored. The particle geometry is immutable.
   Territory clicks move a LIGHT field, never particle positions. */
export const canvas = $("#universe"),
  ctx = canvas.getContext("2d");
/**
 * Pausa del movimiento: el giro de la esfera, los pulsos y el circuito del chip. Ya no hay
 * botón de pausa —se quitó con los controles de la esquina—, así que solo la activa el
 * ajuste de movimiento reducido del sistema.
 */
let paused = reduced.matches;
export let W = 0,
  H = 0,
  R = 0,
  CX = 0,
  CY = 0,
  rotationY = 0.12,
  rotationX = -0.1,
  raf = 0,
  lastFrame = 0;
export const introState = {
  active: true,
  holding: false,
  progress: 0,
  started: 0,
  bursting: false,
  burstStart: 0,
};
export const camera = {
  mix: 0,
  target: 0,
  turning: false,
  y: 0.12,
  x: -0.1,
  restY: 0.12,
  restX: -0.1,
};
let draggedOutside = false;
export let elapsed = 0;
let motionTime = 0,
  lastIdle = 0,
  pointer = null,
  projected = [],
  waves = [],
  lightTransition = null;
const N = 1150,
  GOLD = Math.PI * (3 - Math.sqrt(5));
/**
 * Color de un punto. **Sin memoización**: los cuatro componentes varían de forma continua
 * con la posición, la profundidad y el pulso, así que cachearlos hacía crecer un Map sin
 * techo —164.000 entradas en 40 segundos, medidas— y esto va a estar días encendido en una
 * pantalla de exposición.
 *
 * Lo que sí ahorra es **redondear antes de formatear**. El coste no estaba en concatenar
 * sino en convertir flotantes largos («0.5234523452345235» son dieciocho caracteres) y en
 * que el lienzo tuviera que parsear esa cadena como color CSS, 2.300 veces por fotograma.
 */
function hsla(h, s, l, a) {
  return `hsla(${h | 0},${s | 0}%,${l | 0}%,${((a * 100) | 0) / 100})`;
}
export const dot = (a, b) =>
  Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
const unit = (p) => {
  const n = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / n, y: p.y / n, z: p.z / n };
};
// Latitudes y longitudes reales: algunos puntos están detrás y se descubren al girar.
export const ANCHORS = [
  [0.66, 0.1],
  [0.12, 1.16],
  [-0.42, 2.62],
  [-0.57, 3.87],
  [0.26, 5.2],
].map(([y, longitude]) => ({
  x: Math.sqrt(1 - y * y) * Math.sin(longitude),
  y,
  z: Math.sqrt(1 - y * y) * Math.cos(longitude),
}));
const points = Object.freeze(
  Array.from({ length: N }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / N,
      r = Math.sqrt(1 - y * y),
      a = GOLD * i;
    return Object.freeze({ x: Math.cos(a) * r, y, z: Math.sin(a) * r });
  })
);
/**
 * Transformación esfera → campo de cúbits.
 *
 * `field.mix` va de 0 (esfera) a 1 (chip, con la cámara dentro del territorio). Se reparte
 * en dos tiempos que se solapan: primero la esfera **se despliega** en el chip (`fe`) y,
 * cuando ya casi es chip, la cámara **entra** en el territorio elegido (`ff`). Antes de
 * empezar se espera a que la luz converja sobre el punto pulsado, que es el gesto propio
 * de este proyecto y no debía perderse por el camino.
 *
 * La interpolación se hace en espacio de cámara: cada punto va de donde lo pone la cámara
 * de la esfera a donde lo pone la cámara del campo. Así la esfera puede seguir girando
 * con su propia lógica y el chip tiene su propia cámara, sin pelearse por `rotationY/X`.
 */
const FIELD_SECONDS = 2.8; // duración de la transformación completa
/**
 * Lo que se espera antes de desplegar. Va muy corto a propósito: la transformación tiene que
 * arrancar **con el clic**, no después de un compás de espera; con medio segundo parecía que
 * el chip respondía a otra cosa. La luz convergente no se pierde porque sigue viva sobre los
 * puntos que todavía son esfera, y esa zona es la última en disolverse.
 */
const FIELD_DELAY = 0.12;
const FIELD_SPREAD = 0.45; // desfase máximo entre el primer punto que sale y el último
/**
 * Cámara del campo. **Arranca en la de la esfera** —a la misma distancia, 3,8, y con el
 * picado de campo-cubits— para que el chip nazca donde estaba la esfera, y **acaba en el
 * encuadre oblicuo de campo-cubits**: girada, más baja y muy cerca, con la sección grande
 * abajo a la izquierda, el puente subiendo a la derecha y la fila de las pestañas
 * alejándose en diagonal.
 *
 * Es una cámara de verdad, con distancia y perspectiva, y no un zoom de la imagen: por eso
 * lo cercano se ve grande y lo lejano pequeño, y por eso se puede orbitar arrastrando.
 * Giro y picado se interpolan con `ff`; la distancia, de forma geométrica, como el zoom
 * de antes (lo que el ojo percibe es la proporción, no la diferencia).
 */
const FIELD_START = { yaw: 0, pitch: -1.0, dist: 3.8 };
// La distancia va en columnas del chip, no en unidades sueltas: la retícula creció mucho y
// se hizo más fina para que la esfera entera quepa en ella, y el encuadre final tiene que
// seguir siendo el mismo.
const FIELD_VIEW = { yaw: -0.44, pitch: -0.48, dist: 6.8 * SCALE };
/** Límites del arrastre: ni cenital del todo ni a ras del chip, y un margen de acercamiento. */
const PITCH_MIN = -1.35,
  PITCH_MAX = -0.22,
  ZOOM_MIN = 0.65,
  ZOOM_MAX = 1.8;
/**
 * Tamaños de campo-cubits pasados a este chip (allí una columna mide 1; aquí, `SCALE`):
 * radio del cúbit, del puente, de la sección y de las hijas encendidas, grosor del
 * acoplador y radio y grosor del anillo de la sección abierta.
 */
const QUBIT_R = 0.17 * SCALE,
  BRIDGE_R = 0.11 * SCALE,
  HUB_R = 0.28 * SCALE,
  SUB_R = 0.23 * SCALE,
  DUST_R = 0.06 * SCALE, // las motas: los puntos que no caben en la retícula
  BAR_W = 0.044 * SCALE,
  RING_R = 0.42 * SCALE,
  RING_W = 0.016 * SCALE;
/** Color de los acopladores de la oblea lejana, los que van en trazo de grupo. */
const THIN_BAR = "hsl(230,26%,20%)";
/**
 * En pantallas estrechas (las mismas en que el menú pasa a ir arriba) las pestañas no caben
 * con la cámara a la distancia de escritorio: se acerca algo más y se desplaza a la derecha
 * para que la sección no se salga por la izquierda.
 */
const compact = matchMedia("(max-width: 760px)");
/** Plano cercano, en unidades del chip: lo que queda más cerca de la cámara no se dibuja. */
const NEAR = 0.7 * SCALE,
  NEAR_FADE = 1 * SCALE;
const field = {
  mix: 0,
  target: 0,
  wait: 0,
  focus: -1,
  tab: 0, // pestaña del territorio abierto que está señalada en el chip
  aim: { x: 0, z: 0 },
  aimTo: { x: 0, z: 0 },
  preview: -1, // territorio señalado (sin abrir): adelanta su encendido
  turn: 0, // giro extra de la cámara durante el vuelo de un territorio a otro
};
/**
 * Lo que la persona ha girado, inclinado y acercado a mano, por encima del encuadre del
 * territorio. El arrastre mueve el objetivo (`…To`) y la cámara lo sigue con suavidad,
 * que es lo que hace el amortiguado de OrbitControls en campo-cubits.
 */
const orbit = { yaw: 0, pitch: 0, zoom: 1, yawTo: 0, pitchTo: 0, zoomTo: 1 };
/** Cámara del fotograma: giro y picado ya en senos y cosenos, y la escala `k = 3,8 / dist`. */
const view = { cy: 1, sy: 0, cp: Math.cos(FIELD_START.pitch), sp: Math.sin(FIELD_START.pitch), k: 1, pan: 0 };
const { qubitSource, pointQubit, territories } = assignSources(points, ANCHORS);
// Papel de cada cúbit en el menú: sección (hub) o pestaña (hija) de qué territorio.
const hubOf = new Int8Array(chip.nodes.length).fill(-1);
const childOf = new Int8Array(chip.nodes.length).fill(-1);
territories.forEach((t, i) => {
  hubOf[t.hub] = i;
  t.children.forEach((c) => (childOf[c] = i));
});
/**
 * Estado por cúbit del segundo nivel, como en `campo-cubits`:
 *
 * - `link`: cuánto lo enciende el menú (el camino de su territorio). Sube deprisa y baja
 *   despacio, que es lo que hace que el recorrido de la luz se lea como un encendido y no
 *   como un interruptor.
 * - `hover`: cuánto está señalado con el puntero.
 * - `flash`: el destello al pasarle por encima el frente de lectura del circuito.
 *
 * Y el reloj de la luz de cada territorio, uno por territorio: señalar uno mientras hay
 * otro abierto tiene que hacer viajar su luz desde su propia sección.
 */
const litT = new Float32Array(ANCHORS.length);
const linkTarget = new Float32Array(chip.nodes.length);
const link = new Float32Array(chip.nodes.length);
const linkTerr = new Int8Array(chip.nodes.length).fill(-1);
const hover = new Float32Array(chip.nodes.length);
const flash = new Float32Array(chip.nodes.length);
/** Cúbit señalado con el puntero, y cuánto manda el menú sobre la medida del circuito. */
let hoverQ = -1,
  attention = 0,
  lastStatus = "";
/** Retardo de salida de cada punto: la esfera se despliega desde el territorio pulsado. */
const pointDelay = new Float32Array(N);
let fieldRaw = 0, // avance del despliegue, 0..1
  fe = 0, // despliegue suavizado, para lo que es global (decorados, acopladores)
  ff = 0; // entrada de la cámara en el territorio
const smooth = (t) => t * t * (3 - 2 * t);
/**
 * Curva de las etapas grandes. Con `smooth` la velocidad arranca en cero pero la
 * aceleración no: hay un pequeño tirón al empezar y al acabar. Esta (smootherstep) arranca
 * y termina también sin aceleración, que es lo que hace que un movimiento largo se lea
 * como uno solo.
 */
const soft = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
function morphOf(pointIndex) {
  if (fieldRaw <= 0) return 0;
  return smooth(clamp01(fieldRaw * (1 + FIELD_SPREAD) - pointDelay[pointIndex]));
}
/** 0 pegado a la cámara, 1 a partir de un poco más allá del plano cercano. */
function nearFade(z) {
  return clamp01(((3.8 - z) / view.k - NEAR) / NEAR_FADE);
}
/**
 * Posición en espacio de cámara de un punto del chip (`h` es la altura sobre su plano).
 *
 * El chip **nace del punto pulsado**: al empezar, se desplaza lo justo para que la sección
 * caiga exactamente donde estaba su punto en la esfera, que es donde acaba de converger la
 * luz. Sin eso el chip se desplegaba centrado en la escena, la sección saltaba a un lado y
 * el racimo de luz se quedaba solo en medio. Ese anclaje se va soltando mientras la cámara
 * entra (`ff`).
 *
 * El resultado va escalado por `k`, así que `project()` —la perspectiva de la esfera, con
 * la cámara a 3,8— da la de una cámara a `dist` sin tocarla.
 */
const fieldOrigin = { x: 0, y: 0, z: 0 };
function chipCam(x, h, z) {
  const dx = x - field.aim.x,
    dz = z - field.aim.z,
    free = 1 - ff,
    k = view.k,
    x1 = dx * view.cy + dz * view.sy,
    z1 = -dx * view.sy + dz * view.cy;
  return {
    x: x1 * k + fieldOrigin.x * free + view.pan,
    y: (-h * view.cp - z1 * view.sp) * k + fieldOrigin.y * free,
    z: (-h * view.sp + z1 * view.cp) * k + fieldOrigin.z * free,
  };
}
/**
 * Altura del cúbit sobre el plano del chip: la respiración de `campo-cubits` —solo
 * vertical, la retícula no se desalinea nunca— y el empujoncito de lo que está señalado.
 */
const BREATH = 0.045 * SCALE;
const HOVER_LIFT = 0.16 * SCALE;
function heightOf(node) {
  // La fase va por **fila y columna**, no por distancia: la retícula se hizo mucho más fina
  // al crecer, y midiendo en unidades del mundo los vecinos respiraban casi a la vez y la
  // oblea entera subía y bajaba como una plancha.
  return (
    BREATH * Math.sin(elapsed * 0.8 + node.col * 0.35 + (node.row + (node.bridge ? 0.5 : 0)) * 0.9) +
    HOVER_LIFT * hover[node.index]
  );
}
function fieldCam(node) {
  return chipCam(node.x, heightOf(node), node.z);
}
/** Punto de la escena en pantalla, esté en la esfera, en el chip o a medio camino. */
function blended(sphereLocal, qubit, e) {
  const s = transform(sphereLocal);
  if (e <= 0 || qubit < 0) return s;
  const f = fieldCam(chip.nodes[qubit]);
  return { x: s.x + (f.x - s.x) * e, y: s.y + (f.y - s.y) * e, z: s.z + (f.z - s.z) * e };
}
/** Posición en pantalla del punto de un territorio: su ancla en la esfera o su sección en el chip. */
export function anchorScreen(i) {
  const hub = territories[i].hub;
  return project(blended(ANCHORS[i], hub, morphOf(qubitSource[hub])));
}
/**
 * Vuelo de un territorio a otro dentro del chip: **lateral y con algo de giro** (petición de
 * diseño). Antes la cámara se alejaba a mitad de camino —y como mira en picado, alejarse era
 * subir— y el punto de mira se acercaba al destino con una curva exponencial, que arranca a
 * toda velocidad. Ahora es un desplazamiento a la misma altura, con tiempo propio y curva
 * suave en la salida y en la llegada, mientras la cámara gira hacia el lado al que va y se
 * endereza al llegar.
 */
const flight = { active: false, t: 0, dur: 1, fx: 0, fz: 0, tx: 0, tz: 0, amp: 0, turn0: 0 };
const FLIGHT_TURN = 0.3; // giro máximo a mitad de vuelo, en radianes (~17°)
function startFlight() {
  const dx = field.aimTo.x - field.aim.x,
    dz = field.aimTo.z - field.aim.z,
    dist = Math.hypot(dx, dz);
  // Cuánto del trayecto es de lado según la cámara: el eje «derecha» de la pantalla, en
  // coordenadas del chip, es (cos giro, sin giro). El giro va hacia ese lado y crece con el
  // desplazamiento lateral, así que un salto casi frontal apenas gira.
  const lateral = dx * view.cy + dz * view.sy;
  flight.active = dist > 1e-4;
  flight.t = 0;
  flight.dur = Math.min(1.9, Math.max(1.05, 0.9 + (dist / SCALE) * 0.035));
  flight.fx = field.aim.x;
  flight.fz = field.aim.z;
  flight.tx = field.aimTo.x;
  flight.tz = field.aimTo.z;
  flight.amp = Math.sign(lateral) * Math.min(FLIGHT_TURN, (Math.abs(lateral) / SCALE) * 0.02);
  // Si se cambia de destino a mitad de otro vuelo, el giro que llevaba se deshace poco a
  // poco en vez de saltar a cero.
  flight.turn0 = field.turn;
}
/** Entra en el campo (o cambia de territorio dentro de él). */
export function enterField(index) {
  const fromSphere = field.target === 0 && field.mix === 0;
  field.focus = index;
  field.aimTo = { ...territories[index].aim };
  field.tab = 0;
  litT[index] = 0;
  // Cada territorio se abre en su encuadre: lo que se hubiera girado a mano se deshace.
  orbit.yawTo = orbit.pitchTo = 0;
  orbit.zoomTo = 1;
  if (fromSphere) {
    field.aim = { ...field.aimTo };
    field.turn = 0;
    flight.active = false;
    orbit.yaw = orbit.pitch = 0;
    orbit.zoom = 1;
    field.wait = reduced.matches ? 0 : FIELD_DELAY;
    const a = ANCHORS[index];
    for (let i = 0; i < N; i++) pointDelay[i] = (Math.acos(dot(points[i], a)) / Math.PI) * FIELD_SPREAD;
  }
  else startFlight();
  field.target = 1;
  if (reduced.matches) {
    // Sin animación no hay vuelo: se salta directamente al encuadre del territorio.
    field.mix = 1;
    field.aim = { ...field.aimTo };
    field.turn = 0;
    flight.active = false;
    settleOrbit();
  }
}
/**
 * Señala una pestaña en el chip. Sin ficha es la única respuesta a pulsarla, así que su
 * cúbit se enciende del todo y las otras dos ceden un poco.
 */
export function setFieldTab(j) {
  field.tab = j;
}
/** Devuelve la cámara al encuadre del territorio, deshaciendo lo girado a mano. */
export function recenterField() {
  orbit.yawTo = orbit.pitchTo = 0;
  orbit.zoomTo = 1;
  settleOrbit();
}
/** Vuelve a la esfera. */
export function leaveField() {
  field.target = 0;
  field.wait = 0;
  field.preview = -1;
  hoverQ = -1;
  resetCircuit();
  if (reduced.matches) field.mix = 0;
}
/**
 * Señalar una sección **adelanta su subnivel**: enciende su camino sin abrirla, como en
 * `campo-cubits`. Lo llaman los botones de sección y el menú lateral.
 */
export function setFieldPreview(index) {
  field.preview = index;
}
/** Señalar una pestaña señala su cúbit en el chip. */
export function hoverFieldTab(index, tab) {
  hoverQ = index >= 0 && tab >= 0 ? territories[index].children[tab] : -1;
}
/** ¿Se está mirando el chip? Entonces el arrastre orbita el campo en vez de girar la esfera. */
function inField() {
  return field.target === 1 && fe > 0.3;
}
/** Giro e inclinación a mano, con el picado dentro de sus límites. */
function orbitBy(dYaw, dPitch) {
  orbit.yawTo += dYaw;
  orbit.pitchTo = Math.max(PITCH_MIN - FIELD_VIEW.pitch, Math.min(PITCH_MAX - FIELD_VIEW.pitch, orbit.pitchTo + dPitch));
  settleOrbit();
}
/**
 * Con movimiento reducido no corre el bucle de animación: la cámara salta a donde se la
 * lleva y se redibuja en el acto, igual que el giro de la esfera al arrastrarla.
 */
function settleOrbit() {
  if (!reduced.matches) return;
  orbit.yaw = orbit.yawTo;
  orbit.pitch = orbit.pitchTo;
  orbit.zoom = orbit.zoomTo;
  draw();
}
function stepField(dt) {
  if (field.wait > 0) {
    field.wait -= dt;
  } else if (field.mix !== field.target) {
    const step = dt / FIELD_SECONDS;
    field.mix = field.target > field.mix ? Math.min(field.target, field.mix + step) : Math.max(field.target, field.mix - step);
  }
  // Un paso de un segundo o más es un salto (movimiento reducido, pruebas): sin suavizado.
  const instant = reduced.matches || dt >= 1;
  if (flight.active && !instant) {
    flight.t += dt;
    const p = clamp01(flight.t / flight.dur),
      e = soft(p);
    field.aim.x = flight.fx + (flight.tx - flight.fx) * e;
    field.aim.z = flight.fz + (flight.tz - flight.fz) * e;
    // El giro sube y baja con el trayecto: nada al salir, lo máximo a mitad, nada al llegar.
    field.turn = Math.sin(Math.PI * e) * flight.amp + flight.turn0 * (1 - e);
    if (p >= 1) {
      flight.active = false;
      field.turn = 0;
      field.aim.x = field.aimTo.x;
      field.aim.z = field.aimTo.z;
    }
  } else {
    flight.active = false;
    field.turn = 0;
    field.aim.x = field.aimTo.x;
    field.aim.z = field.aimTo.z;
  }
  // Mientras se arrastra, la cámara sigue al dedo de cerca; al soltar o al volver al
  // encuadre del territorio, con más calma.
  const ko = instant ? 1 : 1 - Math.exp(-dt * (pointer ? 14 : 5));
  orbit.yaw += (orbit.yawTo - orbit.yaw) * ko;
  orbit.pitch += (orbit.pitchTo - orbit.pitch) * ko;
  orbit.zoom += (orbit.zoomTo - orbit.zoom) * ko;
  if (Math.abs(orbit.yawTo - orbit.yaw) + Math.abs(orbit.pitchTo - orbit.pitch) + Math.abs(orbit.zoomTo - orbit.zoom) < 1e-4) {
    orbit.yaw = orbit.yawTo;
    orbit.pitch = orbit.pitchTo;
    orbit.zoom = orbit.zoomTo;
  }
  updateLinks(dt);
  // El circuito solo corre mientras se ve el chip —en la esfera no hay nada que medir— y se
  // para con el movimiento reducido, como el resto de la escena.
  if (fe > 0.3 && !paused) stepCircuit(dt);
  for (let i = 0; i < flash.length; i++) {
    const to = circuit.pulse[i] * 0.85;
    flash[i] += (to - flash[i]) * (instant ? 1 : Math.min(1, dt * 13));
    if (flash[i] < 1e-3) flash[i] = 0;
  }
  const hk = instant ? 1 : Math.min(1, dt * 10);
  for (let i = 0; i < hover.length; i++) {
    const to = i === hoverQ ? 1 : 0;
    if (hover[i] !== to) {
      hover[i] += (to - hover[i]) * hk;
      if (Math.abs(to - hover[i]) < 1e-3) hover[i] = to;
    }
  }
}
/**
 * Encendido del menú sobre el chip. Cada territorio tiene un nivel —abierto del todo,
 * señalado a `HOVER_PREVIEW`— y su luz viaja desde su sección por el camino real de la
 * retícula. El acoplador se deduce de sus extremos, así que se enciende solo por detrás.
 */
const HOVER_PREVIEW = 0.8;
function updateLinks(dt) {
  const instant = reduced.matches || dt >= 1;
  linkTarget.fill(0);
  let top = 0;
  for (let i = 0; i < territories.length; i++) {
    // El territorio abierto enciende su camino cuando la cámara ya ha entrado.
    const level = i === field.focus ? clamp01((ff - 0.55) / 0.3) : i === field.preview ? HOVER_PREVIEW : 0;
    litT[i] = level > 0 ? litT[i] + dt : 0;
    if (level <= 0) continue;
    if (level > top) top = level;
    for (const [qi, hop] of territories[i].hops) {
      const v = level * arrival(litT[i], hop);
      if (v > linkTarget[qi]) {
        linkTarget[qi] = v;
        linkTerr[qi] = i;
      }
    }
  }
  attention += (top - attention) * (instant ? 1 : Math.min(1, dt * 6));
  const up = instant ? 1 : Math.min(1, dt * 16),
    down = instant ? 1 : Math.min(1, dt * 5);
  for (let i = 0; i < link.length; i++) {
    const to = linkTarget[i];
    link[i] += (to - link[i]) * (to > link[i] ? up : down);
    if (Math.abs(to - link[i]) < 1e-3) link[i] = to;
  }
}
function updateFieldStages() {
  // Despliegue y entrada de cámara se solapan casi del todo (0–0,7 y 0,12–1): con poco
  // solape había un valle de velocidad entre los dos y se leían como dos movimientos, y
  // además la cámara —que es el movimiento grande— tardaba medio segundo en arrancar, así
  // que la transformación parecía empezar más tarde de lo que se había pulsado.
  fieldRaw = clamp01(field.mix / 0.7);
  fe = soft(fieldRaw);
  ff = soft(clamp01((field.mix - 0.12) / 0.88));
  const yaw = FIELD_START.yaw + (FIELD_VIEW.yaw + orbit.yaw + field.turn - FIELD_START.yaw) * ff,
    pitch = FIELD_START.pitch + (FIELD_VIEW.pitch + orbit.pitch - FIELD_START.pitch) * ff,
    small = compact.matches,
    end = FIELD_VIEW.dist * (small ? 0.8 : 1) * orbit.zoom;
  // Desplazamiento lateral de la cámara, en unidades de espacio de cámara a la distancia
  // del objetivo (donde una unidad mide `R` píxeles).
  view.pan = small && R > 0 ? ((W * 0.12) / R) * ff : 0;
  view.cy = Math.cos(yaw);
  view.sy = Math.sin(yaw);
  view.cp = Math.cos(pitch);
  view.sp = Math.sin(pitch);
  view.k = FIELD_START.dist / (FIELD_START.dist * Math.pow(end / FIELD_START.dist, ff));
  // Desplazamiento que lleva la sección a su punto en la esfera, con la cámara de partida.
  if (field.focus >= 0) {
    const a = transform(ANCHORS[field.focus]),
      h = chip.nodes[territories[field.focus].hub],
      hx = h.x - field.aim.x,
      hz = h.z - field.aim.z;
    fieldOrigin.x = a.x - hx;
    fieldOrigin.y = a.y + hz * Math.sin(FIELD_START.pitch);
    fieldOrigin.z = a.z - hz * Math.cos(FIELD_START.pitch);
  }
}

/** Cúbit → su objeto proyectado, para dibujar acopladores entre posiciones ya calculadas. */
const qubitScreen = [];
/**
 * La luz del territorio **viaja**: sale de la sección, sube por el puente y recorre la fila
 * de sus pestañas, un salto detrás de otro. Es el gesto de `campo-cubits`.
 */
const HOP_DELAY = 0.1;
const LIT_RISE = 0.22;
function arrival(t, hop) {
  return smooth(clamp01((t - hop * HOP_DELAY) / LIT_RISE));
}
/**
 * Aspecto de un cúbit en el chip, con las reglas de campo-cubits: en reposo es un punto
 * apagado que no emite luz; lo que no es el territorio abierto cede cuando la cámara entra;
 * el camino del menú se enciende en el color de su territorio y engorda, y las hijas crecen
 * hasta su tamaño de pestaña —la señalada se queda casi blanca—. Encima de todo eso pasa el
 * circuito: la medida tiñe cada cúbit con su bit y el frente de lectura le da un destello.
 */
function ballStyle(qi, b) {
  const t = field.focus,
    h = hubOf[qi],
    c = childOf[qi],
    lit = link[qi],
    terr = linkTerr[qi],
    rest = 1 - 0.5 * ff,
    gate = flash[qi],
    hov = hover[qi],
    // La medida pinta medio chip; mientras se mira un territorio se aparta —y no toca su
    // camino encendido—, o el recorrido del menú se pierde entre el ruido de fondo.
    read = circuit.readout[qi] * (1 - 0.3 * attention) * (1 - 0.8 * lit);
  b.ring = false;
  let hue, sat, lum, size;
  if (h >= 0) {
    const focused = h === t;
    hue = DATA[h].hue;
    sat = focused ? 52 : 38;
    lum = focused ? 76 : 10 + 28 * rest + 22 * lit;
    size = HUB_R * (focused ? 1.15 : 1);
    b.glow = focused ? 0.5 * ff : 0.3 * lit;
    b.ring = focused;
  } else if (chip.nodes[qi].dust) {
    // Motas: los puntos que no caben en la retícula. Ni acopladores ni papel en el menú.
    b.h = 234;
    b.s = 26;
    b.l = 30 - 14 * ff;
    b.size = DUST_R;
    b.glow = 0;
    b.bright = 0;
    b.gloss = 0.2;
    b.halo = 0.03;
    return;
  } else {
    const base = chip.nodes[qi].bridge ? BRIDGE_R : QUBIT_R;
    // En reposo arranca con el lavanda de la esfera, para que al salir no parezcan bolas de
    // acero entre sus puntos, y se apaga al entrar la cámara. Y coge un punto del tono del
    // territorio abierto: en campo-cubits el chip entero se baña del acento, y es lo que
    // hace que se lea como una pieza y no como bolas grises alrededor de lo encendido.
    hue = 234 + (t >= 0 ? (DATA[t].hue - 234) * 0.35 * ff : 0);
    sat = 34 - 4 * ff;
    lum = 46 - 20 * ff;
    size = base;
    b.glow = 0;
    if (lit > 0) {
      hue += (DATA[terr].hue - hue) * lit;
      if (c === terr) {
        // Pestaña del territorio: crece a su tamaño y, si está señalada en el chip, se
        // queda casi blanca. Solo manda la pestaña del territorio abierto.
        const on = terr === t && territories[t].children[field.tab] === qi ? 1 : 0;
        sat += (46 - 22 * on - sat) * lit;
        lum += (78 + 12 * on - lum) * lit;
        size = base + (SUB_R - base) * lit;
        b.glow = (0.2 + 0.35 * on) * lit;
      } else {
        sat += (62 - sat) * lit;
        lum += (66 - lum) * lit;
        size = base * (1 + 0.55 * lit);
        b.glow = 0.25 * lit;
      }
    }
  }
  // Medida: los cúbits que salen a |1⟩ se encienden en el color del territorio abierto y los
  // de |0⟩ se apagan. El patrón se queda a la vista un rato y se desvanece.
  const one = circuit.bits[qi] === 1;
  if (read > 0.01) {
    const tone = t >= 0 ? DATA[t].hue : 234;
    hue += (tone - hue) * read;
    sat += ((one ? 58 : 14) - sat) * read;
    lum += ((one ? 58 : 10) - lum) * read;
    if (one) b.glow = Math.max(b.glow, 0.22 * read);
  }
  // Destello del frente de lectura y cúbit señalado con el puntero.
  lum += (96 - lum) * gate * 0.55;
  sat *= 1 - 0.45 * gate;
  lum += (92 - lum) * 0.35 * hov;
  size *= 1 + 0.35 * gate + 0.5 * hov;
  b.glow += 0.5 * gate + 0.4 * hov;
  b.h = hue;
  b.s = sat;
  b.l = lum;
  b.size = size;
  /**
   * Cuánto se derrama este cúbit en el bloom, y cuánto sombreado lleva. Van al revés a
   * propósito: lo apagado necesita el volumen del sombreado para no ser un disco, y lo
   * encendido no —ahí manda la luz, y un borde oscuro alrededor de algo que brilla se lee
   * como un agujero—.
   */
  b.bright = clamp01((lum - 52) / 34) * (0.55 + 0.45 * clamp01(sat / 70)) + b.glow * 0.5;
  b.gloss = 0.9 - 0.75 * clamp01(b.bright);
  // Halo de alrededor, con los mismos pesos que la capa de halos de campo-cubits: casi nada
  // en reposo, y lo que de verdad lo levanta son el encendido, la medida y el puntero.
  b.halo = 0.05 + 0.3 * gate + 0.13 * read * (one ? 1 : 0.15) + 0.28 * hov + 0.22 * lit + b.glow * 0.3;
}
/**
 * Cúbit bajo el puntero. Se busca sobre lo ya dibujado —posición y radio en pantalla del
 * fotograma anterior—, que es más barato y más fiel que rehacer la proyección: lo que se
 * señala es lo que se ve. Gana el que esté más cerca de la cámara.
 */
function pickQubit(x, y) {
  let best = -1,
    bestZ = -Infinity;
  for (const b of balls) {
    if (!b.vis || b.alpha < 0.3) continue;
    const r = Math.max(b.r, 9),
      dx = b.q.x - x,
      dy = b.q.y - y;
    if (dx * dx + dy * dy <= r * r && b.z > bestZ) {
      bestZ = b.z;
      best = b.qi;
    }
  }
  return best;
}
/**
 * Rótulo del cúbit señalado y estado del circuito, los dos de `campo-cubits`. Se escriben
 * desde el dibujado porque el cúbit respira y el estado cambia solo con el tiempo.
 */
function updateChipHud() {
  const tip = $("#qubit-tip"),
    hud = $("#chip-hud"),
    on = fe > 0.3;
  if (hud) {
    const status = on ? circuitStatus() : "";
    if (status !== lastStatus) {
      lastStatus = status;
      hud.textContent = status;
      hud.hidden = !on;
    }
  }
  if (!tip) return;
  const b = hoverQ >= 0 ? balls[hoverQ] : null;
  if (!on || !b || !b.vis) {
    if (!tip.hidden) tip.hidden = true;
    return;
  }
  const read = circuit.readout[hoverQ] > 0.05 && circuit.bits[hoverQ] >= 0 ? ` · |${circuit.bits[hoverQ]}⟩` : "";
  tip.textContent = `Q·${String(hoverQ).padStart(3, "0")}${read}`;
  tip.hidden = false;
  tip.style.left = b.q.x + "px";
  tip.style.top = b.q.y - b.r - 10 + "px";
}
/**
 * Lo que se dibuja del chip, ya reservado: un objeto por cúbit y otro por acoplador que se
 * rellenan en cada fotograma. Se ordenan juntos por profundidad porque con la cámara tan
 * cerca y tan baja una barra delante tapa de verdad a una esfera de detrás, y al revés.
 */
const balls = chip.nodes.map((_, qi) => ({
  kind: 0, qi, q: null, live: false, z: 0, r: 0, rad: 0, alpha: 0, near: 1,
  vis: false, h: 0, s: 0, l: 0, size: 0, glow: 0, ring: false, gloss: 1, bright: 0, halo: 0,
}));
const bars = chip.edges.map(([ia, ib]) => {
  const A = chip.nodes[ia],
    B = chip.nodes[ib],
    len = Math.hypot(B.x - A.x, B.z - A.z);
  // Lateral de la barra en el plano del chip: su anchura va en esa dirección.
  return { kind: 1, ia, ib, sx: -(B.z - A.z) / len, sz: (B.x - A.x) / len, z: 0, pts: new Float32Array(8), alpha: 0, color: "", lit: 0, hue: 230 };
});
const drawList = [];
/**
 * La oblea entera son 1.150 cúbits y 1.344 acopladores, y casi todos caen lejos y apagados.
 * Dibujarlos uno a uno —arco, relleno, sombreado, halo— costaba más que todo lo demás junto,
 * así que lo pequeño y apagado va en **trazo de grupo**: un solo camino por color, con todos
 * sus puntos dentro, y un solo camino para los hilos de los acopladores. Lo cercano y lo
 * encendido —que es lo que se mira— conserva su tratamiento completo y su orden por
 * profundidad.
 */
const TINY_R = 2.2;
const batch = new Map();
const thinLines = new Map();
const round = (v, step) => Math.round(v / step) * step;
/** Tamaño de reposo de un nodo, para decidir si se ve antes de calcular su aspecto. */
function baseSize(qi) {
  const node = chip.nodes[qi];
  if (node.dust) return DUST_R;
  if (hubOf[qi] >= 0) return HUB_R * 1.15;
  return node.bridge ? BRIDGE_R : QUBIT_R;
}
function pack(color, x, y, r) {
  let list = batch.get(color);
  if (!list) batch.set(color, (list = []));
  list.push(x, y, r);
}
function thin(alpha, ax, ay, bx, by) {
  const key = alpha.toFixed(2);
  let list = thinLines.get(key);
  if (!list) thinLines.set(key, (list = []));
  list.push(ax, ay, bx, by);
}
function drawBatch() {
  ctx.lineCap = "butt";
  for (const [key, l] of thinLines) {
    if (!l.length) continue;
    const a = Number(key);
    if (a > 0.02) {
      ctx.globalAlpha = Math.min(1, a);
      ctx.strokeStyle = THIN_BAR;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      for (let i = 0; i < l.length; i += 4) {
        ctx.moveTo(l[i], l[i + 1]);
        ctx.lineTo(l[i + 2], l[i + 3]);
      }
      ctx.stroke();
    }
    l.length = 0;
  }
  ctx.globalAlpha = 1;
  for (const [color, l] of batch) {
    if (!l.length) continue;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < l.length; i += 3) {
      const x = l[i],
        y = l[i + 1],
        r = l[i + 2];
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
/**
 * Bloom del chip, que es lo que hace que la luz del campo se lea **orgánica** y no como
 * discos de color: en `campo-cubits` lo pone un `UnrealBloomPass` sobre toda la escena, así
 * que lo brillante se derrama sobre lo que tiene al lado y sobre el fondo. Aquí se hace a
 * mano y barato: lo que pasa de cierto brillo se vuelve a pintar en un lienzo a **un cuarto
 * de resolución** y se suma encima desenfocado, dos veces —uno corto y otro ancho—.
 *
 * El desenfoque va con el filtro del contexto cuando existe; si no (Safari antiguo), se
 * imita encadenando reducciones, que es el truco de toda la vida y sale casi igual.
 */
const BLOOM_DIV = 4;
let bloomA = null,
  bloomB = null,
  bloomCtxA = null,
  bloomCtxB = null,
  canFilter = false;
function sizeBloom() {
  if (!ctx || W < 8 || H < 8) return;
  canFilter = typeof ctx.filter === "string";
  if (!bloomA) {
    bloomA = document.createElement("canvas");
    bloomB = document.createElement("canvas");
    bloomCtxA = bloomA.getContext("2d");
    bloomCtxB = bloomB.getContext("2d");
  }
  bloomA.width = Math.max(1, Math.round(W / BLOOM_DIV));
  bloomA.height = Math.max(1, Math.round(H / BLOOM_DIV));
  bloomB.width = Math.max(1, Math.round(W / (BLOOM_DIV * 2)));
  bloomB.height = Math.max(1, Math.round(H / (BLOOM_DIV * 2)));
}
/**
 * Textura del cúbit. En `campo-cubits` la esfera es material **sin luz**: un disco de color
 * plano, y el volumen lo ponen el halo de alrededor y el bloom, no un sombreado. Aquí se
 * imita con dos piezas pintadas una sola vez:
 *
 * - `shade`, un apagado muy leve hacia el borde, solo para que a tamaño grande el disco no
 *   se lea como una pegatina. Nada de brillo especular desplazado: eso era lo que hacía que
 *   los cúbits parecieran de plástico y no del chip.
 * - `halo`, el degradado aditivo que rodea a cada cúbit —la capa de halos del original—, en
 *   su tono. Es lo que hace que lo apagado se vea luminoso y lo encendido, encendido.
 */
let shade = null;
function makeShade() {
  const s = document.createElement("canvas");
  s.width = s.height = 128;
  const g = s.getContext("2d");
  if (!g) return s;
  g.beginPath();
  g.arc(64, 64, 64, 0, Math.PI * 2);
  g.clip();
  const rim = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rim.addColorStop(0, "rgba(255,255,255,0.08)");
  rim.addColorStop(0.55, "rgba(255,255,255,0)");
  rim.addColorStop(0.86, "rgba(0,0,0,0.05)");
  rim.addColorStop(1, "rgba(0,0,0,0.3)");
  g.fillStyle = rim;
  g.fillRect(0, 0, 128, 128);
  return s;
}
/** Halo de un tono, redondeado a diez grados para que la caché no crezca. */
const halos = new Map();
function haloSprite(hue) {
  const key = Math.round(hue / 10) * 10;
  let s = halos.get(key);
  if (!s) {
    s = document.createElement("canvas");
    s.width = s.height = 64;
    const g = s.getContext("2d");
    if (g) {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `hsla(${key},85%,62%,0.55)`);
      gr.addColorStop(0.3, `hsla(${key},85%,58%,0.2)`);
      gr.addColorStop(1, `hsla(${key},85%,55%,0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
    }
    halos.set(key, s);
  }
  return s;
}
/**
 * Anillo de la sección abierta, tumbado en el plano del chip como el toroide de
 * campo-cubits. Va en dos mitades —la de detrás antes que la esfera y la de delante
 * después—, o la esfera se lo comería entero o lo tendría siempre encima.
 */
function drawRing(b, front) {
  const node = chip.nodes[b.qi],
    show = b.alpha * clamp01((ff - 0.35) / 0.4);
  if (show < 0.01) return;
  ctx.strokeStyle = hsla(b.h, 85, 72, 0.75 * show);
  ctx.lineWidth = Math.max(1, RING_W * view.k * R * b.q.scale);
  ctx.beginPath();
  let px = 0,
    py = 0,
    pz = 0;
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2,
      c = chipCam(node.x + Math.cos(a) * RING_R, 0, node.z + Math.sin(a) * RING_R),
      depth = 3.8 - c.z;
    if (depth < NEAR * view.k) return;
    const s = 3.8 / depth,
      x = CX + c.x * R * s,
      y = CY + c.y * R * s;
    if (i > 0 && (c.z + pz) / 2 > b.z === front) {
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
    }
    px = x;
    py = y;
    pz = c.z;
  }
  ctx.stroke();
}
/**
 * El chip de campo-cubits: esferas con volumen y halo, y los 176 acopladores como barras
 * con grosor, no hilos de un píxel. Cada acoplador aparece cuando han llegado sus dos
 * extremos: dibujarlo antes sería tender una barra entre un punto que ya está en el chip y
 * otro que sigue en la esfera.
 */
function drawField() {
  const k = view.k,
    rest = 1 - 0.5 * ff;
  drawList.length = 0;
  // Los grupos se reutilizan de un fotograma a otro, pero sus claves son colores: si la
  // escena pasa por muchos tonos, el mapa se llena de grupos vacíos que hay que recorrer.
  if (batch.size > 48) batch.clear();
  else for (const list of batch.values()) list.length = 0;
  for (const list of thinLines.values()) list.length = 0;
  for (const b of balls) {
    const q = qubitScreen[b.qi];
    b.live = false;
    b.vis = false;
    if (!q || q.e <= 0) continue;
    const near = nearFade(q.z);
    if (near <= 0) continue;
    b.q = q;
    b.live = true;
    b.near = near;
    b.z = q.z;
    // Radio aproximado **antes** de calcular el aspecto: con mil y pico cúbits, lo que está
    // fuera del encuadre no puede costar ni un estilo. Los de fuera siguen vivos porque sus
    // acopladores pueden cruzar la pantalla y necesitan su radio para recortarse.
    const base = baseSize(b.qi) * k * (0.25 + 0.75 * q.e);
    b.rad = base;
    const rough = base * R * q.scale;
    if (q.x + rough * 4 < 0 || q.x - rough * 4 > W || q.y + rough * 4 < 0 || q.y - rough * 4 > H) {
      b.r = 0; // fuera del encuadre: su radio en pantalla no vale para nada más
      continue;
    }
    ballStyle(b.qi, b);
    b.vis = true;
    b.rad = Math.max(0, b.size) * k * (0.25 + 0.75 * q.e);
    b.r = b.rad * R * q.scale;
    b.alpha = Math.min(1, q.e * 1.5) * near;
    // Lo diminuto y apagado —casi toda la oblea— va en trazo de grupo: un solo camino por
    // color, en vez de mil arcos con su relleno y su sombreado.
    if (b.r < TINY_R && b.halo < 0.2 && b.bright < 0.05) {
      pack(hsla(round(b.h, 8), round(b.s, 8), round(b.l, 6), round(b.alpha, 0.12)), q.x, q.y, b.r);
      continue;
    }
    drawList.push(b);
  }
  for (const bar of bars) {
    const A = balls[bar.ia],
      B = balls[bar.ib];
    if (!A.live || !B.live) continue;
    const qa = A.q,
      qb = B.q,
      ke = Math.min(qa.e, qb.e);
    if (ke <= 0.5) continue;
    const lit = Math.min(link[bar.ia], link[bar.ib]),
      terr = linkTerr[link[bar.ia] < link[bar.ib] ? bar.ia : bar.ib],
      alpha = (ke - 0.5) * 2 * Math.min(A.near, B.near);
    // Acoplador de la oblea, lejos y apagado: un hilo dentro del trazo de grupo. Ahí no hay
    // ni perspectiva del grosor ni recorte contra las esferas, que a ese tamaño no se ven.
    if (lit < 0.15 && Math.max(A.r || 0, B.r || 0) < TINY_R * 1.6) {
      if (!A.vis && !B.vis) continue;
      thin(round(alpha * rest, 0.12), qa.x, qa.y, qb.x, qb.y);
      continue;
    }
    let dx = qb.cx - qa.cx,
      dy = qb.cy - qa.cy,
      dz = qb.z - qa.z;
    const len = Math.hypot(dx, dy, dz);
    if (len <= A.rad + B.rad) continue;
    dx /= len;
    dy /= len;
    dz /= len;
    // Extremos recortados a la superficie de cada esfera: así la barra nunca entra en una
    // y el orden por profundidad sale bien en las dos puntas.
    const ax = qa.cx + dx * A.rad,
      ay = qa.cy + dy * A.rad,
      az = qa.z + dz * A.rad,
      bx = qb.cx - dx * B.rad,
      by = qb.cy - dy * B.rad,
      bz = qb.z - dz * B.rad;
    // Lateral en espacio de cámara, con el mismo giro que `chipCam`.
    const hw = (BAR_W / 2) * k,
      z1 = -bar.sx * view.sy + bar.sz * view.cy,
      sx = (bar.sx * view.cy + bar.sz * view.sy) * hw,
      sy = -z1 * view.sp * hw,
      sz = z1 * view.cp * hw;
    const da = 3.8 - az,
      db = 3.8 - bz;
    if (da < NEAR * k || db < NEAR * k) continue;
    const pa = 3.8 / (da - sz),
      pa2 = 3.8 / (da + sz),
      pb = 3.8 / (db - sz),
      pb2 = 3.8 / (db + sz),
      P = bar.pts;
    P[0] = CX + (ax + sx) * R * pa;
    P[1] = CY + (ay + sy) * R * pa;
    P[2] = CX + (bx + sx) * R * pb;
    P[3] = CY + (by + sy) * R * pb;
    P[4] = CX + (bx - sx) * R * pb2;
    P[5] = CY + (by - sy) * R * pb2;
    P[6] = CX + (ax - sx) * R * pa2;
    P[7] = CY + (ay - sy) * R * pa2;
    if (Math.min(P[0], P[2], P[4], P[6]) > W || Math.max(P[0], P[2], P[4], P[6]) < 0) continue;
    if (Math.min(P[1], P[3], P[5], P[7]) > H || Math.max(P[1], P[3], P[5], P[7]) < 0) continue;
    bar.z = (az + bz) / 2;
    bar.alpha = alpha;
    // Estructura apagada; el camino de un territorio encendido, en su color, cuando le ha
    // llegado la luz. El acoplador se deduce de sus dos extremos.
    bar.lit = lit;
    bar.hue = terr >= 0 ? DATA[terr].hue : 230;
    bar.color = lit > 0.01 && terr >= 0
      ? hsla(230 + (DATA[terr].hue - 230) * lit, 26 + 46 * lit, 26 * rest + (68 - 26 * rest) * lit, 1)
      : hsla(230, 26, 26 * rest, 1);
    drawList.push(bar);
  }
  drawList.sort((a, b) => a.z - b.z);
  if (!shade) shade = makeShade();
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  // Primero la oblea lejana, en bloque y sin ordenar: a ese tamaño no hay profundidad que
  // leer, y va debajo de lo que sí se mira.
  drawBatch();
  for (const it of drawList) {
    if (it.kind === 1) {
      const P = it.pts;
      ctx.globalAlpha = it.alpha;
      ctx.fillStyle = it.color;
      ctx.beginPath();
      ctx.moveTo(P[0], P[1]);
      ctx.lineTo(P[2], P[3]);
      ctx.lineTo(P[4], P[5]);
      ctx.lineTo(P[6], P[7]);
      ctx.closePath();
      ctx.fill();
      continue;
    }
    if (it.ring) drawRing(it, false);
    ctx.globalAlpha = it.alpha;
    ctx.fillStyle = hsla(it.h, it.s, it.l, 1);
    ctx.beginPath();
    ctx.arc(it.q.x, it.q.y, it.r, 0, Math.PI * 2);
    ctx.fill();
    // Un apagado muy leve hacia el borde, y menos aún en lo que brilla: un borde oscuro
    // alrededor de algo encendido se lee como un agujero.
    if (it.r > 3) {
      ctx.globalAlpha = it.alpha * it.gloss;
      ctx.drawImage(shade, it.q.x - it.r, it.q.y - it.r, it.r * 2, it.r * 2);
    }
    if (it.ring) drawRing(it, true);
  }
  // Halos: la capa aditiva que rodea a cada cúbit en el original. Va encima de todo, porque
  // es luz, y por eso no entra en el orden por profundidad.
  ctx.globalCompositeOperation = "lighter";
  for (const it of drawList) {
    if (it.kind !== 0) continue;
    const a = it.halo * it.alpha;
    if (a < 0.015) continue;
    const g = it.r * 2.6;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(haloSprite(it.h), it.q.x - g, it.q.y - g, g * 2, g * 2);
  }
  ctx.restore();
  drawBloom();
}
/**
 * El derrame de la luz. Se pinta aparte lo que brilla —cúbits encendidos y acopladores del
 * camino— a un cuarto de resolución y se suma encima desenfocado: corto para el núcleo y
 * ancho para el ambiente. Es lo que hace que el chip se vea encendido de verdad y no
 * pintado, y lo que ilumina el fondo alrededor del territorio abierto.
 */
function drawBloom() {
  if (!bloomA) sizeBloom();
  if (!bloomA || !bloomCtxA) return;
  const g = bloomCtxA,
    scale = 1 / BLOOM_DIV;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, bloomA.width, bloomA.height);
  g.save();
  g.scale(scale, scale);
  g.globalCompositeOperation = "lighter";
  let any = false;
  for (const it of drawList) {
    if (it.kind === 1) {
      if (it.lit < 0.15) continue;
      const P = it.pts;
      any = true;
      g.fillStyle = hsla(it.hue, 85, 58, it.lit * it.alpha * 0.75);
      g.beginPath();
      g.moveTo(P[0], P[1]);
      g.lineTo(P[2], P[3]);
      g.lineTo(P[4], P[5]);
      g.lineTo(P[6], P[7]);
      g.closePath();
      g.fill();
      continue;
    }
    if (it.bright < 0.03) continue;
    any = true;
    // La fuente del derrame va con el borde suave —un degradado, no un disco duro—: al
    // desenfocarla después, un disco duro deja un canto y se ve el halo pegado.
    const b = Math.min(1.2, it.bright),
      soft = it.r * 3;
    g.globalAlpha = Math.min(1, b * 0.8) * it.alpha;
    g.drawImage(haloSprite(it.h), it.q.x - soft, it.q.y - soft, soft * 2, soft * 2);
    g.globalAlpha = 1;
    g.fillStyle = hsla(it.h, Math.min(92, it.s + 18), 58, Math.min(1, b * 0.5) * it.alpha);
    g.beginPath();
    g.arc(it.q.x, it.q.y, it.r * 0.95, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  if (!any) return;
  // La escala ancha se desenfoca en el lienzo pequeño: desenfocar ciento y pico píxeles
  // sobre el lienzo grande cuesta, y a un octavo de resolución sale igual por mucho menos.
  const h = bloomCtxB;
  h.setTransform(1, 0, 0, 1, 0, 0);
  h.clearRect(0, 0, bloomB.width, bloomB.height);
  h.filter = canFilter ? "blur(9px)" : "none";
  h.drawImage(bloomA, 0, 0, bloomB.width, bloomB.height);
  h.filter = "none";
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.imageSmoothingEnabled = true;
  // Tres escalas, como las cinco del bloom del original: poco brillo cerca del núcleo y un
  // ambiente muy ancho, que es lo que se lee como luz y no como un halo pegado.
  if (canFilter) {
    ctx.filter = "blur(7px)";
    ctx.globalAlpha = 0.26;
    ctx.drawImage(bloomA, 0, 0, W, H);
    ctx.filter = "blur(24px)";
    ctx.globalAlpha = 0.36;
    ctx.drawImage(bloomA, 0, 0, W, H);
    ctx.filter = "none";
  } else {
    ctx.globalAlpha = 0.3;
    ctx.drawImage(bloomA, 0, 0, W, H);
  }
  ctx.globalAlpha = 0.6;
  ctx.drawImage(bloomB, 0, 0, W, H);
  ctx.restore();
}

export function transform(p) {
  const c = Math.cos(rotationY),
    s = Math.sin(rotationY),
    a = Math.cos(rotationX),
    b = Math.sin(rotationX),
    x = p.x * c + p.z * s,
    z = -p.x * s + p.z * c;
  return { x, y: p.y * a - z * b, z: p.y * b + z * a };
}
function inverse(p) {
  const a = Math.cos(rotationX),
    b = Math.sin(rotationX),
    c = Math.cos(rotationY),
    s = Math.sin(rotationY),
    y = p.y * a + p.z * b,
    z = -p.y * b + p.z * a;
  return { x: p.x * c - z * s, y, z: p.x * s + z * c };
}
export function project(p) {
  const perspective = 3.8 / (3.8 - p.z);
  return {
    x: CX + p.x * R * perspective,
    y: CY + p.y * R * perspective,
    z: p.z,
    scale: perspective,
  };
}
export function resize() {
  const r = canvas.getBoundingClientRect();
  W = r.width;
  H = r.height;
  const dpr = Math.min(devicePixelRatio || 1, 1.75);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  cameraLayout();
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sizeBloom();
  positionNodes();
  draw();
}
// Transparencia: los puntos posteriores siguen visibles y seleccionables, con menor brillo.
export function positionNodes() {
  // En el chip la sección la dibuja el lienzo como una esfera grande: el botón deja sus
  // adornos de la esfera, la cubre para poder pulsarla y lleva el nombre encima.
  const chipView = fe > 0.5;
  $("#scene").classList.toggle("in-field", chipView);
  nodeEls.forEach((b, i) => {
    const p = anchorScreen(i),
      front = p.z > 0.03 || chipView,
      near = nearFade(p.z);
    // Con la cámara metida en el chip, una sección puede quedar detrás de ella o pegada:
    // su proyección ya no significa nada y el botón no debe quedarse flotando.
    if (near < 0.5) {
      b.style.opacity = "0";
      b.style.pointerEvents = "none";
      return;
    }
    b.style.left = p.x + "px";
    b.style.top = p.y + "px";
    // En el chip todos los territorios quedan a la vista y se puede saltar de uno a otro;
    // el abierto manda y los demás ceden.
    // Los de la cara de atrás van atenuados, pero no tanto que su nombre —que ahora se ve
    // siempre— deje de leerse.
    const sphereOpacity = front ? 0.72 + 0.28 * Math.max(0, p.z) : 0.58,
      fieldOpacity = i === field.focus ? 1 : 0.62;
    b.style.opacity = String(sphereOpacity + (fieldOpacity - sphereOpacity) * fe);
    b.style.pointerEvents = "auto";
    b.dataset.back = String(!front);
    const depthScale = 0.8 + (0.25 * (p.z + 1)) / 2;
    b.style.setProperty("--depth-scale", String(chipView ? 1 : depthScale));
    if (chipView) {
      const r = (i === field.focus ? HUB_R * 1.15 : HUB_R) * view.k * R * p.scale;
      b.style.setProperty("--ball", Math.round(r * 2) + "px");
    }
  });
  // Pestañas del territorio abierto, cada una sobre su cúbit hija y por encima de su
  // esfera. Aparecen cuando la cámara ya ha entrado: antes estarían viajando por la
  // pantalla sin dónde posarse.
  const subs = $$(".field-sub"),
    t = field.focus >= 0 ? territories[field.focus] : null;
  subs.forEach((b, j) => {
    const q = t ? t.children[j] : -1;
    if (q < 0 || ff < 0.02) {
      b.style.opacity = "0";
      b.style.pointerEvents = "none";
      return;
    }
    const p = project(blended(points[qubitSource[q]], q, morphOf(qubitSource[q])));
    b.style.left = p.x + "px";
    b.style.top = p.y + "px";
    b.style.setProperty("--lift", Math.round(SUB_R * view.k * R * p.scale + 12) + "px");
    const shown = clamp01((ff - 0.55) / 0.4) * (nearFade(p.z) > 0.5 ? 1 : 0);
    b.style.opacity = String(shown);
    b.style.pointerEvents = shown > 0.5 ? "auto" : "none";
  });
  positionCard();
}
// El destino no desplaza una mancha: recibe frentes de luz desde cuatro orígenes.
function lightCenter() {
  return lightTransition ? lightTransition.to : null;
}
export function selectLight(index) {
  if (index < 0) {
    lightTransition = null;
    waves = [];
    emitWave(0, 0, 230);
    draw();
    return;
  }
  const target = ANCHORS[index],
    previous = lightCenter();
  const paths = ANCHORS.filter((_, i) => i !== index).map((origin, i) => ({
    origin,
    distance: Math.acos(dot(origin, target)),
    delay: i * 0.16,
  }));
  lightTransition = { to: target, previous, paths, start: elapsed };
  draw();
  activity();
}
/**
 * Preparación de la luz convergente, **una vez por fotograma**.
 *
 * De la fórmula original, casi todo depende solo del tiempo y no del punto: las crestas
 * activas de cada origen, su avance y su peso, la carga acumulada (`arrived`) y el
 * desvanecimiento de la selección anterior. Estaba todo dentro del bucle de los 1.150
 * puntos, o sea recalculado 1.150 veces por fotograma para dar siempre el mismo número.
 * Aquí se calcula una vez y `convergingLight` se queda solo con lo que sí varía punto a
 * punto: dos distancias angulares y sus gaussianas.
 */
const SPEED = 1.05;
/**
 * Fuera de este desvío el corredor vale menos de 3·10⁻⁷ y no pinta un solo píxel, así que
 * el origen se descarta entero para ese punto sin entrar en sus crestas. Como el corredor
 * es una banda estrecha, la mayoría de los puntos se descartan.
 */
const CORRIDOR_CUTOFF = 0.85;
let lightFrame = null;
function prepareLight() {
  if (!lightTransition) {
    lightFrame = null;
    return;
  }
  const state = lightTransition,
    age = elapsed - state.start;
  let arrived = 0;
  const paths = [];
  for (const path of state.paths) {
    const beats = [];
    const localAge = age - path.delay;
    for (let beat = 0; beat < 3; beat++) {
      const pulseAge = localAge - beat * 0.24;
      if (pulseAge < 0) continue;
      const front = pulseAge * SPEED;
      const tail = Math.max(0, Math.min(1, (path.distance + 0.3 - front) / 0.3));
      const weight = tail * (0.68 - beat * 0.12);
      if (weight > 0) beats.push({ front, weight });
    }
    paths.push({ origin: path.origin, distance: path.distance, beats });
    const arrival = path.delay + path.distance / SPEED;
    const t = Math.max(0, Math.min(1, (age - arrival + 0.12) / 0.65));
    arrived += (t * t * (3 - 2 * t)) / state.paths.length;
  }
  lightFrame = {
    at: elapsed,
    to: state.to,
    previous: state.previous,
    previousFade: state.previous ? 0.65 * Math.exp(-age * 2) : 0,
    paths,
    arrived,
    breathePhase: elapsed * 1.2,
  };
}
// Cada frente se expande desde su origen por un corredor esférico hacia el destino.
// Se dibujan tres crestas finas consecutivas por origen. Solo cambia la luz.
function convergingLight(p) {
  if (!lightTransition) return 0;
  // La preparación se rehace si el reloj ha cambiado desde la última. Dentro de `draw()`
  // eso ocurre una vez por fotograma y las 1.150 llamadas siguientes la reutilizan; fuera
  // —el smoke test la llama directamente moviendo `elapsed`— sigue comportándose como una
  // función del reloj, que es lo que era antes de sacarle el cálculo común.
  if (!lightFrame || lightFrame.at !== elapsed) prepareLight();
  const f = lightFrame;
  if (!f) return 0;
  const distanceToTarget = Math.acos(dot(p, f.to));
  const d = distanceToTarget / 0.48;
  const nearby = Math.exp(-d * d);
  if (reduced.matches) return nearby * 0.85;
  let travelling = 0;
  for (const path of f.paths) {
    if (!path.beats.length) continue;
    const distanceFromSource = Math.acos(dot(p, path.origin));
    // La suma de distancias es mínima sobre el arco que une origen y destino.
    const detour = distanceFromSource + distanceToTarget - path.distance;
    if (detour > CORRIDOR_CUTOFF) continue;
    const c = Math.max(0, detour) / 0.22;
    const corridor = Math.exp(-c * c);
    for (const beat of path.beats) {
      const r = (distanceFromSource - beat.front) / 0.105;
      travelling += Math.exp(-r * r) * corridor * beat.weight;
    }
  }
  // La zona se carga a medida que llegan los pulsos y después respira suavemente.
  const breathe = 0.79 + 0.21 * Math.sin(f.breathePhase - distanceToTarget * 5);
  const settled = nearby * f.arrived * breathe;
  let previous = 0;
  if (f.previousFade > 0) {
    const q = Math.acos(dot(p, f.previous)) / 0.48;
    previous = Math.exp(-q * q) * f.previousFade;
  }
  return Math.min(1, travelling + settled + previous);
}
// Original expanding pulse for free touches and idle animation.
export function emitWave(x, y, hue = 230, audible = false) {
  if (audible) sound("pulse");
  const len = Math.hypot(x, y);
  if (len > 0.97) {
    x = (x / len) * 0.97;
    y = (y / len) * 0.97;
  }
  const origin = inverse({
    x,
    y,
    z: Math.sqrt(Math.max(0, 1 - x * x - y * y)),
  });
  waves.push({
    origin,
    born: motionTime * 1000 - (paused || reduced.matches ? 650 : 0),
    hue,
  });
  waves = waves.slice(-5);
  draw();
  activity();
}
/**
 * Puertas para que otros módulos toquen el estado del motor sin escribirle variables.
 * Antes `card.js` y `main.js` reasignaban `rotationX`/`rotationY` y la intro vaciaba
 * `waves` directamente, cosa que el ámbito global permitía y los módulos no.
 */
export function setRotation(y, x) {
  rotationY = y;
  rotationX = x;
}
export function clearWaves() {
  waves = [];
}
/** Devuelve si el último gesto sobre la esfera fue un arrastre, y consume la marca. */
export function consumeDragOutside() {
  const was = draggedOutside;
  draggedOutside = false;
  return was;
}

function line3D(fn, color, width = 1) {
  ctx.beginPath();
  for (let i = 0; i <= 180; i++) {
    const p = project(transform(fn((i / 180) * Math.PI * 2)));
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
/** Última vista para la que ya se recolocaron etiquetas y ficha. */
const lastView = { ry: NaN, rx: NaN, cx: NaN, cy: NaN, r: NaN, sel: NaN };
export function draw() {
  const now = motionTime * 1000;
  updateFieldStages();
  cameraLayout();
  // Las etiquetas de los cinco puntos y la ficha solo se recolocan cuando la vista cambia
  // de verdad. Con una ficha abierta la esfera está quieta, y aun así se escribían 25
  // estilos y se forzaban dos reflujos de maquetación por fotograma —`positionCard` lee
  // `getBoundingClientRect` y `offsetWidth` justo después de escribir estilos— para dejarlo
  // todo donde ya estaba. Quien cambia el contenido de la ficha (`renderTab`) o el tamaño
  // de la ventana (`resize`) sigue llamando directamente, así que no se pierde nada.
  if (
    lastView.ry !== rotationY ||
    lastView.rx !== rotationX ||
    lastView.cx !== CX ||
    lastView.cy !== CY ||
    lastView.r !== R ||
    lastView.sel !== selected ||
    lastView.fm !== field.mix ||
    lastView.ax !== field.aim.x ||
    lastView.az !== field.aim.z ||
    lastView.fo !== field.focus ||
    lastView.oy !== orbit.yaw ||
    lastView.op !== orbit.pitch ||
    lastView.oz !== orbit.zoom ||
    lastView.tn !== field.turn
  ) {
    lastView.oy = orbit.yaw;
    lastView.op = orbit.pitch;
    lastView.oz = orbit.zoom;
    lastView.tn = field.turn;
    lastView.fm = field.mix;
    lastView.ax = field.aim.x;
    lastView.az = field.aim.z;
    lastView.fo = field.focus;
    lastView.ry = rotationY;
    lastView.rx = rotationX;
    lastView.cx = CX;
    lastView.cy = CY;
    lastView.r = R;
    lastView.sel = selected;
    positionNodes();
  }
  drawBackdrop();
  // El rótulo del cúbit y el estado del circuito son HTML: se actualizan aunque no haya
  // lienzo, y con las posiciones del fotograma anterior, que es lo que se está viendo.
  updateChipHud();
  if (!ctx || !W || !H) return;
  ctx.clearRect(0, 0, W, H);
  // El armazón de la esfera —halo, ejes de Bloch, órbita, ecuador y meridianos— se
  // desvanece mientras la esfera se despliega: en el chip no significa nada.
  const sphereAlpha = 1 - fe;
  if (sphereAlpha > 0.01) {
  ctx.globalAlpha = sphereAlpha;
  const halo = ctx.createRadialGradient(CX, CY, R * 0.1, CX, CY, R * 1.5);
  halo.addColorStop(0, "#273ede3c");
  halo.addColorStop(0.62, "#4833ee1c");
  halo.addColorStop(1, "#05081900");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);
  drawCoordinates();
  // Fine orbit marks and a gently tilted equatorial path.
  ctx.save();
  ctx.translate(CX, CY);
  ctx.strokeStyle = "#6674ed35";
  ctx.lineWidth = 0.6;
  ctx.setLineDash([2, 9]);
  ctx.beginPath();
  ctx.arc(0, 0, R * 1.23, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 64; i++) {
    const a = (i * Math.PI) / 32,
      r = R * 1.23;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(
      Math.cos(a) * (r + (i % 8 === 0 ? 6 : 2)),
      Math.sin(a) * (r + (i % 8 === 0 ? 6 : 2))
    );
    ctx.stroke();
  }
  ctx.restore();
  // Ecuador z_Bloch=0 y dos meridianos ortogonales sobre la esfera unitaria.
  line3D((a) => ({ x: Math.cos(a), y: 0, z: Math.sin(a) }), "#8c91ff85", 0.9);
  line3D((a) => ({ x: Math.cos(a), y: Math.sin(a), z: 0 }), "#7383ed35", 0.6);
  line3D((a) => ({ x: 0, y: Math.sin(a), z: Math.cos(a) }), "#7383ed35", 0.6);
  ctx.globalAlpha = 1;
  }
  waves = waves.filter((w) => now - w.born < 3200);
  // Se reutilizan el mismo array y los mismos objetos, y se ordena en el sitio. Antes se
  // creaban 1.150 objetos nuevos en cada dibujado —34.500 por segundo— solo para tirarlos:
  // la geometría es fija y lo único que cambia es su proyección.
  if (projected.length !== N) {
    // `cx`/`cy` guardan la posición en espacio de cámara: las barras del chip se recortan
    // ahí, antes de proyectar.
    projected = points.map((p, i) => ({ x: 0, y: 0, z: 0, cx: 0, cy: 0, scale: 1, p, i, e: 0, fade: 1 }));
    // Cada cúbit apunta al objeto proyectado de su punto: sobrevive a la ordenación.
    projected.forEach((q) => {
      if (pointQubit[q.i] >= 0) qubitScreen[pointQubit[q.i]] = q;
    });
  }
  for (let i = 0; i < N; i++) {
    const q = projected[i],
      r = transform(q.p);
    let x = r.x,
      y = r.y,
      z = r.z;
    q.e = 0;
    q.fade = 1;
    if (fieldRaw > 0) {
      const qi = pointQubit[q.i];
      if (qi >= 0) {
        // Punto que se convierte en cúbit: viaja de la esfera a su sitio en el chip.
        const e = morphOf(q.i);
        if (e > 0) {
          const f = fieldCam(chip.nodes[qi]);
          x += (f.x - x) * e;
          y += (f.y - y) * e;
          z += (f.z - z) * e;
        }
        q.e = e;
      }
    }
    // Con la cámara del chip tan cerca, algo puede quedar detrás de ella a mitad de
    // vuelta a la esfera: se deja de dibujar como punto y la perspectiva no se desboca.
    const depth = 3.8 - z;
    if (depth < 0.3) q.fade = 0;
    const perspective = 3.8 / Math.max(depth, 0.05);
    q.x = CX + x * R * perspective;
    q.y = CY + y * R * perspective;
    q.z = z;
    q.cx = x;
    q.cy = y;
    q.scale = perspective;
  }
  projected.sort((a, b) => a.z - b.z);
  const focal = lightCenter();
  ctx.globalCompositeOperation = "lighter";
  for (const q of projected) {
    // Ya disuelto, o ya en el chip, donde lo dibuja `drawField`: ni se calcula.
    const keep = q.fade * (1 - q.e);
    if (keep < 0.01) continue;
    // La profundidad va acotada. Sobre la esfera `z` vive en [-1, 1], pero un punto a medio
    // camino del chip se mide con la cámara del campo, que se mete dentro y deja lo lejano
    // mucho más allá de -1: sin acotar, el radio y el aplastamiento del halo salían
    // negativos y el lienzo lanzaba `IndexSizeError`, que se cargaba el fotograma entero.
    const depth = clamp01((q.z + 1) / 2);
    let light = 0.13 + depth * 0.52,
      hue = 233 + q.p.y * 25 + q.p.x * 12;
    let wavePower = 0;
    // La luz de la esfera —pulsos y convergencia— solo tiene sentido mientras el punto
    // sigue siendo esfera; ya en el chip lo ilumina el camino del territorio.
    if (q.e < 1) {
      for (const w of waves) {
        const dot = Math.max(
            -1,
            Math.min(
              1,
              q.p.x * w.origin.x + q.p.y * w.origin.y + q.p.z * w.origin.z
            )
          ),
          dist = Math.acos(dot),
          age = (now - w.born) / 1000;
        const power =
          Math.exp(-Math.pow((dist - age * 1.25) / 0.17, 2)) *
          Math.max(0, 1 - age / 3.2);
        if (power > wavePower) {
          wavePower = power;
          hue = w.hue + dist * 25;
        }
      }
      // Geometría inmutable: varios pulsos iluminan los puntos hasta alcanzar el destino.
      if (focal) {
        const viewPoint = q.p,
          dist = Math.acos(dot(viewPoint, focal));
        const localPower = convergingLight(viewPoint);
        if (localPower > wavePower) {
          wavePower = localPower;
          hue = DATA[selected].hue + dist * 22;
        }
      }
    }
    // Respiración de fondo de la retícula. Va corta a propósito: da vida sin que la esfera
    // en reposo compita con el pulso, que es lo que sí tiene que destacar.
    const idle = 0.5 + 0.5 * Math.sin(q.p.y * 7 + q.p.x * 3 + elapsed * 0.7);
    const breathe = reduced.matches
      ? 1
      : 0.84 + 0.16 * Math.sin(elapsed * 1.25 + q.p.y * 3);
    light += idle * 0.075 + wavePower * 0.7 * breathe;
    let radius = Math.max(0.1, (0.65 + depth * 1.3 + wavePower * 1.8) * q.scale),
      sat = 45 + wavePower * 45,
      lum = 53 + depth * 17 + wavePower * 25,
      alpha = Math.min(1, light),
      haloAlpha = Math.min(0.6, light * 0.48),
      ringRatio = 0.3 + depth * 0.7,
      ringTilt = q.p.x * 0.5,
      wp = wavePower;
    // Un punto que viaja al chip se funde en su esfera de cúbit (`drawField`) según avanza.
    alpha *= keep;
    haloAlpha *= keep;
    // El halo se salta cuando su alfa cae por debajo de lo que un píxel puede mostrar:
    // son una elipse y un trazo por punto que no pintaban nada.
    if (q.z > -0.3 && haloAlpha > 0.012) {
      ctx.strokeStyle = hsla(hue, 65, 50 + wp * 30, haloAlpha);
      ctx.lineWidth = 0.5 + wp * 0.55;
      ctx.beginPath();
      ctx.ellipse(q.x, q.y, radius * 2.5, radius * 2.5 * ringRatio, ringTilt, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = hsla(hue, sat, lum, alpha);
    ctx.beginPath();
    ctx.arc(q.x, q.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (wp > 0.18 && q.z > 0) {
      ctx.fillStyle = hsla(hue, 95, 70, wp * 0.18 * keep);
      ctx.beginPath();
      ctx.arc(q.x, q.y, radius * 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";
  // Thin linking chords make the sphere read as an interconnected object.
  ctx.lineWidth = 0.4;
  for (let i = 0; fe < 0.99 && i < 20; i++) {
    const a = projected[Math.floor(((i + 0.2) * N) / 21)],
      b = projected[Math.floor(((i + 0.6) * N) / 21)];
    if (a && b) {
      ctx.strokeStyle = "#a2b4ff0b";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  // El chip va encima de lo que queda de la esfera: sus esferas son opacas y tapan.
  if (fe > 0.01) drawField();
}

// Zoom de cámara: jamás modifica las posiciones locales de las partículas.
function cameraLayout() {
  const m = camera.mix,
    wide = W >= 900,
    base = Math.min(W * 0.35, H * 0.35);
  const zoom = wide
    ? Math.min(base * 1.24, W * 0.285, H * 0.43)
    : Math.min(base * 1.16, W * 0.4);
  // Sin ficha a la derecha no hay que apartar la esfera: se queda centrada y solo se
  // acerca. Antes se corría un 20 % a la izquierda para dejarle sitio.
  CX = W * 0.5;
  CY = H * 0.48;
  R = base + (zoom - base) * m;
}
/**
 * Acercamiento al territorio elegido. **La esfera ya no gira para traer el punto al frente.**
 *
 * Ese giro venía de cuando había una ficha al lado del punto y había que verlo bien. Ahora lo
 * que pasa al pulsar es la transformación, y el chip se ancla en el punto pulsado esté donde
 * esté, así que el giro solo servía para arrastrar consigo la malla a medio formar: al elegir
 * un territorio de la cara de atrás, los puntos salían rotando en vez de expandiéndose, que es
 * lo que se quiere ver. Sin él, la esfera se queda quieta y solo se abre.
 *
 * Se conserva el acercamiento (`camera.mix`), que es el que ajusta el radio de la escena.
 */
export function focusCamera() {
  if (camera.target === 0) {
    camera.restY = rotationY;
    camera.restX = rotationX;
  }
  camera.y = rotationY;
  camera.x = rotationX;
  camera.target = 1;
  if (reduced.matches) stepCamera(1);
  draw();
}
export function unfocusCamera() {
  camera.target = 0;
  camera.y =
    rotationY +
    Math.atan2(
      Math.sin(camera.restY - rotationY),
      Math.cos(camera.restY - rotationY)
    );
  camera.x = camera.restX;
  camera.turning = true;
  if (reduced.matches) stepCamera(1);
}
function stepCamera(dt) {
  stepField(dt);
  const k = reduced.matches || dt >= 1 ? 1 : 1 - Math.exp(-dt * 7);
  camera.mix += (camera.target - camera.mix) * k;
  if (Math.abs(camera.target - camera.mix) < 0.0008) camera.mix = camera.target;
  if (camera.turning) {
    rotationY += (camera.y - rotationY) * k;
    rotationX += (camera.x - rotationX) * k;
    if (
      Math.abs(camera.y - rotationY) + Math.abs(camera.x - rotationX) <
      0.001
    ) {
      rotationY = camera.y;
      rotationX = camera.x;
      camera.turning = false;
    }
  }
  cameraLayout();
}
// Ejes de Bloch estilizados según la referencia: x, y, z, |0⟩ et |1⟩.
// Ejes ortonormales de Bloch; giran con la misma cámara que la esfera.
// Conversión Bloch -> motor: (x_B, y_B, z_B) = (x, z, -y).
// Source: https://quantum.cloud.ibm.com/learning/en/modules/quantum-mechanics/superposition-with-qiskit
function drawCoordinates() {
  if (!ctx) return;
  ctx.save();
  ctx.lineWidth = 0.75;
  const axes = [
    { v: { x: 1, y: 0, z: 0 }, name: "x" },
    { v: { x: 0, y: 0, z: 1 }, name: "y" },
    { v: { x: 0, y: -1, z: 0 }, name: "z · |0⟩", negative: "|1⟩" },
  ];
  ctx.font = (W < 500 ? "13" : "15") + "px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const axis of axes) {
    const pos = project(
      transform({ x: axis.v.x * 1.13, y: axis.v.y * 1.13, z: axis.v.z * 1.13 })
    );
    const neg = project(
      transform({
        x: -axis.v.x * 1.13,
        y: -axis.v.y * 1.13,
        z: -axis.v.z * 1.13,
      })
    );
    ctx.strokeStyle = "#8996ff59";
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(neg.x, neg.y);
    ctx.lineTo(CX, CY);
    ctx.stroke();
    ctx.strokeStyle = "#b3bdffaa";
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    const a = Math.atan2(pos.y - CY, pos.x - CX);
    ctx.beginPath();
    ctx.moveTo(pos.x - Math.cos(a - 0.4) * 7, pos.y - Math.sin(a - 0.4) * 7);
    ctx.lineTo(pos.x, pos.y);
    ctx.lineTo(pos.x - Math.cos(a + 0.4) * 7, pos.y - Math.sin(a + 0.4) * 7);
    ctx.stroke();
    ctx.fillStyle = "#c5ceff";
    ctx.fillText(axis.name, pos.x + Math.cos(a) * 20, pos.y + Math.sin(a) * 18);
    if (axis.negative) {
      const angle = Math.atan2(neg.y - CY, neg.x - CX);
      ctx.fillStyle = "#a7b4ed";
      ctx.fillText(
        axis.negative,
        neg.x + Math.cos(angle) * 18,
        neg.y + Math.sin(angle) * 18
      );
    }
  }
  ctx.fillStyle = "#b8ccff";
  ctx.beginPath();
  ctx.arc(CX, CY, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
/**
 * ¿Hay algo moviéndose de verdad? Transformación, cámara o desplazamiento por el chip.
 * Mientras sí, se dibuja en cada refresco de pantalla; en reposo basta con 30 por segundo,
 * que es lo que había. La transformación iba a 30 fps y era lo que más la frenaba: un
 * despliegue con zoom a medio refresco se ve a saltos aunque cada fotograma sea correcto.
 */
function moving() {
  return (
    field.wait > 0 ||
    field.mix !== field.target ||
    camera.turning ||
    camera.mix !== camera.target ||
    Math.abs(field.aimTo.x - field.aim.x) + Math.abs(field.aimTo.z - field.aim.z) > 1e-4 ||
    flight.active ||
    orbit.yaw !== orbit.yawTo ||
    orbit.pitch !== orbit.pitchTo ||
    orbit.zoom !== orbit.zoomTo ||
    fe > 0.3 // el chip está vivo: circuito, respiración y encendidos
  );
}
function tick(now) {
  raf = 0;
  if (introState.active || document.hidden || reduced.matches) return;
  if (moving() || now - lastFrame >= 30) {
    const dt = Math.min((now - lastFrame) / 1000, 0.05);
    lastFrame = now;
    elapsed += dt;
    stepCamera(dt);
    if (!paused) {
      motionTime += dt;
      if (!pointer && selected < 0 && !camera.turning && camera.mix < 0.001)
        rotationY += dt * 0.035;
      if (motionTime - lastIdle > 11 && selected < 0 && !pointer) {
        lastIdle = motionTime;
        emitWave(-0.5, -0.3, 230);
      }
    }
    draw();
  }
  raf = requestAnimationFrame(tick);
}
export function syncMotion() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (!document.hidden && !reduced.matches) {
    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  } else draw();
}
reduced.addEventListener("change", () => {
  paused = reduced.matches;
  syncMotion();
});
document.addEventListener("visibilitychange", () => {
  activity();
  syncMotion();
});
canvas.addEventListener("pointerdown", (e) => {
  if (pointer || e.button !== 0) return;
  draggedOutside = false;
  pointer = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    lastX: e.clientX,
    lastY: e.clientY,
    dragged: false,
  };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  // Señalar un cúbit: solo mientras no se esté arrastrando, que entonces se mira el chip
  // entero y no un cúbit concreto.
  if (inField() && (!pointer || !pointer.dragged)) {
    const r = canvas.getBoundingClientRect();
    hoverQ = pickQubit(e.clientX - r.left, e.clientY - r.top);
  }
  if (!pointer || pointer.id !== e.pointerId) return;
  const dx = e.clientX - pointer.lastX,
    dy = e.clientY - pointer.lastY;
  if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 7)
    pointer.dragged = true;
  if (pointer.dragged) {
    if (inField()) {
      hoverQ = -1;
      // En el chip se orbita el campo, como con OrbitControls en campo-cubits: en
      // horizontal gira alrededor del territorio y en vertical cambia el picado.
      orbitBy(dx * 0.006, -dy * 0.004);
    } else {
      camera.turning = false;
      rotationY += dx * 0.006;
      // La esfera sigue al dedo en las dos direcciones: arrastrar hacia abajo baja la cara
      // de delante. Con el signo al revés, en vertical giraba en contra del arrastre.
      rotationX = Math.max(-1.1, Math.min(1.1, rotationX - dy * 0.003));
      draw();
    }
  }
  pointer.lastX = e.clientX;
  pointer.lastY = e.clientY;
});
canvas.addEventListener("pointerup", (e) => {
  if (!pointer || pointer.id !== e.pointerId) return;
  const dragged = pointer.dragged;
  draggedOutside = dragged;
  pointer = null;
  if (canvas.hasPointerCapture(e.pointerId))
    canvas.releasePointerCapture(e.pointerId);
  // En el chip un toque en vacío es volver a la esfera (lo resuelve `app.js`); el pulso
  // sonaría y se vería al reformarse, como si hubiera sido otra cosa.
  if (!dragged && !inField()) {
    const r = canvas.getBoundingClientRect();
    emitWave(
      (e.clientX - r.left - CX) / R,
      (e.clientY - r.top - CY) / R,
      230,
      true
    );
  }
});
canvas.addEventListener("pointerleave", () => {
  hoverQ = -1;
});
canvas.addEventListener("pointercancel", () => {
  pointer = null;
});
canvas.addEventListener("lostpointercapture", () => {
  pointer = null;
});
/**
 * Rueda: en el chip acerca y aleja la cámara, dentro de sus límites. Fuera del chip no se
 * toca, para que la página siga desplazándose con normalidad.
 */
canvas.addEventListener(
  "wheel",
  (e) => {
    if (!inField()) return;
    e.preventDefault();
    const delta = e.deltaY * (e.deltaMode === 1 ? 33 : 1);
    orbit.zoomTo = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, orbit.zoomTo * Math.exp(delta * 0.0012)));
    settleOrbit();
    activity();
  },
  { passive: false }
);
canvas.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    emitWave(0, 0, 230, true);
  } else if (e.key.startsWith("Arrow") && inField()) {
    // Con teclado también se orbita el chip.
    e.preventDefault();
    if (e.key === "ArrowLeft") orbitBy(-0.12, 0);
    if (e.key === "ArrowRight") orbitBy(0.12, 0);
    if (e.key === "ArrowUp") orbitBy(0, 0.08);
    if (e.key === "ArrowDown") orbitBy(0, -0.08);
    activity();
  } else if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    camera.turning = false;
    if (e.key === "ArrowLeft") rotationY -= 0.12;
    if (e.key === "ArrowRight") rotationY += 0.12;
    // Igual que el arrastre: flecha arriba sube la cara de delante. Con el mismo tope, que
    // sin él se podía dar la vuelta a la esfera por el polo.
    if (e.key === "ArrowUp") rotationX = Math.min(1.1, rotationX + 0.1);
    if (e.key === "ArrowDown") rotationX = Math.max(-1.1, rotationX - 0.1);
    draw();
  }
});

/**
 * Superficie del smoke test. jsdom conduce el motor por nombre —`tick`, `stepCamera`,
 * `motionTime`, `lightTransition`…— y eso antes se lo daba gratis el ámbito global de los
 * scripts clásicos. Se expone **solo** en el build de pruebas (`vite build --mode test`):
 * en el de producción la condición es constante y el bloque desaparece del bundle.
 *
 * Va con accesores y no copiando valores porque el test lee números que cambian mientras
 * conduce la escena; una copia se quedaría con el valor del arranque.
 *
 * Y va en un objeto propio, **no en globales sueltas sobre `window`**: el test las abre con
 * `with (__engine)`. Colgarlas de `window` hacía que una variable libre por un import
 * olvidado se resolviera igualmente en el build de pruebas y explotara solo en producción.
 * Pasó con `R` en `card.js`, y el suite entero lo dio por bueno.
 */
if (import.meta.env.MODE === "test") {
  const vivo = (get, set) => ({ get, set, configurable: true });
  const engine = (window.__engine ??= {});
  Object.defineProperties(engine, {
    W: vivo(() => W, (v) => (W = v)),
    H: vivo(() => H, (v) => (H = v)),
    R: vivo(() => R),
    CX: vivo(() => CX),
    rotationY: vivo(() => rotationY, (v) => (rotationY = v)),
    rotationX: vivo(() => rotationX),
    elapsed: vivo(() => elapsed, (v) => (elapsed = v)),
    motionTime: vivo(() => motionTime),
    lastFrame: vivo(() => lastFrame),
    waves: vivo(() => waves),
    lightTransition: vivo(() => lightTransition),
    fe: vivo(() => fe),
    ff: vivo(() => ff),
  });
  Object.assign(engine, {
    ANCHORS,
    camera,
    introState,
    points,
    dot,
    unit,
    transform,
    draw,
    emitWave,
    tick,
    stepCamera,
    cameraLayout,
    convergingLight,
    lightCenter,
    field,
    chip,
    pointQubit,
    qubitSource,
    circuit,
    stepCircuit,
    orbit,
    view,
    territories,
    qubitScreen,
  });
}
