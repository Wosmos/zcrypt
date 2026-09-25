// Direction C, The Tunnel.
//
// A Three.js tube of ciphertext panels sits behind a sticky hero. Scroll
// progress moves the camera down the tube (ScrollTrigger, scrubbed), and a
// file travels with the camera: it appears whole, splits into eight, seals
// into ciphertext, and at the end the tube forks into four branches, one per
// platform, and the pieces fly into them. HTML copy is a HUD over the canvas.
//
// Layout: 1 scene setup, 2 stations timeline, 3 HUD, 4 fallbacks and boot.

import { COPY } from "../shared/copy.js";
import { PLATFORMS, hexString } from "../shared/marks.js";
import { renderCipher } from "../shared/cipher.js";
import { renderEighty } from "../shared/eighty.js";
import { renderFeatures } from "../shared/icons.js";
import {
  nav,
  byline,
  trust,
  ctas,
  story,
  eightySection,
  featuresSection,
  cipherSection,
  plugSection,
  priceSection,
  catchSection,
  closeSection,
  footer,
  wireSticky,
  wireStrikes,
  REDUCE,
} from "../shared/sections.js";

const { gsap, ScrollTrigger, SplitText } = window;
gsap.registerPlugin(ScrollTrigger, SplitText);

const BG = 0x0c0f1a;
const CYAN = 0x00d5e4;
const MOBILE = matchMedia("(max-width: 760px)").matches;

// Tube dimensions, in scene units. The camera starts at z = 0 and flies to
// CAM_END; the main tube ends at TUBE_END where the four branches begin.
const TUBE_R = 6;
const TUBE_END = 130;
const CAM_END = -(TUBE_END - 8);
const PANELS_PER_RING = 20;
const RING_STEP = MOBILE ? 3.25 : 1.3;
const BRANCH_R = 2.6;
const BRANCH_LEN = 34;
const BRANCH_STEP = MOBILE ? 2.6 : 1.15;
const BRANCH_PANELS = 12;

// Branch directions: up-left, up-right, down-left, down-right, all leaning
// forward. Order matches PLATFORMS (GitHub, GitLab, Hugging Face, Telegram).
const BRANCH_DIRS = [
  [-1, 0.75, -1.2],
  [1, 0.75, -1.2],
  [-1, -0.75, -1.2],
  [1, -0.75, -1.2],
];

/* ------------------------------------------------------------------ */
/* 1. Scene                                                             */
/* ------------------------------------------------------------------ */

// One 4x4 atlas of hex panels. Each instance picks a tile, so the wall never
// repeats obviously even though it is a single texture and a single draw.
function makeAtlas(THREE) {
  const size = 1024;
  const tiles = 4;
  const t = size / tiles;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#141829";
  ctx.fillRect(0, 0, size, size);
  let seed = 11;
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const x0 = tx * t;
      const y0 = ty * t;
      ctx.fillStyle = "#10142a";
      ctx.fillRect(x0 + 3, y0 + 3, t - 6, t - 6);
      ctx.strokeStyle = "rgba(0,213,228,0.22)";
      ctx.lineWidth = 3;
      ctx.strokeRect(x0 + 4, y0 + 4, t - 8, t - 8);
      ctx.font = "600 27px ui-monospace, Menlo, Consolas, monospace";
      ctx.textBaseline = "top";
      for (let row = 0; row < 7; row++) {
        const a = 0.35 + ((seed * 7919) % 60) / 100;
        ctx.fillStyle = `rgba(0,213,228,${a.toFixed(2)})`;
        ctx.fillText(hexString(14, seed), x0 + 18, y0 + 20 + row * 32);
        seed += 17;
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// The file card the camera carries down the tube.
function makeFileCard(THREE) {
  const c = document.createElement("canvas");
  c.width = 768;
  c.height = 512;
  const ctx = c.getContext("2d");
  const r = 36;
  ctx.fillStyle = "#1c2039";
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, c.height, r);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.fillStyle = "#7a80a1";
  ctx.font = "500 22px Poppins, system-ui, sans-serif";
  ctx.fillText("ON YOUR DEVICE", 48, 68);
  ctx.textAlign = "right";
  ctx.font = "500 24px ui-monospace, Menlo, monospace";
  ctx.fillText("1.2 GB", c.width - 48, 68);
  ctx.textAlign = "left";
  ctx.fillStyle = "#f0f2f8";
  ctx.font = "600 46px Poppins, system-ui, sans-serif";
  ctx.fillText("wedding-photos.zip", 48, 156);
  ctx.fillStyle = "#363c5c";
  [0.92, 0.74, 0.86, 0.6].forEach((w, i) => {
    ctx.beginPath();
    ctx.roundRect(48, 210 + i * 40, (c.width - 96) * w, 14, 7);
    ctx.fill();
  });
  ctx.fillStyle = "rgba(0,213,228,0.55)";
  ctx.font = "500 22px ui-monospace, Menlo, monospace";
  ctx.fillText(hexString(40, 3), 48, 440);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Soft radial glow sprite texture.
function makeGlow(THREE, inner = 0.05) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(0,213,228,1)");
  g.addColorStop(inner, "rgba(0,213,228,0.9)");
  g.addColorStop(0.4, "rgba(0,213,228,0.25)");
  g.addColorStop(1, "rgba(0,213,228,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function buildScene(THREE, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MOBILE ? 1.5 : 2));
  renderer.setClearColor(BG, 0);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, 0.02);

  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
  camera.position.set(0, 0, 0);
  scene.add(camera);

  // Everything static in the world sits in `world` so cursor sway can tilt
  // the world instead of the camera; that keeps camera-local maths simple.
  const world = new THREE.Group();
  scene.add(world);

  /* Walls: main tube plus four branches, one InstancedMesh. */
  const atlas = makeAtlas(THREE);
  const wallMat = new THREE.MeshBasicMaterial({
    map: atlas,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    fog: true,
  });
  // Per-instance tile offset into the 4x4 atlas.
  wallMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec2 aTile;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = vMapUv * 0.25 + aTile;");
  };
  wallMat.customProgramCacheKey = () => "tunnel-wall";

  const mainRings = Math.floor((TUBE_END - 2) / RING_STEP);
  const branchRings = Math.floor(BRANCH_LEN / BRANCH_STEP);
  const count = mainRings * PANELS_PER_RING + branchRings * BRANCH_PANELS * 4;

  const panelGeo = new THREE.PlaneGeometry(1.62, 1.12);
  const tileAttr = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  panelGeo.setAttribute("aTile", tileAttr);
  const walls = new THREE.InstancedMesh(panelGeo, wallMat, count);

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3(1, 1, 1);
  const color = new THREE.Color();
  const up = new THREE.Vector3(0, 0, 1);
  let i = 0;
  let rnd = 7;
  const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);

  const place = (center, axisQuat, radius, panels, twist) => {
    for (let p = 0; p < panels; p++) {
      const a = (p / panels) * Math.PI * 2 + twist;
      // Panel on the ring, facing the axis.
      const local = new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
      local.applyQuaternion(axisQuat);
      pos.copy(center).add(local);
      // Orientation: plane normal points at the ring centre.
      const normal = local.clone().negate().normalize();
      quat.setFromUnitVectors(up, normal);
      m.compose(pos, quat, scl);
      walls.setMatrixAt(i, m);
      color.setHSL(0.51, 0.6, 0.42 + rand() * 0.45);
      walls.setColorAt(i, color);
      tileAttr.setXY(i, Math.floor(rand() * 4) * 0.25, Math.floor(rand() * 4) * 0.25);
      i++;
    }
  };

  const identity = new THREE.Quaternion();
  for (let r = 0; r < mainRings; r++) {
    place(new THREE.Vector3(0, 0, -2 - r * RING_STEP), identity, TUBE_R, PANELS_PER_RING, r * 0.11);
  }

  const forkOrigin = new THREE.Vector3(0, 0, -TUBE_END);
  const branches = BRANCH_DIRS.map((d) => {
    const dir = new THREE.Vector3(...d).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
    for (let r = 0; r < branchRings; r++) {
      const center = forkOrigin.clone().addScaledVector(dir, 1 + r * BRANCH_STEP);
      place(center, q, BRANCH_R, BRANCH_PANELS, r * 0.2);
    }
    return { dir, q, mouth: forkOrigin.clone().addScaledVector(dir, 4.2) };
  });
  walls.instanceMatrix.needsUpdate = true;
  walls.instanceColor.needsUpdate = true;
  world.add(walls);

  /* Glow at the far end of the main tube and at each branch mouth. */
  const glowTex = makeGlow(THREE);
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, color: CYAN, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const endGlow = new THREE.Sprite(glowMat);
  endGlow.position.set(0, 0, -TUBE_END - 6);
  endGlow.scale.setScalar(26);
  world.add(endGlow);

  const mouthGlows = branches.map((b) => {
    const s = new THREE.Sprite(glowMat.clone());
    s.material.opacity = 0;
    s.position.copy(b.mouth);
    s.scale.setScalar(7);
    world.add(s);
    // A cyan ring at the mouth so the four openings read as openings.
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(BRANCH_R - 0.12, BRANCH_R + 0.12, 48),
      new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0, side: THREE.DoubleSide, fog: false }),
    );
    ring.position.copy(forkOrigin).addScaledVector(b.dir, 1.2);
    ring.quaternion.copy(b.q);
    world.add(ring);
    return { sprite: s, ring };
  });

  /* The file, carried by the camera. */
  const carry = new THREE.Group();
  carry.position.set(0, -0.15, -5);
  camera.add(carry);

  const cardTex = makeFileCard(THREE);
  const slabMat = new THREE.MeshBasicMaterial({ map: cardTex, transparent: true, opacity: 0, fog: false });
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), slabMat);
  slab.scale.setScalar(0.001);
  carry.add(slab);

  // Eight pieces in a 4x2 grid. Same footprint as the slab, so the split
  // reads as the slab coming apart. Each piece maps one atlas tile.
  const pieceMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, opacity: 1, fog: false, color: new THREE.Color(0.22, 0.25, 0.4) });
  const edgeMat = new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0 });
  const pieces = [];
  const piecesGroup = new THREE.Group();
  piecesGroup.visible = false;
  carry.add(piecesGroup);
  for (let k = 0; k < 8; k++) {
    const geo = new THREE.BoxGeometry(0.58, 0.78, 0.08);
    const uv = geo.attributes.uv;
    const ox = (k % 4) * 0.25;
    const oy = Math.floor(k / 4) * 0.5;
    for (let u = 0; u < uv.count; u++) uv.setXY(u, uv.getX(u) * 0.25 + ox, uv.getY(u) * 0.25 + oy);
    const mesh = new THREE.Mesh(geo, pieceMat);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat);
    mesh.add(edges);
    const gx = (k % 4) - 1.5;
    const gy = 0.5 - Math.floor(k / 4);
    mesh.position.set(gx * 0.6, gy * 0.8, 0);
    mesh.userData.home = { x: gx * 0.6, y: gy * 0.8 };
    piecesGroup.add(mesh);
    pieces.push(mesh);
  }

  const twist = { z: 0 };
  return { renderer, scene, camera, world, walls, twist, carry, slab, slabMat, piecesGroup, pieces, pieceMat, edgeMat, branches, mouthGlows, endGlow, count };
}

/* ------------------------------------------------------------------ */
/* 2. Stations timeline (one scrubbed timeline, 0 to 1 = full runway)   */
/* ------------------------------------------------------------------ */

function buildTimeline(S, hud) {
  const tl = gsap.timeline({ defaults: { ease: "none" }, paused: true });

  // Centring transforms live in GSAP so the timeline's y/scale compose with
  // them instead of replacing the CSS transform.
  gsap.set(hud.s0, { yPercent: -50 });
  gsap.set(hud.s4, { xPercent: -50 });
  gsap.set(hud.marks, { xPercent: -50, yPercent: -50 });

  // Camera flight, then hold for the fork.
  tl.to(S.camera.position, { z: CAM_END, duration: 0.8 }, 0);
  // A gentle twist of the world while flying, so the walls stream past
  // with some motion in them rather than sliding straight.
  tl.to(S.twist, { z: 0.9, duration: 0.8 }, 0);

  // HUD helpers: fade a station in at `a`, out at `b`.
  const show = (el, a, b, y = 26) => {
    tl.fromTo(el, { autoAlpha: 0, y }, { autoAlpha: 1, y: 0, duration: 0.04, ease: "power2.out" }, a);
    if (b != null) tl.to(el, { autoAlpha: 0, y: -18, duration: 0.035, ease: "power2.in" }, b);
  };

  // Station 0: hero. Visible via CSS from first paint (a zero-duration set
  // at time 0 of a scrubbed timeline gets reverted at progress 0), so the
  // timeline only ever fades it out.
  tl.to(hud.s0, { autoAlpha: 0, y: -40, duration: 0.07, ease: "power2.in" }, 0.06);
  tl.fromTo(hud.hint, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.03 }, 0.14);
  tl.to(hud.hint, { autoAlpha: 0, duration: 0.03 }, 0.76);

  // Station 1: the slab arrives ahead of the camera.
  tl.to(S.slab.scale, { x: 1, y: 1, z: 1, duration: 0.06, ease: "back.out(1.4)" }, 0.15);
  tl.to(S.slabMat, { opacity: 1, duration: 0.05 }, 0.15);
  tl.to(S.slab.rotation, { y: -0.25, x: 0.08, duration: 0.2 }, 0.15);
  show(hud.s1, 0.17, 0.35);

  // Station 2: split. Slab out, pieces in and apart.
  tl.to(S.slabMat, { opacity: 0, duration: 0.03 }, 0.37);
  tl.set(S.piecesGroup, { visible: true }, 0.37);
  tl.set(S.piecesGroup.rotation, { y: -0.25, x: 0.08 }, 0.37);
  S.pieces.forEach((p, k) => {
    const { x, y } = p.userData.home;
    tl.to(p.position, { x: x * 2.1, y: y * 1.9, z: ((k * 37) % 5) * 0.12 - 0.25, duration: 0.1, ease: "power2.inOut" }, 0.39);
    tl.to(p.rotation, { z: (((k * 53) % 9) - 4) * 0.04, y: (((k * 29) % 7) - 3) * 0.05, duration: 0.1 }, 0.39);
  });
  show(hud.s2, 0.39, 0.55);

  // Station 3: seal. Pieces light up as ciphertext, edges glow.
  tl.to(S.pieceMat.color, { r: 1, g: 1, b: 1, duration: 0.07, ease: "power2.inOut" }, 0.58);
  tl.to(S.edgeMat, { opacity: 1, duration: 0.05 }, 0.6);
  S.pieces.forEach((p, k) => {
    tl.to(p.scale, { x: 1.08, y: 1.08, z: 1.08, duration: 0.03, ease: "power2.out" }, 0.58 + k * 0.004);
    tl.to(p.scale, { x: 1, y: 1, z: 1, duration: 0.04, ease: "power2.in" }, 0.62 + k * 0.004);
  });
  show(hud.s3, 0.59, 0.76);

  // Station 4: fork. Camera is parked at CAM_END with identity rotation, so a
  // world point in camera space is simply world minus camera position, and
  // in carry space that minus the carry offset.
  const camEnd = { x: 0, y: 0, z: CAM_END };
  S.pieces.forEach((p, k) => {
    const b = S.branches[k % 4];
    const side = k < 4 ? -1 : 1;
    const target = b.mouth.clone().addScaledVector(b.dir, 1.6 + (k < 4 ? 0 : 1.1));
    const local = {
      x: target.x - camEnd.x - S.carry.position.x + side * 0.3,
      y: target.y - camEnd.y - S.carry.position.y + side * 0.2,
      z: target.z - camEnd.z - S.carry.position.z,
    };
    tl.to(p.position, { ...local, duration: 0.14, ease: "power2.in" }, 0.8 + (k % 4) * 0.008);
    tl.to(p.scale, { x: 0.55, y: 0.55, z: 0.55, duration: 0.14, ease: "power2.in" }, 0.8 + (k % 4) * 0.008);
  });
  S.mouthGlows.forEach((g, k) => {
    tl.to(g.sprite.material, { opacity: 0.85, duration: 0.05 }, 0.84 + k * 0.01);
    tl.to(g.ring.material, { opacity: 0.9, duration: 0.05 }, 0.84 + k * 0.01);
  });
  tl.to(S.endGlow.material, { opacity: 0.2, duration: 0.1 }, 0.8);
  show(hud.s4, 0.86, null);
  hud.marks.forEach((el, k) => {
    tl.fromTo(el, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.05, ease: "back.out(2)" }, 0.88 + k * 0.012);
  });

  // Rail dots.
  const stops = [0, 0.17, 0.39, 0.59, 0.86];
  hud.rail.forEach((dot, k) => {
    tl.add(() => dot.classList.add("on"), Math.max(stops[k], 0.001));
    if (k > 0) tl.add(() => dot.classList.remove("on"), stops[k] - 0.001);
  });
  hud.rail[0].classList.add("on");

  // Pad to a full unit so progress maps 1:1.
  tl.to({}, { duration: 0.001 }, 1);
  return tl;
}

/* ------------------------------------------------------------------ */
/* 3. HUD, projection, render loop                                      */
/* ------------------------------------------------------------------ */

function collectHud() {
  const marksRoot = document.getElementById("marks");
  marksRoot.innerHTML = PLATFORMS.map((p) => `<span class="mark" data-k="${p.key}">${p.svg}${p.label}</span>`).join("");
  return {
    s0: document.querySelector(".s0"),
    s1: document.querySelector(".s1"),
    s2: document.querySelector(".s2"),
    s3: document.querySelector(".s3"),
    s4: document.querySelector(".s4"),
    hint: document.getElementById("hint"),
    marks: [...marksRoot.querySelectorAll(".mark")],
    rail: [...document.querySelectorAll("#rail span")],
  };
}

function startLoop(THREE, S, hud, hero) {
  const { renderer, scene, camera, world, branches } = S;
  const canvas = renderer.domElement;
  let running = false;
  let raf = 0;
  let inView = true;
  let w = 0;
  let h = 0;

  const resize = () => {
    w = hero.clientWidth;
    h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener("resize", resize);

  // Cursor sway tilts the world, not the camera (see buildScene).
  const swayX = gsap.quickTo(world.rotation, "y", { duration: 0.9, ease: "power2.out" });
  const swayY = gsap.quickTo(world.rotation, "x", { duration: 0.9, ease: "power2.out" });
  if (!MOBILE) {
    addEventListener("pointermove", (e) => {
      swayX((e.clientX / innerWidth - 0.5) * 0.14);
      swayY((e.clientY / innerHeight - 0.5) * -0.1);
    });
  }

  const v = new THREE.Vector3();
  S.drift = 0;
  let logged = false;
  const frame = (t) => {
    if (!running) return;
    // Idle drift so the walls breathe while the visitor reads.
    S.drift += 0.0006;
    world.rotation.z = S.twist.z + S.drift;
    renderer.render(scene, camera);
    if (!logged) {
      logged = true;
      console.info(`[tunnel] instances=${S.count} drawCalls=${renderer.info.render.calls} triangles=${renderer.info.render.triangles}`);
    }
    // Project the branch mouths to screen for the platform labels.
    branches.forEach((b, k) => {
      const el = hud.marks[k];
      if (el.style.visibility === "hidden") return;
      v.copy(b.mouth).applyMatrix4(world.matrixWorld).project(camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      el.style.left = x.toFixed(1) + "px";
      el.style.top = y.toFixed(1) + "px";
    });
    raf = requestAnimationFrame(frame);
  };
  const start = () => {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  };
  const stop = () => {
    running = false;
    cancelAnimationFrame(raf);
  };
  const sync = () => (inView && document.visibilityState === "visible" ? start() : stop());

  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    sync();
  }).observe(hero);
  document.addEventListener("visibilitychange", sync);
  sync();
  return { canvas };
}

/* ------------------------------------------------------------------ */
/* 4. Fallbacks and boot                                                */
/* ------------------------------------------------------------------ */

function mountShared() {
  document.getElementById("nav").innerHTML = nav();
  document.getElementById("byline").innerHTML = byline();
  document.getElementById("ctas").innerHTML = ctas();
  document.getElementById("trust").innerHTML = trust();
  document.getElementById("after").innerHTML =
    story() + eightySection() + featuresSection() + cipherSection() + plugSection() + priceSection() + catchSection() + closeSection() + footer();

  renderEighty(document.querySelector("[data-eighty]"), { reduce: REDUCE });
  renderFeatures(document.querySelector("[data-features]"), { reduce: REDUCE });
  renderCipher(document.querySelector("[data-cipher]"));
  wireStrikes(REDUCE);
  wireSticky("#hero");
}

function staticMode(hud) {
  document.documentElement.classList.add("static");
  // Everything visible, nothing pinned, all the marks in a row.
  [hud.s0, hud.s1, hud.s2, hud.s3, hud.s4, ...hud.marks].forEach((el) => {
    el.style.opacity = "1";
    el.style.visibility = "visible";
    el.style.transform = "none";
  });
}

function heroType() {
  const h1 = document.getElementById("h1");
  const sr = document.createElement("span");
  sr.className = "sr-only";
  sr.textContent = h1.textContent;
  h1.after(sr);
  const split = SplitText.create(h1, { type: "words,chars", charsClass: "char", aria: "hidden" });
  gsap.from(split.chars, {
    yPercent: 60,
    opacity: 0,
    duration: 0.7,
    ease: "power3.out",
    stagger: { each: 0.012, from: "start" },
    delay: 0.1,
  });
  gsap.from(["#byline", ".s0 .lede", "#ctas", "#trust", ".scroll-cue"], {
    y: 18,
    opacity: 0,
    duration: 0.7,
    ease: "power2.out",
    stagger: 0.08,
    delay: 0.45,
  });
}

async function boot() {
  mountShared();
  const hud = collectHud();
  const hero = document.getElementById("hero");
  const canvas = document.getElementById("tube");

  const gl = !REDUCE && (canvas.getContext("webgl2") || canvas.getContext("webgl"));
  if (!gl) {
    staticMode(hud);
    return;
  }

  let THREE;
  try {
    THREE = await import("three");
  } catch {
    staticMode(hud);
    return;
  }

  const S = buildScene(THREE, canvas);
  const tl = buildTimeline(S, hud);
  startLoop(THREE, S, hud, hero);

  const mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", () => {
    // Split after the fonts land so the line breaks SplitText measures are
    // the ones Satoshi will actually produce.
    document.fonts.ready.then(heroType);
    const st = ScrollTrigger.create({
      trigger: "#hero-wrap",
      start: "top top",
      end: "bottom bottom",
      scrub: 0.8,
      animation: tl,
      invalidateOnRefresh: true,
    });
    // Debug aid: ?p=0.5 opens the page at half the runway.
    const p = parseFloat(new URLSearchParams(location.search).get("p"));
    if (p >= 0 && p <= 1) {
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        scrollTo(0, p * (document.getElementById("hero-wrap").offsetHeight - innerHeight));
      });
    }
    return () => st.kill();
  });
  mm.add("(prefers-reduced-motion: reduce)", () => {
    // Reached only if the preference flips after load.
    tl.progress(1);
    staticMode(hud);
  });
}

boot();
