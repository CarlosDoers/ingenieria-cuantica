import { $, reduced } from './dom.js';
import { selected } from './app.js';
import { ANCHORS, H, W, dot, elapsed, project, transform } from './sphere.js';

// Shader WebGL de interferencia y filamentos. Resolución limitada para móviles.
let backdrop = null;
/**
 * Antes lo montaba `main.js` con `backdrop = createBackdrop()`, escribiendo una variable
 * de este módulo desde fuera. Ahora la asignación se queda donde vive el dato.
 */
export function initBackdrop() {
  backdrop = createBackdrop();
}
export function createBackdrop() {
  const surface = $("#quantum-background");
  let gl;
  try {
    gl = surface.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      powerPreference: "low-power",
    });
  } catch {
    return null;
  }
  if (!gl) return null;
  const vertex =
    "attribute vec2 a_position;void main(){gl_Position=vec4(a_position,0.,1.);}";
  const fragment = `precision mediump float;
 uniform vec2 u_resolution;uniform float u_time;uniform vec2 u_focus;uniform float u_energy;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){
  vec2 uv=gl_FragCoord.xy/u_resolution;vec2 p=(uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);
  float t=u_time*.10;vec3 color=vec3(.007,.010,.035);
  float field=0.;
  for(int i=0;i<5;i++){
   float fi=float(i);float y=p.y+sin(p.x*2.2+t+fi*.74)*.105+cos(p.x*4.1-t*.8+fi)*.036;
   float beam=exp(-abs(y+fi*.042-.084)*22.);
   float strands=pow(.5+.5*sin(y*125.+sin(p.x*3.+t)*3.+fi*1.4),10.);
   vec3 tint=mix(vec3(.08,.32,1.),vec3(.48,.08,.95),.5+.5*sin(fi+t*.25));
   color+=tint*beam*(.018+strands*.073);
   field+=beam*.012;
  }
  float rings=pow(.5+.5*sin(length(p*vec2(.92,1.))*44.-t*2.+sin(p.x*3.+t)),20.);
  color+=vec3(.09,.27,.7)*rings*.026*exp(-length(p)*1.8);
  vec2 focus=(u_focus-.5)*vec2(u_resolution.x/u_resolution.y,1.);
  color+=vec3(.20,.10,.52)*exp(-length(p-focus)*4.)*u_energy*.11;
  vec2 cells=uv*vec2(180.,110.);vec2 id=floor(cells);float star=step(.997,hash(id));
  float speck=exp(-length(fract(cells)-.5)*24.)*star*(.55+.45*sin(t*2.+hash(id)*6.28));
  color+=vec3(.4,.65,1.)*speck*.6;
  color*=1.-smoothstep(.35,1.3,length(p))*.65;
  gl_FragColor=vec4(color,1.);
 }`;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex),
    fs = compile(gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const location = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
  const state = {
    gl,
    surface,
    program,
    buffer,
    resolution: gl.getUniformLocation(program, "u_resolution"),
    time: gl.getUniformLocation(program, "u_time"),
    focus: gl.getUniformLocation(program, "u_focus"),
    energy: gl.getUniformLocation(program, "u_energy"),
  };
  surface.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    backdrop = null;
    surface.style.opacity = "0";
  });
  surface.addEventListener(
    "webglcontextrestored",
    () => {
      backdrop = createBackdrop();
      surface.style.opacity = backdrop ? "1" : "0";
      drawBackdrop();
    },
    { once: true }
  );
  return state;
}
export function drawBackdrop() {
  if (!backdrop) return;
  const b = backdrop,
    gl = b.gl;
  const width = Math.min(1100, Math.round(innerWidth * 0.7)),
    height = Math.max(1, Math.round((innerHeight * width) / innerWidth));
  if (b.surface.width !== width || b.surface.height !== height) {
    b.surface.width = width;
    b.surface.height = height;
    gl.viewport(0, 0, width, height);
  }
  gl.useProgram(b.program);
  gl.uniform2f(b.resolution, width, height);
  gl.uniform1f(b.time, reduced.matches ? 0 : elapsed);
  const f =
    selected < 0 ? { x: 0.5, y: 0.5 } : project(transform(ANCHORS[selected]));
  gl.uniform2f(
    b.focus,
    selected < 0 ? 0.5 : f.x / W,
    selected < 0 ? 0.5 : 1 - f.y / H
  );
  gl.uniform1f(b.energy, selected < 0 ? 0.3 : 1);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
