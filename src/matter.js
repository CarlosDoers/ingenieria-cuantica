/**
 * Materia de la entrada: una nube de partículas que, al mantener pulsado, se condensa y
 * acaba siendo los 1.150 puntos de la esfera.
 *
 * El aspecto viene del fondo de aaronjcunningham.com (three.js r185 sobre WebGPU): una bola
 * densa de partículas en mezcla aditiva, con bloom de cinco niveles y tone mapping ACES a
 * exposición 1.2. De aquel original se conserva **el post-procesado** —los cinco niveles
 * con sus núcleos 3/5/7/9/11 y sus factores 1.0…0.2, `lerpBloomFactor`, el umbral de
 * luminancia, ACES con las mismas matrices y la salida sRGB—, que es lo que le da el núcleo
 * blanco y el halo ancho. Solo cambia dónde se hace el umbral (ver `BLUR_FS`) y la
 * resolución (ver `SCENE_DPR`), por rendimiento.
 * La simulación del original no venía en la captura, y aquí no hace falta: cada partícula
 * se calcula en el vertex shader a partir de su semilla, el tiempo y el puntero, sin estado.
 * Eso lo hace barato y deja la geometría en manos de quien la conduce (`intro.js`).
 *
 * Va en WebGL2 directo y no en three.js: es una sola escena de puntos y un bloom, y meter la
 * librería entera para eso pesaba más que todo el proyecto.
 *
 * **Continuidad con la esfera.** Cada partícula tiene asignado un punto de la esfera
 * (`targets[i % 1150]`) y nace en una dirección cercana a él. La nube se proyecta con la
 * misma cámara que `sphere.js` —giro Y, luego X, perspectiva `3.8 / (3.8 - z)`—, así que al
 * converger cada partícula cae exactamente donde el lienzo de la esfera pinta su punto.
 */

const PER_POINT_DESKTOP = 110; // 1.150 × 110 = 126.500 partículas
const PER_POINT_COMPACT = 44; // 50.600 en móvil
/** Núcleos y factores de los cinco niveles del bloom de three (`BloomNode`). */
const KERNELS = [3, 5, 7, 9, 11];
/**
 * Resolución de la materia: a píxel CSS aunque la pantalla sea retina. La nube es difusa y
 * no se nota, y en retina ahorra más de la mitad del trabajo: lo que pesaba no eran las
 * partículas sino las pasadas a pantalla completa del bloom y la composición.
 */
const SCENE_DPR = 1;
const FACTORS = [1.0, 0.8, 0.6, 0.4, 0.2];

const PARTICLE_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aSeed;   // xyz: posición en la bola unidad · w: azar
layout(location = 1) in vec4 aTarget; // xyz: su punto de la esfera · w: azar
uniform vec2 uView;       // tamaño del lienzo en px CSS
uniform vec3 uSphere;     // centro (x, y) y radio de la esfera, en px CSS
uniform vec2 uRot;        // giro de la esfera: rotationY, rotationX
uniform vec2 uTilt;       // paralaje del puntero, solo para la nube
uniform float uTime, uSpin, uCharge, uBurst, uCloud, uPx, uSize, uGain, uGather;
uniform vec4 uPointer;    // x, y (px CSS) del puntero, radio (px), fuerza (px)
uniform vec2 uTrail;      // rastro lento del puntero, px CSS
uniform vec2 uVel;        // velocidad amortiguada del puntero, px/s
out vec3 vColor;
out float vAlpha;

// Ruido simplex 3D (Ashima Arts / Stefan Gustavson, MIT).
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y +
    vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// La misma rotación que transform() en sphere.js: primero Y, luego X.
vec3 turn(vec3 p, float ry, float rx) {
  float c = cos(ry), s = sin(ry), a = cos(rx), b = sin(rx);
  float x = p.x * c + p.z * s, z = -p.x * s + p.z * c;
  return vec3(x, p.y * a - z * b, p.y * b + z * a);
}
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
vec3 spinY(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}

void main() {
  float w = aSeed.w, w2 = aTarget.w;
  float r = length(aSeed.xyz);
  // Llegada al punto de la esfera: rápida al principio y posada al final.
  float b = clamp(uBurst / 0.62, 0.0, 1.0);
  float e = b < 0.5 ? 4.0 * b * b * b : 1.0 - pow(-2.0 * b + 2.0, 3.0) / 2.0;

  // Nube: la semilla, empujada por un flujo de ruido lento.
  vec3 p = aSeed.xyz * uCloud;
  float amp = 0.09 * (1.0 - 0.55 * uCharge);
  vec3 q = aSeed.xyz * 1.15;
  float t = uTime * 0.07;
  p += amp * vec3(
    snoise(q + vec3(0.0, t, 3.1)),
    snoise(q + vec3(17.3, 5.2, -t)),
    snoise(q + vec3(t, 41.7, 9.4)));
  // Al cargar, la materia se recoge sobre la superficie de la esfera y vibra.
  float len = max(length(p), 1e-4);
  float shell = mix(len, 1.0 + (w - 0.5) * 0.08, uCharge * 0.88);
  p = p / len * shell;
  // Solo mientras se carga: en reposo son tres ruidos por partícula que no se verían.
  if (uCharge > 0.002) {
    p += uCharge * uCharge * 0.022 * vec3(
      snoise(q * 9.0 + uTime * 2.3),
      snoise(q * 9.0 + 7.7 + uTime * 2.3),
      snoise(q * 9.0 + 15.1 + uTime * 2.3));
  }
  // Remolino: lo de dentro gira más deprisa. Se deshace al converger, así que cada
  // partícula vuelve en espiral a la dirección de su punto.
  p = spinY(p, uSpin * (0.55 + 0.9 * (1.0 - clamp(r, 0.0, 1.0))) * (1.0 - e));
  // Entrada: la materia llega del caos. Cada partícula nace en un punto al azar de la
  // pantalla, sin relación con su sitio en la nube, y viaja por su propio camino: el ruido
  // la desvía sobre todo a mitad de viaje y la deja posarse al final. Sale con su propio
  // retraso y frena al llegar, así la nube se rellena poco a poco.
  float gi = clamp(uGather * 1.6 - w * 0.6, 0.0, 1.0);
  gi = 1.0 - pow(1.0 - gi, 3.0);
  if (gi < 1.0) {
    vec3 h = vec3(hash(aSeed.xyz), hash(aSeed.zxy + 3.1), hash(aSeed.yzx + 7.7)) * 2.0 - 1.0;
    vec3 far = h * vec3(3.2, 2.0, 1.4);
    vec3 path = mix(far, p, gi);
    vec3 n = far * 0.7 + vec3(0.0, 0.0, uTime * 0.35);
    float wander = (1.0 - gi) * 0.3 + sin(gi * 3.14159) * 0.55;
    p = path + wander * vec3(
      snoise(n),
      snoise(n + vec3(19.1, 0.0, 0.0)),
      snoise(n + vec3(0.0, 33.7, 0.0)) * 0.6);
  }
  vec3 cloud = turn(p, uRot.x + uTilt.x * (1.0 - e), uRot.y + uTilt.y * (1.0 - e));
  vec3 target = turn(aTarget.xyz, uRot.x, uRot.y);
  vec3 pos = mix(cloud, target, e);

  float depth = max(3.8 - pos.z, 0.3);
  float persp = 3.8 / depth;
  vec2 screen = uSphere.xy + pos.xy * uSphere.z * persp;

  // Perturbación del puntero, en pantalla. Cada partícula reacciona con su propio retraso:
  // unas siguen al puntero casi al instante y otras a su rastro lento. Así el hueco deja
  // estela, se rellena poco a poco al parar y no se mueve todo a la vez, como un fluido.
  // Con w * w la mayoría responde rápido y solo una parte se queda rezagada.
  vec2 ptr = mix(uPointer.xy, uTrail, w * w);
  vec2 d = screen - ptr;
  float d2 = dot(d, d);
  float rad = uPointer.z * (0.8 + 0.4 * w2);
  float f = exp(-d2 / (rad * rad)) * (1.0 - e) * (0.8 + 0.2 * sin(uTime * 1.7 + w2 * 6.2832));
  vec2 dir = d * inversesqrt(d2 + 1.0);
  screen += (dir * (0.6 + 0.5 * w) + vec2(-dir.y, dir.x) * (w2 - 0.5) * 1.1) * uPointer.w * f;
  // Arrastre: lo que hay entre el puntero y su rastro se va con el movimiento y vuelve a su
  // sitio cuando el rastro le alcanza.
  screen += ((uPointer.xy - uTrail) * 0.3 + uVel * 0.035) * f * (0.4 + w);

  gl_Position = vec4(screen.x / uView.x * 2.0 - 1.0, 1.0 - screen.y / uView.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(1.0, uSize * uPx * persp * (0.55 + 0.9 * w2) * mix(1.0, 0.8, e));

  // Luz: más en la cara de delante y arriba (en el motor, +y es hacia abajo).
  float front = clamp((pos.z + 1.0) * 0.5, 0.0, 1.0);
  float lit = 0.4 + 1.0 * smoothstep(-1.2, 1.2, -pos.y * 0.85 + pos.z * 0.5);
  // Lineales: azul violeta saturado en el borde; el blanco del núcleo lo pone la densidad
  // al pasar por ACES, como en el original.
  vec3 deep = vec3(0.07, 0.035, 0.85);
  vec3 lavender = vec3(0.26, 0.22, 1.0);
  vec3 pale = vec3(0.7, 0.72, 1.0);
  vec3 col = mix(deep, lavender, smoothstep(0.1, 0.9, w2 * 0.6 + lit * 0.45));
  col = mix(col, pale, uCharge * 0.15 * front);
  float edge = 1.0 - smoothstep(1.05, 1.3, r) * 0.7;
  vColor = col;
  // Al recogerse, la misma materia ocupa menos: se compensa para que no se funda en blanco
  // y se lea el borde de la esfera.
  vAlpha = uGain * (0.45 + 0.55 * front) * lit * edge * mix(1.0, 0.62, uCharge) * mix(1.0, 0.42, e);
  // Al cargar la página la materia se enciende mientras llega.
  vAlpha *= smoothstep(0.0, 0.12, uGather) * mix(0.75, 1.0, gi);
}`;

const PARTICLE_FS = `#version 300 es
precision highp float;
in vec3 vColor;
in float vAlpha;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c) * 4.0;
  if (d > 1.0) discard;
  float a = 1.0 - d;
  outColor = vec4(vColor * vAlpha * a * a, 0.0);
}`;

const QUAD_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * Desenfoque separable de three: gaussiana con sigma igual al radio del núcleo.
 *
 * El primer nivel lee directamente la escena y aplica ahí el `luminosityHighPass` de three
 * (umbral con `smoothWidth` 0.01) a cada muestra: es el mismo resultado sin una pasada
 * propia a media resolución. En los demás niveles `uThreshold` es negativo y no se aplica.
 */
const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform int uRadius;
uniform float uThreshold;
out vec4 outColor;
float gauss(float x, float s) { return 0.39894 * exp(-0.5 * x * x / (s * s)) / s; }
vec3 pick(vec2 uv) {
  vec3 c = texture(uTex, uv).rgb;
  if (uThreshold < 0.0) return c;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return c * smoothstep(uThreshold, uThreshold + 0.01, l);
}
void main() {
  float s = float(uRadius);
  float wsum = gauss(0.0, s);
  vec3 sum = pick(vUv) * wsum;
  for (int i = 1; i < 11; i++) {
    if (i >= uRadius) break;
    float x = float(i), g = gauss(x, s);
    sum += (pick(vUv + uDir * x) + pick(vUv - uDir * x)) * g;
    wsum += 2.0 * g;
  }
  outColor = vec4(sum / wsum, 1.0);
}`;

/**
 * Composición del bloom y salida, como `Bloom_comp` + `RenderPipeline` del original:
 * escena + bloom, ACES filmic con la exposición del renderer y OETF sRGB. El alfa sale de la
 * luminancia, premultiplicado: lo oscuro deja ver lo de debajo, que es lo que permite que la
 * esfera aparezca por detrás mientras las partículas aún brillan.
 */
const FINAL_FS = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene, uB0, uB1, uB2, uB3, uB4;
uniform float uStrength, uRadius, uExposure, uFade;
uniform float uFactors[5];
out vec4 outColor;
float lerpBloomFactor(float factor) { return mix(factor, 1.2 - factor, uRadius); }
vec3 aces(vec3 color) {
  color *= uExposure / 0.6;
  color = mat3(0.59719, 0.076, 0.0284, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777) * color;
  color = (color * (color + 0.0245786) - 0.000090537) / (color * (0.983729 * color + 0.432951) + 0.238081);
  color = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602) * color;
  return clamp(color, 0.0, 1.0);
}
vec3 srgb(vec3 c) {
  return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}
void main() {
  vec3 bloom = uStrength * (
    lerpBloomFactor(uFactors[0]) * texture(uB0, vUv).rgb +
    lerpBloomFactor(uFactors[1]) * texture(uB1, vUv).rgb +
    lerpBloomFactor(uFactors[2]) * texture(uB2, vUv).rgb +
    lerpBloomFactor(uFactors[3]) * texture(uB3, vUv).rgb +
    lerpBloomFactor(uFactors[4]) * texture(uB4, vUv).rgb);
  vec3 c = srgb(aces(texture(uScene, vUv).rgb + bloom));
  float a = clamp(max(c.r, max(c.g, c.b)) * 1.15, 0.0, 1.0);
  outColor = vec4(c, a) * uFade;
}`;

/** Azar con semilla: la nube es la misma en cada visita. */
function random(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seeds(targets, perPoint) {
  const rand = random(1150),
    gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand()),
    count = targets.length * perPoint,
    data = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const t = targets[i % targets.length];
    // Nace cerca de la dirección de su punto: al condensarse, cada una tiene poco camino.
    let x = t.x + gauss() * 0.42,
      y = t.y + gauss() * 0.42,
      z = t.z + gauss() * 0.42;
    const n = Math.hypot(x, y, z) || 1;
    // Bola más densa hacia el centro, con un 6 % de partículas sueltas que deshilachan el
    // borde.
    let r = Math.pow(rand(), 0.5);
    if (rand() < 0.06) r *= 1.05 + rand() * 0.22;
    x = (x / n) * r;
    y = (y / n) * r;
    z = (z / n) * r;
    data.set([x, y, z, rand(), t.x, t.y, t.z, rand()], i * 8);
  }
  return { data, count };
}

function compile(gl, vs, fs) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) || "shader");
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) || "link");
  const uniforms = {},
    total = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < total; i++) {
    const name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, "");
    uniforms[name] = gl.getUniformLocation(program, name);
  }
  return { program, uniforms };
}

/**
 * Monta la materia sobre `canvas`. Devuelve `null` si no hay WebGL2 o algo falla al
 * compilar: la entrada vuelve entonces a su dibujo 2D de siempre.
 */
export function createMatter(canvas, targets, { compact = false } = {}) {
  if (typeof WebGL2RenderingContext === "undefined") return null;
  let gl;
  try {
    gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  if (!(gl instanceof WebGL2RenderingContext)) return null;

  const { data, count } = seeds(targets, compact ? PER_POINT_COMPACT : PER_POINT_DESKTOP);
  let res = null,
    lost = false;
  const size = { w: 1, h: 1, cssW: 1, cssH: 1, dpr: 1, sceneDpr: 1, scale: 1 };

  function build() {
    const half = !!gl.getExtension("EXT_color_buffer_float");
    const programs = {
      particles: compile(gl, PARTICLE_VS, PARTICLE_FS),
      blur: compile(gl, QUAD_VS, BLUR_FS),
      final: compile(gl, QUAD_VS, FINAL_FS),
    };
    const vao = gl.createVertexArray(),
      buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    const quad = gl.createVertexArray();
    gl.bindVertexArray(null);
    res = { half, programs, vao, buffer, quad, targets: null };
  }

  function makeTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const alloc = (half) =>
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        half ? gl.RGBA16F : gl.RGBA8,
        w,
        h,
        0,
        gl.RGBA,
        half ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
        null
      );
    alloc(res.half);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    // Sin coma flotante renderizable, 8 bits: el núcleo satura antes, pero se ve.
    if (res.half && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      res.half = false;
      alloc(false);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  function freeTargets() {
    if (!res?.targets) return;
    const { scene, tmp, mips } = res.targets;
    for (const t of [scene, ...tmp, ...mips]) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fb);
    }
    res.targets = null;
  }

  function sizeTargets() {
    freeTargets();
    const w = Math.max(1, Math.round(size.cssW * size.sceneDpr * size.scale)),
      h = Math.max(1, Math.round(size.cssH * size.sceneDpr * size.scale));
    const scene = makeTarget(w, h);
    let mw = Math.max(1, Math.round(w / 2)),
      mh = Math.max(1, Math.round(h / 2));
    const tmp = [],
      mips = [];
    for (let i = 0; i < KERNELS.length; i++) {
      tmp.push(makeTarget(mw, mh));
      mips.push(makeTarget(mw, mh));
      mw = Math.max(1, Math.round(mw / 2));
      mh = Math.max(1, Math.round(mh / 2));
    }
    res.targets = { scene, tmp, mips };
  }

  function resize(cssW, cssH, dpr) {
    size.cssW = cssW;
    size.cssH = cssH;
    size.dpr = dpr;
    size.sceneDpr = Math.min(dpr, SCENE_DPR);
    // El lienzo va a la misma resolución que la luz: componer a más no añadiría detalle,
    // solo píxeles. El navegador lo escala a la pantalla sin coste.
    size.w = Math.max(1, Math.round(cssW * size.sceneDpr));
    size.h = Math.max(1, Math.round(cssH * size.sceneDpr));
    canvas.width = size.w;
    canvas.height = size.h;
    if (!lost) sizeTargets();
  }

  /**
   * Calidad adaptativa, como el bucle del original: si el fotograma medio pasa de 21,5 ms
   * se baja la resolución de render un 10 % (hasta el 70 %), y se recupera cuando baja de
   * 17,2 ms dos ventanas seguidas.
   */
  const perf = { start: 0, sum: 0, frames: 0, calm: 0, last: 0 };
  function adapt(now) {
    if (!perf.last) {
      perf.last = perf.start = now;
      return;
    }
    perf.sum += Math.max(now - perf.last, 1);
    perf.frames++;
    perf.last = now;
    if (now - perf.start < 2500 || perf.frames <= 30) return;
    const avg = perf.sum / perf.frames;
    let next = size.scale;
    if (avg > 21.5) {
      next = Math.max(0.7, size.scale - 0.1);
      perf.calm = 0;
    } else if (avg < 17.2 && size.scale < 1) {
      if (++perf.calm >= 2) {
        next = Math.min(1, size.scale + 0.1);
        perf.calm = 0;
      }
    } else perf.calm = 0;
    if (next !== size.scale) {
      size.scale = next;
      sizeTargets();
    }
    perf.start = now;
    perf.sum = 0;
    perf.frames = 0;
  }

  function pass(target, program) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, target ? target.w : size.w, target ? target.h : size.h);
    gl.useProgram(program.program);
    return program.uniforms;
  }
  function bind(unit, tex) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  function render(s, now) {
    if (lost || !res?.targets) return;
    adapt(now);
    const { programs, targets } = res,
      { scene, tmp, mips } = targets;

    // 1 · Partículas, aditivas, sobre coma flotante.
    let u = pass(scene, programs.particles);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform2f(u.uView, size.cssW, size.cssH);
    gl.uniform3f(u.uSphere, s.cx, s.cy, s.r);
    gl.uniform2f(u.uRot, s.ry, s.rx);
    gl.uniform2f(u.uTilt, s.tiltY, s.tiltX);
    gl.uniform1f(u.uTime, s.time);
    gl.uniform1f(u.uSpin, s.spin);
    gl.uniform1f(u.uCharge, s.charge);
    gl.uniform1f(u.uBurst, s.burst);
    gl.uniform1f(u.uCloud, s.cloud);
    gl.uniform1f(u.uPx, size.sceneDpr * size.scale);
    gl.uniform1f(u.uSize, s.pointSize);
    gl.uniform1f(u.uGain, s.gain);
    gl.uniform1f(u.uGather, s.gather);
    gl.uniform4f(u.uPointer, s.px, s.py, s.pr, s.pf);
    gl.uniform2f(u.uTrail, s.tx, s.ty);
    gl.uniform2f(u.uVel, s.vx, s.vy);
    gl.bindVertexArray(res.vao);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.disable(gl.BLEND);

    // 2 · Cinco niveles, cada uno desenfocado en horizontal y en vertical. El primero parte
    // de la escena y le aplica el umbral.
    gl.bindVertexArray(res.quad);
    let source = scene;
    for (let i = 0; i < KERNELS.length; i++) {
      u = pass(tmp[i], programs.blur);
      bind(0, source.tex);
      gl.uniform1i(u.uTex, 0);
      gl.uniform1i(u.uRadius, KERNELS[i]);
      gl.uniform1f(u.uThreshold, i === 0 ? s.threshold : -1);
      gl.uniform2f(u.uDir, 1 / tmp[i].w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      u = pass(mips[i], programs.blur);
      bind(0, tmp[i].tex);
      gl.uniform1i(u.uTex, 0);
      gl.uniform1i(u.uRadius, KERNELS[i]);
      gl.uniform1f(u.uThreshold, -1);
      gl.uniform2f(u.uDir, 0, 1 / mips[i].h);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      source = mips[i];
    }

    // 3 · Composición, tone mapping y salida.
    u = pass(null, programs.final);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    bind(0, scene.tex);
    gl.uniform1i(u.uScene, 0);
    mips.forEach((m, i) => {
      bind(i + 1, m.tex);
      gl.uniform1i(u["uB" + i], i + 1);
    });
    gl.uniform1fv(u.uFactors, FACTORS);
    gl.uniform1f(u.uStrength, s.bloom);
    gl.uniform1f(u.uRadius, s.bloomRadius);
    gl.uniform1f(u.uExposure, s.exposure);
    gl.uniform1f(u.uFade, s.fade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  function dispose() {
    if (!res) return;
    freeTargets();
    const { programs, vao, buffer, quad } = res;
    Object.values(programs).forEach((p) => gl.deleteProgram(p.program));
    gl.deleteVertexArray(vao);
    gl.deleteVertexArray(quad);
    gl.deleteBuffer(buffer);
    res = null;
    // Libera la GPU del todo: la entrada no vuelve, y esto se queda días encendido.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    lost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (!res) return;
    lost = false;
    build();
    sizeTargets();
  });

  try {
    build();
  } catch (error) {
    console.warn("Materia de la entrada sin WebGL2:", error);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  return { count, resize, render, dispose };
}
