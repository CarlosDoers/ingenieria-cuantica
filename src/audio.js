// Audio sintetizado localmente: ningún archivo ni red. Solo se inicia con un gesto.
/**
 * Paleta sonora con *Interstellar* (Hans Zimmer) como referencia. Se toma su sonido, no su
 * música: ninguna melodía de la película.
 *
 * - **Órgano de tubos.** Cada nota son dos tubos con el mismo timbre (una `PeriodicWave` con
 *   los armónicos de un registro de principal: 8', 4', 2 2/3', 2', 1 1/3', 1') desafinados
 *   unos pocos cents. Batir entre ellos es lo que da el pulso lento de un órgano de verdad.
 *   Las voces suaves usan un registro de flauta, con muchos menos armónicos. Pocas notas:
 *   quintas abiertas y motivos cortos.
 * - **Reverberación de catedral**, de 5,5 s, generada aquí mismo con ruido que se apaga y se
 *   oscurece con el tiempo.
 * - **El reloj.** El tic-tac seco de la película acompaña la carga y el pulso de la esfera.
 * - **Dinámica extrema:** la carga crece desde casi nada y el nacimiento llega de golpe,
 *   con un sub-grave y el acorde entero; luego silencio que se llena de reverberación.
 *
 * Todo pasa por un limitador antes de salir: el nacimiento es muy fuerte a propósito y no
 * debe saturar los altavoces de la sala.
 */
import { $, icon } from './dom.js';

const MASTER = 0.5;
export let soundEnabled = true;
export let audioContext = null;
/** Grafo de audio: contexto, salida, envío a la reverberación y timbres. */
let A = null;

function periodic(ctx, amps) {
  return ctx.createPeriodicWave(new Float32Array(amps.length), new Float32Array(amps));
}
/** Respuesta de una nave de piedra: ruido que cae 60 dB en `seconds` y se va oscureciendo. */
function hall(ctx, seconds) {
  const rate = ctx.sampleRate,
    length = Math.floor(rate * seconds),
    buffer = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let y = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate,
        bright = 0.85 - 0.72 * Math.min(1, t / seconds);
      y += (Math.random() * 2 - 1 - y) * bright;
      data[i] = y * Math.exp((-6.9 * t) / seconds) * (1 - Math.exp(-t * 80));
    }
  }
  return buffer;
}
function graph(ctx) {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = soundEnabled ? MASTER : 0;
  master.connect(limiter);
  const dry = ctx.createGain();
  dry.connect(master);
  const reverb = ctx.createConvolver();
  reverb.buffer = hall(ctx, 5.5);
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  wet.connect(reverb);
  reverb.connect(master);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
    samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return {
    ctx,
    master,
    dry,
    wet,
    noise,
    organ: periodic(ctx, [0, 1, 0.72, 0.34, 0.5, 0.06, 0.26, 0, 0.3]),
    flute: periodic(ctx, [0, 1, 0.3, 0.07, 0.1]),
  };
}

const release = (nodes, source) => {
  source.onended = () => nodes.forEach((n) => n.disconnect());
};

/**
 * Una nota de órgano: dos tubos desafinados, envolvente de tubo (entra, se sostiene y se
 * apaga en la nave) y envío a la reverberación.
 */
function pipe(hz, at, hold, vol, o = {}) {
  const { ctx } = A,
    attack = o.attack ?? 0.06,
    fall = o.release ?? 1.2,
    end = at + attack + hold + fall * 1.8;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, at);
  out.gain.linearRampToValueAtTime(vol, at + attack);
  out.gain.setValueAtTime(vol, at + attack + hold);
  out.gain.setTargetAtTime(0, at + attack + hold, fall / 4);
  const nodes = [out];
  let last = null;
  for (const side of [-1, 1]) {
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(o.wave || A.organ);
    osc.frequency.value = hz;
    osc.detune.value = side * (o.detune ?? 3.5);
    osc.connect(out);
    osc.start(at);
    osc.stop(end);
    nodes.push(osc);
    last = osc;
  }
  if (o.sub) {
    // Registro de 16': la octava de abajo, que es lo que hace temblar la sala.
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.frequency.value = hz / 2;
    gain.gain.value = o.sub;
    osc.connect(gain);
    gain.connect(out);
    osc.start(at);
    osc.stop(end);
    nodes.push(osc, gain);
  }
  let node = out;
  if (o.cutoff) {
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = o.cutoff;
    filter.Q.value = 0.5;
    out.connect(filter);
    nodes.push(filter);
    node = filter;
  }
  node.connect(o.dry || A.dry);
  const send = o.send ?? 0.6;
  if (send > 0) {
    const gain = ctx.createGain();
    gain.gain.value = send;
    node.connect(gain);
    gain.connect(o.wet || A.wet);
    nodes.push(gain);
  }
  release(nodes, last);
}

/** Tic de reloj: un clic seco de ruido y un golpecito tonal, casi sin sala. */
function tick(at, vol, out = A.dry) {
  const { ctx } = A,
    src = ctx.createBufferSource(),
    high = ctx.createBiquadFilter(),
    band = ctx.createBiquadFilter(),
    gain = ctx.createGain(),
    knock = ctx.createOscillator(),
    knockGain = ctx.createGain(),
    send = ctx.createGain();
  src.buffer = A.noise;
  high.type = "highpass";
  high.frequency.value = 2500;
  band.type = "bandpass";
  band.frequency.value = 4200;
  band.Q.value = 2;
  gain.gain.setValueAtTime(vol, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
  knock.frequency.value = 2100;
  knockGain.gain.setValueAtTime(vol * 0.5, at);
  knockGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.02);
  send.gain.value = 0.15;
  src.connect(high);
  high.connect(band);
  band.connect(gain);
  knock.connect(knockGain);
  for (const g of [gain, knockGain]) {
    g.connect(out);
    g.connect(send);
  }
  send.connect(A.wet);
  src.start(at, Math.random());
  src.stop(at + 0.05);
  knock.start(at);
  knock.stop(at + 0.04);
  release([src, high, band, gain, knockGain, send], src);
  release([knock], knock);
}

/** Sub-grave que cae: el golpe del nacimiento. */
function boom(at, vol) {
  const { ctx } = A,
    osc = ctx.createOscillator(),
    gain = ctx.createGain(),
    send = ctx.createGain();
  osc.frequency.setValueAtTime(58, at);
  osc.frequency.exponentialRampToValueAtTime(30, at + 1.6);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(vol, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 2.6);
  send.gain.value = 0.3;
  osc.connect(gain);
  gain.connect(A.dry);
  gain.connect(send);
  send.connect(A.wet);
  osc.start(at);
  osc.stop(at + 2.7);
  release([osc, gain, send], osc);
}

/**
 * Carga de la intro. Vive aquí y no en `intro.js` porque son nodos sobre `audioContext`,
 * que es de este módulo. Va por sus propias salidas para poder cortarla entera al soltar.
 */
const HOLD_SECONDS = 1.8;
let chargeVoice = null;
export function stopCharge() {
  if (!chargeVoice) return;
  try {
    const { dry, wet } = chargeVoice,
      now = A.ctx.currentTime;
    for (const g of [dry, wet]) {
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, 0.03);
    }
    setTimeout(() => {
      dry.disconnect();
      wet.disconnect();
    }, 800);
  } catch {}
  chargeVoice = null;
}

/** El crescendo de órgano de la carga: los tubos van entrando y el registro se abre. */
function charge(now) {
  const { ctx } = A,
    dry = ctx.createGain(),
    wet = ctx.createGain(),
    swell = ctx.createBiquadFilter();
  dry.connect(A.dry);
  wet.connect(A.wet);
  swell.type = "lowpass";
  swell.Q.value = 0.6;
  swell.frequency.setValueAtTime(350, now);
  swell.frequency.exponentialRampToValueAtTime(5200, now + HOLD_SECONDS);
  swell.connect(dry);
  // [nota, cuándo entra, volumen]: del pedal hacia arriba, hasta el acorde entero.
  const notes = [
    [55, 0, 0.11],
    [110, 0, 0.07],
    [164.81, 0.5, 0.055],
  ];
  for (const [hz, delay, vol] of notes)
    pipe(hz, now + delay, 0.3, vol, {
      attack: HOLD_SECONDS - delay,
      release: 0.3,
      sub: hz === 55 ? 0.6 : 0,
      dry: swell,
      wet,
    });
  // El reloj, cada vez más deprisa.
  for (let t = 0; t < HOLD_SECONDS; t += 0.42 - 0.3 * (t / HOLD_SECONDS))
    tick(now + t, 0.05 + 0.06 * (t / HOLD_SECONDS), dry);
  chargeVoice = { dry, wet };
}

/**
 * El nacimiento: golpe grave, una quinta abierta de órgano y el tic del reloj al cristalizar
 * la esfera. Minimalista a propósito: con el acorde entero, la ráfaga de aire y una cola de
 * más de tres segundos tapaba la llegada a la esfera. Tampoco lleva ya la nota aguda que
 * sonaba al final (petición del cliente).
 */
function birth(now) {
  boom(now, 0.3);
  // Una quinta, la y mi, con el 16' debajo de la nota grave.
  pipe(110, now, 0.7, 0.1, { attack: 0.04, release: 1.8, send: 0.45, sub: 0.7 });
  pipe(164.81, now, 0.7, 0.065, { attack: 0.04, release: 1.8, send: 0.45 });
  // Las partículas se posan en sus puntos hacia el 60 % de la transición (0,78 s).
  tick(now + 0.78, 0.045);
}

/**
 * Elegir un territorio: dos notas alternas, a una quinta, sobre un pedal grave, que
 * acompañan el viaje de la esfera al campo. Cada territorio tiene su nota.
 */
function select(now, index) {
  const base = [220, 261.63, 293.66, 329.63, 392][index % 5];
  pipe(base / 2, now, 0.9, 0.05, { attack: 0.25, release: 1.8, sub: 0.5, cutoff: 900 });
  [1, 1.5].forEach((ratio, i) =>
    pipe(base * ratio, now + i * 0.16, 0.04, 0.038, {
      wave: A.flute,
      attack: 0.012,
      release: 0.45,
      send: 0.7,
    })
  );
}

/** Pulso de la esfera: el tic del reloj y una nota de flauta que se queda en la nave. */
function pulse(now) {
  tick(now, 0.06);
  pipe(220, now, 0.2, 0.028, { wave: A.flute, attack: 0.12, release: 1.4 });
}

function hover(now) {
  pipe(659.25, now, 0.05, 0.022, { wave: A.flute, attack: 0.04, release: 0.9, send: 0.9 });
}

function play(kind, index, now) {
  if (kind === "hover") hover(now);
  else if (kind === "charge") {
    stopCharge();
    charge(now);
  } else if (kind === "birth") birth(now);
  else if (kind === "select") select(now, index);
  else pulse(now);
}

export function sound(kind = "select", index = 0) {
  if (!soundEnabled || document.hidden) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!audioContext) {
      audioContext = new Audio();
      A = graph(audioContext);
    }
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
    play(kind, index, audioContext.currentTime);
    // El ambiente no suena en la intro: allí manda la carga. Entra al nacer el universo, ya
    // apagado el acorde, o con el primer sonido si se entró directamente.
    if (kind === "birth") startAmbience(3.5);
    else if (kind !== "hover" && kind !== "charge") startAmbience(0);
  } catch {
    /* La animación sigue operativa si el navegador no permite audio. */
  }
}

/**
 * Fondo: acordes de órgano en registro de flauta que se funden despacio uno en otro, muy
 * filtrados y con mucha nave. Solo arranca tras habilitarse Web Audio con una interacción.
 */
const CHORDS = [
  // Dos notas por acorde, a una décima: lo justo para que se oiga el color de cada uno.
  [110, 261.63], // la menor
  [87.31, 220], // fa
  [130.81, 329.63], // do
  [98, 246.94], // sol
];
const CHORD_SECONDS = 15;
let ambience = null;
function ambienceChord(at) {
  ambience.chord = (ambience.chord + 1) % CHORDS.length;
  for (const hz of CHORDS[ambience.chord])
    pipe(hz, at, CHORD_SECONDS - 6, 0.011, {
      wave: A.flute,
      attack: 5,
      release: 6,
      send: 0,
      dry: ambience.bus,
    });
}
function startAmbience(delay) {
  if (ambience || !A) return;
  const { ctx } = A,
    bus = ctx.createGain(),
    filter = ctx.createBiquadFilter(),
    dry = ctx.createGain(),
    wet = ctx.createGain(),
    now = ctx.currentTime;
  bus.gain.setValueAtTime(0, now);
  bus.gain.setTargetAtTime(1, now + delay, 2.5);
  filter.type = "lowpass";
  filter.frequency.value = 1100;
  filter.Q.value = 0.3;
  dry.gain.value = 0.7;
  bus.connect(filter);
  filter.connect(dry);
  filter.connect(wet);
  dry.connect(A.dry);
  wet.connect(A.wet);
  ambience = { bus, chord: -1 };
  ambienceChord(now + delay);
  setInterval(() => {
    if (!audioContext || document.hidden || audioContext.state !== "running") return;
    ambienceChord(audioContext.currentTime);
  }, CHORD_SECONDS * 1000);
}

document.addEventListener("visibilitychange", () => {
  if (!audioContext) return;
  if (document.hidden) audioContext.suspend().catch(() => {});
  else if (soundEnabled) audioContext.resume().catch(() => {});
});
$("#sound").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  if (A) A.master.gain.setTargetAtTime(soundEnabled ? MASTER : 0, A.ctx.currentTime, 0.03);
  $("#sound").setAttribute("aria-pressed", String(soundEnabled));
  $("#sound").setAttribute("aria-label", soundEnabled ? "Silenciar sonido" : "Activar sonido");
  $("#sound").title = soundEnabled ? "Silenciar sonido" : "Activar sonido";
  $("#sound").innerHTML = icon(soundEnabled ? "sound" : "muted");
  if (soundEnabled) sound("select");
});

/**
 * En desarrollo: `__audioLevels(kind, index, seconds)` renderiza un sonido sin tocar los
 * altavoces (OfflineAudioContext) y devuelve pico y RMS por medio segundo, para calibrar
 * volúmenes sin tener que escucharlos. `kind` también admite "ambience".
 */
if (import.meta.env.DEV)
  window.__audioLevels = async (kind, index = 0, seconds = 6) => {
    const rate = 44100,
      off = new OfflineAudioContext(2, rate * seconds, rate),
      saved = { A, chargeVoice, ambience };
    A = graph(off);
    A.master.gain.value = MASTER;
    if (kind === "ambience") {
      ambience = { bus: A.dry, chord: -1 };
      ambienceChord(0);
    } else play(kind, index, 0);
    ({ A, chargeVoice, ambience } = saved);
    const buffer = await off.startRendering(),
      data = buffer.getChannelData(0),
      step = rate / 2,
      windows = [];
    let peak = 0;
    for (let i = 0; i < data.length; i += step) {
      let p = 0,
        sum = 0;
      for (let j = i; j < Math.min(i + step, data.length); j++) {
        p = Math.max(p, Math.abs(data[j]));
        sum += data[j] * data[j];
      }
      peak = Math.max(peak, p);
      windows.push([+p.toFixed(3), +Math.sqrt(sum / step).toFixed(4)]);
    }
    return { peak: +peak.toFixed(3), windows };
  };
