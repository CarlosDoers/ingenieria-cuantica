/**
 * Contenido de «Computación cuántica», la primera página de tercer nivel. Las secciones son
 * las del diseño (computacion-cuantica-desktop.html, 25/09/2026) tal cual; la cabecera de la
 * página —migas, título, entradilla y esfera— y el enlace a la siguiente las pone page.js,
 * que son comunes a todas las páginas.
 */
import mapa from '../assets/computacion-mapa.jpg';

export default {
  crumb: "Computación",
  lead: "La computación cuántica aprovecha la superposición y el entrelazamiento para procesar información de una forma distinta a un ordenador clásico.",
  title: "Computación<br>cuántica",
  body: `
<!-- Del bit al qubit -->
<section class="section" aria-labelledby="s1">
  <div class="section-head">
    <h2 id="s1">Un qubit no elige entre 0 y 1</h2>
    <p>Utiliza bits cuánticos o qubits en lugar de bits clásicos. Un qubit puede representar varias posibilidades a la vez hasta que se mide.</p>
  </div>
  <div class="section-body">
  <div class="compare">
    <div class="panel">
      <span class="mono-label">Ordenador clásico</span>
      <div class="big-state">0<small>ó</small>1</div>
      <div class="bits" aria-label="Ejemplo de 3 bits: 101"><span class="on">1</span><span>0</span><span class="on">1</span></div>
      <p>Evalúa los estados de forma secuencial. Con 3 bits, solo uno de los 8 estados a la vez.</p>
    </div>
    <div class="panel panel--q">
      <span class="mono-label mono-label--accent">Ordenador cuántico</span>
      <div class="amp">
        <div class="amp-row"><span class="ket">|0⟩</span><span class="amp-bar"><i style="width:70%"></i></span></div>
        <div class="amp-row"><span class="ket">|1⟩</span><span class="amp-bar"><i style="width:30%"></i></span></div>
      </div>
      <div class="big-state" style="font-size:var(--fs-md)">70% · 30%</div>
      <p>Representa simultáneamente varias posibilidades en superposición.</p>
    </div>
  </div>
  </div>
</section>

<!-- Escala exponencial -->
<section class="section" aria-labelledby="s2">
  <div class="section-head">
    <h2 id="s2">El espacio de estados crece exponencialmente</h2>
  </div>
  <div class="section-body">
  <div class="formula"><span>Cada qubit añadido duplica los estados posibles</span><span class="ket">2<sup>n</sup></span></div>
  <div class="scale" role="table" aria-label="Número de qubits y estados posibles">
    <div class="scale-row" role="row"><span class="n" role="cell"><b>1</b> qubit</span><span class="scale-val" role="cell"><span>2</span><i style="width:3.3%"></i></span></div>
    <div class="scale-row" role="row"><span class="n" role="cell"><b>2</b> qubits</span><span class="scale-val" role="cell"><span>4</span><i style="width:6.7%"></i></span></div>
    <div class="scale-row" role="row"><span class="n" role="cell"><b>3</b> qubits</span><span class="scale-val" role="cell"><span>8</span><i style="width:10%"></i></span></div>
    <div class="scale-row" role="row"><span class="n" role="cell"><b>10</b> qubits</span><span class="scale-val" role="cell"><span>1.024</span><i style="width:33.3%"></i></span></div>
    <div class="scale-row" role="row"><span class="n" role="cell"><b>20</b> qubits</span><span class="scale-val" role="cell"><span>1.048.576</span><i style="width:66.7%"></i></span></div>
    <div class="scale-row" role="row"><span class="n" role="cell"><b>30</b> qubits</span><span class="scale-val" role="cell"><span>1.073.741.824</span><i style="width:100%"></i></span></div>
  </div>
  <p class="mono-label">Barras en escala logarítmica (log₂)</p>
  </div>
</section>

<!-- Algoritmo -->
<section class="section" aria-labelledby="s3">
  <div class="section-head">
    <h2 id="s3">Cómo funciona un algoritmo cuántico</h2>
  </div>
  <div class="section-body">
  <ol class="steps">
    <li class="step"><span class="step-dot">01</span><div class="step-body"><h3>Inicialización</h3><p>Preparamos los qubits en un estado inicial: <span class="ket">|0⟩ |0⟩ … |0⟩</span></p></div></li>
    <li class="step"><span class="step-dot">02</span><div class="step-body"><h3>Puertas cuánticas</h3><p>Aplicamos operaciones que crean superposición y entrelazamiento.</p></div></li>
    <li class="step"><span class="step-dot">03</span><div class="step-body"><h3>Evolución cuántica</h3><p>El sistema evoluciona en un espacio de estados enorme de forma paralela.</p></div></li>
    <li class="step"><span class="step-dot">04</span><div class="step-body"><h3>Medición</h3><p>Medimos los qubits y obtenemos el resultado con mayor probabilidad: un resultado clásico.</p></div></li>
  </ol>
  </div>
</section>

<!-- Aplicaciones -->
<section class="section" aria-labelledby="s6">
  <div class="section-head">
    <h2 id="s6">Qué puede aportar a la industria</h2>
    <p>Resolver problemas complejos que superan las capacidades de la computación clásica en ciertos ámbitos.</p>
  </div>
  <div class="section-body">
  <div class="areas">
    <div class="area"><b>Optimización</b><span>Redes eléctricas, rutas logísticas, planificación.</span></div>
    <div class="area"><b>Simulación</b><span>Moléculas, materiales y procesos industriales.</span></div>
    <div class="area"><b>Análisis de datos</b><span>Patrones en grandes volúmenes de datos.</span></div>
  </div>

  <figure>
    <div class="fig-frame"><img src="${mapa}" alt="Infografía de computación cuántica: qubits, algoritmos, desarrollo y simulación, ejecución en hardware cuántico, aplicaciones e impacto." width="1000" height="667" decoding="async"></div>
    <figcaption><span class="mono-label">Fig. 02 · Mapa de la computación cuántica</span><span class="mono-label">GIE</span></figcaption>
  </figure>
  </div>
</section>

<!-- Hardware -->
<section class="section" aria-labelledby="s7">
  <div class="section-head">
    <h2 id="s7">Ejecución en hardware cuántico real</h2>
    <p>Diseñamos, simulamos y probamos algoritmos cuánticos, y los ejecutamos en plataformas reales accesibles en la nube.</p>
  </div>
  <div class="section-body">
  <div class="hw">
    <div class="hw-row"><b>IBM Quantum</b><span class="mono-label">Superconductores</span></div>
    <div class="hw-row"><b>IonQ</b><span class="mono-label">Iones atrapados</span></div>
    <div class="hw-row"><b>Rigetti</b><span class="mono-label">Superconductores</span></div>
  </div>
  </div>
</section>
`,
};
