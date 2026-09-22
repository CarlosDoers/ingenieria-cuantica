import { $, icon, reduced } from './dom.js';
import { DATA } from './content.js';
import { activity, announce, nodeEls, selected } from './app.js';
import { positionCard } from './card.js';
import { sound } from './audio.js';
import { drawBackdrop } from './background.js';

/* V3 · Original pulse restored. The particle geometry is immutable.
   Territory clicks move a LIGHT field, never particle positions. */
export const canvas = $("#universe"),
  ctx = canvas.getContext("2d");
/**
 * Pausa del movimiento. La declaraba `app.js`, que no la usaba para nada: la leen y la
 * escriben `tick` y `syncMotion`, que están aquí.
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
  positionNodes();
  draw();
}
// Transparencia: los puntos posteriores siguen visibles y seleccionables, con menor brillo.
export function positionNodes() {
  nodeEls.forEach((b, i) => {
    const p = project(transform(ANCHORS[i])),
      front = p.z > 0.03;
    b.style.left = p.x + "px";
    b.style.top = p.y + "px";
    b.style.opacity = front ? String(0.72 + 0.28 * Math.max(0, p.z)) : "0.43";
    b.style.pointerEvents = "auto";
    b.dataset.back = String(!front);
    b.style.setProperty("--depth-scale", String(0.8 + (0.25 * (p.z + 1)) / 2));
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
export function turnBy(delta) {
  camera.turning = false;
  rotationY += delta;
  draw();
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
    lastView.sel !== selected
  ) {
    lastView.ry = rotationY;
    lastView.rx = rotationX;
    lastView.cx = CX;
    lastView.cy = CY;
    lastView.r = R;
    lastView.sel = selected;
    positionNodes();
  }
  drawBackdrop();
  if (!ctx || !W || !H) return;
  ctx.clearRect(0, 0, W, H);
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
  waves = waves.filter((w) => now - w.born < 3200);
  // Se reutilizan el mismo array y los mismos objetos, y se ordena en el sitio. Antes se
  // creaban 1.150 objetos nuevos en cada dibujado —34.500 por segundo— solo para tirarlos:
  // la geometría es fija y lo único que cambia es su proyección.
  if (projected.length !== N)
    projected = points.map((p, i) => ({ x: 0, y: 0, z: 0, scale: 1, p, i }));
  for (let i = 0; i < N; i++) {
    const q = projected[i],
      r = transform(q.p),
      perspective = 3.8 / (3.8 - r.z);
    q.x = CX + r.x * R * perspective;
    q.y = CY + r.y * R * perspective;
    q.z = r.z;
    q.scale = perspective;
  }
  projected.sort((a, b) => a.z - b.z);
  const focal = lightCenter();
  ctx.globalCompositeOperation = "lighter";
  for (const q of projected) {
    const depth = (q.z + 1) / 2;
    let light = 0.13 + depth * 0.52,
      hue = 233 + q.p.y * 25 + q.p.x * 12;
    let wavePower = 0;
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
    // Respiración de fondo de la retícula. Va corta a propósito: da vida sin que la esfera
    // en reposo compita con el pulso, que es lo que sí tiene que destacar.
    const idle = 0.5 + 0.5 * Math.sin(q.p.y * 7 + q.p.x * 3 + elapsed * 0.7);
    const breathe = reduced.matches
      ? 1
      : 0.84 + 0.16 * Math.sin(elapsed * 1.25 + q.p.y * 3);
    light += idle * 0.075 + wavePower * 0.7 * breathe;
    const radius = (0.65 + depth * 1.3 + wavePower * 1.8) * q.scale;
    // El halo se salta cuando su alfa cae por debajo de lo que un píxel puede mostrar:
    // son una elipse y un trazo por punto que no pintaban nada.
    const haloAlpha = Math.min(0.6, light * 0.48);
    if (q.z > -0.3 && haloAlpha > 0.012) {
      ctx.strokeStyle = hsla(hue, 65, 50 + wavePower * 30, haloAlpha);
      ctx.lineWidth = 0.5 + wavePower * 0.55;
      ctx.beginPath();
      ctx.ellipse(
        q.x,
        q.y,
        radius * 2.5,
        radius * 2.5 * (0.3 + depth * 0.7),
        q.p.x * 0.5,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
    ctx.fillStyle = hsla(
      hue,
      45 + wavePower * 45,
      53 + depth * 17 + wavePower * 25,
      Math.min(1, light)
    );
    ctx.beginPath();
    ctx.arc(q.x, q.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (wavePower > 0.18 && q.z > 0) {
      ctx.fillStyle = hsla(hue, 95, 70, wavePower * 0.18);
      ctx.beginPath();
      ctx.arc(q.x, q.y, radius * 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = "source-over";
  // Thin linking chords make the sphere read as an interconnected object.
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 20; i++) {
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
}

// Zoom de cámara: jamás modifica las posiciones locales de las partículas.
function cameraLayout() {
  const m = camera.mix,
    wide = W >= 900,
    base = Math.min(W * 0.35, H * 0.35);
  const zoom = wide
    ? Math.min(base * 1.24, W * 0.285, H * 0.43)
    : Math.min(base * 1.16, W * 0.4);
  CX = W * (0.5 + (wide ? -0.2 : 0) * m);
  CY = H * (0.48 + (wide ? -0.015 : -0.18) * m);
  R = base + (zoom - base) * m;
}
export function focusCamera(index) {
  if (camera.target === 0) {
    camera.restY = rotationY;
    camera.restX = rotationX;
  }
  const p = ANCHORS[index],
    yaw = -Math.atan2(p.x, p.z) + (W >= 900 ? 0.34 : 0.1);
  camera.y =
    rotationY +
    Math.atan2(Math.sin(yaw - rotationY), Math.cos(yaw - rotationY));
  camera.x =
    Math.atan2(p.y, Math.sqrt(p.x * p.x + p.z * p.z)) +
    (W >= 900 ? 0.12 : 0.44);
  camera.target = 1;
  camera.turning = true;
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
function tick(now) {
  raf = 0;
  if (introState.active || document.hidden || reduced.matches) return;
  if (now - lastFrame >= 30) {
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
  $("#pause").innerHTML = icon(paused ? "play" : "pause");
  const label = paused
    ? "Reanudar pulso y giro"
    : "Pausar pulso y giro; mantener luz viva";
  $("#pause").setAttribute("aria-label", label);
  $("#pause").title = label;
  $("#pause").setAttribute("aria-pressed", String(paused));
  if (!document.hidden && !reduced.matches) {
    lastFrame = performance.now();
    raf = requestAnimationFrame(tick);
  } else draw();
}
$("#pause").addEventListener("click", () => {
  if (reduced.matches) {
    announce(
      "El dispositivo tiene movimiento reducido. La iluminación cambia sin animación."
    );
    return;
  }
  paused = !paused;
  syncMotion();
  announce(
    paused
      ? "Pulso y giro pausados. La luz sigue respirando."
      : "Pulso y giro reanudados."
  );
});
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
  if (!pointer || pointer.id !== e.pointerId) return;
  const dx = e.clientX - pointer.lastX,
    dy = e.clientY - pointer.lastY;
  if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 7)
    pointer.dragged = true;
  if (pointer.dragged) {
    camera.turning = false;
    rotationY += dx * 0.006;
    rotationX = Math.max(-1.1, Math.min(1.1, rotationX + dy * 0.003));
    draw();
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
  if (!dragged) {
    const r = canvas.getBoundingClientRect();
    emitWave(
      (e.clientX - r.left - CX) / R,
      (e.clientY - r.top - CY) / R,
      230,
      true
    );
  }
});
canvas.addEventListener("pointercancel", () => {
  pointer = null;
});
canvas.addEventListener("lostpointercapture", () => {
  pointer = null;
});
canvas.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    emitWave(0, 0, 230, true);
  } else if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    camera.turning = false;
    if (e.key === "ArrowLeft") rotationY -= 0.12;
    if (e.key === "ArrowRight") rotationY += 0.12;
    if (e.key === "ArrowUp") rotationX -= 0.1;
    if (e.key === "ArrowDown") rotationX += 0.1;
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
    elapsed: vivo(() => elapsed, (v) => (elapsed = v)),
    motionTime: vivo(() => motionTime),
    lastFrame: vivo(() => lastFrame),
    waves: vivo(() => waves),
    lightTransition: vivo(() => lightTransition),
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
  });
}
