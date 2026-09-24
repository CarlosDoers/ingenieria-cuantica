const fs = require("node:fs");
const assert = require("node:assert/strict");
const { JSDOM, VirtualConsole } = require("jsdom");
const path = require("node:path");
// Se prueba **lo que se publica**: el bundle de `dist/`, no las fuentes. `npm test` hace
// el build antes. Los assets se inlinean en memoria, en el orden del HTML.
//
// El script va inlineado como clásico porque jsdom no ejecuta módulos ES. Se puede porque
// el bundle de Vite es autocontenido: no queda en él ni un `import` ni un `export`.
const dist = path.resolve(__dirname, "../dist");
const entry = fs.readFileSync(path.join(dist, "index.html"), "utf8");
const local = (href) => path.join(dist, href.replace(/^\//, ""));
let bundle = "";
const html = entry
  .replace(
    /<link rel="stylesheet"[^>]*href="([^"]+)"\s*\/?>/g,
    (_, file) => "<style>" + fs.readFileSync(local(file), "utf8") + "</style>"
  )
  // Vite sube el script al `<head>` porque como módulo va diferido. Inlineado como
  // clásico se ejecutaría antes de que exista el DOM, así que se saca de ahí y se pone
  // al final del `<body>`, que es donde estaba en la entrega original.
  .replace(/<script[^>]*src="([^"]+)"><\/script>/g, (_, file) => {
    bundle = fs.readFileSync(local(file), "utf8");
    return "";
  })
  .replace("</body>", "<script>" + bundle + "</script></body>");
function check(reducedMotion = false, canvasAvailable = true) {
  const errors = [],
    timers = [];
  let draws = 0;
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => errors.push(e.message));
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: reducedMotion, addEventListener() {} });
      w.ResizeObserver = class {
        observe() {}
      };
      w.requestAnimationFrame = () => 1;
      w.cancelAnimationFrame = () => {};
      w.setInterval = (fn) => {
        timers.push(fn);
        return timers.length;
      };
      w.setTimeout = () => 1;
      w.clearTimeout = () => {};
      w.scrollTo = () => {};
      w.HTMLElement.prototype.scrollIntoView = () => {};
      w.HTMLDialogElement.prototype.showModal = function () {
        this.setAttribute("open", "");
      };
      w.HTMLDialogElement.prototype.close = function () {
        this.removeAttribute("open");
      };
      w.HTMLElement.prototype.getBoundingClientRect = () => ({
        width: 700,
        height: 620,
        left: 0,
        top: 0,
        right: 700,
        bottom: 620,
      });
      const noop = (...args) => {
        for (const arg of args)
          if (typeof arg === "number")
            assert(
              Number.isFinite(arg),
              "Canvas received a non-finite coordinate"
            );
        draws++;
      };
      // Un radio negativo lanza `IndexSizeError` y se lleva por delante el fotograma
      // entero: el lienzo se queda en negro desde el `clearRect`. Pasó con la profundidad
      // de un punto medido con la cámara del campo, que se mete dentro del chip.
      const guard = (name) => (...args) => {
        noop(...args);
        const radii = name === "arc" ? [args[2]] : name === "ellipse" ? [args[2], args[3]] : [];
        for (const r of radii)
          assert(r >= 0, `Canvas ${name}() received a negative radius: ${r}`);
      };
      w.HTMLCanvasElement.prototype.getContext = () =>
        canvasAvailable
          ? new Proxy(
              { createRadialGradient: () => ({ addColorStop() {} }) },
              {
                get(o, k) {
                  return k in o ? o[k] : guard(k);
                },
                set(o, k, v) {
                  o[k] = v;
                  return true;
                },
              }
            )
          : null;
    },
  });
  const w = dom.window,
    d = w.document;
  // Las expresiones del test se resuelven **solo** contra la superficie que publica el
  // motor, no contra `window`. Así un identificador que falte por un import olvidado
  // revienta aquí en vez de pasar desapercibido hasta el build de producción.
  const raw = w.eval.bind(w);
  w.eval = (code) => raw("with (window.__engine) {" + code + "\n}");
  // Initial gateway gates the scene, then cancellation and successful hold are verified.
  assert(w.eval("introState.active"));
  assert.equal(d.querySelector(".shell").getAttribute("aria-hidden"), "true");
  w.eval("beginHold();frameBirth(introState.started+900)");
  assert(
    w.eval("introState.progress") > 0.4 && w.eval("introState.progress") < 0.6
  );
  w.eval("cancelHold()");
  assert.equal(w.eval("introState.progress"), 0);
  assert(w.eval("introState.active"));
  w.eval("beginHold();frameBirth(introState.started+1850)");
  if (!reducedMotion) {
    assert(w.eval("introState.bursting"));
    w.eval("frameBirth(introState.burstStart+1400)");
  }
  assert(!w.eval("introState.active"));
  assert(d.querySelector("#gateway").hidden);
  assert.equal(d.querySelector(".shell").getAttribute("aria-hidden"), null);
  assert.equal(d.querySelectorAll(".orbit-node").length, 5);
  assert.equal(d.querySelector("#intro"), null);
  assert.equal(d.querySelector("#territories"), null);
  const geometry = w.eval("JSON.stringify(points)");
  assert(w.eval("Object.isFrozen(points) && points.every(Object.isFrozen)"));
  assert.equal(w.eval("waves.length"), 1, "Initial original pulse is present");
  // Verify independent origins, moving pulse fronts and persistent destination light.
  d.querySelectorAll(".orbit-node")[0].click();
  assert.equal(w.eval("lightTransition.paths.length"), 4);
  if (!reducedMotion) {
    for (let j = 0; j < 4; j++) {
      const power =
        w.eval(`(()=>{const path=lightTransition.paths[${j}],b=lightTransition.to;
    const midpoint=unit({x:path.origin.x+b.x,y:path.origin.y+b.y,z:path.origin.z+b.z});
    elapsed=lightTransition.start+path.delay+path.distance/2/1.05;
    return convergingLight(midpoint)})()`);
      assert(
        power > 0.4,
        "Each origin must produce a visible travelling pulse"
      );
    }
  }
  w.eval("elapsed=lightTransition.start+8");
  assert(
    w.eval("convergingLight(lightTransition.to)") > 0.55,
    "Destination stays lit after pulses arrive"
  );
  assert(
    w.eval(
      "convergingLight({x:-lightTransition.to.x,y:-lightTransition.to.y,z:-lightTransition.to.z})"
    ) < 0.01
  );
  for (let i = 0; i < 5; i++) {
    const waveCount = w.eval("waves.length");
    d.querySelectorAll(".orbit-node")[i].click();
    w.eval("stepCamera(1);draw()");
    assert.equal(
      w.eval("waves.length"),
      waveCount,
      "Territory selection must not emit an outward wave"
    );
    // Sin ficha en los dos primeros niveles: seleccionar entra en el chip.
    assert(d.querySelector("#detail").hidden, "No card on levels 1-2");
    assert.equal(
      d.querySelectorAll('[data-index][aria-pressed="true"]').length,
      1
    );
    assert.equal(
      d.querySelector(".rail-item.active").dataset.rail,
      String(i),
      "Side menu marks the open territory"
    );
    // Con un territorio abierto, «Universo» es la vuelta al primer nivel y lo enseña.
    assert(d.querySelector("#rail").classList.contains("has-selection"));
    // Al abrir un territorio **ninguna pestaña sale señalada**, ni en su etiqueta ni en su
    // cúbit: la señala quien la pulsa.
    assert.equal(d.querySelectorAll('.field-sub[aria-pressed="true"]').length, 0, "No tab marked on open");
    assert.equal(w.eval("field.tab"), -1);
    // Cada pestaña es un cúbit del chip; pulsarla la señala (y sigue cargando su contenido).
    for (let j = 0; j < 3; j++) {
      d.querySelectorAll(".field-sub")[j].click();
      assert.equal(
        d.querySelectorAll('.field-sub[aria-pressed="true"]')[0],
        d.querySelectorAll(".field-sub")[j]
      );
      assert.equal(d.querySelectorAll(".feature").length, 3);
    }
    w.eval("elapsed+=2;draw()");
    assert(w.eval(`Math.acos(dot(lightCenter(),ANCHORS[${i}]))<.00001`));
    assert.equal(
      w.eval("JSON.stringify(points)"),
      geometry,
      "Only light changes, never particle positions"
    );
  }
  w.eval("emitWave(0,0)");
  assert(w.eval("waves.length") >= 2, "Free touches preserve original pulse");
  // Sin controles en la esquina: ni giro con botones, ni pausa, ni reinicio, ni lema.
  ["#turn-left", "#turn-right", "#pause", "#reset", ".scene-controls"].forEach((sel) =>
    assert.equal(d.querySelector(sel), null, `${sel} is gone`)
  );
  assert(!/Un universo\. Cinco conexiones/.test(d.querySelector(".site-footer").textContent));
  d.querySelector(".rail-home").click();
  assert(d.querySelector("#detail").hidden);
  assert.equal(w.eval("lightCenter()"), null);
  assert(d.querySelector(".rail-home").classList.contains("active"));
  assert(!d.querySelector("#rail").classList.contains("has-selection"));
  assert.equal(d.querySelector(".rail-home").textContent.trim(), "Universo Quantum");
  assert(d.querySelector(".rail-home .rail-glyph svg"), "The first level carries its sphere icon");
  assert.equal(
    d.querySelectorAll(".rail-children .rail-item[data-rail]").length,
    5,
    "The five territories hang from the first level"
  );
  assert.equal(w.eval("JSON.stringify(points)"), geometry);
  // Arrastrar la esfera la gira **siguiendo al dedo** también en vertical: hacia abajo, la
  // cara de delante baja. Antes giraba al revés que el arrastre.
  w.eval("stepCamera(1);stepCamera(1);stepCamera(1);draw()");
  {
    const canvasEl = d.querySelector("#universe");
    canvasEl.setPointerCapture = canvasEl.releasePointerCapture = () => {};
    canvasEl.hasPointerCapture = () => false;
    const drag = (type, y) => {
      const ev = new w.Event(type, { bubbles: true });
      Object.assign(ev, { pointerId: 11, button: 0, clientX: 300, clientY: y });
      canvasEl.dispatchEvent(ev);
    };
    const front = "transform({ x: 0, y: 0, z: 1 }).y";
    const before = w.eval(front);
    drag("pointerdown", 200);
    drag("pointermove", 230);
    drag("pointermove", 260);
    drag("pointerup", 260);
    assert(w.eval(front) > before, "Dragging down moves the sphere's front face down");
  }
  // Sección en el chip, pestañas colocadas y sin haz; entrar también desde el menú.
  for (let i = 0; i < 5; i++) {
    const spin = w.eval("JSON.stringify([rotationY, rotationX])");
    (i % 2 ? d.querySelectorAll(".orbit-node")[i] : d.querySelector(`[data-rail="${i}"]`)).click();
    w.eval("stepCamera(1);stepCamera(1);stepCamera(1);stepCamera(1);draw()");
    // Elegir un territorio **no gira la esfera**: el chip se ancla en el punto pulsado esté
    // donde esté, y el giro solo arrastraba consigo la malla a medio formar. Con uno de la
    // cara de atrás, los puntos salían rotando en vez de expandiéndose.
    assert.equal(w.eval("JSON.stringify([rotationY, rotationX])"), spin, "Selecting never spins the sphere");
    assert.notEqual(d.querySelector("#point-signal").style.display, "block");
    const node = d.querySelectorAll(".orbit-node")[i];
    assert(Number.isFinite(parseFloat(node.style.left)));
    assert(Number.isFinite(parseFloat(node.style.top)));
    d.querySelectorAll(".field-sub").forEach((b) =>
      assert(Number.isFinite(parseFloat(b.style.left)), "Tab label sits on its qubit")
    );
  }
  // Fusión con el campo: abrir un territorio transforma la esfera en el chip, y cada
  // pestaña de la ficha pasa a ser un cúbit del chip con su nombre encima.
  assert.equal(
    d.querySelectorAll(".field-sub").length,
    d.querySelectorAll(".tab").length,
    "Each tab is a qubit on the chip"
  );
  // En el chip, arrastrar **orbita la cámara del campo**, como en campo-cubits, y no gira
  // la esfera, que ya no está. La rueda acerca y aleja, y el picado tiene límites.
  w.eval("stepCamera(1);stepCamera(1);draw()");
  assert.equal(w.eval("field.mix"), 1, "Chip fully open");
  const surface = d.querySelector("#universe");
  // jsdom 24 no trae PointerEvent ni captura de puntero: eventos genéricos con sus datos.
  surface.setPointerCapture = surface.releasePointerCapture = () => {};
  surface.hasPointerCapture = () => false;
  const input = (type, props) => {
    const ev = new w.Event(type, { bubbles: true, cancelable: true });
    Object.assign(ev, { pointerId: 3, button: 0 }, props);
    surface.dispatchEvent(ev);
    return ev;
  };
  const spin = w.eval("rotationY"),
    yaw = w.eval("orbit.yawTo"),
    tilt = w.eval("orbit.pitchTo");
  input("pointerdown", { clientX: 300, clientY: 300 });
  input("pointermove", { clientX: 260, clientY: 280 });
  input("pointermove", { clientX: 200, clientY: 250 });
  input("pointerup", { clientX: 200, clientY: 250 });
  assert.equal(w.eval("rotationY"), spin, "Dragging the chip does not spin the sphere");
  assert(w.eval("orbit.yawTo") < yaw, "Horizontal drag orbits the field");
  assert(w.eval("orbit.pitchTo") > tilt, "Vertical drag tilts the field camera");
  w.eval("stepCamera(1);draw()");
  assert.equal(w.eval("orbit.yaw"), w.eval("orbit.yawTo"), "Camera follows the drag");
  input("pointerdown", { clientX: 300, clientY: 300 });
  for (let k = 0; k < 40; k++) input("pointermove", { clientX: 300, clientY: 300 - k * 40 });
  input("pointerup", { clientX: 300, clientY: -1300 });
  assert(w.eval("orbit.pitchTo") <= -0.22 + 0.48 + 1e-9, "Tilt stays above the chip plane");
  const zoom = w.eval("orbit.zoomTo");
  assert(input("wheel", { deltaY: 120, deltaMode: 0 }).defaultPrevented, "Wheel zooms the chip, not the page");
  assert(w.eval("orbit.zoomTo") > zoom);
  w.eval("stepCamera(1);draw()");
  d.querySelectorAll(".field-sub").forEach((b) =>
    assert(Number.isFinite(parseFloat(b.style.left)), "Tab labels follow the orbit")
  );
  // La transformación mueve **todos** los puntos de la esfera: cada uno tiene su sitio en la
  // retícula y ninguno se disuelve por el camino.
  assert.equal(
    w.eval("pointQubit.length"),
    w.eval("points.length"),
    "Every sphere point is mapped"
  );
  assert(w.eval("[...pointQubit].every((q) => q >= 0)"), "No sphere point dissolves");
  assert.equal(w.eval("new Set(pointQubit).size"), w.eval("points.length"), "Each point lands on its own node");
  assert.equal(w.eval("chip.nodes.length"), w.eval("points.length"), "The lattice holds every point");
  // Y el reparto es un desenrollado: la fila 0 —la del fondo, arriba en pantalla— se queda
  // el casquete de |0⟩ (y negativa en este motor) y la última, el de |1⟩. Al revés, las dos
  // mitades de la esfera se cruzaban por el medio.
  assert(
    w.eval(`(() => {
      const mean = [];
      for (const n of chip.nodes) {
        if (n.dust || n.bridge) continue;
        (mean[n.row] ??= []).push(points[qubitSource[n.index]].y);
      }
      const avg = mean.map((ys) => ys.reduce((a, b) => a + b, 0) / ys.length);
      return avg.every((v, i) => i === 0 || v > avg[i - 1]);
    })()`),
    "Lattice rows unroll the sphere from |0⟩ to |1⟩, without crossings"
  );
  // El chip está vivo, como en campo-cubits: el circuito avanza por capas y cada cierto
  // tiempo un frente de lectura lo cruza y deja cada cúbit en |0⟩ o en |1⟩. Con movimiento
  // reducido no corre: es movimiento.
  if (!reducedMotion) {
    // El circuito ya lleva un rato corriendo, así que puede estar en cualquiera de sus tres
    // fases: lo que se comprueba es que el chip dice lo que hace.
    assert(
      /^(Capa \d+\/\d+ · \w+|Medida · |Preparando )/.test(d.querySelector("#chip-hud").textContent),
      "Chip reports its circuit"
    );
    let measured = false;
    for (let i = 0; i < 60 && !measured; i++) {
      w.eval("stepCamera(0.3);draw()");
      measured = w.eval("circuit.phase") === "measure" && w.eval("circuit.readout.some((r) => r > 0.2)");
    }
    assert(measured, "A measurement sweep crosses the chip");
    assert(
      w.eval("circuit.bits.some((b) => b === 1) && circuit.bits.some((b) => b === 0)"),
      "Each qubit collapses to 0 or 1"
    );
    assert(/^Medida · /.test(d.querySelector("#chip-hud").textContent));
    // Sin lienzo no hay cúbits dibujados que señalar.
    if (canvasAvailable) {
      // Señalar un cúbit lo dice: mismo rótulo que en campo-cubits.
      const hub = w.eval("territories[4].hub"),
        at = JSON.parse(w.eval(`JSON.stringify([qubitScreen[${hub}].x, qubitScreen[${hub}].y])`));
      input("pointermove", { clientX: at[0], clientY: at[1] });
      w.eval("stepCamera(0.1);draw()");
      const tip = d.querySelector("#qubit-tip");
      assert(!tip.hidden && /^Q·\d{3}/.test(tip.textContent), "Pointing at a qubit names it");
      input("pointerleave", {});
      w.eval("stepCamera(0.1);draw()");
      assert(d.querySelector("#qubit-tip").hidden, "The label goes with the pointer");
    }
  }
  // Pulsar en el menú el territorio ya abierto recoloca la cámara y no lo cierra.
  const open = d.querySelector(".rail-item.active").dataset.rail;
  d.querySelector(`[data-rail="${open}"]`).click();
  assert.equal(w.eval("orbit.yawTo"), 0, "Re-clicking the open territory recentres the camera");
  assert.equal(w.eval("orbit.zoomTo"), 1);
  assert.equal(d.querySelector(".rail-item.active").dataset.rail, open);
  // Otro territorio se abre en su encuadre: lo girado a mano se deshace.
  input("pointerdown", { clientX: 300, clientY: 300 });
  input("pointermove", { clientX: 200, clientY: 300 });
  input("pointerup", { clientX: 200, clientY: 300 });
  assert.notEqual(w.eval("orbit.yawTo"), 0);
  d.querySelector('[data-rail="2"]').click();
  assert.equal(w.eval("orbit.yawTo"), 0);
  assert.equal(w.eval("orbit.zoomTo"), 1);
  w.eval("stepCamera(1);stepCamera(1);stepCamera(1);draw()");
  // Vuelo de un territorio a otro: **lateral y con algo de giro**, sin alejar la cámara
  // —como mira en picado, alejarse era subir, y diseño pidió quitarlo—. El giro sube a mitad
  // de camino y se deshace al llegar.
  if (!reducedMotion) {
    const k = w.eval("view.k");
    d.querySelector('[data-rail="0"]').click();
    let turned = 0;
    for (let i = 0; i < 10; i++) {
      w.eval("stepCamera(0.25);draw()");
      assert(Math.abs(w.eval("view.k") - k) < 1e-9, "The camera never pulls back between territories");
      turned = Math.max(turned, Math.abs(w.eval("field.turn")));
    }
    assert(turned > 0.05, "The flight turns on the way");
    assert.equal(w.eval("field.turn"), 0, "…and straightens out on arrival");
  }
  // Lo que sigue comprueba el primer nivel —puntos en la cara trasera de la esfera—, así
  // que se vuelve antes a la esfera: con un territorio abierto ya no hay esfera.
  d.querySelector("#detail-close").click();
  w.eval("stepCamera(1);stepCamera(1);stepCamera(1);draw()");
  const nodePositions = Array.from(
    d.querySelectorAll(".orbit-node"),
    (n) => n.style.left
  ).join();
  w.eval("rotationY+=Math.PI;draw()");
  assert.notEqual(
    Array.from(d.querySelectorAll(".orbit-node"), (n) => n.style.left).join(),
    nodePositions
  );
  assert(
    Array.from(d.querySelectorAll(".orbit-node")).every(
      (n) => n.style.pointerEvents === "auto" && Number(n.style.opacity) > 0
    )
  );
  assert(
    Array.from(d.querySelectorAll(".orbit-node")).some(
      (n) => n.dataset.back === "true"
    )
  );
  d.querySelectorAll(".orbit-node")[0].focus();
  assert.equal(
    d.activeElement,
    d.querySelectorAll(".orbit-node")[0],
    "Keyboard focus reaches visible rear points"
  );
  d.querySelector("#sound").click();
  assert.equal(d.querySelector("#sound").getAttribute("aria-pressed"), "false");
  d.querySelector("#sound").click();
  assert.equal(d.querySelector("#sound").getAttribute("aria-pressed"), "true");
  assert(d.querySelector("#quantum-background"));
  // Sin ficha no hay que apartar la escena: se queda centrada y solo se acerca.
  w.eval("W=1200;H=700;camera.mix=0;camera.target=0;cameraLayout()");
  const baseRadius = w.eval("R");
  d.querySelectorAll(".orbit-node")[1].click();
  w.eval("stepCamera(1);draw()");
  assert(w.eval("camera.mix") === 1);
  assert.equal(w.eval("CX"), w.eval("W") * 0.5, "Scene stays centred");
  assert(w.eval("R") > baseRadius);
  assert(d.querySelector("#detail-close").hidden, "No card close button");
  d.querySelector(".rail-home").click();
  w.eval("stepCamera(1);draw()");
  // Al volver a la esfera el chip se apaga: ni medida a la vista ni cúbit señalado.
  assert(w.eval("circuit.readout.every((r) => r === 0)"), "The chip stops measuring on the sphere");
  assert(d.querySelector("#qubit-tip").hidden);
  assert.equal(w.eval("camera.mix"), 0);
  assert.equal(w.eval("CX"), w.eval("W") * 0.5);
  assert.equal(w.eval("R"), baseRadius);
  assert(d.querySelector("#detail-close").hidden);
  assert(d.querySelector("#detail").hidden);
  assert.equal(d.querySelectorAll(".node-name svg").length, 5);
  assert.equal(
    d.querySelector("#hold-start").parentElement,
    d.querySelector("#gateway"),
    "Hold nucleus is centred independently of the caption"
  );
  assert.equal(d.querySelector("#back"), null);
  assert.equal(
    d.querySelector(".gateway-caption").textContent.trim(),
    "Mantén pulsado para comenzar"
  );
  assert.equal(
    d.querySelector("#birth-hint").textContent.trim(),
    "Pulsa con el ratón o manteniendo la tecla espacio."
  );
  d.querySelectorAll(".orbit-node")[2].click();
  w.eval("stepCamera(1);draw()");
  d.querySelectorAll(".field-sub")[1].click();
  assert.equal(
    d.querySelector(".rail-item.active").dataset.rail,
    "2",
    "Clicking a tab qubit keeps the territory open"
  );
  d.querySelector('[data-rail="4"]').click();
  assert.equal(
    d.querySelector(".rail-item.active").dataset.rail,
    "4",
    "Side menu switches territory without leaving the chip"
  );
  d.querySelector(".scene-footer").click();
  assert(
    d.querySelector(".rail-home").classList.contains("active"),
    "Outside click returns to the sphere"
  );
  assert.equal(w.eval("camera.target"), 0);
  // Menú de móvil: el botón de abajo abre la navegación a pantalla completa, con el primer
  // nivel y los cinco territorios; elegir en ella un territorio lo abre y cierra el panel.
  const sheetEl = d.querySelector("#nav-sheet"),
    trigger = d.querySelector("#nav-trigger");
  trigger.click();
  assert(sheetEl.hasAttribute("open"), "The mobile menu opens");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(d.querySelectorAll(".sheet-link").length, 6, "First level plus five territories");
  assert(d.querySelector(".sheet-home").classList.contains("active"), "It shows where you are");
  d.querySelector('.sheet-link[data-sheet="3"]').click();
  assert.equal(
    d.querySelector(".rail-item.active").dataset.rail,
    "3",
    "Picking in the mobile menu opens that territory"
  );
  assert(d.querySelector('.sheet-link[data-sheet="3"]').classList.contains("active"));
  assert(
    reducedMotion ? !sheetEl.hasAttribute("open") : sheetEl.classList.contains("is-closing"),
    "…and the menu closes"
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(
    d.querySelectorAll('script[src],link[rel="stylesheet"],img[src],iframe')
      .length,
    0
  );
  console.log(
    `PASS: reduced motion=${reducedMotion}, canvas=${canvasAvailable}; intro hold, sphere→chip, tabs as qubits, live circuit, field orbit, side menu, mobile menu, no card, outside dismissal, camera reset, Bloch geometry, fixed particles.`
  );
  dom.window.close();
}
check();
check(true);
check(false, false);
