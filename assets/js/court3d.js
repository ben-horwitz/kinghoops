/* KING Hoops — scroll-driven 3D home experience.
   Everything on screen is a pure function of scroll progress p (0..1), so scrubbing
   up and down always shows the same frame. Ambient motion (dust, crowd, net sway)
   runs on clock time on top of that. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const scrolly = document.querySelector(".scrolly");
const stage = scrolly && scrolly.querySelector(".stage");
const canvas = stage && stage.querySelector("canvas");

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch (e) { return false; }
}

if (canvas && webglOK()) {
  scrolly.classList.add("is-3d");
  start().catch((err) => {
    console.error(err);
    scrolly.classList.remove("is-3d");
  });
}

/* ------------------------------------------------------------------ utils */
const D = THREE.MathUtils.degToRad;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (t) => t * t * (3 - 2 * t);
const range = (p, a, b) => clamp((p - a) / (b - a));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const mixV = (a, b, t) => a.clone().lerp(b, t);
const frac = (x) => x - Math.floor(x);
function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
function bounceY(q, hs, ds) {
  let acc = 0;
  for (let i = 0; i < hs.length; i++) {
    if (q <= acc + ds[i]) { const t = (q - acc) / ds[i]; return 4 * hs[i] * t * (1 - t); }
    acc += ds[i];
  }
  return 0;
}
function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function texFrom(c, aniso = 8) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; return t; }
function loadImage(src) { return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

const FONT = '"Oswald", "Arial Narrow", sans-serif';
const NAVY = "#15397c", GOLD = "#ffbc36", INK = "#0a1430";

/* --------------------------------------------------------------- textures */
function courtTexture(logo) {
  const S = 64, W = 19, L = 32, X0 = 9.5, Z0 = 3.575;
  const [c, g] = makeCanvas(W * S, L * S);
  const r = rng(11);
  const grd = g.createLinearGradient(0, 0, 0, L * S);
  grd.addColorStop(0, "#cf9a62"); grd.addColorStop(1, "#b98048");
  g.fillStyle = grd; g.fillRect(0, 0, W * S, L * S);
  for (let x = 0; x < W * S; x += 6) {
    let z = -r() * 120;
    while (z < L * S) {
      const len = (1.4 + r() * 2.6) * S;
      g.fillStyle = `hsla(${27 + r() * 7},${46 + r() * 14}%,${46 + r() * 12}%,0.5)`;
      g.fillRect(x, z, 6, len);
      g.fillStyle = "rgba(70,35,10,0.22)"; g.fillRect(x, z, 1, len); g.fillRect(x, z, 6, 1);
      z += len;
    }
  }
  for (let i = 0; i < 14000; i++) {
    g.fillStyle = r() < 0.5 ? `rgba(90,45,12,${0.03 + r() * 0.05})` : `rgba(255,235,205,${0.03 + r() * 0.04})`;
    g.fillRect(r() * W * S, r() * L * S, 1, 4 + r() * 22);
  }
  g.setTransform(S, 0, 0, S, X0 * S, Z0 * S); // draw in metres: x right, z down
  const base = -1.575, half = 12.425, far = 26.425;
  g.fillStyle = "#0c2250";
  g.fillRect(-9.5, -3.575, 19, base + 3.575);
  g.fillRect(-9.5, base, 2, far - base); g.fillRect(7.5, base, 2, far - base);
  g.fillRect(-9.5, far, 19, 2);
  const paint = "rgba(21,57,124,0.93)";
  g.fillStyle = paint;
  g.fillRect(-2.45, base, 4.9, 5.8); g.fillRect(-2.45, far - 5.8, 4.9, 5.8);
  g.beginPath(); g.arc(0, half, 1.8, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#f6f2ea"; g.lineWidth = 0.055;
  const line = (a, b, c2, d) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); };
  g.strokeRect(-7.5, base, 15, far - base);
  line(-7.5, half, 7.5, half);
  g.beginPath(); g.arc(0, half, 1.8, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, half, 0.6, 0, Math.PI * 2); g.stroke();
  const end = (zb, s) => {
    const bz = zb + 1.575 * s, fz = zb + 5.8 * s;
    g.strokeRect(-2.45, zb, 4.9, 5.8 * s);
    g.beginPath(); s > 0 ? g.arc(0, fz, 1.8, 0, Math.PI) : g.arc(0, fz, 1.8, Math.PI, Math.PI * 2); g.stroke();
    g.setLineDash([0.32, 0.26]);
    g.beginPath(); s > 0 ? g.arc(0, fz, 1.8, Math.PI, Math.PI * 2) : g.arc(0, fz, 1.8, 0, Math.PI); g.stroke();
    g.setLineDash([]);
    g.beginPath(); s > 0 ? g.arc(0, bz, 1.25, 0, Math.PI) : g.arc(0, bz, 1.25, Math.PI, Math.PI * 2); g.stroke();
    const a0 = Math.atan2(1.415, 6.6);
    line(6.6, zb, 6.6, bz + 1.415 * s); line(-6.6, zb, -6.6, bz + 1.415 * s);
    g.beginPath(); s > 0 ? g.arc(0, bz, 6.75, a0, Math.PI - a0) : g.arc(0, bz, 6.75, Math.PI + a0, Math.PI * 2 - a0); g.stroke();
    for (const hz of [2.0, 2.9, 3.8]) { line(2.45, zb + hz * s, 2.7, zb + hz * s); line(-2.45, zb + hz * s, -2.7, zb + hz * s); }
  };
  end(base, 1); end(far, -1);
  if (logo) {
    const lw = 2.9, lh = lw * (logo.height / logo.width);
    g.globalAlpha = 0.95; g.drawImage(logo, -lw / 2, half - lh / 2, lw, lh); g.globalAlpha = 1;
  }
  g.fillStyle = GOLD; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `700 1.05px ${FONT}`;
  g.fillText("KING HOOPS", 0, -2.6);
  g.save(); g.translate(8.5, half); g.rotate(-Math.PI / 2);
  g.font = `600 0.7px ${FONT}`; g.fillText("PEOPLE FIRST · ATHLETES SECOND", 0, 0); g.restore();
  g.save(); g.translate(-8.5, half); g.rotate(Math.PI / 2);
  g.font = `600 0.7px ${FONT}`; g.fillText("KING HOOPS NYC · EST. 2016", 0, 0); g.restore();
  return texFrom(c, 16);
}

function ballTexture() {
  const W = 1024, H = 512;
  const [c, g] = makeCanvas(W, H);
  const r = rng(5);
  g.fillStyle = "#d4642a"; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) {
    g.fillStyle = r() < 0.55 ? `rgba(120,40,10,${0.15 + r() * 0.2})` : `rgba(255,170,110,${0.12 + r() * 0.15})`;
    g.beginPath(); g.arc(r() * W, r() * H, 0.8 + r() * 1.3, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = "#1c0d06"; g.lineWidth = 7; g.lineCap = "round";
  const toXY = (v) => { const lon = Math.atan2(v.x, v.z); const lat = Math.asin(clamp(v.y, -1, 1)); return [((lon / (2 * Math.PI)) + 0.5) * W, (0.5 - lat / Math.PI) * H]; };
  g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  for (const x of [0, W / 2, W]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (const lonC of [Math.PI / 2, -Math.PI / 2]) {
    const cdir = V(Math.sin(lonC), 0, Math.cos(lonC)), u = V(0, 1, 0), w = new THREE.Vector3().crossVectors(cdir, u);
    const rho = D(52);
    let prev = null;
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * Math.PI * 2;
      const v = cdir.clone().multiplyScalar(Math.cos(rho)).add(u.clone().multiplyScalar(Math.sin(rho) * Math.cos(t))).add(w.clone().multiplyScalar(Math.sin(rho) * Math.sin(t)));
      const xy = toXY(v);
      if (prev && Math.abs(prev[0] - xy[0]) < W / 3) { g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(xy[0], xy[1]); g.stroke(); }
      prev = xy;
    }
  }
  return texFrom(c);
}

function jerseyTexture({ base, trim, text, number, ink }) {
  const W = 1024, H = 512;
  const [c, g] = makeCanvas(W, H);
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // mesh fabric
  g.fillStyle = "rgba(255,255,255,0.035)";
  for (let y = 0; y < H; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < W; x += 6) g.fillRect(x, y, 2, 2);
  g.fillStyle = trim;
  g.fillRect(0, 0, W, 16); g.fillRect(0, H - 22, W, 10);
  g.fillRect(W * 0.25 - 10, 0, 20, H); g.fillRect(W * 0.75 - 10, 0, 20, H);
  // CylinderGeometry with thetaStart=PI puts u=0.5 at the front
  g.textAlign = "center"; g.textBaseline = "middle";
  if (text) {
    g.font = `700 92px ${FONT}`; g.lineWidth = 10; g.strokeStyle = trim; g.strokeText(text, W / 2, 140);
    g.fillStyle = ink; g.fillText(text, W / 2, 140);
  }
  g.font = `700 ${text ? 150 : 210}px ${FONT}`; g.lineWidth = 12; g.strokeStyle = trim;
  g.strokeText(number, W / 2, text ? 300 : 250); g.fillStyle = ink; g.fillText(number, W / 2, text ? 300 : 250);
  g.font = `700 230px ${FONT}`;
  for (const x of [0, W]) { g.strokeText(number, x, 250); g.fillText(number, x, 250); }
  return texFrom(c);
}

function bannerTexture(lines) {
  const [c, g] = makeCanvas(256, 512);
  g.fillStyle = NAVY; g.fillRect(0, 0, 256, 512);
  g.fillStyle = GOLD; g.fillRect(0, 0, 256, 14); g.fillRect(0, 0, 10, 512); g.fillRect(246, 0, 10, 512);
  g.beginPath(); g.moveTo(0, 440); g.lineTo(128, 512); g.lineTo(256, 440); g.lineTo(256, 512); g.lineTo(0, 512); g.fillStyle = "#050b1c"; g.fill();
  g.strokeStyle = GOLD; g.lineWidth = 8; g.beginPath(); g.moveTo(10, 436); g.lineTo(128, 502); g.lineTo(246, 436); g.stroke();
  g.textAlign = "center"; g.textBaseline = "middle";
  let y = 110;
  for (const [txt, size, col] of lines) {
    g.font = `700 ${size}px ${FONT}`; g.fillStyle = col || "#fff"; g.fillText(txt, 128, y); y += size * 1.15;
  }
  return texFrom(c);
}

function softDot() {
  const [c, g] = makeCanvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.35, "rgba(255,255,255,0.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* ---------------------------------------------------------------- player */
const JN = ["hips", "spine", "chest", "neck", "head", "shL", "elL", "haL", "shR", "elR", "haR", "hipL", "knL", "anL", "hipR", "knR", "anR"];
const Z3 = [0, 0, 0];

function makePlayer(o) {
  const M = {
    body: new THREE.MeshStandardMaterial({ color: o.body, roughness: 0.38, metalness: 0.12, envMapIntensity: 0.7 }),
    jersey: new THREE.MeshStandardMaterial({ map: o.jersey, roughness: 0.72, envMapIntensity: 0.4 }),
    shorts: new THREE.MeshStandardMaterial({ color: o.shorts, roughness: 0.7, envMapIntensity: 0.4 }),
    trim: new THREE.MeshStandardMaterial({ color: o.trim, roughness: 0.45, metalness: 0.2 }),
    shoe: new THREE.MeshStandardMaterial({ color: o.shoe, roughness: 0.5 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.6 }),
  };
  const J = {};
  const grp = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); J[name] = g; return g; };
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 16);
  const root = new THREE.Group();
  const hips = grp("hips", root, 0, 1.06, 0);
  mesh(new THREE.CylinderGeometry(0.2, 0.215, 0.26, 24), M.shorts, hips, 0, -0.06, 0, 1, 1, 0.72);
  mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 32), M.trim, hips, 0, 0.065, 0, 1, 0.72, 1).rotation.x = Math.PI / 2;
  const spine = grp("spine", hips, 0, 0.04, 0);
  mesh(new THREE.CylinderGeometry(0.205, 0.178, 0.52, 28, 1, false, Math.PI), M.jersey, spine, 0, 0.25, 0, 1, 1, 0.62);
  const chest = grp("chest", spine, 0, 0.44, 0);
  mesh(new THREE.SphereGeometry(0.1, 18, 12), M.body, chest, 0, 0.0, 0, 1.5, 0.45, 0.85);
  const neck = grp("neck", chest, 0, 0.05, 0);
  mesh(new THREE.CylinderGeometry(0.046, 0.054, 0.13, 14), M.body, neck, 0, 0.05, 0);
  const head = grp("head", neck, 0, 0.13, 0);
  mesh(new THREE.SphereGeometry(0.108, 28, 20), M.body, head, 0, 0.06, 0.005, 0.9, 1.1, 1);
  mesh(new THREE.TorusGeometry(0.1, 0.014, 8, 32), M.trim, head, 0, 0.1, 0.0, 0.92, 1, 1.02).rotation.x = Math.PI / 2;
  for (const [s, k] of [["L", 1], ["R", -1]]) {
    const sh = grp("sh" + s, chest, 0.205 * k, -0.01, 0);
    mesh(new THREE.SphereGeometry(0.064, 16, 12), M.body, sh, 0, -0.01, 0);
    mesh(cap(0.052, 0.22), M.body, sh, 0, -0.16, 0);
    const el = grp("el" + s, sh, 0, -0.32, 0);
    mesh(cap(0.044, 0.2), M.body, el, 0, -0.135, 0);
    mesh(new THREE.CylinderGeometry(0.049, 0.049, 0.055, 14), M.trim, el, 0, -0.235, 0);
    const ha = grp("ha" + s, el, 0, -0.28, 0);
    mesh(cap(0.036, 0.06), M.body, ha, 0, -0.06, 0, 1.15, 1, 0.6);
    const palm = new THREE.Object3D(); palm.position.set(0, -0.07, 0); ha.add(palm); J["palm" + s] = palm;
    const hp = grp("hip" + s, hips, 0.1 * k, -0.06, 0);
    mesh(cap(0.078, 0.32), M.body, hp, 0, -0.235, 0);
    mesh(new THREE.CylinderGeometry(0.098, 0.09, 0.27, 18), M.shorts, hp, 0, -0.12, 0);
    const kn = grp("kn" + s, hp, 0, -0.47, 0);
    mesh(cap(0.06, 0.34), M.body, kn, 0, -0.23, 0);
    mesh(new THREE.CylinderGeometry(0.063, 0.06, 0.13, 14), M.white, kn, 0, -0.39, 0);
    const an = grp("an" + s, kn, 0, -0.47, 0);
    mesh(new THREE.BoxGeometry(0.11, 0.085, 0.28), M.shoe, an, 0, -0.02, 0.06);
    mesh(new THREE.BoxGeometry(0.116, 0.026, 0.292), M.white, an, 0, -0.066, 0.06);
  }
  return { root, J };
}

function mixPose(a, b, t) {
  const o = {};
  for (const n of JN) {
    const x = a[n] || Z3, y = b[n] || Z3;
    o[n] = [lerp(x[0], y[0], t), lerp(x[1] || 0, y[1] || 0, t), lerp(x[2] || 0, y[2] || 0, t)];
  }
  o.grip = lerp(a.grip ?? 0, b.grip ?? 0, t);
  const ba = a.bo || Z3, bb = b.bo || Z3;
  o.bo = [lerp(ba[0], bb[0], t), lerp(ba[1], bb[1], t), lerp(ba[2], bb[2], t)];
  return o;
}
function track(keys, p) {
  if (p <= keys[0][0]) return mixPose(keys[0][1], keys[0][1], 0);
  for (let i = 0; i < keys.length - 1; i++) {
    const [p0, a] = keys[i], [p1, b] = keys[i + 1];
    if (p <= p1) return mixPose(a, b, sstep((p - p0) / (p1 - p0)));
  }
  const last = keys[keys.length - 1][1];
  return mixPose(last, last, 0);
}
const _v = new THREE.Vector3();
function applyPose(P, pose, lift) {
  for (const n of JN) { const v = pose[n] || Z3; P.J[n].rotation.set(D(v[0]), D(v[1] || 0), D(v[2] || 0)); }
  // keep feet flat unless the pose points the toes (ankle value is an offset)
  for (const s of ["L", "R"]) {
    const a = pose["an" + s] || Z3;
    P.J["an" + s].rotation.x = D(-((pose.hips || Z3)[0] + (pose["hip" + s] || Z3)[0] + (pose["kn" + s] || Z3)[0]) + a[0]);
  }
  P.J.hips.position.y = 1.06;
  P.root.updateMatrixWorld(true);
  const yl = P.J.anL.getWorldPosition(_v).y, yr = P.J.anR.getWorldPosition(_v).y;
  P.J.hips.position.y += 0.078 - Math.min(yl, yr) + P.root.position.y * 0 + lift;
  P.root.updateMatrixWorld(true);
  P.pose = pose;
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function gripPos(P, out) {
  const pose = P.pose;
  P.J.palmL.getWorldPosition(_a); P.J.palmR.getWorldPosition(_b);
  out.copy(_a).lerp(_b, 0.5).lerp(_b, pose.grip);
  const bo = V(pose.bo[0], pose.bo[1], pose.bo[2]).applyQuaternion(P.root.quaternion);
  return out.add(bo);
}

/* poses (degrees). Player faces +Z, their left is +X.
   arm rx<0 raises forward; elbow rx<0 flexes; hip rx<0 flexes; knee rx>0 bends; spine rx>0 leans forward. */
const P_ = (o) => o;
const STANCE = P_({ spine: [14, 0, 0], neck: [-12, 0, 0], shL: [-35, 0, -12], elL: [-80, 0, 0], shR: [-35, 0, 12], elR: [-80, 0, 0],
  hipL: [-30, 0, 7], knL: [45, 0, 0], hipR: [-30, 0, -7], knR: [45, 0, 0], grip: 0, bo: [0, 0, 0.09] });
const DRIB = P_({ spine: [20, 0, 0], neck: [-18, 0, 0], shL: [-55, 0, 25], elL: [-50, 0, 0], shR: [-22, 0, -12], elR: [-35, 0, 0], haR: [-20, 0, 0],
  hipL: [-40, 0, 8], knL: [58, 0, 0], hipR: [-36, 0, -8], knR: [54, 0, 0], grip: 1, bo: [0, -0.13, 0.05] });
const HIGH = P_({ spine: [16, 0, 0], neck: [-14, 0, 0], shL: [-55, 0, -14], elL: [-95, 0, 0], shR: [-55, 0, 14], elR: [-95, 0, 0],
  hipL: [-35, 0, 7], knL: [52, 0, 0], hipR: [-35, 0, -7], knR: [52, 0, 0], grip: 0.3, bo: [0, 0.02, 0.1] });
const LOAD = P_({ spine: [24, 0, 0], neck: [-22, 0, 0], shL: [-78, 0, -14], elL: [-105, 0, 0], shR: [-82, 0, 10], elR: [-110, 0, 0], haR: [-30, 0, 0],
  hipL: [-62, 0, 7], knL: [100, 0, 0], hipR: [-62, 0, -7], knR: [100, 0, 0], grip: 0.55, bo: [0, 0.06, 0.08] });
const SET = P_({ spine: [6, 0, 0], neck: [-14, 0, 0], shL: [-122, 0, -20], elL: [-100, 0, 0], shR: [-125, 0, 6], elR: [-100, 0, 0], haR: [-55, 0, 0],
  hipL: [-18, 0, 6], knL: [28, 0, 0], anL: [10, 0, 0], hipR: [-18, 0, -6], knR: [28, 0, 0], anR: [10, 0, 0], grip: 1, bo: [0, 0.12, 0.0] });
const RELEASE = P_({ spine: [0, 0, 0], neck: [-16, 0, 0], shL: [-140, 0, -32], elL: [-45, 0, 0], shR: [-165, 0, 5], elR: [-10, 0, 0], haR: [20, 0, 0],
  hipL: [-5, 0, 5], knL: [6, 0, 0], anL: [38, 0, 0], hipR: [-5, 0, -5], knR: [6, 0, 0], anR: [38, 0, 0], grip: 1, bo: [0, 0.12, 0.06] });
const FOLLOW = P_({ ...RELEASE, haR: [70, 0, 0], shL: [-120, 0, -35], elL: [-30, 0, 0], hipL: [-10, 0, 5], knL: [15, 0, 0], anL: [30, 0, 0], hipR: [-10, 0, -5], knR: [15, 0, 0], anR: [30, 0, 0] });
const LAND = P_({ spine: [12, 0, 0], neck: [-20, 0, 0], shR: [-160, 0, 5], elR: [-12, 0, 0], haR: [75, 0, 0], shL: [-50, 0, 15], elL: [-40, 0, 0],
  hipL: [-34, 0, 6], knL: [50, 0, 0], hipR: [-34, 0, -6], knR: [50, 0, 0], grip: 1, bo: [0, 0.12, 0.06] });
const WATCH = P_({ spine: [6, 0, 0], neck: [-24, 0, 0], shR: [-20, 0, -10], elR: [-25, 0, 0], shL: [-20, 0, 10], elL: [-25, 0, 0],
  hipL: [-10, 0, 6], knL: [14, 0, 0], hipR: [-10, 0, -6], knR: [14, 0, 0], grip: 1, bo: [0, 0.12, 0.06] });
const CELEB = P_({ spine: [2, 0, 0], neck: [-8, 0, 0], shR: [-168, 0, -12], elR: [-15, 0, 0], shL: [-25, 0, 14], elL: [-35, 0, 0],
  hipL: [-10, 0, 6], knL: [14, 0, 0], hipR: [-10, 0, -6], knR: [14, 0, 0], grip: 1, bo: [0, 0.12, 0.06] });

const GATHER = P_({ spine: [18, 0, 0], neck: [-14, 0, 0], shL: [-50, 0, -25], elL: [-90, 0, 0], shR: [-40, 0, 8], elR: [-85, 0, 0],
  hipL: [-15, 0, 4], knL: [40, 0, 0], hipR: [-60, 0, -4], knR: [70, 0, 0], grip: 0.2, bo: [0, 0, 0.1] });
const TAKEOFF = P_({ spine: [6, 0, 0], neck: [-20, 0, 0], shL: [-120, 0, -20], elL: [-60, 0, 0], shR: [-130, 0, 8], elR: [-60, 0, 0],
  hipL: [5, 0, 4], knL: [12, 0, 0], anL: [35, 0, 0], hipR: [-95, 0, -4], knR: [100, 0, 0], grip: 0.5, bo: [0, 0.1, 0.06] });
const COCK = P_({ spine: [-12, 0, 0], neck: [-22, 0, 0], shR: [-195, 0, -8], elR: [-95, 0, 0], haR: [-20, 0, 0], shL: [-150, 0, -30], elL: [-25, 0, 0],
  hipL: [-20, 0, 6], knL: [80, 0, 0], anL: [30, 0, 0], hipR: [-70, 0, -6], knR: [110, 0, 0], anR: [20, 0, 0], grip: 1, bo: [0, 0.08, -0.04] });
const COCK2 = P_({ ...COCK, shR: [-205, 0, -8], elR: [-105, 0, 0], spine: [-16, 0, 0] });
const SLAM = P_({ spine: [18, 0, 0], neck: [-10, 0, 0], shR: [-140, 0, -6], elR: [-20, 0, 0], haR: [40, 0, 0], shL: [-160, 0, -25], elL: [-10, 0, 0],
  hipL: [-10, 0, 6], knL: [70, 0, 0], anL: [30, 0, 0], hipR: [-50, 0, -6], knR: [90, 0, 0], anR: [20, 0, 0], grip: 1, bo: [0, 0.1, 0.08] });
const HANG = P_({ spine: [4, 0, 0], neck: [-4, 0, 0], shR: [-178, 0, -4], elR: [-6, 0, 0], shL: [-176, 0, 6], elL: [-6, 0, 0],
  hipL: [-35, 0, 8], knL: [70, 0, 0], anL: [30, 0, 0], hipR: [-55, 0, -8], knR: [95, 0, 0], anR: [30, 0, 0], grip: 1, bo: [0, 0.1, 0.08] });
const HANG2 = P_({ ...HANG, hipL: [-15, 0, 8], knL: [40, 0, 0], hipR: [-25, 0, -8], knR: [50, 0, 0] });
const LANDC = P_({ spine: [30, 0, 0], neck: [-30, 0, 0], shL: [-60, 0, 20], elL: [-40, 0, 0], shR: [-60, 0, -20], elR: [-40, 0, 0],
  hipL: [-70, 0, 10], knL: [105, 0, 0], hipR: [-70, 0, -10], knR: [105, 0, 0], grip: 1, bo: [0, 0.1, 0.08] });
const VPOSE = P_({ spine: [-4, 0, 0], neck: [-12, 0, 0], shL: [-165, 0, 28], elL: [-12, 0, 0], shR: [-165, 0, -28], elR: [-12, 0, 0],
  hipL: [-8, 0, 8], knL: [10, 0, 0], hipR: [-8, 0, -8], knR: [10, 0, 0], grip: 1, bo: [0, 0.1, 0.08] });

const DST = P_({ spine: [22, 0, 0], neck: [-18, 0, 0], shL: [-25, 0, 65], elL: [-35, 0, 0], shR: [-25, 0, -65], elR: [-35, 0, 0],
  hipL: [-45, 0, 14], knL: [70, 0, 0], hipR: [-45, 0, -14], knR: [70, 0, 0] });
const DJUMP = P_({ spine: [2, 0, 0], neck: [-24, 0, 0], shL: [-172, 0, 12], elL: [-6, 0, 0], shR: [-172, 0, -12], elR: [-6, 0, 0],
  hipL: [-10, 0, 6], knL: [30, 0, 0], anL: [35, 0, 0], hipR: [-10, 0, -6], knR: [30, 0, 0], anR: [35, 0, 0] });
const DLAND = P_({ ...DST, shL: [-30, 0, 25], shR: [-30, 0, -25], elL: [-20, 0, 0], elR: [-20, 0, 0] });
const DSHOCK = P_({ spine: [-6, 0, 0], neck: [-28, 0, 0], shL: [-150, 0, 55], elL: [-135, 0, 0], shR: [-150, 0, -55], elR: [-135, 0, 0],
  hipL: [-8, 0, 7], knL: [10, 0, 0], hipR: [-8, 0, -7], knR: [10, 0, 0] });

const KEYS1 = [[0, STANCE], [0.045, STANCE], [0.056, DRIB], [0.124, DRIB], [0.145, HIGH], [0.178, LOAD], [0.214, SET], [0.24, RELEASE],
  [0.262, FOLLOW], [0.3, LAND], [0.35, LAND], [0.388, WATCH], [0.425, WATCH], [0.452, CELEB], [0.5, CELEB]];
const KEYS2 = [[0.5, STANCE], [0.715, STANCE], [0.738, GATHER], [0.762, TAKEOFF], [0.812, COCK], [0.846, COCK2], [0.862, SLAM],
  [0.878, HANG], [0.908, HANG2], [0.936, LANDC], [0.966, VPOSE], [1, VPOSE]];
const KEYSD = [[0.5, DST], [0.768, DST], [0.8, DJUMP], [0.84, DJUMP], [0.89, DLAND], [0.935, DSHOCK], [1, DSHOCK]];

function runPose(phi, dribPhase) {
  const sL = Math.sin(phi), cL = Math.cos(phi);
  return P_({ spine: [20, 0, 0], neck: [-16, 0, 0],
    hipL: [-12 - 42 * sL, 0, 4], knL: [22 + 62 * Math.max(0, cL), 0, 0],
    hipR: [-12 + 42 * sL, 0, -4], knR: [22 + 62 * Math.max(0, -cL), 0, 0],
    shL: [-20 + 45 * sL, 0, 10], elL: [-85, 0, 0],
    shR: [-28, 0, -10], elR: [-45 + 18 * Math.cos(dribPhase * Math.PI * 2), 0, 0], haR: [-15, 0, 0],
    grip: 1, bo: [0, -0.13, 0.08] });
}

/* =============================================================== start() */
async function start() {
  const isMobile = matchMedia("(max-width: 760px)").matches;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  try { await Promise.race([document.fonts.load(`700 64px ${FONT}`), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* ignore */ }
  const logo = await loadImage("assets/img/b40c4b_43e169ad9888472a8d624c2b9e7cf167.png");

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const BG = new THREE.Color(0x040916);
  scene.background = BG;
  scene.fog = new THREE.FogExp2(0x040916, 0.028);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);

  /* ---- lights ---- */
  scene.add(new THREE.HemisphereLight(0x9db8ff, 0x241408, 0.55));
  const key = new THREE.SpotLight(0xfff0dc, 520, 0, 0.42, 0.6, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 4; key.shadow.camera.far = 30;
  scene.add(key, key.target);
  const hoopSpot = new THREE.SpotLight(0xffffff, 380, 0, 0.32, 0.6, 2);
  hoopSpot.position.set(0.5, 12, 4); hoopSpot.target.position.set(0, 2.4, 0);
  scene.add(hoopSpot, hoopSpot.target);
  const goldRim = new THREE.DirectionalLight(0xffb02e, 1.8); goldRim.position.set(-7, 4, -5); scene.add(goldRim);
  const blueRim = new THREE.DirectionalLight(0x3d7bff, 2.4); blueRim.position.set(8, 3, -3); scene.add(blueRim);
  const fill = new THREE.DirectionalLight(0x8fa4ff, 0.35); fill.position.set(0, 6, 14); scene.add(fill);

  /* ---- floor + arena ---- */
  const courtTex = courtTexture(logo);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(19, 32), new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.38, metalness: 0, envMapIntensity: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 12.425); floor.receiveShadow = true; scene.add(floor);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), new THREE.MeshStandardMaterial({ color: 0x050a18, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.01, 10); ground.receiveShadow = true; scene.add(ground);
  const stands = new THREE.Mesh(new THREE.CylinderGeometry(24, 30, 18, 64, 1, true), new THREE.MeshStandardMaterial({ color: 0x0a1226, roughness: 0.9, side: THREE.BackSide }));
  stands.position.set(0, 7, 10); scene.add(stands);

  // crowd lights on the stands (twinkle + camera flashes on a score)
  const CROWD = isMobile ? 900 : 1800;
  const crowdPos = new Float32Array(CROWD * 3), crowdCol = new Float32Array(CROWD * 3), crowdSeed = new Float32Array(CROWD);
  { const r = rng(3); for (let i = 0; i < CROWD; i++) {
      const a = r() * Math.PI * 2, y = 1 + r() * 12, rad = lerp(25, 29.5, y / 18) - 0.6;
      crowdPos.set([Math.sin(a) * rad, y - 2, 10 + Math.cos(a) * rad], i * 3); crowdSeed[i] = r();
  } }
  const crowdGeo = new THREE.BufferGeometry();
  crowdGeo.setAttribute("position", new THREE.BufferAttribute(crowdPos, 3));
  crowdGeo.setAttribute("color", new THREE.BufferAttribute(crowdCol, 3));
  const dot = softDot();
  const crowd = new THREE.Points(crowdGeo, new THREE.PointsMaterial({ size: 0.5, map: dot, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  scene.add(crowd);

  // floating dust in the light
  const DUST = isMobile ? 260 : 520;
  const dustBase = new Float32Array(DUST * 3), dustPos = new Float32Array(DUST * 3);
  { const r = rng(9); for (let i = 0; i < DUST; i++) dustBase.set([(r() - 0.5) * 14, r() * 9, -2 + r() * 18], i * 3); }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.05, map: dot, color: 0xffe3b0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // volumetric light shafts
  const coneMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { color: { value: new THREE.Color(0xfff0d4) }, strength: { value: 0.11 } },
    vertexShader: "varying float vH; varying vec3 vN; varying vec3 vV; void main(){ vH = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }",
    fragmentShader: "uniform vec3 color; uniform float strength; varying float vH; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN,vV)), 2.0); float a = edge * (0.25 + 0.75*pow(vH, 1.4)) * strength; gl_FragColor = vec4(color*a, a); }",
  });
  const cones = [];
  function addCone(from, to, radius) {
    const len = from.distanceTo(to);
    const m = new THREE.Mesh(new THREE.ConeGeometry(radius, len, 40, 1, true), coneMat);
    m.position.copy(from).lerp(to, 0.5);
    m.quaternion.setFromUnitVectors(V(0, 1, 0), from.clone().sub(to).normalize());
    scene.add(m); cones.push(m); return m;
  }
  const shaftKey = addCone(V(1.5, 13, 9), V(-2.6, 0, 6.3), 2.3);
  addCone(V(0.5, 12, 4), V(0, 0, 0.4), 1.9);
  addCone(V(-6, 13, 14), V(-4, 0, 12), 1.6);
  addCone(V(6, 13, 3), V(4.5, 0, 4), 1.6);

  // championship-style banners
  const bannerData = [
    [["KING", 70, GOLD], ["HOOPS", 70], ["EST. 2016", 34, GOLD]],
    [["150+", 96, GOLD], ["PLAYERS", 46], ["SERVED", 46], ["ANNUALLY", 46]],
    [["$400K+", 74, GOLD], ["IN", 40], ["SCHOLAR-", 46], ["SHIPS", 46]],
    [["15+", 96, GOLD], ["COLLEGE", 46], ["PLAYERS", 46], ["2024–25", 40, GOLD]],
    [["375+", 96, GOLD], ["STUDENT-", 46], ["ATHLETES", 46], ["SINCE 2018", 36, GOLD]],
  ];
  bannerData.forEach((lines, i) => {
    const t = bannerTexture(lines);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.4), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.8, side: THREE.DoubleSide }));
    m.position.set((i - 2) * 2.6, 10.6 + Math.abs(i - 2) * -0.15, -4.2 + Math.abs(i - 2) * 0.5);
    m.rotation.y = -(i - 2) * 0.12;
    scene.add(m);
  });

  /* ---- hoop ---- */
  const RIM = V(0, 3.05, 0);
  const hoop = new THREE.Group(); scene.add(hoop);
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a3146, roughness: 0.4, metalness: 0.7 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x15397c, roughness: 0.7 });
  const addM = (geo, mat, x, y, z, parent = hoop) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xdcefff, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, envMapIntensity: 2.2, clearcoat: 1, depthWrite: false });
  const board = addM(new THREE.BoxGeometry(1.83, 1.07, 0.035), glass, 0, 3.45, -0.4); board.castShadow = false;
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffbc36, emissiveIntensity: 0.25, roughness: 0.3 });
  addM(new THREE.BoxGeometry(1.88, 0.05, 0.05), ledMat, 0, 3.985, -0.4);
  addM(new THREE.BoxGeometry(1.88, 0.05, 0.05), ledMat, 0, 2.915, -0.4);
  addM(new THREE.BoxGeometry(0.05, 1.07, 0.05), ledMat, 0.915, 3.45, -0.4);
  addM(new THREE.BoxGeometry(0.05, 1.07, 0.05), ledMat, -0.915, 3.45, -0.4);
  const lineMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25 });
  addM(new THREE.BoxGeometry(0.61, 0.045, 0.01), lineMat, 0, 3.51, -0.377);
  addM(new THREE.BoxGeometry(0.61, 0.045, 0.01), lineMat, 0, 3.08, -0.377);
  addM(new THREE.BoxGeometry(0.045, 0.45, 0.01), lineMat, 0.295, 3.295, -0.377);
  addM(new THREE.BoxGeometry(0.045, 0.45, 0.01), lineMat, -0.295, 3.295, -0.377);
  addM(new THREE.BoxGeometry(1.86, 0.07, 0.08), padMat, 0, 2.88, -0.4);
  addM(new THREE.BoxGeometry(0.14, 0.14, 2.0), metal, 0, 3.3, -1.42);
  addM(new THREE.BoxGeometry(0.1, 0.1, 1.5), metal, 0, 2.6, -1.7).rotation.x = -0.75;
  addM(new THREE.BoxGeometry(0.24, 3.5, 0.24), metal, 0, 1.75, -2.45);
  addM(new THREE.BoxGeometry(0.34, 2.1, 0.34), padMat, 0, 1.05, -2.45);
  {
    const [c, g] = makeCanvas(512, 352);
    g.fillStyle = NAVY; g.fillRect(0, 0, 512, 352);
    if (logo) { const h = 220, w = h * logo.width / logo.height; g.drawImage(logo, 256 - w / 2, 30, w, h); }
    g.fillStyle = GOLD; g.font = `700 64px ${FONT}`; g.textAlign = "center"; g.fillText("KING HOOPS", 256, 318);
    const front = new THREE.MeshStandardMaterial({ map: texFrom(c), roughness: 0.7 });
    const mats = [padMat, padMat, padMat, padMat, front, padMat];
    addM(new THREE.BoxGeometry(1.3, 0.9, 1.7), mats, 0, 0.45, -3.25);
  }
  const rimPivot = new THREE.Group(); rimPivot.position.set(0, 3.05, -0.38); hoop.add(rimPivot);
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.32, metalness: 0.55, emissive: 0xff3d00, emissiveIntensity: 0.08 });
  const rim = addM(new THREE.TorusGeometry(0.2286, 0.011, 12, 64), rimMat, 0, 0, 0.38, rimPivot); rim.rotation.x = Math.PI / 2;
  addM(new THREE.BoxGeometry(0.16, 0.035, 0.17), rimMat, 0, -0.01, 0.07, rimPivot);

  // net: diamond mesh drawn as instanced strands, deformed every frame
  const NR = 7, NS = 16, NLEN = 0.44;
  const netRest = [];
  for (let i = 0; i < NR; i++) {
    const t = i / (NR - 1);
    netRest.push({ r: lerp(0.2286, 0.135, Math.pow(t, 0.8)), y: -NLEN * t, off: (i % 2) * 0.5 });
  }
  const segs = [];
  for (let i = 0; i < NR - 1; i++) for (let j = 0; j < NS; j++) {
    if (netRest[i].off === 0) { segs.push([i, j, i + 1, j], [i, j, i + 1, (j - 1 + NS) % NS]); }
    else { segs.push([i, j, i + 1, j], [i, j, i + 1, (j + 1) % NS]); }
  }
  const netGroup = new THREE.Group(); netGroup.position.set(0, 0, 0.38); rimPivot.add(netGroup);
  const netMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0045, 0.0045, 1, 5), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.22, roughness: 0.8 }), segs.length);
  netMesh.castShadow = true; netGroup.add(netMesh);
  const netPts = Array.from({ length: NR }, () => Array.from({ length: NS }, () => V()));

  /* ---- ball ---- */
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.121, 48, 32), new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.62, envMapIntensity: 0.8 }));
  ball.castShadow = true; scene.add(ball);

  /* ---- players ---- */
  const player = makePlayer({ body: 0xc7ccd8, jersey: jerseyTexture({ base: NAVY, trim: GOLD, text: "KING", number: "16", ink: "#ffffff" }), shorts: 0x15397c, trim: 0xffbc36, shoe: 0xffbc36 });
  const defender = makePlayer({ body: 0x545b6b, jersey: jerseyTexture({ base: "#f2f2f2", trim: "#9b1b30", text: "", number: "00", ink: "#9b1b30" }), shorts: 0xf2f2f2, trim: 0x9b1b30, shoe: 0x222222 });
  scene.add(player.root, defender.root);

  /* ---- score FX ---- */
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffbc36, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 72), ringMat); ring.rotation.x = -Math.PI / 2; scene.add(ring);
  const floorRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 72), ringMat.clone()); floorRing.rotation.x = -Math.PI / 2; floorRing.position.y = 0.02; scene.add(floorRing);
  const SPARKS = 140;
  const sparkVel = [], sparkPos = new Float32Array(SPARKS * 3);
  { const r = rng(21); for (let i = 0; i < SPARKS; i++) { const a = r() * Math.PI * 2, s = 1.2 + r() * 2.8; sparkVel.push(V(Math.cos(a) * s, 1 + r() * 3.5, Math.sin(a) * s)); } }
  const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.07, map: dot, color: 0xffcf6b, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(sparks);

  /* ================================================== choreography */
  const S1 = V(-2.6, 0, 6.3);
  const yaw1 = Math.atan2(-S1.x, -S1.z);
  const A2 = V(2.6, 0, 13.2), T2 = V(0.45, 0, 2.35), D2 = V(0.12, 0, 0.6), H2 = V(0.04, 0, 0.5), END2 = V(0.25, 0, 1.25);
  const runDir = T2.clone().sub(A2).normalize();
  const runLen = A2.distanceTo(T2);
  const yawRun = Math.atan2(runDir.x, runDir.z);
  const SCORE1 = 0.4, SCORE2 = 0.864;
  const DEF0 = V(-1.6, 0, 3.4), DEF1 = V(-0.62, 0, 1.75), DEF2 = V(-1.05, 0, 2.35);

  const st = { phi: 0, drib: 0 };
  function runS(p) { const q = range(p, 0.565, 0.755); return Math.pow(q, 1.3); }

  function posePlayer(p, time) {
    const R = player.root;
    if (p < 0.5) {
      R.position.copy(S1); R.rotation.y = yaw1;
      const pose = track(KEYS1, p);
      // dribble arm pump
      const dw = range(p, 0.045, 0.056) * (1 - range(p, 0.124, 0.135));
      if (dw > 0) { const f = frac(range(p, 0.05, 0.13) * 3); pose.elR[0] += 24 * Math.cos(f * Math.PI * 2) * dw; pose.shR[0] += 8 * Math.cos(f * Math.PI * 2) * dw; }
      if (p < 0.2) pose.spine[0] += Math.sin(time * 1.9) * 1.2;
      let lift = 0;
      if (p > 0.205 && p < 0.243) lift = 0.42 * easeOut(range(p, 0.205, 0.243));
      else if (p >= 0.243 && p < 0.29) lift = 0.42 * (1 - easeIn(range(p, 0.243, 0.29)));
      applyPose(player, pose, lift);
      return;
    }
    // ---- act II
    const s = runS(p);
    const pos = A2.clone().lerp(T2, s);
    let yaw = yawRun, lift = 0;
    const phi = (s * runLen) / 0.86 * Math.PI;
    st.phi = phi; st.drib = phi / (Math.PI * 2);
    if (p > 0.755) {
      const q = range(p, 0.755, 0.846);
      pos.copy(T2).lerp(D2, easeOut(q));
      if (p > 0.846) pos.copy(D2).lerp(H2, range(p, 0.846, 0.878));
      if (p > 0.912) pos.copy(H2).lerp(END2, easeOut(range(p, 0.925, 0.975)));
      yaw = lerp(yawRun, Math.PI, sstep(range(p, 0.74, 0.8)));
      if (p > 0.93) yaw = lerp(Math.PI, Math.PI - 2.4, sstep(range(p, 0.93, 0.975)));
      if (p < 0.846) lift = 1.06 * easeOut(q);
      else if (p < 0.912) lift = lerp(1.06, 0.96, range(p, 0.846, 0.878));
      else lift = 0.96 * (1 - easeIn(range(p, 0.912, 0.934)));
    }
    R.position.copy(pos); R.rotation.y = yaw;
    let pose = track(KEYS2, p);
    const wRun = range(p, 0.56, 0.585) * (1 - range(p, 0.712, 0.738));
    if (wRun > 0) {
      pose = mixPose(pose, runPose(phi, st.drib), wRun);
      lift += 0.05 * Math.max(0, Math.sin(2 * phi)) * wRun;
    }
    applyPose(player, pose, lift);
  }

  function poseDefender(p) {
    const R = defender.root;
    defender.root.visible = p >= 0.5;
    if (p < 0.5) return;
    const sl = range(p, 0.62, 0.765);
    const pos = DEF0.clone().lerp(DEF1, sstep(sl));
    if (p > 0.89) pos.copy(DEF1).lerp(DEF2, sstep(range(p, 0.89, 0.95)));
    R.position.copy(pos);
    const att = player.root.position;
    R.rotation.y = Math.atan2(att.x - pos.x, att.z - pos.z);
    const pose = track(KEYSD, p);
    const psi = (sstep(sl) * DEF0.distanceTo(DEF1)) / 0.32 * Math.PI;
    if (sl > 0 && sl < 1) { pose.hipL[2] += 10 * Math.abs(Math.sin(psi)); pose.hipR[2] -= 10 * Math.abs(Math.sin(psi)); }
    let lift = 0;
    if (p > 0.775 && p < 0.826) lift = 0.62 * easeOut(range(p, 0.775, 0.826));
    else if (p >= 0.826 && p < 0.885) lift = 0.62 * (1 - easeIn(range(p, 0.826, 0.885)));
    applyPose(defender, pose, lift);
  }

  // release points (captured once from the deterministic poses)
  posePlayer(0.24, 0); const REL1 = gripPos(player, V());
  posePlayer(0.858, 0); const REL2 = gripPos(player, V());
  const flightDir = V(-REL1.x, 0, -REL1.z).normalize();
  const DROP1 = V(flightDir.x * 0.32, 0.121, flightDir.z * 0.32);
  const BOUNCE1_END = DROP1.clone().add(flightDir.clone().multiplyScalar(-2.4)).setY(0.121);

  const bState = { axis: V(1, 0, 0), angle: 0 };
  const tmp = V(), tmp2 = V();
  function placeBall(p, time) {
    const pos = ball.position;
    const spinAxis = bState.axis;
    if (p < 0.5) {
      spinAxis.set(flightDir.z, 0, -flightDir.x);
      if (p < 0.24) {
        gripPos(player, pos);
        const dw = range(p, 0.045, 0.056) * (1 - range(p, 0.124, 0.135));
        if (dw > 0) {
          const f = frac(range(p, 0.05, 0.13) * 3);
          player.J.palmR.getWorldPosition(tmp);
          const fwd = V(Math.sin(yaw1), 0, Math.cos(yaw1));
          tmp.addScaledVector(fwd, 0.12);
          const top = tmp.y - 0.1;
          tmp.y = 0.121 + (top - 0.121) * Math.pow(Math.abs(2 * f - 1), 0.85);
          pos.lerp(tmp, dw);
          bState.angle = range(p, 0.05, 0.13) * 10;
        } else bState.angle = 0;
      } else if (p < SCORE1) {
        const s = range(p, 0.24, SCORE1);
        const u = lerp(s, easeOut(s), 0.55);
        pos.set(lerp(REL1.x, RIM.x, u), lerp(REL1.y, RIM.y, u) + 4 * 1.75 * u * (1 - u), lerp(REL1.z, RIM.z, u));
        bState.angle = -s * 18;
      } else if (p < 0.43) {
        const q = range(p, SCORE1, 0.43);
        pos.set(DROP1.x * easeOut(q), 3.05 - (3.05 - 0.121) * Math.pow(q, 1.35), DROP1.z * easeOut(q));
        bState.angle = -18 - q * 3;
      } else {
        const q = range(p, 0.43, 0.495);
        pos.copy(DROP1).lerp(BOUNCE1_END, easeOut(q));
        pos.y = 0.121 + bounceY(q, [0.75, 0.32, 0.1], [0.42, 0.33, 0.25]);
        bState.angle = -21 + easeOut(q) * 20;
      }
    } else {
      if (p < 0.858) {
        gripPos(player, pos);
        const dw = range(p, 0.57, 0.585) * (1 - range(p, 0.7, 0.715));
        if (dw > 0) {
          const f = frac(st.drib);
          player.J.palmR.getWorldPosition(tmp);
          tmp.addScaledVector(runDir, 0.32);
          const top = tmp.y - 0.1;
          tmp.y = 0.121 + (top - 0.121) * Math.pow(Math.abs(2 * f - 1), 0.85);
          pos.lerp(tmp, dw);
        }
        spinAxis.set(runDir.z, 0, -runDir.x);
        bState.angle = st.phi * 0.6;
      } else if (p < 0.872) {
        const q = range(p, 0.858, 0.872);
        const c1 = V(0, 3.25, 0.1), e = V(0, 2.55, 0);
        pos.set(0, 0, 0).addScaledVector(REL2, (1 - q) * (1 - q)).addScaledVector(c1, 2 * q * (1 - q)).addScaledVector(e, q * q);
        bState.angle = st.phi * 0.6 + q * 4;
      } else if (p < 0.895) {
        const q = range(p, 0.872, 0.895);
        pos.set(0.05 * q, 2.55 - (2.55 - 0.121) * Math.pow(q, 1.3), 0.25 * q);
      } else {
        const q = range(p, 0.895, 0.975);
        pos.set(lerp(0.05, 1.4, easeOut(q)), 0.121 + bounceY(q, [0.95, 0.4, 0.14], [0.42, 0.33, 0.25]), lerp(0.25, 2.9, easeOut(q)));
        spinAxis.set(1, 0, -0.5).normalize();
        bState.angle = st.phi * 0.6 + 4 + easeOut(q) * 12;
      }
    }
    ball.quaternion.setFromAxisAngle(spinAxis.normalize(), bState.angle);
  }

  function rimTilt(p) {
    if (p < 0.858) return 0;
    if (p < 0.912) return 7 * sstep(range(p, 0.858, 0.868)) - 1.5 * range(p, 0.88, 0.912);
    const dt = (p - 0.912) * 70;
    return 5.5 * Math.exp(-dt * 0.9) * Math.cos(dt * 7);
  }

  const nb = V(), segA = V(), segB = V(), up = V(0, 1, 0), qd = new THREE.Quaternion(), mtx = new THREE.Matrix4(), scl = V();
  function updateNet(p, time) {
    netGroup.worldToLocal(nb.copy(ball.position));
    const bh = Math.hypot(nb.x, nb.z);
    const ds = Math.min(Math.abs(p - SCORE1), Math.abs(p - SCORE2));
    const lastScore = p >= SCORE2 ? SCORE2 : p >= SCORE1 ? SCORE1 : -1;
    const dt = lastScore > 0 ? (p - lastScore) * 80 : 99;
    const whip = dt < 12 ? Math.exp(-dt * 0.45) : 0;
    for (let i = 0; i < NR; i++) {
      const rr = netRest[i], t = i / (NR - 1);
      for (let j = 0; j < NS; j++) {
        const a = ((j + rr.off) / NS) * Math.PI * 2;
        let r = rr.r, y = rr.y;
        if (bh < 0.3) {
          const dy = y - nb.y;
          const k = 1 - (dy / 0.15) * (dy / 0.15);
          if (k > 0) { r = Math.max(r, 0.138 * Math.sqrt(k) + 0.01); y -= 0.05 * k * (i > 0 ? 1 : 0); }
        }
        if (whip > 0 && i > 0) {
          r *= 1 + 0.3 * whip * Math.sin(dt * 1.6 - t * 2.4) * t;
          y += 0.12 * whip * Math.sin(dt * 1.3 - t * 2) * t * t;
        }
        const sway = 0.006 * t * Math.sin(time * 1.4 + i * 0.7);
        netPts[i][j].set(Math.cos(a) * r + sway, y, Math.sin(a) * r);
      }
    }
    for (let k = 0; k < segs.length; k++) {
      const s = segs[k];
      segA.copy(netPts[s[0]][s[1]]); segB.copy(netPts[s[2]][s[3]]);
      const len = segA.distanceTo(segB);
      qd.setFromUnitVectors(up, segB.clone().sub(segA).normalize());
      mtx.compose(segA.add(segB).multiplyScalar(0.5), qd, scl.set(1, len, 1));
      netMesh.setMatrixAt(k, mtx);
    }
    netMesh.instanceMatrix.needsUpdate = true;
    return ds;
  }

  /* ---- camera path ---- */
  const pl = (who, x, y, z) => who.root.localToWorld(V(x, y, z));
  const R_ = (x, y, z) => RIM.clone().add(V(x, y, z));
  const chase = (back, upv, side) => () => ball.position.clone().addScaledVector(flightDir, -back).add(V(0, upv, 0)).addScaledVector(V(flightDir.z, 0, -flightDir.x), side);
  const runnerSide = (dist, h, ahead) => () => {
    const side = V(-runDir.z, 0, runDir.x);
    if (side.x < 0) side.negate();
    return player.root.position.clone().addScaledVector(side, dist).add(V(0, h, 0)).addScaledVector(runDir, ahead);
  };
  const CAM = [
    [0.0, () => pl(player, -1.25, 1.2, 3.5), () => pl(player, 0, 1.2, 0)],
    [0.04, () => pl(player, -1.9, 1.0, 3.0), () => pl(player, 0, 1.0, 0)],
    [0.09, () => pl(player, 2.7, 1.3, 2.1), () => pl(player, 0, 0.9, 0)],
    [0.14, () => pl(player, 3.1, 1.6, -1.1), () => pl(player, -0.2, 1.4, 1.4)],
    [0.2, () => pl(player, 1.0, 1.9, -3.3), () => mixV(pl(player, 0, 2, 0), RIM, 0.45), 0.2],
    [0.24, () => pl(player, 0.8, 2.1, -2.9), () => mixV(ball.position, RIM, 0.5), 0.22],
    [0.29, chase(2.0, 0.45, 0.8), () => mixV(ball.position, RIM, 0.35), 0.24],
    [0.355, chase(1.3, 0.15, 1.0), () => mixV(ball.position, RIM, 0.3), 0.16],
    [0.39, () => R_(1.25, -0.22, 1.1), () => R_(0, -0.04, 0), 0.08],
    [0.412, () => R_(1.35, -0.85, 1.55), () => R_(0, -0.5, 0.1)],
    [0.445, () => V(4.4, 1.6, 5.6), () => V(-1.1, 1.0, 3.0), 0.2],
    [0.475, () => V(5.6, 3.2, 9.6), () => V(-1.4, 1.2, 3.4), 0.18],
    [0.512, () => V(3.2, 2.4, 9.5), () => V(0, 10.4, -3.6)],
    [0.548, () => pl(player, -2.2, 1.1, 3.2), () => pl(player, 0, 1.2, 0)],
    [0.59, runnerSide(5.2, 1.6, 0.6), () => player.root.position.clone().add(V(0, 1.1, 0)).addScaledVector(runDir, 1.0), 0.24],
    [0.7, runnerSide(4.8, 1.5, 0.8), () => player.root.position.clone().add(V(0, 1.1, 0)).addScaledVector(runDir, 1.0), 0.24],
    [0.745, runnerSide(4.2, 1.35, 0.6), () => mixV(pl(player, 0, 1.2, 0), RIM, 0.22), 0.2],
    [0.8, () => R_(2.4, -2.0, 2.9), () => mixV(pl(player, 0, 1.7, 0), RIM, 0.3)],
    [0.846, () => R_(1.95, -1.7, 2.35), () => mixV(pl(player, 0, 1.9, 0), RIM, 0.5)],
    [0.866, () => R_(1.6, -1.2, 1.95), () => R_(0, -0.25, 0.2)],
    [0.905, () => R_(2.5, -1.0, 3.25), () => R_(0, -0.6, 0.35)],
    [0.95, () => V(4.6, 1.8, 6.4), () => V(0, 1.5, 1.3)],
    [1.0, () => V(6.4, 2.7, 9.4), () => V(0.2, 1.7, 1.0)],
  ];
  const camPos = V(), camTgt = V();
  function placeCamera(p, time) {
    let i = 0;
    while (i < CAM.length - 2 && p > CAM[i + 1][0]) i++;
    const [p0, pa, ta] = CAM[i], [p1, pb, tb] = CAM[i + 1];
    const t = sstep(range(p, p0, p1));
    camPos.copy(pa()).lerp(pb(), t);
    camTgt.copy(ta()).lerp(tb(), t);
    // push the subject toward the right of frame (text lives on the left on wide screens)
    const shift = lerp(CAM[i][3] || 0, CAM[i + 1][3] || 0, t) * (W / H >= 1.1 ? 1 : 0);
    if (shift) {
      const fwd = camTgt.clone().sub(camPos), dist = fwd.length();
      const right = fwd.normalize().cross(up).normalize();
      camTgt.addScaledVector(right, -shift * dist);
    }
  }

  /* ---- DOM hooks ---- */
  const beats = Array.from(stage.querySelectorAll("[data-p]")).map((el) => {
    const [a, b] = el.getAttribute("data-p").split(",").map(Number);
    return { el, a, b, nums: Array.from(el.querySelectorAll("[data-to]")), on: false };
  });
  const words = Array.from(stage.querySelectorAll("[data-word]")).map((el) => {
    const [a, b] = el.getAttribute("data-word").split(",").map(Number);
    return { el, a, b };
  });
  const rail = stage.querySelector(".hud__fill");
  const chapters = Array.from(stage.querySelectorAll("[data-chapter]"));
  const scoreEl = stage.querySelector("[data-score]");
  const clockEl = stage.querySelector("[data-clock]");
  const flashEl = stage.querySelector(".stage__flash");
  const loader = stage.querySelector(".stage__loader");
  const fmt = (n, el) => (el.getAttribute("data-prefix") || "") + Math.round(n).toLocaleString() + (el.getAttribute("data-suffix") || "");

  function updateDOM(p) {
    const fw = 0.011;
    for (const b of beats) {
      const fin = b.a <= 0 ? 1 : sstep(range(p, b.a - fw, b.a + fw));
      const fout = b.b >= 1 ? 1 : 1 - sstep(range(p, b.b - fw, b.b + fw));
      const al = Math.min(fin, fout);
      const on = al > 0.01;
      if (on !== b.on) { b.el.classList.toggle("is-on", on); b.on = on; }
      if (on) {
        b.el.style.opacity = al.toFixed(3);
        const dy = (1 - fin) * 40 - (1 - fout) * 40;
        b.el.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0)`;
        for (const n of b.nums) n.textContent = fmt(+n.getAttribute("data-to") * easeOut(range(p, b.a, b.a + 0.03)), n);
      }
    }
    for (const w of words) {
      const q = range(p, w.a, w.b);
      const al = q <= 0 || q >= 1 ? 0 : Math.min(1, q * 6, (1 - q) * 3);
      w.el.style.opacity = al.toFixed(3);
      w.el.style.transform = `scale(${(0.7 + 0.45 * easeOut(Math.min(1, q * 2.2)) + q * 0.1).toFixed(3)})`;
      w.el.style.visibility = al > 0 ? "visible" : "hidden";
    }
    if (rail) rail.style.transform = `scaleY(${p.toFixed(4)})`;
    chapters.forEach((c) => { const [a, b] = c.getAttribute("data-chapter").split(",").map(Number); c.classList.toggle("is-active", p >= a && p < b); });
    if (scoreEl) scoreEl.textContent = p >= SCORE2 ? "5" : p >= SCORE1 ? "3" : "0";
    if (clockEl) {
      let c = 24;
      if (p < SCORE1) c = 24 * (1 - p / SCORE1);
      else if (p < 0.52) c = 24;
      else if (p < SCORE2) c = 24 * (1 - range(p, 0.52, SCORE2));
      clockEl.textContent = String(Math.ceil(c)).padStart(2, "0");
    }
    if (flashEl) {
      const f = Math.max(Math.exp(-Math.max(0, p - SCORE1) * 300) * (p >= SCORE1 ? 1 : 0), Math.exp(-Math.max(0, p - SCORE2) * 240) * (p >= SCORE2 ? 1 : 0));
      flashEl.style.opacity = (f * 0.55).toFixed(3);
    }
  }

  /* ---- sizing ---- */
  let W = 0, H = 0;
  function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    const aspect = W / H;
    camera.aspect = aspect;
    camera.fov = aspect < 1 ? Math.min(68, 40 / Math.pow(aspect, 0.55)) : 40;
    if (aspect >= 1.1) camera.setViewOffset(W, H, -W * 0.13, 0, W, H);
    else camera.setViewOffset(W, H, 0, H * 0.1, W, H);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  /* ---- input ---- */
  let target = 0, prog = 0;
  function readScroll() {
    const r = scrolly.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    target = clamp(total > 0 ? -r.top / total : 0);
  }
  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", readScroll);
  readScroll(); prog = target;
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  if (!reduce) window.addEventListener("pointermove", (e) => { mouse.x = e.clientX / window.innerWidth - 0.5; mouse.y = e.clientY / window.innerHeight - 0.5; }, { passive: true });

  let visible = true;
  new IntersectionObserver((en) => { visible = en[0].isIntersecting; }, { rootMargin: "100px" }).observe(scrolly);

  /* ---- frame ---- */
  const clock = new THREE.Clock();
  const shakeV = V();
  function frame(p, time) {
    posePlayer(p, time);
    poseDefender(p);
    rimPivot.rotation.x = D(rimTilt(p));
    rimPivot.updateMatrixWorld(true);
    placeBall(p, time);
    updateNet(p, time);

    // lights follow the action
    const pp = player.root.position;
    key.position.set(pp.x + 1.6, 12.5, pp.z + 2.8);
    key.target.position.set(pp.x, 1, pp.z);
    shaftKey.position.copy(key.position).lerp(V(pp.x, 0, pp.z), 0.5);
    shaftKey.quaternion.setFromUnitVectors(up, key.position.clone().sub(V(pp.x, 0, pp.z)).normalize());

    const f1 = p >= SCORE1 ? Math.exp(-(p - SCORE1) * 90) : 0;
    const f2 = p >= SCORE2 ? Math.exp(-(p - SCORE2) * 70) : 0;
    const fx = Math.max(f1, f2);
    ledMat.emissiveIntensity = 0.25 + fx * 7 + (p > SCORE2 ? 0.6 * Math.max(0, Math.sin(time * 6)) * Math.exp(-(p - SCORE2) * 20) : 0);
    ledMat.emissive.setHex(f2 > f1 ? 0xff6a2a : 0xffbc36);
    hoopSpot.intensity = 380 + fx * 900;
    rimMat.emissiveIntensity = 0.08 + fx * 1.5;

    // shockwave ring + sparks
    const which = p >= SCORE2 ? SCORE2 : SCORE1;
    const q = range(p, which, which + 0.035);
    ring.visible = p >= SCORE1 && q < 1;
    if (ring.visible) { const s = 0.25 + easeOut(q) * 3.2; ring.scale.set(s, s, s); ring.position.copy(RIM).setY(2.95); ringMat.opacity = (1 - q) * 0.9; }
    const q2 = range(p, SCORE2 + 0.004, SCORE2 + 0.05);
    floorRing.visible = p > SCORE2 && q2 < 1;
    if (floorRing.visible) { const s = 0.4 + easeOut(q2) * 7; floorRing.scale.set(s, s, s); floorRing.position.set(0, 0.02, 0.6); floorRing.material.opacity = (1 - q2) * 0.7; }
    const sq = range(p, which, which + 0.04);
    sparks.visible = p >= SCORE1 && sq < 1;
    if (sparks.visible) {
      const tt = sq * 1.1;
      for (let i = 0; i < SPARKS; i++) {
        const v = sparkVel[i];
        sparkPos[i * 3] = v.x * tt; sparkPos[i * 3 + 1] = 2.95 + v.y * tt - 4.9 * tt * tt; sparkPos[i * 3 + 2] = v.z * tt;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparks.material.opacity = (1 - sq) * 1;
    }

    // crowd + dust
    for (let i = 0; i < CROWD; i++) {
      const s = crowdSeed[i];
      let b = 0.18 + 0.12 * Math.sin(time * (0.6 + s * 1.6) + s * 40);
      const flashChance = 0.03 + fx * 0.5;
      if (frac(Math.sin((Math.floor(time * 9) + s * 977) * 12.9898) * 43758.5453) < flashChance) b = 1.6;
      const warm = s > 0.7;
      crowdCol[i * 3] = b * (warm ? 1 : 0.75); crowdCol[i * 3 + 1] = b * (warm ? 0.82 : 0.82); crowdCol[i * 3 + 2] = b * (warm ? 0.55 : 1);
    }
    crowdGeo.attributes.color.needsUpdate = true;
    for (let i = 0; i < DUST; i++) {
      const bx = dustBase[i * 3], by = dustBase[i * 3 + 1], bz = dustBase[i * 3 + 2];
      dustPos[i * 3] = bx + Math.sin(time * 0.15 + i) * 0.4;
      dustPos[i * 3 + 1] = (by + time * 0.06 * (0.5 + (i % 7) / 7)) % 9;
      dustPos[i * 3 + 2] = bz + Math.cos(time * 0.12 + i * 1.3) * 0.4;
    }
    dustGeo.attributes.position.needsUpdate = true;

    // camera
    placeCamera(p, time);
    mouse.sx += (mouse.x - mouse.sx) * 0.05; mouse.sy += (mouse.y - mouse.sy) * 0.05;
    const fwd = camTgt.clone().sub(camPos).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
    camPos.addScaledVector(right, mouse.sx * 0.35).addScaledVector(up, -mouse.sy * 0.2);
    camPos.y += Math.sin(time * 0.7) * 0.015;
    if (!reduce && f2 > 0.02) {
      const a = f2 * 0.09;
      shakeV.set(Math.sin(time * 61) * a, Math.sin(time * 47 + 1) * a, Math.sin(time * 53 + 2) * a);
      camPos.add(shakeV);
    }
    camera.position.copy(camPos);
    camera.lookAt(camTgt);
    renderer.render(scene, camera);
    updateDOM(p);
  }

  let first = true;
  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!visible && !first) return;
    const k = 1 - Math.exp(-dt * (reduce ? 30 : 5.5));
    prog += (target - prog) * k;
    if (Math.abs(target - prog) < 1e-5) prog = target;
    frame(prog, clock.elapsedTime);
    if (first) { first = false; if (loader) loader.classList.add("is-done"); }
  }
  loop();

  // debug/QA hook: window.__kh.go(0.4)
  window.__kh = { go: (p) => { target = prog = p; }, get p() { return prog; } };
}
