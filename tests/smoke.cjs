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
      w.HTMLCanvasElement.prototype.getContext = () =>
        canvasAvailable
          ? new Proxy(
              { createRadialGradient: () => ({ addColorStop() {} }) },
              {
                get(o, k) {
                  return k in o ? o[k] : noop;
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
    assert(!d.querySelector("#detail").hidden);
    assert.equal(
      d.querySelectorAll('[data-index][aria-pressed="true"]').length,
      1
    );
    for (let j = 0; j < 3; j++) {
      d.querySelectorAll(".tab")[j].click();
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
  if (!reducedMotion && canvasAvailable) {
    d.querySelector("#pause").click();
    w.eval("stepCamera(1);draw()");
    const clock = w.eval("motionTime"),
      lightClock = w.eval("elapsed"),
      rotation = w.eval("rotationY");
    w.eval("tick(lastFrame+100)");
    assert.equal(w.eval("motionTime"), clock);
    assert.equal(w.eval("rotationY"), rotation);
    assert(w.eval("elapsed") > lightClock);
  }
  d.querySelector("#detail-close").click();
  assert(d.querySelector("#detail").hidden);
  assert.equal(w.eval("lightCenter()"), null);
  assert.equal(w.eval("JSON.stringify(points)"), geometry);
  // Anchored cards, world-space discovery and mute control.
  for (let i = 0; i < 5; i++) {
    d.querySelectorAll(".orbit-node")[i].click();
    w.eval("stepCamera(1);draw()");
    assert.equal(d.querySelector("#point-signal").style.display, "block");
    assert(
      d.querySelector("#point-signal path").getAttribute("d").startsWith("M ")
    );
    assert(Number.isFinite(parseFloat(d.querySelector("#detail").style.left)));
    assert(Number.isFinite(parseFloat(d.querySelector("#detail").style.top)));
    assert(w.eval(`transform(ANCHORS[${i}]).z`) > 0.02);
  }
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
  // Focus zoom goes left on desktop, then returns to the unzoomed central view.
  w.eval("W=1200;H=700;camera.mix=0;camera.target=0;cameraLayout()");
  const baseRadius = w.eval("R");
  d.querySelectorAll(".orbit-node")[1].click();
  w.eval("stepCamera(1);draw()");
  assert(w.eval("camera.mix") === 1);
  assert(w.eval("CX") < w.eval("W") * 0.4);
  assert(w.eval("R") > baseRadius);
  assert(!d.querySelector("#detail-close").hidden);
  assert.equal(
    d.querySelector("#detail-close").parentElement,
    d.querySelector(".experience"),
    "Close is outside scrolling panel"
  );
  d.querySelector("#detail").scrollTop = 600;
  assert(!d.querySelector("#detail-close").hidden);
  d.querySelector("#detail-close").click();
  w.eval("stepCamera(1);draw()");
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
  assert(
    parseFloat(d.querySelector("#detail-close").style.left) >
      parseFloat(d.querySelector("#detail").style.left)
  );
  d.querySelector("#detail-title").click();
  assert(!d.querySelector("#detail").hidden, "Click inside keeps card open");
  d.querySelectorAll(".orbit-node")[4].click();
  assert(!d.querySelector("#detail").hidden, "Another point switches content");
  d.querySelector(".scene-footer").click();
  assert(d.querySelector("#detail").hidden, "Outside click closes card");
  assert.equal(w.eval("camera.target"), 0);
  assert.equal(errors.length, 0, errors.join("\n"));
  assert.equal(
    d.querySelectorAll('script[src],link[rel="stylesheet"],img[src],iframe')
      .length,
    0
  );
  console.log(
    `PASS: reduced motion=${reducedMotion}, canvas=${canvasAvailable}; Hover update, intro copy, 5 panels, X only/top-right, outside dismissal, camera reset, Bloch geometry, fixed particles, intro hold.`
  );
  dom.window.close();
}
check();
check(true);
check(false, false);
