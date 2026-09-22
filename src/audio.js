// Audio sintetizado localmente: ningún archivo ni red. Solo se inicia con un gesto.
import { $, icon } from './dom.js';

export let soundEnabled = true;
export let audioContext = null;
let audioMaster = null;
/**
 * Voz de la carga de la intro. Vive aquí y no en `intro.js` porque es un par
 * oscilador/ganancia sobre `audioContext`, que es de este módulo: antes la declaraba la
 * intro y la reasignaba el audio a través del ámbito global.
 */
let chargeVoice = null;
export function stopCharge() {
  if (!chargeVoice) return;
  try {
    const { oscillator, gain } = chargeVoice,
      now = audioContext.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, 0.025);
    oscillator.stop(now + 0.12);
  } catch {}
  chargeVoice = null;
}
export function sound(kind = "select", index = 0) {
  if (!soundEnabled || document.hidden) return;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!audioContext) {
      audioContext = new Audio();
      audioMaster = audioContext.createGain();
      audioMaster.gain.value = 0.42;
      audioMaster.connect(audioContext.destination);
    }
    if (audioContext.state === "suspended")
      audioContext.resume().catch(() => {});
    startAmbience();
    const now = audioContext.currentTime;
    const play = (hz, offset, duration, volume) => {
      const oscillator = audioContext.createOscillator(),
        gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(hz, now + offset);
      oscillator.frequency.exponentialRampToValueAtTime(
        hz * 0.985,
        now + offset + duration
      );
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(volume, now + offset + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
      oscillator.connect(gain);
      gain.connect(audioMaster);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + duration + 0.04);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    };
    const notes = [261.63, 293.66, 329.63, 392, 440],
      base = notes[index % 5];
    if (kind === "hover") {
      play(659.25, 0, 0.34, 0.025);
      play(987.77, 0.045, 0.38, 0.011);
    } else if (kind === "charge") {
      stopCharge();
      const oscillator = audioContext.createOscillator(),
        gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(110, now);
      oscillator.frequency.exponentialRampToValueAtTime(880, now + 1.8);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.055, now + 0.15);
      gain.gain.setTargetAtTime(0.0001, now + 1.8, 0.05);
      oscillator.connect(gain);
      gain.connect(audioMaster);
      oscillator.start(now);
      oscillator.stop(now + 2.1);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      chargeVoice = { oscillator, gain };
    } else if (kind === "birth") {
      play(65.41, 0, 1.4, 0.13);
      play(523.25, 0.02, 1.9, 0.075);
      play(783.99, 0.12, 2, 0.045);
      play(1046.5, 0.26, 2.2, 0.025);
    } else if (kind === "select") {
      play(base * 2, 0, 0.6, 0.09);
      play(base * 3, 0.05, 0.85, 0.035);
      [0, 1, 2].forEach((i) =>
        play(base * (1 + i * 0.5), 0.26 + i * 0.28, 0.7, 0.027)
      );
    } else {
      play(174.61, 0, 1.15, 0.06);
      play(349.23, 0.12, 1.2, 0.028);
    }
  } catch {
    /* La animación sigue operativa si el navegador no permite audio. */
  }
}
// Fondo musical procedural: acordes graves, batidos lentos y filtro suave.
// Solo arranca tras habilitarse Web Audio con una interacción; no usa archivos externos.
let ambience = null;
function startAmbience() {
  if (ambience || !audioContext) return;
  const bus = audioContext.createGain(),
    filter = audioContext.createBiquadFilter();
  bus.gain.value = 0.17;
  filter.type = "lowpass";
  filter.frequency.value = 720;
  filter.Q.value = 0.35;
  bus.connect(filter);
  filter.connect(audioMaster);
  const chords = [
    [73.416, 110, 164.814],
    [65.406, 97.999, 146.832],
    [58.27, 87.307, 130.813],
    [73.416, 110, 174.614],
  ];
  const voices = chords[0].map((hz, i) => {
    const oscillator = audioContext.createOscillator(),
      gain = audioContext.createGain(),
      lfo = audioContext.createOscillator(),
      depth = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = hz;
    oscillator.detune.value = (i - 1) * 3;
    gain.gain.value = 0.022;
    lfo.frequency.value = 0.065 + i * 0.018;
    depth.gain.value = 0.006;
    lfo.connect(depth);
    depth.connect(gain.gain);
    oscillator.connect(gain);
    gain.connect(bus);
    oscillator.start();
    lfo.start();
    return { oscillator, gain, lfo, depth };
  });
  ambience = { voices, bus, filter, chord: 0 };
  setInterval(() => {
    if (!audioContext || document.hidden || audioContext.state !== "running")
      return;
    ambience.chord = (ambience.chord + 1) % chords.length;
    voices.forEach((v, i) =>
      v.oscillator.frequency.setTargetAtTime(
        chords[ambience.chord][i],
        audioContext.currentTime,
        3.5
      )
    );
  }, 18000);
}
document.addEventListener("visibilitychange", () => {
  if (!audioContext) return;
  if (document.hidden) audioContext.suspend().catch(() => {});
  else if (soundEnabled) audioContext.resume().catch(() => {});
});
$("#sound").addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  if (audioMaster)
    audioMaster.gain.setTargetAtTime(
      soundEnabled ? 0.42 : 0,
      audioContext.currentTime,
      0.03
    );
  $("#sound").setAttribute("aria-pressed", String(soundEnabled));
  $("#sound").setAttribute(
    "aria-label",
    soundEnabled ? "Silenciar sonido" : "Activar sonido"
  );
  $("#sound").title = soundEnabled ? "Silenciar sonido" : "Activar sonido";
  $("#sound").innerHTML = icon(soundEnabled ? "sound" : "muted");
  if (soundEnabled) sound("select");
});
