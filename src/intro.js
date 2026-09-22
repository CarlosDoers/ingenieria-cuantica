import { $, icon, reduced } from './dom.js';
import { activity, announce, nodeEls } from './app.js';
import { canvas, clearWaves, emitWave, introState, resize, syncMotion } from './sphere.js';
import { audioContext, sound, soundEnabled, stopCharge } from './audio.js';

// Entrada independiente: el motor de la esfera permanece detenido hasta completar la carga.
const gateway = $("#gateway"),
  birthCanvas = $("#birth-canvas"),
  birthCtx = birthCanvas.getContext("2d");
let birthW = 0,
  birthH = 0,
  birthRAF = 0,
  birthLast = 0;
export function resizeBirth() {
  birthW = innerWidth;
  birthH = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  birthCanvas.width = Math.round(birthW * dpr);
  birthCanvas.height = Math.round(birthH * dpr);
  if (birthCtx) birthCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintBirth(performance.now());
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
  paintBirth(performance.now());
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
  if (now - birthLast >= 30) {
    birthLast = now;
    if (introState.holding) {
      introState.progress = Math.min(1, (now - introState.started) / 1800);
      $("#hold-start").style.setProperty(
        "--charge",
        `${introState.progress * 100}%`
      );
      $("#birth-progress").setAttribute(
        "aria-valuenow",
        String(Math.round(introState.progress * 100))
      );
      if (introState.progress >= 1) beginBirth(now);
    }
    paintBirth(now);
    if (introState.bursting && now - introState.burstStart >= 1300) {
      finishIntro();
      return;
    }
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
    ? Math.min(1, (now - introState.burstStart) / 1300)
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
$("#skip-intro").addEventListener("click", () => {
  sound("select");
  finishIntro();
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
