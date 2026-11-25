import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/*
 * Scene (Three.js): ten Excel sheets, each marked wrong, drift in space,
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

const SHEETS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"];
const FEATURES = ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12", "f13"];

// Orbit shape per sheet: eccentricity and tilt about X.
const ECC = [0.1, 0.28, 0.18, 0.34, 0.12, 0.3, 0.2, 0.08, 0.26, 0.16];
const TILT = [0.35, -0.3, 0.12, 0.42, -0.45, 0.2, -0.15, 0.38, -0.34, 0.1];

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

function later(fn, ms) {
  timers.push(setTimeout(fn, ms));
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
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
  const cs = getComputedStyle(document.documentElement);
  const get = (n, fb) => cs.getPropertyValue(n).trim() || fb;
  theme = {
    dark: document.documentElement.getAttribute("data-theme") === "dark",
    surface: get("--color-surface", "#ffffff"),
    alt: get("--color-bg-alt", "#f6f7f9"),
    border: get("--color-border", "#e4e6ea"),
    muted: get("--color-text-muted", "#5b6270"),
    accent: get("--color-accent", "#2f6feb"),
  };
}

function sheetTexture(selected) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 176;
  const g = c.getContext("2d");
  const r = 18;
  g.fillStyle = theme.surface;
  g.strokeStyle = selected ? theme.accent : theme.muted;
  g.lineWidth = selected ? 7 : 4;
  g.beginPath();
  g.roundRect(6, 6, 244, 164, r);
  g.fill();
  g.stroke();
  // header band and grid, so it reads as a spreadsheet at a glance
  g.fillStyle = theme.alt;
  g.beginPath();
  g.roundRect(8, 8, 240, 38, [r - 2, r - 2, 0, 0]);
  g.fill();
  g.strokeStyle = theme.border;
  g.lineWidth = 3;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(6 + (244 / 4) * i, 8);
    g.lineTo(6 + (244 / 4) * i, 168);
    g.stroke();
  }
  for (let j = 1; j < 4; j++) {
    g.beginPath();
    g.moveTo(8, 6 + (164 / 4) * j);
    g.lineTo(248, 6 + (164 / 4) * j);
    g.stroke();
  }
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
  const line = new THREE.Color(theme.muted);

  bodies.forEach((b) => {
    b.tex?.dispose();
    b.texSel?.dispose();
    b.tex = sheetTexture(false);
    b.texSel = sheetTexture(true);
  });

  coreMesh.material.color.set(theme.accent);
  glowSprite.material.map?.dispose();
  glowSprite.material.map = glowTexture();
  glowSprite.material.blending = theme.dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  glowSprite.material.needsUpdate = true;
  wire.material.color.set(theme.accent);
  stars.material.color.copy(line);
  stars.material.opacity = theme.dark ? 0.7 : 0.35;
  refresh();
}

// ---------- build ----------

function buildWorld() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

  root = new THREE.Group();
  scene3.add(root);

  // core: a plain sphere with a soft halo
  coreMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.9, 48, 32),
    new THREE.MeshBasicMaterial({ color: 0x2f6feb })
  );
  root.add(coreMesh);

  wire = new THREE.Mesh(
    new THREE.SphereGeometry(1.32, 14, 10),
    new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.2, depthWrite: false })
  );
  root.add(wire);

  glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  glowSprite.scale.setScalar(6);
  root.add(glowSprite);

  // sheets, each with its orbit line and a DOM label
  const rand = rng(7);
  SHEETS.forEach((key, i) => {
    const a = 3.1 + i * 0.52;
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
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0 })
    );
    line.rotation.copy(eul);
    root.add(line);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    root.add(sprite);

    const el = document.createElement("button");
    el.type = "button";
    el.className = "orb";
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
      ang0: rand() * Math.PI * 2,
      speed: 1.35 / Math.pow(a, 1.5),
      chaos: new THREE.Vector3((rand() - 0.5) * 14, (rand() - 0.5) * 7, (rand() - 0.5) * 9),
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

  // faint stars for depth
  const sp = [];
  const r2 = rng(99);
  for (let i = 0; i < 360; i++) {
    sp.push(new THREE.Vector3(r2() - 0.5, r2() - 0.5, r2() - 0.5).normalize().multiplyScalar(26 + r2() * 24));
  }
  stars = new THREE.Points(
    new THREE.BufferGeometry().setFromPoints(sp),
    new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false })
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
  const fit = 9.2 / (Math.tan((camera.fov * Math.PI) / 360) * aspect);
  // On a narrow screen the outer orbits may run past the edge; a bigger
  // scene is worth more than showing every orbit at once.
  const dist = aspect < 1 ? Math.max(15, fit * 0.66) : Math.max(15, fit);
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

function placeLabel(el, pos, alpha) {
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
  const left = x > W * 0.62;
  const tx = left ? x - 16 : x + 16;
  el.style.transform = `translate3d(${tx.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(${left ? "-100%" : "0"}, -50%)`;
  el.style.opacity = String(Math.min(a, 1));
  el.style.pointerEvents = a > 0.6 ? "auto" : "none";
  el.style.zIndex = el.matches(":hover, :focus-visible") ? "2000" : String(Math.round((1 - v3.z) * 800));
  el.classList.toggle("is-left", left);
  el._shown = true;
}

function frame(ts) {
  requestAnimationFrame(frame);
  if (!visible || !renderer || !W) return;
  const dt = Math.min((ts - lastTs) / 1000 || 0, 0.05);
  lastTs = ts;

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
    b.sprite.scale.set(1.5 * k, 1.03 * k, 1);
    b.line.material.opacity = (b.sel ? 0.95 : theme.dark ? 0.42 : 0.5) * b.ow;
    b.line.visible = b.ow > 0.01;

    placeLabel(b.el, b.pos, k);
  });

  featGroup.rotation.y = clock * 0.12;
  feats.forEach((f) => {
    f.pos.copy(f.dir).multiplyScalar(5.6 * f.fw).applyAxisAngle(THREE.Object3D.DEFAULT_UP, featGroup.rotation.y);
    placeLabel(f.el, f.pos, f.fw);
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

  bodies.forEach((b, i) => later(() => b.el.classList.add("is-stamped"), 600 + i * 140));
  const tMerge = 600 + bodies.length * 140 + 900;
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
    b.line.material.color.set(b.sel ? theme.accent : theme.muted);
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
  new MutationObserver(applyTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
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
        if (en.isIntersecting && en.intersectionRatio >= 0.4) start();
      });
    },
    { threshold: [0, 0.4] }
  ).observe(stage);

  if (window.__amadDict) setDict(window.__amadDict);
}

window.AmadScene = { setDict };

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
