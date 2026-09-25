/**
 * Arranque. Las importaciones fijan el orden de evaluación de los módulos; el cuerpo se
 * ejecuta cuando todos están ya montados, que es lo que antes garantizaba ser el último
 * `<script>` de la página.
 */
import './fonts.css';
import './styles.css';
import { $ } from './dom.js';
import './app.js';
import { canvas, ctx, draw, emitWave, resize, syncMotion } from './sphere.js';
import { initBackdrop } from './background.js';
import { resizeBirth, scheduleBirth } from './intro.js';

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
  $("#scene").insertAdjacentHTML(
    "afterbegin",
    '<p class="fallback">Elige uno de los cinco puntos para explorar.</p>'
  );
}

if (import.meta.env.MODE === "test") (window.__engine ??= {}).$ = $;
