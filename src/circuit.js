/**
 * Un circuito cuántico ejecutándose sobre el chip, portado tal cual de `campo-cubits`. No
 * simula nada: marca el ritmo de lo que pasa en un Heron cuando corre un trabajo, que es lo
 * que hace que el segundo nivel esté vivo mientras nadie lo toca.
 *
 * - El circuito avanza por **capas**, que el rótulo va contando. Las capas **no se pintan**:
 *   encender sus puertas hacía parpadear el chip entero una y otra vez, y en un menú eso
 *   cansa y compite con la navegación. El circuito se cuenta, no se destella.
 * - El acontecimiento visible es la **medida**: un frente de lectura cruza el chip y cada
 *   cúbit colapsa a 0 o a 1; los que salen a 1 se quedan encendidos un rato.
 * - Después, reposo —el patrón medido se desvanece— y vuelve a empezar con otro circuito.
 */
import { SCALE, chip } from './field.js';

const LAYER_SECONDS = 0.52; // duración de cada capa del circuito
const PULSE_DECAY = 2.6; // caída del destello al pasar el frente de lectura
const IDLE_SECONDS = 2.4; // reposo entre un circuito y el siguiente
const DEPTH_MIN = 8;
const DEPTH_MAX = 12;
const LABELS = ["SX", "CZ", "RZ", "CZ", "X", "CZ"];

const n = chip.nodes.length;
// Las motas quedan fuera del tramo de lectura: están sueltas más allá de los extremos de la
// retícula y el frente se pasaba la primera décima parte del barrido cruzando tres puntos.
const xs = chip.nodes.filter((q) => !q.dust).map((q) => q.x);
const x0 = Math.min(...xs);
const span = Math.max(...xs) - x0 || 1;
/**
 * El barrido de lectura se mide **en columnas**, no en fracciones del chip. La oblea es
 * ahora casi tres veces más ancha en columnas que el chip de antes, y con una fracción fija
 * el frente cruzaba el encuadre casi tres veces más rápido y con un degradado tres veces más
 * ancho: el gesto se perdía. Con esto, a la distancia de cámara del territorio se ve pasar
 * igual que antes, aunque la oblea entera tarde más en leerse del todo.
 */
const COLUMNS = span / SCALE;
const FRONT_COLS = 2.4; // anchura del frente, en columnas
const FRONT_SPEED = 7.62; // columnas por segundo, la velocidad de campo-cubits
const MEASURE_WIDTH = FRONT_COLS / COLUMNS;
const MEASURE_SECONDS = (COLUMNS * (1 + 2 * MEASURE_WIDTH)) / FRONT_SPEED;

export const circuit = {
  /** Resultado de la última medida: -1 sin medir, 0 o 1 medido. */
  bits: new Int8Array(n).fill(-1),
  /** Cuánto se ha leído ya cada cúbit, 0..1: tiñe el cúbit con su valor. */
  readout: new Float32Array(n),
  /** Destello breve al pasarle por encima el frente de lectura. */
  pulse: new Float32Array(n),
  phase: "gates", // 'gates' | 'measure' | 'idle'
  layer: 1,
  depth: DEPTH_MIN,
  label: LABELS[0],
  t: 0,
};
compile();

/** Texto del rótulo: qué está haciendo el chip ahora mismo. */
export function circuitStatus() {
  // Sin número de cúbits: la retícula ya no es un Heron literal —se hizo tan grande como la
  // esfera para que ningún punto se disolviera—, así que el rótulo cuenta lo que hace la
  // máquina y no cuántos cúbits dice tener.
  if (circuit.phase === "measure") return "Medida · lectura del registro";
  if (circuit.phase === "idle") return "Preparando el siguiente circuito";
  return `Capa ${circuit.layer}/${circuit.depth} · ${circuit.label}`;
}

function compile() {
  circuit.depth = DEPTH_MIN + Math.floor(Math.random() * (DEPTH_MAX - DEPTH_MIN + 1));
}

/** Deja el chip sin medida a la vista: al volver a la esfera no tiene que seguir corriendo. */
export function resetCircuit() {
  circuit.bits.fill(-1);
  circuit.readout.fill(0);
  circuit.pulse.fill(0);
  circuit.phase = "gates";
  circuit.layer = 1;
  circuit.label = LABELS[0];
  circuit.t = 0;
  compile();
}

export function stepCircuit(dt) {
  circuit.t += dt;
  const k = Math.exp(-dt * PULSE_DECAY);
  for (let i = 0; i < circuit.pulse.length; i++) {
    if (circuit.pulse[i] > 0) circuit.pulse[i] = circuit.pulse[i] < 1e-3 ? 0 : circuit.pulse[i] * k;
  }

  if (circuit.phase === "gates") {
    const index = Math.floor(circuit.t / LAYER_SECONDS);
    if (index >= circuit.depth) {
      circuit.phase = "measure";
      circuit.t = 0;
      circuit.bits.fill(-1);
      circuit.readout.fill(0);
      return;
    }
    circuit.layer = index + 1;
    circuit.label = LABELS[index % LABELS.length];
    return;
  }

  if (circuit.phase === "measure") {
    // Frente de lectura que cruza el chip de izquierda a derecha.
    const front = (circuit.t / MEASURE_SECONDS) * (1 + MEASURE_WIDTH * 2) - MEASURE_WIDTH;
    chip.nodes.forEach((node, i) => {
      const u = (node.x - x0) / span,
        d = (front - u) / MEASURE_WIDTH;
      if (d < 0) return;
      if (circuit.bits[i] < 0) circuit.bits[i] = Math.random() < 0.5 ? 0 : 1;
      circuit.readout[i] = d < 1 ? d : 1;
      if (d < 1 && 1 - d > circuit.pulse[i]) circuit.pulse[i] = 1 - d;
    });
    if (circuit.t >= MEASURE_SECONDS) {
      circuit.phase = "idle";
      circuit.t = 0;
    }
    return;
  }

  // Reposo: el patrón medido se queda a la vista y se desvanece de forma lineal.
  const fade = Math.max(0, 1 - circuit.t / IDLE_SECONDS);
  for (let i = 0; i < circuit.readout.length; i++) {
    if (circuit.readout[i] > fade) circuit.readout[i] = fade;
  }
  if (circuit.t >= IDLE_SECONDS) {
    resetCircuit();
  }
}
