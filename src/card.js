import { $ } from './dom.js';
import { selected } from './app.js';
import {
  ANCHORS,
  CX,
  R,
  canvas,
  draw,
  positionNodes,
  project,
  setRotation,
  transform,
} from './sphere.js';

// Fichas ancladas: coordenadas proyectadas del mismo punto 3D que se ilumina.
function revealNode(index, force = false) {
  const p = ANCHORS[index];
  if (force || transform(p).z < 0.25) {
    const z = Math.sqrt(p.x * p.x + p.z * p.z);
    setRotation(
      -Math.atan2(p.x, p.z) + (innerWidth < 650 ? 0.18 : 0.42),
      Math.atan2(p.y, z) + (innerWidth < 650 ? 0.52 : 0.12)
    );
  }
  positionNodes();
  draw();
}
export function positionCard() {
  const detail = $("#detail"),
    signal = $("#point-signal");
  if (selected < 0 || detail.hidden) {
    signal.style.display = "none";
    $("#detail-close").hidden = true;
    return;
  }
  const projectedNode = project(transform(ANCHORS[selected]));
  detail.style.visibility = "visible";
  const root = $(".experience").getBoundingClientRect(),
    scene = canvas.getBoundingClientRect();
  const ew = root.width,
    eh = root.height,
    x = projectedNode.x + scene.left - root.left,
    y = projectedNode.y + scene.top - root.top;
  // Reservar espacio inferior para los controles, también con texto largo.
  detail.style.maxHeight =
    Math.max(180, Math.min(ew < 900 ? 340 : 610, eh - 125)) + "px";
  const width = detail.offsetWidth || Math.min(420, ew - 24),
    height = detail.offsetHeight || 300;
  const clamp = (v, a, b) => Math.max(a, Math.min(Math.max(a, b), v));
  let left, top, endX, endY, path;
  if (ew < 900) {
    left = clamp(x - width / 2, 8, ew - width - 8);
    top = clamp(Math.max(eh * 0.53, y + 65) - 26, 35, eh - height - 90);
    endX = clamp(x, left + 28, left + width - 28);
    endY = top > y ? top : top + height;
    const startY = y + (endY > y ? 25 : -25),
      middle = (startY + endY) / 2;
    path = `M ${x} ${startY} L ${x} ${middle} L ${endX} ${middle} L ${endX} ${endY}`;
  } else {
    const right = true;
    left = clamp(
      (CX + R * 1.08 + 28 + scene.left - root.left + (ew - width - 22)) * 0.5,
      18,
      ew - width - 16
    );
    top = clamp(y - 90, 35, eh - height - 90);
    endX = right ? left : left + width;
    endY = clamp(y, top + 44, top + height - 35);
    const startX = x + (right ? 27 : -27),
      elbow = startX + (right ? 32 : -32);
    path = `M ${startX} ${y} L ${elbow} ${y} L ${
      endX + (right ? -18 : 18)
    } ${endY} L ${endX} ${endY}`;
  }
  const close = $("#detail-close");
  close.hidden = false;
  close.style.left = left + width - 20 + "px";
  close.style.top = top - 16 + "px";
  detail.style.left = left + "px";
  detail.style.top = top + "px";
  detail.style.transformOrigin = `${x - left}px ${y - top}px`;
  signal.style.display = "block";
  signal.setAttribute("viewBox", `0 0 ${ew} ${eh}`);
  signal.querySelectorAll("path").forEach((p) => p.setAttribute("d", path));
  const tip = signal.querySelector("circle");
  tip.setAttribute("cx", endX);
  tip.setAttribute("cy", endY);
}
export function openPointCard() {
  const d = $("#detail");
  d.classList.remove("point-opening");
  void d.offsetWidth;
  d.classList.add("point-opening");
  positionCard();
}
