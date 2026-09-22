/**
 * Arranque. Las importaciones fijan el orden de evaluación de los módulos; el cuerpo se
 * ejecuta cuando todos están ya montados, que es lo que antes garantizaba ser el último
 * `<script>` de la página.
 */
import './styles.css';
import { $ } from './dom.js';
import { activity } from './app.js';
import { canvas, ctx, draw, emitWave, resize, syncMotion, turnBy } from './sphere.js';
import { initBackdrop } from './background.js';
import { resizeBirth, scheduleBirth } from './intro.js';

// Los puntos posteriores ya son visibles: el foco de teclado revela su etiqueta sin girar la cámara.
$("#turn-left").addEventListener("click", () => {
  turnBy(-Math.PI / 3);
  activity();
});
$("#turn-right").addEventListener("click", () => {
  turnBy(Math.PI / 3);
  activity();
});
initBackdrop();
new ResizeObserver(resize).observe($("#scene"));
resize();
emitWave(-0.5, -0.3, 230);
syncMotion();
$(".shell").inert = true;
$(".shell").setAttribute("aria-hidden", "true");
resizeBirth();
scheduleBirth();
if (!ctx) {
  canvas.hidden = true;
  $("#pause").disabled = true;
  $("#scene").insertAdjacentHTML(
    "afterbegin",
    '<p class="fallback">Elige uno de los cinco puntos para explorar.</p>'
  );
}

if (import.meta.env.MODE === "test") (window.__engine ??= {}).$ = $;
