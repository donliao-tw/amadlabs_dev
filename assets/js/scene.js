import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/*
 * Scene (Three.js): sixteen Excel sheets, each marked wrong, drift in space,
 * fall into one system, then fly out onto orbits around it.
 *
 *   chaos   -> sheets scattered in 3D, each stamped with a red mark
 *   merging -> they are pulled into the core
 *   orbit   -> they travel on elliptical orbits; only a title is shown,
 *              hover or click for the detail
 *   core    -> click the core: the orbiting sheets collapse into it, the
 *              core grows and the feature tags open around it
 *
 * All text comes from i18n/*.json (keys scene.*). Labels are real DOM
 * buttons laid over the canvas, so they stay sharp, translate, and are
 * reachable by keyboard.
 */

const SHEETS = Array.from({ length: 16 }, (_, i) => "s" + (i + 1));
const FEATURES = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12", "f13"];

// Orbit shape per sheet: eccentricity and tilt about X.
const ECC = [0.1, 0.28, 0.18, 0.34, 0.12, 0.3, 0.2, 0.08, 0.26, 0.16, 0.22, 0.14, 0.3, 0.1, 0.24, 0.18];
const TILT = [0.35, -0.3, 0.12, 0.42, -0.45, 0.2, -0.15, 0.38, -0.34, 0.1, -0.25, 0.46, -0.08, 0.3, -0.4, 0.18];

// One hue per sheet, so the system reads as colourful rather than grey.
const HUES = [
  "#ff6b8b", "#ff9a52", "#ffd24d", "#7be07b", "#34d3c1", "#4cc3ff", "#6f8cff", "#a47bff",
  "#e07bff", "#ff7bbd", "#ffb36b", "#b6e04d", "#4de0a3", "#5ad0f0", "#8aa2ff", "#d58aff",
];

const ICON_X =
  '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 2l8 8M10 2L2 10"/></svg>';

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let scene, stage, canvas, layer, detail, statusEl, replayBtn;
let dict = {};
let state = "chaos"; // chaos | merging | orbit | core
let selection = null; // { type: "sheet" | "feature", key }
let hovered = false;
let timers = [];
let started = false;
let visible = false;
let W = 0;
let H = 0;

let renderer, camera, controls, root, featGroup, coreMesh, glowSprite, stars, wire;
const scene3 = new THREE.Scene();
const bodies = [];
const feats = [];
const core = { scale: 1, el: null, r: 0 };
const tweens = [];
let clock = 0;
let lastTs = 0;
let theme = {};

const t = (key) => (Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : "");

// ---------- small tween engine ----------

const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function tween(obj, key, to, dur, delay = 0) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    if (tweens[i].obj === obj && tweens[i].key === key) tweens.splice(i, 1);
  }
  if (reduceMotion) {
    obj[key] = to;
    return;
  }
  tweens.push({ obj, key, to, dur, delay, el: 0, from: null });
}

function stepTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.el += dt;
    if (tw.el < tw.delay) continue;
    if (tw.from === null) tw.from = tw.obj[tw.key];
    const k = Math.min((tw.el - tw.delay) / tw.dur, 1);
    tw.obj[tw.key] = tw.from + (tw.to - tw.from) * easeInOut(k);
    if (k >= 1) tweens.splice(i, 1);
  }
}

// Intro steps run on the scene's own clock, which only ticks while the scene
// is on screen. A wall-clock setTimeout would keep advancing the story while
// the visitor is elsewhere on the page and leave it half-played on return.
let sceneTime = 0;

function later(fn, ms) {
  timers.push({ at: sceneTime + ms / 1000, fn });
}

function clearTimers() {
  timers = [];
}

function runTimers() {
  for (let i = 0; i < timers.length; ) {
    if (timers[i].at <= sceneTime) {
      const { fn } = timers.splice(i, 1)[0];
      fn();
    } else i++;
  }
}

// Deterministic pseudo-random, so the pile looks the same every visit.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- theme colours, read from the page's CSS variables ----------

function readTheme() {
  // The stage is always deep space, so these do not follow the page theme.
  theme = { surface: "#f7f9ff", alt: "#e8edff", border: "#c9d2f0", muted: "#7c88b8", accent: "#4f8cff" };
}

function sheetTexture(selected, hue) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 176;
  const g = c.getContext("2d");
  const r = 18;
  // translucent body and header in the sheet's own colour; the stars show through
  g.fillStyle = hue;
  g.globalAlpha = 0.16;
  g.beginPath();
  g.roundRect(6, 6, 244, 164, r);
  g.fill();
  g.globalAlpha = 0.38;
  g.beginPath();
  g.roundRect(6, 6, 244, 40, [r, r, 0, 0]);
  g.fill();
  // two cells only: one centre line each way
  g.globalAlpha = 0.55;
  g.strokeStyle = hue;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(128, 46);
  g.lineTo(128, 168);
  g.moveTo(8, 108);
  g.lineTo(248, 108);
  g.stroke();
  g.globalAlpha = 1;
  g.strokeStyle = selected ? "#ffffff" : hue;
  g.lineWidth = selected ? 9 : 5;
  g.beginPath();
  g.roundRect(6, 6, 244, 164, r);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  const col = new THREE.Color(theme.accent);
  const rgb = `${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)}`;
  grad.addColorStop(0, `rgba(${rgb},0.5)`);
  grad.addColorStop(0.45, `rgba(${rgb},0.14)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function applyTheme() {
  readTheme();
  bodies.forEach((b, i) => {
    b.tex?.dispose();
    b.texSel?.dispose();
    b.tex = sheetTexture(false, HUES[i]);
    b.texSel = sheetTexture(true, HUES[i]);
  });

  glowSprite.material.map?.dispose();
  glowSprite.material.map = glowTexture();
  glowSprite.material.blending = THREE.AdditiveBlending;
  glowSprite.material.needsUpdate = true;
  wire.material.color.set(theme.accent);
  refresh();
}

// ---------- build ----------

// The core: a ball of slowly flowing colour. Domain-warped noise in the
// object's own space gives drifting bands; a rim light keeps it round.
function coreMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vPos = position;
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vView;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
          mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = p * 2.03 + vec3(1.7, 9.2, 3.1);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 p = vPos * 1.6;
        float t = uTime * 0.22;
        // warp the lookup twice so the colour streams instead of just fading
        vec3 q = vec3(fbm(p + vec3(0.0, t, 0.0)), fbm(p + vec3(5.2, 1.3, -t)), fbm(p + vec3(-t, 8.3, 2.8)));
        float n = fbm(p + 2.2 * q + vec3(t * 0.6));

        vec3 deep = vec3(0.07, 0.12, 0.45);
        vec3 blue = vec3(0.20, 0.45, 1.00);
        vec3 cyan = vec3(0.20, 0.85, 1.00);
        vec3 violet = vec3(0.60, 0.35, 1.00);
        vec3 col = mix(deep, blue, smoothstep(0.15, 0.55, n));
        col = mix(col, violet, smoothstep(0.45, 0.8, q.x) * 0.75);
        col = mix(col, cyan, smoothstep(0.55, 0.9, n + q.y * 0.3) * 0.85);

        float fres = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.4);
        col += vec3(0.45, 0.65, 1.0) * fres * 0.9;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function buildWorld() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

  root = new THREE.Group();
  scene3.add(root);

  // core: a plain sphere with a soft halo
  coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.9, 64, 48), coreMaterial());
  root.add(coreMesh);

  wire = new THREE.Mesh(
    new THREE.SphereGeometry(1.32, 14, 10),
    new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.35, depthWrite: false })
  );
  root.add(wire);

  glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  glowSprite.scale.setScalar(6);
  root.add(glowSprite);

  // sheets, each with its orbit line and a DOM label
  const rand = rng(7);
  SHEETS.forEach((key, i) => {
    const a = 2.9 + i * 0.36;
    const ecc = ECC[i];
    const b = a * Math.sqrt(1 - ecc * ecc);
    const eul = new THREE.Euler(TILT[i], i * 0.63, 0);

    const pts = [];
    for (let k = 0; k <= 160; k++) {
      const th = (k / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(a * (Math.cos(th) - ecc), 0, b * Math.sin(th)));
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0, color: HUES[i] })
    );
    line.rotation.copy(eul);
    root.add(line);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    root.add(sprite);

    const el = document.createElement("button");
    el.type = "button";
    el.className = "orb";
    el.style.setProperty("--hue", HUES[i]);
    el.setAttribute("data-k", key);
    el.innerHTML =
      '<span class="orb-x" aria-hidden="true">' + ICON_X + "</span>" +
      '<span class="orb-text"><strong></strong><small></small></span>' +
      '<span class="orb-card"><b></b><span></span></span>';
    layer.appendChild(el);

    bodies.push({
      key,
      a,
      b,
      ecc,
      eul,
      ang0: i * 2.399963 + rand() * 0.4,
      speed: 1.35 / Math.pow(a, 1.5),
      chaos: new THREE.Vector3((rand() - 0.5) * 17, (rand() - 0.5) * 8, (rand() - 0.5) * 9),
      cw: 1, // weight of the scattered position
      ow: 0, // weight of the orbit position
      sel: false,
      sprite,
      line,
      el,
      pos: new THREE.Vector3(),
      tex: null,
      texSel: null,
    });
  });

  // features: placed on a sphere around the enlarged core
  featGroup = new THREE.Group();
  root.add(featGroup);
  FEATURES.forEach((key, i) => {
    const n = FEATURES.length;
    const y = 1 - (i / (n - 1)) * 2;
    const rr = Math.sqrt(1 - y * y);
    const phi = i * 2.399963;
    const el = document.createElement("button");
    el.type = "button";
    el.className = "orb orb-feat";
    el.style.setProperty("--hue", HUES[(i * 3 + 2) % HUES.length]);
    el.setAttribute("data-k", key);
    el.innerHTML = '<span class="orb-text"><strong></strong></span><span class="orb-card"><span></span></span>';
    layer.appendChild(el);
    feats.push({
      key,
      dir: new THREE.Vector3(Math.cos(phi) * rr, y * 0.72, Math.sin(phi) * rr).normalize(),
      fw: 0,
      el,
      pos: new THREE.Vector3(),
    });
  });

  // stars in a few colours, for depth
  const sp = [];
  const sc = [];
  const r2 = rng(99);
  const starCols = ["#ffffff", "#bcd0ff", "#ffd9a8", "#c9b6ff", "#9fe8ff"].map((h) => new THREE.Color(h));
  for (let i = 0; i < 900; i++) {
    sp.push(new THREE.Vector3(r2() - 0.5, r2() - 0.5, r2() - 0.5).normalize().multiplyScalar(26 + r2() * 24));
    const col = starCols[Math.floor(r2() * starCols.length)];
    const dim = 0.4 + r2() * 0.6;
    sc.push(col.r * dim, col.g * dim, col.b * dim);
  }
  const starGeo = new THREE.BufferGeometry().setFromPoints(sp);
  starGeo.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
  stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })
  );
  root.add(stars);

  controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false; // the wheel keeps scrolling the page
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.35;
  controls.maxPolarAngle = 1.45;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.35;
  canvas.style.touchAction = "pan-y"; // a vertical swipe still scrolls the page
}

function fitCamera() {
  const aspect = W / H;
  camera.aspect = aspect;
  const fit = 9.6 / (Math.tan((camera.fov * Math.PI) / 360) * aspect);
  // On a narrow screen the outer orbits may run past the edge; a bigger
  // scene is worth more than showing every orbit at once.
  const dist = aspect < 1 ? Math.max(14, fit * 0.62) : Math.max(14, fit);
  camera.position.setLength(dist);
  camera.updateProjectionMatrix();
  controls.update();
}

function resize() {
  W = stage.clientWidth;
  H = stage.clientHeight;
  if (!W || !H) return;
  renderer.setSize(W, H, false);
  fitCamera();
}

// ---------- per-frame update ----------

const v3 = new THREE.Vector3();
const edge = new THREE.Vector3();

function placeLabel(el, pos, alpha, spritePx) {
  v3.copy(pos).project(camera);
  const x = (v3.x * 0.5 + 0.5) * W;
  const y = (-v3.y * 0.5 + 0.5) * H;
  const a = v3.z > 1 ? 0 : alpha;
  if (a < 0.02) {
    if (el._shown !== false) {
      el.style.opacity = "0";
      el.style.pointerEvents = "none";
      el._shown = false;
    }
    return;
  }
  // The label sits on its sheet and grows or shrinks with it.
  let sc = spritePx ? Math.min(Math.max(spritePx / 200, 0.72), 1.3) : 1;
  if (el.matches(":hover, :focus-visible")) sc = Math.max(sc, 1.2); // the one being read is never small
  el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${sc.toFixed(3)})`;
  el.style.opacity = String(Math.min(a, 1));
  el.style.pointerEvents = a > 0.6 ? "auto" : "none";
  el.style.zIndex = el.matches(":hover, :focus-visible") ? "2000" : String(Math.round((1 - v3.z) * 800));
  el.classList.toggle("is-low", y > H * 0.5); // open the card upward near the bottom
  el.classList.toggle("is-edge-l", x < W * 0.22);
  el.classList.toggle("is-edge-r", x > W * 0.78);
  el._shown = true;
}

function frame(ts) {
  requestAnimationFrame(frame);
  if (!visible || !renderer || !W) return;
  const dt = Math.min((ts - lastTs) / 1000 || 0, 0.05);
  lastTs = ts;

  coreMesh.material.uniforms.uTime.value += reduceMotion ? 0 : dt; // the flow never pauses
  coreMesh.rotation.y += reduceMotion ? 0 : dt * 0.05;
  sceneTime += dt;
  runTimers();

  const paused = hovered || reduceMotion;
  if (!paused) clock += dt;
  stepTweens(dt);

  controls.autoRotate = !paused && state !== "chaos";
  controls.update();

  coreMesh.scale.setScalar(core.scale);
  wire.scale.setScalar(core.scale);
  wire.rotation.y = clock * 0.08;
  glowSprite.scale.setScalar(6 * core.scale);

  bodies.forEach((b) => {
    const th = b.ang0 + b.speed * clock;
    v3.set(b.a * (Math.cos(th) - b.ecc), 0, b.b * Math.sin(th)).applyEuler(b.eul);
    b.pos.copy(b.chaos).multiplyScalar(b.cw).addScaledVector(v3, b.ow);

    const k = Math.min(b.cw + b.ow, 1);
    b.sprite.position.copy(b.pos);
    b.sprite.scale.set(2.0 * k, 1.38 * k, 1);
    b.line.material.opacity = (b.sel ? 1 : 0.4) * b.ow;
    b.line.visible = b.ow > 0.01;

    const dist = camera.position.distanceTo(b.pos);
    const pxPerUnit = H / (2 * Math.tan((camera.fov * Math.PI) / 360) * dist);
    placeLabel(b.el, b.pos, k, 2.0 * k * pxPerUnit);
  });

  featGroup.rotation.y = clock * 0.12;
  feats.forEach((f) => {
    f.pos.copy(f.dir).multiplyScalar(5.6 * f.fw).applyAxisAngle(THREE.Object3D.DEFAULT_UP, featGroup.rotation.y);
    placeLabel(f.el, f.pos, f.fw, 200);
  });

  // the core's click target follows the sphere on screen
  v3.set(0, 0, 0).project(camera);
  const cx = (v3.x * 0.5 + 0.5) * W;
  const cy = (-v3.y * 0.5 + 0.5) * H;
  edge.set(0.9 * core.scale, 0, 0).applyQuaternion(camera.quaternion).project(camera);
  core.r = Math.abs((edge.x * 0.5 + 0.5) * W - cx);
  core.el.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) translate(-50%, -50%)`;
  core.el.style.setProperty("--r", Math.max(core.r, 28).toFixed(1) + "px");

  renderer.render(scene3, camera);
}

// ---------- states ----------

function setState(next) {
  state = next;
  scene.setAttribute("data-state", next);
  if (next !== "orbit" && selection && selection.type === "sheet") selection = null;
  if (next !== "core" && selection && selection.type === "feature") selection = null;
  core.el.disabled = next === "chaos" || next === "merging";
  core.el.setAttribute("aria-pressed", next === "core" ? "true" : "false");
  refresh();
}

function stampAll() {
  bodies.forEach((b) => b.el.classList.add("is-stamped"));
}

function toOrbit(delay = 0) {
  bodies.forEach((b, i) => tween(b, "ow", 1, 1.4, delay + i * 0.05));
  tween(core, "scale", 1, 1, delay);
  feats.forEach((f) => tween(f, "fw", 0, 0.5));
  setState("orbit");
}

function toCore() {
  bodies.forEach((b, i) => tween(b, "ow", 0, 0.9, i * 0.03));
  tween(core, "scale", 2.4, 1.1, 0.1);
  feats.forEach((f, i) => tween(f, "fw", 1, 1, 0.55 + i * 0.04));
  setState("core");
}

function play() {
  clearTimers();
  tweens.length = 0;
  selection = null;
  clock = 0;
  bodies.forEach((b) => {
    b.cw = 1;
    b.ow = 0;
    b.el.classList.remove("is-stamped");
  });
  feats.forEach((f) => (f.fw = 0));
  core.scale = 1;
  setState("chaos");

  if (reduceMotion) {
    stampAll();
    bodies.forEach((b) => {
      b.cw = 0;
      b.ow = 1;
    });
    setState("orbit");
    return;
  }

  bodies.forEach((b, i) => later(() => b.el.classList.add("is-stamped"), 400 + i * 93));
  const tMerge = 400 + bodies.length * 93 + 600;
  later(() => {
    setState("merging");
    bodies.forEach((b, i) => tween(b, "cw", 0, 1.1, i * 0.04));
  }, tMerge);
  later(() => toOrbit(0), tMerge + 1500);
}

function skipIntro() {
  clearTimers();
  stampAll();
  tweens.length = 0;
  bodies.forEach((b) => (b.cw = 0));
  setState("merging");
  later(() => toOrbit(0), 200);
}

// ---------- texts, selection, detail ----------

function refresh() {
  if (!scene || !core.el || !bodies.length) return;
  const stateKey = { chaos: "chaos", merging: "merged", orbit: "burst", core: "core" }[state];
  statusEl.textContent = t("scene.status." + stateKey);

  bodies.forEach((b) => {
    const k = b.key;
    b.el.querySelector("strong").textContent = t(`scene.${k}.flaw`);
    b.el.querySelector("small").textContent = t(`scene.${k}.file`);
    b.el.querySelector(".orb-card b").textContent = `${t(`scene.${k}.file`)} · ${t(`scene.${k}.who`)}`;
    b.el.querySelector(".orb-card span").textContent = t(`scene.${k}.desc`);
    b.sel = !!selection && selection.type === "sheet" && selection.key === k;
    b.el.classList.toggle("is-selected", b.sel);
    if (b.tex) {
      b.sprite.material.map = b.sel ? b.texSel : b.tex;
      b.sprite.material.needsUpdate = true;
    }
  });

  feats.forEach((f) => {
    f.el.querySelector("strong").textContent = t(`scene.${f.key}.name`);
    f.el.querySelector(".orb-card span").textContent = t(`scene.${f.key}.desc`);
    f.el.classList.toggle("is-selected", !!selection && selection.type === "feature" && selection.key === f.key);
  });

  core.el.querySelector(".orb-core-name").textContent = "AMAD Smart";
  core.el.setAttribute("aria-label", t(state === "core" ? "scene.coreCollapse" : "scene.coreExpand"));
  renderDetail();
}

function renderDetail() {
  const title = detail.querySelector(".scene-detail-title");
  const text = detail.querySelector(".scene-detail-text");
  if (selection && selection.type === "sheet") {
    const k = selection.key;
    title.textContent = `${t(`scene.${k}.file`)}  /  ${t(`scene.${k}.flaw`)}`;
    text.textContent = t("scene.fixLabel") + t(`scene.${k}.fix`);
    detail.setAttribute("data-kind", "sheet");
  } else if (selection && selection.type === "feature") {
    title.textContent = t(`scene.${selection.key}.name`);
    text.textContent = t(`scene.${selection.key}.desc`);
    detail.setAttribute("data-kind", "feature");
  } else {
    title.textContent = "";
    text.textContent = t("scene.detail." + { chaos: "chaos", merging: "chaos", orbit: "burst", core: "core" }[state]);
    detail.setAttribute("data-kind", "hint");
  }
}

function select(type, key) {
  selection = selection && selection.type === type && selection.key === key ? null : { type, key };
  refresh();
}

// ---------- events ----------

function bind() {
  layer.addEventListener("click", (e) => {
    const orb = e.target.closest(".orb");
    if (!orb) return;
    if (state === "chaos") {
      skipIntro();
      return;
    }
    select(orb.classList.contains("orb-feat") ? "feature" : "sheet", orb.getAttribute("data-k"));
  });

  layer.addEventListener("pointerover", (e) => {
    if (e.target.closest(".orb")) hovered = true;
  });
  layer.addEventListener("pointerout", (e) => {
    const to = e.relatedTarget;
    if (!to || !to.closest || !to.closest(".orb")) hovered = false;
  });
  layer.addEventListener("focusin", (e) => {
    if (e.target.closest(".orb")) hovered = true;
  });
  layer.addEventListener("focusout", () => {
    hovered = false;
  });

  core.el.addEventListener("click", () => {
    if (state === "orbit") toCore();
    else if (state === "core") toOrbit(0.25);
  });

  scene.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (selection) {
      selection = null;
      refresh();
    } else if (state === "core") toOrbit(0.25);
  });

  canvas.addEventListener("click", () => {
    if (state === "chaos") skipIntro();
  });

  replayBtn.addEventListener("click", play);

  new ResizeObserver(resize).observe(stage);
}

function start() {
  if (started) return;
  started = true;
  play();
}

function setDict(d) {
  dict = d || {};
  refresh();
}

function init() {
  scene = document.getElementById("scene");
  stage = document.getElementById("sceneStage");
  canvas = document.getElementById("sceneCanvas");
  layer = document.getElementById("orbLayer");
  detail = document.getElementById("sceneDetail");
  statusEl = document.getElementById("sceneStatus");
  replayBtn = document.getElementById("sceneReplay");
  if (!scene || !stage || !canvas || !layer || !detail || !statusEl || !replayBtn) return;

  core.el = document.createElement("button");
  core.el.type = "button";
  core.el.className = "orb-core";
  core.el.disabled = true;
  core.el.innerHTML = '<span class="orb-core-name"></span>';
  layer.appendChild(core.el);

  try {
    readTheme();
    buildWorld();
  } catch (err) {
    console.error(err);
    scene.setAttribute("data-fallback", "true");
    return;
  }

  W = stage.clientWidth;
  H = stage.clientHeight;
  camera.position.set(0, 12, 8);
  applyTheme();
  bind();
  resize();
  requestAnimationFrame(frame);

  new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        visible = en.isIntersecting;
        if (en.isIntersecting && en.intersectionRatio >= 0.5) start();
      });
    },
    { threshold: [0, 0.5] }
  ).observe(stage);

  if (window.__amadDict) setDict(window.__amadDict);
}

window.AmadScene = { setDict };

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
