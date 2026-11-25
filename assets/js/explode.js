import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/*
 * "What we build" as an exploded view (Three.js).
 *
 * One stacked block, one layer per service. When the section scrolls into
 * view the block is assembled, then it comes apart: every layer lifts off,
 * slides to its side and gets a callout. Hover a callout or a layer to
 * light it, click to pull that layer out and read about it in the panel.
 *
 * Text comes from i18n/*.json (keys build.*). Callouts are DOM buttons, the
 * same list is repeated in the side panel for keyboard and screen readers.
 */

const LAYERS = [
  { key: "web", hue: "#4cc3ff" },
  { key: "game", hue: "#ff7bbd" },
  { key: "bot", hue: "#7be07b" },
  { key: "order", hue: "#ffb36b" },
  { key: "erp", hue: "#6f8cff" },
  { key: "report", hue: "#ffd24d" },
  { key: "ai", hue: "#a47bff" },
  { key: "api", hue: "#34d3c1" },
];

const SLAB = { w: 4, h: 0.26, d: 2.7 };
const GAP_PACKED = 0.3;
const GAP_OPEN = 0.98;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let section, stage, canvas, layer, panel, replayBtn, listEl;
let renderer, camera, controls;
const scene3 = new THREE.Scene();
const root = new THREE.Group();
const slabs = [];
let dict = {};
let W = 0;
let H = 0;
let visible = false;
let started = false;
let selected = null;
let hoverKey = null;
let open = 0; // 0 packed, 1 exploded
let openTarget = 0;
let sceneTime = 0;
let timers = [];
let lastTs = 0;
let baseDist = 20;
let fitScale = 1; // grows until every callout fits inside the stage

const t = (k) => (Object.prototype.hasOwnProperty.call(dict, k) ? dict[k] : "");
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function later(fn, ms) {
  timers.push({ at: sceneTime + ms / 1000, fn });
}

// ---------- the drawing on top of each layer ----------

function topTexture(kind, hue) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 344;
  const g = c.getContext("2d");
  g.fillStyle = hue;
  g.fillRect(0, 0, 512, 344);
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.roundRect(22, 22, 468, 300, 22);
  g.fill();
  g.strokeStyle = hue;
  g.fillStyle = hue;
  g.lineWidth = 12;
  g.lineCap = "round";
  g.lineJoin = "round";
  const line = (x1, y1, x2, y2) => {
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  };
  const box = (x, y, w, h, r = 12, fill = false) => {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    fill ? g.fill() : g.stroke();
  };
  const dot = (x, y, r) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };

  switch (kind) {
    case "web": // a browser window
      box(70, 60, 372, 224, 18);
      line(70, 104, 442, 104);
      dot(98, 82, 8);
      dot(124, 82, 8);
      dot(150, 82, 8);
      box(100, 128, 150, 96, 10, true);
      line(280, 140, 410, 140);
      line(280, 176, 390, 176);
      line(280, 212, 360, 212);
      line(100, 252, 410, 252);
      break;
    case "game": { // a prize wheel
      const cx = 256;
      const cy = 172;
      const r = 118;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        line(cx, cy, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.globalAlpha = 0.45;
      g.beginPath();
      g.moveTo(cx, cy);
      g.arc(cx, cy, r, 0, Math.PI / 4);
      g.fill();
      g.globalAlpha = 1;
      dot(cx, cy, 22);
      g.beginPath();
      g.moveTo(cx - 18, 32);
      g.lineTo(cx + 18, 32);
      g.lineTo(cx, 64);
      g.closePath();
      g.fill();
      break;
    }
    case "bot": // two chat bubbles
      box(70, 60, 240, 90, 28);
      line(110, 92, 270, 92);
      line(110, 120, 220, 120);
      box(200, 180, 240, 100, 28, true);
      g.strokeStyle = "rgba(255,255,255,0.95)";
      line(240, 214, 400, 214);
      line(240, 246, 340, 246);
      break;
    case "order": // a checklist with a cart total
      for (let i = 0; i < 3; i++) {
        const y = 78 + i * 72;
        box(80, y, 44, 44, 10);
        line(150, y + 22, 330, y + 22);
        if (i < 2) {
          g.beginPath();
          g.moveTo(90, y + 22);
          g.lineTo(100, y + 34);
          g.lineTo(116, y + 10);
          g.stroke();
        }
      }
      box(360, 92, 84, 160, 14, true);
      break;
    case "erp": // a table with boxes on a shelf
      box(64, 56, 384, 232, 14);
      line(64, 108, 448, 108);
      line(192, 56, 192, 288);
      line(320, 56, 320, 288);
      line(64, 168, 448, 168);
      line(64, 228, 448, 228);
      g.globalAlpha = 0.45;
      box(64, 56, 384, 52, 14, true);
      g.globalAlpha = 1;
      break;
    case "report": // bar chart with a trend line
      line(70, 280, 450, 280);
      [90, 150, 120, 200, 170].forEach((h, i) => box(96 + i * 72, 280 - h, 44, h, 8, true));
      g.strokeStyle = "#1b1f3a";
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(118, 170);
      g.lineTo(190, 120);
      g.lineTo(262, 140);
      g.lineTo(334, 70);
      g.lineTo(406, 92);
      g.stroke();
      break;
    case "ai": // a document being scanned
      box(150, 46, 212, 252, 14);
      line(186, 100, 326, 100);
      line(186, 140, 326, 140);
      line(186, 180, 290, 180);
      line(186, 220, 310, 220);
      g.globalAlpha = 0.5;
      box(108, 152, 296, 26, 13, true);
      g.globalAlpha = 1;
      g.beginPath(); // sparkle
      g.moveTo(410, 60);
      g.lineTo(420, 90);
      g.lineTo(450, 100);
      g.lineTo(420, 110);
      g.lineTo(410, 140);
      g.lineTo(400, 110);
      g.lineTo(370, 100);
      g.lineTo(400, 90);
      g.closePath();
      g.fill();
      break;
    case "api": { // connected nodes
      const pts = [[120, 100], [256, 70], [392, 110], [170, 250], [340, 240]];
      [[0, 1], [1, 2], [0, 3], [1, 4], [2, 4], [3, 4], [1, 3]].forEach(([a, b]) =>
        line(pts[a][0], pts[a][1], pts[b][0], pts[b][1])
      );
      pts.forEach(([x, y]) => dot(x, y, 26));
      g.fillStyle = "rgba(255,255,255,0.95)";
      pts.forEach(([x, y]) => dot(x, y, 10));
      break;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ---------- build ----------

function build() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(9, 6.5, 11);

  scene3.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(4, 10, 6);
  scene3.add(sun);
  const rim = new THREE.DirectionalLight(0x9fb4ff, 1.2);
  rim.position.set(-6, 2, -6);
  scene3.add(rim);
  scene3.add(root);

  const geo = new THREE.BoxGeometry(SLAB.w, SLAB.h, SLAB.d);
  const edgeGeo = new THREE.EdgesGeometry(geo);
  const n = LAYERS.length;

  LAYERS.forEach((L, i) => {
    const side = new THREE.MeshStandardMaterial({
      color: L.hue,
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
      opacity: 0.92,
    });
    const top = new THREE.MeshStandardMaterial({
      map: topTexture(L.key, L.hue),
      roughness: 0.5,
      metalness: 0,
      transparent: true,
      opacity: 1,
    });
    const bottom = side.clone();
    // box faces: +x, -x, +y, -y, +z, -z
    const mesh = new THREE.Mesh(geo, [side, side, top, bottom, side, side]);
    const edges = new THREE.LineSegments(
      edgeGeo,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
    );
    mesh.add(edges);
    mesh.userData.key = L.key;

    // callout: a leader line from the layer edge out to the label
    const dir = i % 2 === 0 ? 1 : -1;
    const leader = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: L.hue, transparent: true, opacity: 0 })
    );
    root.add(mesh, leader);

    const el = document.createElement("button");
    el.type = "button";
    el.className = "xp-label";
    el.style.setProperty("--hue", L.hue);
    el.setAttribute("data-k", L.key);
    el.innerHTML = '<span class="xp-num"></span><span class="xp-name"></span>';
    el.querySelector(".xp-num").textContent = String(i + 1).padStart(2, "0");
    layer.appendChild(el);

    slabs.push({
      ...L,
      i,
      dir,
      mesh,
      side,
      top,
      bottom,
      edges,
      leader,
      el,
      lift: 0, // pulled-out amount when selected
      glow: 0,
      fade: 1,
      packedY: (n - 1 - i) * GAP_PACKED - ((n - 1) * GAP_PACKED) / 2,
      openY: (n - 1 - i) * GAP_OPEN - ((n - 1) * GAP_OPEN) / 2,
    });
  });

  controls = new OrbitControls(camera, canvas);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = 1.35;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 0.5;
  canvas.style.touchAction = "pan-y";
}

function resize() {
  W = stage.clientWidth;
  H = stage.clientHeight;
  if (!W || !H) return;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  // keep the whole open stack (about 9 units tall, 9 wide with callouts) in view
  const vFit = 5.6 / Math.tan((camera.fov * Math.PI) / 360);
  const hFit = (camera.aspect < 0.8 ? 6.4 : 8.6) / (Math.tan((camera.fov * Math.PI) / 360) * camera.aspect);
  baseDist = Math.max(vFit, hFit);
  camera.position.setLength(baseDist * fitScale);
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------- frame ----------

const v = new THREE.Vector3();
const a = new THREE.Vector3();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const approach = (cur, to, k) => cur + (to - cur) * k;

function frame(ts) {
  requestAnimationFrame(frame);
  if (!visible || !W) return;
  const dt = Math.min((ts - lastTs) / 1000 || 0, 0.05);
  lastTs = ts;

  sceneTime += dt;
  for (let i = 0; i < timers.length; ) {
    if (timers[i].at <= sceneTime) timers.splice(i, 1)[0].fn();
    else i++;
  }

  open = reduceMotion ? openTarget : approach(open, openTarget, 1 - Math.pow(0.02, dt));
  const e = ease(Math.min(Math.max(open, 0), 1));
  const anyHot = selected || hoverKey;

  controls.autoRotate = !reduceMotion && !selected && !hoverKey;
  controls.update();

  let minLeft = Infinity;
  let maxRight = -Infinity;

  slabs.forEach((s) => {
    const hot = s.key === selected || s.key === hoverKey;
    s.lift = approach(s.lift, s.key === selected ? 1 : 0, 1 - Math.pow(0.001, dt));
    s.glow = approach(s.glow, hot ? 1 : 0, 1 - Math.pow(0.001, dt));
    s.fade = approach(s.fade, anyHot && !hot ? 0.28 : 1, 1 - Math.pow(0.001, dt));

    const y = s.packedY + (s.openY - s.packedY) * e;
    const x = s.dir * 0.55 * e;
    s.mesh.position.set(x, y + 0.25 * s.lift, 1.4 * s.lift); // a picked layer slides out toward the viewer
    s.mesh.rotation.y = s.dir * 0.12 * e;

    s.side.opacity = 0.92 * s.fade;
    s.bottom.opacity = 0.92 * s.fade;
    s.top.opacity = s.fade;
    s.edges.material.opacity = 0.55 * s.fade + 0.45 * s.glow;
    s.side.emissive.set(s.hue);
    s.side.emissiveIntensity = 0.45 * s.glow;

    // leader: from the layer's outer edge to the callout point
    const edgeX = x + s.dir * (SLAB.w / 2);
    const z = 1.4 * s.lift;
    const reach = camera.aspect < 0.8 ? 0.7 : 0.9; // short leaders on narrow screens
    a.set(edgeX, y + 0.25 * s.lift, z);
    v.set(edgeX + s.dir * (0.4 + reach * e), y + 0.25 * s.lift, z);
    const pos = s.leader.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z);
    pos.setXYZ(1, v.x, v.y, v.z);
    pos.needsUpdate = true;
    s.leader.geometry.computeBoundingSphere();
    s.leader.material.opacity = e * (0.35 + 0.65 * Math.max(s.glow, s.fade === 1 ? 0.4 : 0)) * s.fade;

    // callout label at the end of the leader
    v.applyMatrix4(root.matrixWorld).project(camera);
    const sx = (v.x * 0.5 + 0.5) * W;
    const sy = (-v.y * 0.5 + 0.5) * H;
    const leftSide = sx < W / 2;
    const show = e > 0.6;
    s.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(${leftSide ? "-100%" : "0"}, -50%)`;
    s.el.style.opacity = show ? String(Math.max(0.35, s.fade)) : "0";
    s.el.style.pointerEvents = show ? "auto" : "none";
    s.el.classList.toggle("is-left", leftSide);
    if (show) {
      const w = s.el.offsetWidth;
      minLeft = Math.min(minLeft, leftSide ? sx - w : sx);
      maxRight = Math.max(maxRight, leftSide ? sx : sx + w);
    }
  });

  // Pull the camera back while any callout runs past the stage edge, and
  // ease it in again once there is room to spare.
  if (maxRight > -Infinity) {
    const pad = 12;
    const over = Math.max(maxRight - (W - pad), pad - minLeft);
    if (over > 0) fitScale = Math.min(fitScale * (1 + Math.min(over, 80) * 0.0008), 2.2);
    else if (over < -30) fitScale = Math.max(fitScale * 0.997, 1);
    camera.position.setLength(baseDist * fitScale);
  }

  renderer.render(scene3, camera);
}

// ---------- story ----------

function play() {
  timers = [];
  selected = null;
  hoverKey = null;
  open = 0;
  openTarget = 0;
  refresh();
  if (reduceMotion) {
    openTarget = 1;
    return;
  }
  later(() => (openTarget = 1), 700);
}

function select(key) {
  selected = selected === key ? null : key;
  if (selected) openTarget = 1;
  refresh();
}

// ---------- text ----------

function refresh() {
  if (!slabs.length) return;
  slabs.forEach((s) => {
    s.el.querySelector(".xp-name").textContent = t(`build.${s.key}.name`);
    s.el.classList.toggle("is-selected", s.key === selected);
  });

  listEl.querySelectorAll("button").forEach((b) => {
    const k = b.getAttribute("data-k");
    b.querySelector(".xp-item-name").textContent = t(`build.${k}.name`);
    b.setAttribute("aria-pressed", k === selected ? "true" : "false");
  });

  const title = panel.querySelector(".xp-detail-title");
  const text = panel.querySelector(".xp-detail-text");
  const bullets = panel.querySelector(".xp-detail-list");
  const detail = panel.querySelector(".xp-detail");
  bullets.textContent = "";
  if (selected) {
    detail.style.setProperty("--hue", LAYERS.find((L) => L.key === selected).hue);
    title.textContent = t(`build.${selected}.name`);
    text.textContent = t(`build.${selected}.desc`);
    t(`build.${selected}.points`)
      .split("|")
      .filter(Boolean)
      .forEach((p) => {
        const li = document.createElement("li");
        li.textContent = p;
        bullets.appendChild(li);
      });
    detail.setAttribute("data-kind", "item");
  } else {
    detail.style.removeProperty("--hue");
    title.textContent = t("build.hintTitle");
    text.textContent = t("build.hint");
    detail.setAttribute("data-kind", "hint");
  }
}

function buildList() {
  LAYERS.forEach((L, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "xp-item";
    b.style.setProperty("--hue", L.hue);
    b.setAttribute("data-k", L.key);
    b.innerHTML = '<span class="xp-num"></span><span class="xp-item-name"></span>';
    b.querySelector(".xp-num").textContent = String(i + 1).padStart(2, "0");
    li.appendChild(b);
    listEl.appendChild(li);
  });
}

// ---------- events ----------

function pick(e) {
  const r = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(slabs.map((s) => s.mesh), false)[0];
  return hit ? hit.object.userData.key : null;
}

function bind() {
  let down = null;
  canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return; // a drag, not a click
    const k = pick(e);
    if (k) select(k);
    else if (selected) select(selected);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    const k = pick(e);
    hoverKey = k;
    canvas.style.cursor = k ? "pointer" : "grab";
  });
  canvas.addEventListener("pointerleave", () => (hoverKey = null));

  const onHover = (root) => {
    root.addEventListener("pointerover", (e) => {
      const b = e.target.closest("[data-k]");
      if (b) hoverKey = b.getAttribute("data-k");
    });
    root.addEventListener("pointerout", () => (hoverKey = null));
    root.addEventListener("focusin", (e) => {
      const b = e.target.closest("[data-k]");
      if (b) hoverKey = b.getAttribute("data-k");
    });
    root.addEventListener("focusout", () => (hoverKey = null));
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-k]");
      if (b) select(b.getAttribute("data-k"));
    });
  };
  onHover(layer);
  onHover(listEl);

  section.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selected) select(selected);
  });
  replayBtn.addEventListener("click", play);
  new ResizeObserver(resize).observe(stage);
}

function setDict(d) {
  dict = d || {};
  refresh();
}

function init() {
  section = document.getElementById("offerings");
  stage = document.getElementById("xpStage");
  canvas = document.getElementById("xpCanvas");
  layer = document.getElementById("xpLayer");
  panel = document.getElementById("xpPanel");
  replayBtn = document.getElementById("xpReplay");
  listEl = document.getElementById("xpList");
  if (!section || !stage || !canvas || !layer || !panel || !replayBtn || !listEl) return;

  buildList();
  try {
    build();
  } catch (err) {
    console.error(err);
    section.setAttribute("data-fallback", "true");
    refresh();
    return;
  }
  bind();
  resize();
  requestAnimationFrame(frame);

  new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        visible = en.isIntersecting;
        if (!started && en.isIntersecting && en.intersectionRatio >= 0.5) {
          started = true;
          play();
        }
      });
    },
    { threshold: [0, 0.5] }
  ).observe(stage);

  if (window.__amadDict) setDict(window.__amadDict);
}

window.AmadExplode = { setDict };

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
