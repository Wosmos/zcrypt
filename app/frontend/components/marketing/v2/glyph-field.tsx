"use client";

import { useEffect, useRef } from "react";

/**
 * A field of ciphertext glyphs behind the hero, in WebGL.
 *
 * Hex characters drift upward and part around the cursor, the way dust moves
 * in a beam of light. It is atmosphere, not a diagram: the one WebGL element
 * on the page, kept cheap on purpose. One draw call, a 4x4 glyph atlas, a
 * few hundred points on phones and about a thousand on desktop.
 *
 * Three.js is imported lazily so it never lands in the critical path, the
 * loop pauses when the hero is off screen or the tab is hidden, and reduced
 * motion gets a single still frame.
 */
export function GlyphField() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      const THREE = await import("three");
      if (cancelled) return;

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const mobile = window.matchMedia("(max-width: 760px)").matches;
      const COUNT = mobile ? 380 : 1100;

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
      renderer.setClearColor(0x000000, 0);
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.z = 14;

      // Glyph atlas: sixteen hex characters on a 4x4 sheet.
      const atlas = document.createElement("canvas");
      atlas.width = atlas.height = 256;
      const g = atlas.getContext("2d")!;
      g.fillStyle = "#e6fbfd";
      g.font = "600 44px ui-monospace, Menlo, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      "0123456789abcdef".split("").forEach((ch, i) => {
        g.fillText(ch, (i % 4) * 64 + 32, Math.floor(i / 4) * 64 + 32);
      });
      const tex = new THREE.CanvasTexture(atlas);

      const pos = new Float32Array(COUNT * 3);
      const tile = new Float32Array(COUNT);
      const seed = new Float32Array(COUNT);
      for (let i = 0; i < COUNT; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 30;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 18;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
        tile[i] = Math.floor(Math.random() * 16);
        seed[i] = Math.random() * 1000;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aTile", new THREE.BufferAttribute(tile, 1));
      geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));

      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uMouse: { value: new THREE.Vector2(0, 0) },
          uTex: { value: tex },
          uColor: { value: new THREE.Color(0x00d5e4) },
          uDpr: { value: renderer.getPixelRatio() },
        },
        vertexShader: /* glsl */ `
          attribute float aTile;
          attribute float aSeed;
          uniform float uTime;
          uniform vec2 uMouse;
          uniform float uDpr;
          varying float vTile;
          varying float vAlpha;
          void main() {
            vTile = aTile;
            vec3 p = position;
            // Slow upward drift with a little sway, wrapped in y.
            p.y = mod(p.y + uTime * (0.25 + fract(aSeed) * 0.35) + 9.0, 18.0) - 9.0;
            p.x += sin(uTime * 0.4 + aSeed) * 0.35;
            // Part around the cursor.
            vec2 d = p.xy - uMouse * vec2(15.0, 9.0);
            float dist = length(d);
            float push = smoothstep(4.0, 0.0, dist) * 1.6;
            p.xy += normalize(d + 0.0001) * push;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float depth = smoothstep(-6.0, 6.0, p.z);
            vAlpha = mix(0.10, 0.45, depth) * (0.6 + 0.4 * sin(uTime * 1.3 + aSeed));
            gl_PointSize = (7.0 + depth * 8.0) * uDpr * (12.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D uTex;
          uniform vec3 uColor;
          varying float vTile;
          varying float vAlpha;
          void main() {
            vec2 uv = gl_PointCoord;
            uv.y = 1.0 - uv.y;
            vec2 cell = vec2(mod(vTile, 4.0), floor(vTile / 4.0));
            vec2 tuv = (cell + uv) / 4.0;
            float a = texture2D(uTex, tuv).a;
            if (a < 0.05) discard;
            gl_FragColor = vec4(uColor, a * vAlpha);
          }
        `,
      });
      const points = new THREE.Points(geo, mat);
      scene.add(points);

      const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
      const onMove = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        mouse.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
        mouse.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);
      };
      window.addEventListener("pointermove", onMove, { passive: true });

      const resize = () => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      let raf = 0;
      let visible = true;
      let t0 = performance.now();
      const frame = () => {
        raf = 0;
        if (!visible || document.hidden) return;
        const t = (performance.now() - t0) / 1000;
        mouse.x += (mouse.tx - mouse.x) * 0.06;
        mouse.y += (mouse.ty - mouse.y) * 0.06;
        mat.uniforms.uTime.value = t;
        mat.uniforms.uMouse.value.set(mouse.x, mouse.y);
        camera.position.x = mouse.x * 0.6;
        camera.position.y = mouse.y * 0.4;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
        if (!reduce) raf = requestAnimationFrame(frame);
      };
      const kick = () => {
        if (!raf) raf = requestAnimationFrame(frame);
      };

      const io = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible) {
          t0 = performance.now() - mat.uniforms.uTime.value * 1000;
          kick();
        }
      });
      io.observe(el);
      const onVis = () => !document.hidden && kick();
      document.addEventListener("visibilitychange", onVis);
      kick();

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        ro.disconnect();
        window.removeEventListener("pointermove", onMove);
        document.removeEventListener("visibilitychange", onVis);
        geo.dispose();
        mat.dispose();
        tex.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <div ref={host} className="v2-hero-field" aria-hidden="true" />;
}
