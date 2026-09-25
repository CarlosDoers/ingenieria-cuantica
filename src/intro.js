import { $, icon, reduced } from './dom.js';
import { activity, announce, nodeEls } from './app.js';
import { clearWaves, emitWave, introState, points, sphereFrame, syncMotion } from './sphere.js';
import { audioContext, sound, soundEnabled, stopCharge } from './audio.js';
import { createMatter } from './matter.js';

// Entrada independiente: el motor de la esfera permanece detenido hasta completar la carga.
const gateway = $("#gateway");
const HOLD_MS = 1800; // lo que hay que mantener pulsado
const BURST_MS = 1300; // de soltar la carga a la esfera ya formada
let birthCanvas = $("#birth-canvas");
/**
 * La materia (WebGL2) es la entrada de verdad; el dibujo 2D queda de respaldo para los
 * navegadores sin WebGL2. Un lienzo que ya pidió un contexto WebGL no admite después uno 2D,
 * así que si la materia no arranca se cambia por uno limpio.
 */
const matter = createMatter(birthCanvas, points, {
  compact: matchMedia("(max-width: 760px), (pointer: coarse)").matches,
});
if (!matter) {
  const fresh = birthCanvas.cloneNode(false);
  birthCanvas.replaceWith(fresh);
  birthCanvas = fresh;
}
const birthCtx = matter ? null : birthCanvas.getContext("2d");
gateway.classList.toggle("has-matter", !!matter);
let birthW = 0,
  birthH = 0,
  birthRAF = 0,
  birthLast = 0,
  painted = 0;
export function resizeBirth() {
  birthW = innerWidth;
  birthH = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  if (matter) {
    matter.resize(birthW, birthH, dpr);
    placeCore();
    paintMatter(performance.now());
    return;
  }
  birthCanvas.width = Math.round(birthW * dpr);
  birthCanvas.height = Math.round(birthH * dpr);
  if (birthCtx) birthCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintBirth(performance.now());
}

/**
 * Estado de la materia. Los tiempos siguen el bucle del original: paso acotado entre 1/240
 * y 1/30 s, la carga y la velocidad del puntero amortiguadas (λ 5) y el paralaje de cámara
 * siguiendo al puntero a 0,16 en horizontal y 0,1 en vertical (λ 3).
 *
 * El puntero se sigue dos veces: `a` lo alcanza casi al instante y `b` es un rastro lento.
 * Cada partícula reacciona a su propia mezcla de los dos (ver el shader), que es lo que le da
 * el retraso orgánico.
 */
const GATHER_SECONDS = 3.4; // lo que tarda la materia dispersa en reunirse al cargar
const flow = {
  last: 0,
  time: 14, // arranca con el flujo ya desarrollado, no desde la semilla
  spin: 0,
  charge: 0,
  gather: reduced.matches ? 1 : 0,
  x: -1e4,
  y: -1e4,
  ax: -1e4,
  ay: -1e4,
  bx: -1e4,
  by: -1e4,
  moveX: 0,
  moveY: 0,
  vx: 0,
  vy: 0,
  presence: 0,
  inside: false,
  tiltY: 0,
  tiltX: 0,
};
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
let frame = { x: 0, y: 0, r: 1, ry: 0, rx: 0 };
/** Aspecto de la materia: tamaño de la nube, grano, brillo y bloom. */
const LOOK = {
  cloud: 1.36, // radio de la nube, en radios de la esfera
  pointSize: 2.2,
  gain: 0.75,
  threshold: 0.05,
  bloom: 0.8,
  bloomRadius: 0.75,
  exposure: 1.2, // la del renderer del original
  pointerRadius: 175, // alcance del puntero, px con la esfera a su tamaño de escritorio
  pointerForce: 24, // empuje con el puntero quieto, px
  pointerSpeed: 0.06, // empuje extra por px/s de velocidad
  pointerMax: 110, // tope de ese empuje extra, px
  trail: 2.4, // lo que tarda el rastro en alcanzar al puntero (λ; menos es más lento)
};
// En desarrollo, `__matter` permite afinar el aspecto en vivo y congelar una fase de la
// entrada con `__matter.pose = { charge, burst, gather }` para mirarla con calma.
if (import.meta.env.DEV) window.__matter = LOOK;

/** El botón de carga va en el corazón de la nube, que es el centro de la esfera. */
let placed = "";
function placeCore() {
  frame = sphereFrame();
  // Solo se escribe si cambia: se llama en cada fotograma y un estilo reescrito, aunque sea
  // igual, obliga al navegador a recalcular.
  const at = frame.x + "," + frame.y;
  if (at === placed) return;
  placed = at;
  const button = $("#hold-start");
  button.style.left = frame.x + "px";
  button.style.top = frame.y + "px";
}

function paintMatter(now) {
  const dt = flow.last ? Math.min(Math.max((now - flow.last) / 1000, 1 / 240), 1 / 30) : 1 / 60;
  flow.last = now;
  const still = reduced.matches;
  const pose = import.meta.env.DEV ? LOOK.pose : null;
  const charge = pose ? pose.charge : introState.bursting ? 1 : introState.progress;
  flow.charge = still ? charge : damp(flow.charge, charge, 5, dt);
  if (!still) {
    flow.time += dt;
    flow.spin += dt * (0.05 + 1.3 * flow.charge * flow.charge);
  }
  // Si se empieza a cargar antes de que la nube esté reunida, se reúne más deprisa.
  const hurry = introState.holding || introState.bursting ? 2.5 : 1;
  flow.gather = still ? 1 : Math.min(1, flow.gather + (dt / GATHER_SECONDS) * hurry);
  flow.ax = damp(flow.ax, flow.x, 16, dt);
  flow.ay = damp(flow.ay, flow.y, 16, dt);
  flow.bx = damp(flow.bx, flow.x, LOOK.trail, dt);
  flow.by = damp(flow.by, flow.y, LOOK.trail, dt);
  // Velocidad del puntero: lo recorrido en este fotograma, suavizado.
  flow.vx = damp(flow.vx, flow.moveX / dt, 5, dt);
  flow.vy = damp(flow.vy, flow.moveY / dt, 5, dt);
  flow.moveX = flow.moveY = 0;
  flow.presence = damp(flow.presence, flow.inside ? 1 : 0, 4, dt);
  const nx = flow.inside ? (flow.x / birthW) * 2 - 1 : 0,
    ny = flow.inside ? (flow.y / birthH) * 2 - 1 : 0;
  flow.tiltY = damp(flow.tiltY, nx * 0.16, 3, dt);
  flow.tiltX = damp(flow.tiltX, -ny * 0.1, 3, dt);

  const burst = pose
    ? pose.burst
    : introState.bursting
    ? clamp01((now - introState.burstStart) / BURST_MS)
    : 0;
  // Destello al llegar: la materia se posa en sus puntos y se enciende un instante.
  const arrive = Math.exp(-Math.pow((burst - 0.6) / 0.09, 2));
  const speed = Math.hypot(flow.vx, flow.vy),
    scale = frame.r / 260;
  matter.render(
    {
      cx: frame.x,
      cy: frame.y,
      r: frame.r,
      ry: frame.ry,
      rx: frame.rx,
      tiltY: still ? 0 : flow.tiltY,
      tiltX: still ? 0 : flow.tiltX,
      time: flow.time,
      spin: flow.spin,
      charge: flow.charge,
      burst,
      cloud: LOOK.cloud,
      pointSize: LOOK.pointSize,
      gain: LOOK.gain,
      gather: pose?.gather ?? flow.gather,
      px: flow.ax,
      py: flow.ay,
      tx: flow.bx,
      ty: flow.by,
      pr: LOOK.pointerRadius * scale,
      pf: still
        ? 0
        : (LOOK.pointerForce + Math.min(speed * LOOK.pointerSpeed, LOOK.pointerMax)) *
          scale *
          flow.presence,
      vx: still ? 0 : flow.vx,
      vy: still ? 0 : flow.vy,
      threshold: LOOK.threshold,
      bloom: LOOK.bloom,
      bloomRadius: LOOK.bloomRadius,
      exposure: LOOK.exposure * (1 + 0.9 * arrive),
      fade: 1 - clamp01((burst - 0.62) / 0.38),
    },
    now
  );
}
function beginHold() {
  if (!introState.active || introState.bursting || introState.holding) return;
  introState.holding = true;
  introState.started = performance.now();
  introState.progress = 0;
  gateway.classList.add("charging");
  $("#birth-status").textContent = "Concentrando energía…";
  sound("charge");
  scheduleBirth();
}
function cancelHold() {
  if (!introState.holding || introState.bursting) return;
  introState.holding = false;
  introState.progress = 0;
  gateway.classList.remove("charging");
  stopCharge();
  $("#birth-status").textContent = "Mantén pulsado hasta completar el círculo.";
  $("#birth-progress").setAttribute("aria-valuenow", "0");
  $("#hold-start").style.setProperty("--charge", "0%");
  if (!matter) paintBirth(performance.now());
  else scheduleBirth();
}
function beginBirth(now) {
  if (introState.bursting || !introState.active) return;
  introState.holding = false;
  introState.bursting = true;
  introState.burstStart = now;
  stopCharge();
  sound("birth");
  gateway.classList.add("bursting");
  $("#birth-status").textContent = "Tu universo comienza aquí.";
  if (reduced.matches) {
    finishIntro();
    return;
  }
  document.body.classList.add("universe-forming");
  scheduleBirth();
}
function finishIntro() {
  if (!introState.active) return;
  introState.active = false;
  introState.holding = false;
  introState.bursting = false;
  cancelAnimationFrame(birthRAF);
  birthRAF = 0;
  stopCharge();
  gateway.hidden = true;
  // La entrada no vuelve: se suelta la GPU para que la esfera la tenga entera.
  matter?.dispose();
  document.body.classList.remove("intro-active", "universe-forming");
  const shell = $(".shell");
  shell.inert = false;
  shell.removeAttribute("aria-hidden");
  clearWaves();
  emitWave(0, 0, 245);
  syncMotion();
  nodeEls[0].focus({ preventScroll: true });
  announce(
    "Universo activado. Gira la esfera o elige uno de sus cinco puntos."
  );
  activity();
}
export function scheduleBirth() {
  if (!birthRAF && introState.active && !document.hidden)
    birthRAF = requestAnimationFrame(frameBirth);
}
function frameBirth(now) {
  birthRAF = 0;
  if (!introState.active || document.hidden) return;
  if (introState.holding) {
    introState.progress = Math.min(1, (now - introState.started) / HOLD_MS);
    $("#hold-start").style.setProperty("--charge", `${introState.progress * 100}%`);
    $("#birth-progress").setAttribute(
      "aria-valuenow",
      String(Math.round(introState.progress * 100))
    );
    if (introState.progress >= 1) beginBirth(now);
  }
  if (introState.bursting && now - introState.burstStart >= BURST_MS) {
    finishIntro();
    return;
  }
  if (matter) {
    // Tope de 60 fps: en pantallas de 120 Hz se pintaría el doble para verse igual. El
    // margen deja pasar cada refresco a 60 y 90 Hz y uno de cada dos a 120 y 144.
    if (now - painted >= 10 || introState.bursting) {
      painted = now;
      // La esfera puede recolocarse (cambio de tamaño, barra del navegador en móvil).
      placeCore();
      paintMatter(now);
    }
  } else if (now - birthLast >= 30) {
    birthLast = now;
    paintBirth(now);
  }
  if (!reduced.matches || introState.holding || introState.bursting)
    scheduleBirth();
}
function paintBirth(now) {
  if (!birthCtx || !introState.active) return;
  const c = birthCtx,
    cx = birthW * 0.5,
    cy = birthH * 0.43;
  const size = Math.min(birthW * 0.31, birthH * 0.24, 190),
    t = reduced.matches ? 0 : now / 1000,
    charge = introState.progress;
  const burst = introState.bursting
    ? Math.min(1, (now - introState.burstStart) / BURST_MS)
    : 0;
  c.clearRect(0, 0, birthW, birthH);
  if (introState.bursting) {
    c.globalCompositeOperation = "lighter";
    for (let j = 0; j < 3; j++) {
      const r = size * (0.2 + burst * (3 + j * 0.65));
      c.strokeStyle = `rgba(${130 + j * 35},${135 + j * 25},255,${
        (1 - burst) * (0.55 - j * 0.12)
      })`;
      c.lineWidth = (1 - burst) * 3 + 0.5;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
    }
    for (let i = 0; i < 150; i++) {
      const a = i * 2.39996,
        r =
          size * 0.2 +
          Math.pow(burst, 0.68) *
            Math.min(birthW, birthH) *
            (0.26 + (i % 17) / 28),
        x = cx + Math.cos(a) * r,
        y = cy + Math.sin(a) * r * 0.8;
      c.fillStyle = `hsla(${205 + (i % 80)},100%,85%,${(1 - burst) * 0.85})`;
      c.beginPath();
      c.arc(x, y, (1 - burst) * (1 + (i % 4) * 0.45), 0, Math.PI * 2);
      c.fill();
      if (i % 8 === 0) {
        c.strokeStyle = `rgba(170,208,255,${(1 - burst) * 0.38})`;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - Math.cos(a) * 18 * burst, y - Math.sin(a) * 18 * burst);
        c.stroke();
      }
    }
    const glow = c.createRadialGradient(
      cx,
      cy,
      0,
      cx,
      cy,
      size * (0.5 + burst * 3)
    );
    glow.addColorStop(0, `rgba(220,231,255,${(1 - burst) * 0.68})`);
    glow.addColorStop(0.17, `rgba(120,125,255,${(1 - burst) * 0.33})`);
    glow.addColorStop(1, "rgba(60,80,255,0)");
    c.fillStyle = glow;
    c.fillRect(0, 0, birthW, birthH);
    c.globalCompositeOperation = "source-over";
    gateway.style.opacity = String(1 - Math.max(0, (burst - 0.35) / 0.65));
    return;
  }
  const radius = size * (1 - charge * 0.82);
  const fog = c.createRadialGradient(cx, cy, 0, cx, cy, size * 1.9);
  fog.addColorStop(0, `rgba(98,69,240,${0.18 + charge * 0.1})`);
  fog.addColorStop(0.5, "rgba(36,59,175,.065)");
  fog.addColorStop(1, "rgba(15,19,60,0)");
  c.fillStyle = fog;
  c.fillRect(0, 0, birthW, birthH);
  c.globalCompositeOperation = "lighter";
  // Filamentos de forma variable se concentran en un núcleo de luz.
  for (let layer = 0; layer < 21; layer++) {
    c.beginPath();
    for (let k = 0; k <= 110; k++) {
      const a = (k / 110) * Math.PI * 2;
      const deform =
        (Math.sin(a * 3 + t * 0.58 + layer * 0.22) * 0.17 +
          Math.sin(a * 5 - t * 0.35 + layer * 0.6) * 0.1) *
        (1 - charge);
      const r = radius * (0.58 + layer * 0.018 + deform),
        x = cx + Math.cos(a + t * 0.08) * r,
        y =
          cy +
          Math.sin(a) * r * (0.69 + 0.18 * Math.sin(layer * 0.2 + t * 0.2));
      if (k === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.strokeStyle = `hsla(${220 + layer * 2.9},95%,${60 + charge * 23}%,${
      0.12 + charge * 0.19
    })`;
    c.lineWidth = 0.6 + charge * 0.6;
    c.stroke();
  }
  for (let i = 0; i < 190; i++) {
    const a = i * 2.39996 + t * 0.13,
      r = radius * (0.4 + (i % 29) / 22) * (1 + 0.11 * Math.sin(t * 0.5 + i));
    c.fillStyle = `hsla(${205 + (i % 70)},100%,${66 + charge * 26}%,${
      0.16 + 0.35 * (0.5 + 0.5 * Math.sin(i + t * 0.8))
    })`;
    c.beginPath();
    c.arc(
      cx + Math.cos(a) * r,
      cy + Math.sin(a) * r * 0.77,
      0.6 + charge * 1.2 + (i % 3) * 0.2,
      0,
      Math.PI * 2
    );
    c.fill();
  }
  const core = c.createRadialGradient(
    cx,
    cy,
    0,
    cx,
    cy,
    Math.max(18, radius * 0.85)
  );
  core.addColorStop(0, `rgba(226,236,255,${0.14 + charge * 0.8})`);
  core.addColorStop(0.15, `rgba(138,130,255,${0.16 + charge * 0.65})`);
  core.addColorStop(0.5, `rgba(71,74,240,${0.08 + charge * 0.19})`);
  core.addColorStop(1, "rgba(75,60,230,0)");
  c.fillStyle = core;
  c.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  // Sin anillo de progreso en el lienzo. Era un arco de radio `size * 1.32` —más de 250 px—
  // que barría por detrás del núcleo y cruzaba por encima del propio texto. Y sobraba: el
  // botón ya se rellena solo con su `conic-gradient`, que es el indicador que hay que mirar.
  c.globalCompositeOperation = "source-over";
}
const holdButton = $("#hold-start");
let lastHover = -1000;
const introHover = () => {
  if (!introState.active || introState.holding || introState.bursting) return;
  const now = performance.now();
  if (now - lastHover < 600) return;
  lastHover = now;
  // El navegador puede impedir sonido antes del primer gesto del usuario.
  if (
    audioContext?.state === "running" ||
    navigator.userActivation?.hasBeenActive
  )
    sound("hover");
};
holdButton.addEventListener("pointerenter", introHover);
holdButton.addEventListener("focus", introHover);
holdButton.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  if (holdButton.setPointerCapture) holdButton.setPointerCapture(e.pointerId);
  beginHold();
});
["pointerup", "pointercancel", "lostpointercapture"].forEach((name) =>
  holdButton.addEventListener(name, cancelHold)
);
holdButton.addEventListener("keydown", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    if (!e.repeat) beginHold();
  }
});
holdButton.addEventListener("keyup", (e) => {
  if (e.key === " " || e.key === "Enter") {
    e.preventDefault();
    cancelHold();
  }
});
holdButton.addEventListener("blur", cancelHold);
/**
 * Mantener pulsado vale en cualquier sitio de la entrada, no solo en el botón: la nube
 * entera es lo que se toca. El botón sigue ahí para el teclado y como indicación.
 */
gateway.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || e.target !== gateway) return;
  e.preventDefault();
  gateway.setPointerCapture?.(e.pointerId);
  beginHold();
});
["pointerup", "pointercancel", "lostpointercapture"].forEach((name) =>
  gateway.addEventListener(name, cancelHold)
);
// El puntero perturba la materia al pasar: la aparta, la arremolina y la arrastra.
window.addEventListener("pointermove", (e) => {
  if (!matter || !introState.active) return;
  if (flow.inside) {
    flow.moveX += e.clientX - flow.x;
    flow.moveY += e.clientY - flow.y;
  } else {
    // Al entrar, los dos seguidores saltan al puntero: si no, cruzarían la pantalla desde
    // donde se quedaron.
    flow.ax = flow.bx = e.clientX;
    flow.ay = flow.by = e.clientY;
  }
  flow.x = e.clientX;
  flow.y = e.clientY;
  flow.inside = true;
});
document.documentElement.addEventListener("pointerleave", () => {
  flow.inside = false;
});
$("#intro-sound").addEventListener("click", () => {
  $("#sound").click();
  $("#intro-sound").setAttribute("aria-pressed", String(soundEnabled));
  $("#intro-sound").setAttribute(
    "aria-label",
    soundEnabled ? "Silenciar sonido" : "Activar sonido"
  );
  $("#intro-sound").innerHTML = icon(soundEnabled ? "sound" : "muted");
  if (!soundEnabled) stopCharge();
});
window.addEventListener("resize", () => {
  if (introState.active) resizeBirth();
});
document.addEventListener("visibilitychange", () => {
  if (introState.active) {
    cancelHold();
    cancelAnimationFrame(birthRAF);
    birthRAF = 0;
    if (!document.hidden) {
      if (introState.bursting) finishIntro();
      else scheduleBirth();
    }
  }
});

// Ver la nota en `sphere.js`: la intro también se conduce por nombre desde el smoke test.
if (import.meta.env.MODE === "test") {
  Object.assign((window.__engine ??= {}), { beginHold, cancelHold, frameBirth });
}
