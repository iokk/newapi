/*!
 * Bozzii AI (https://ai.bozzii.com/) — 1:1 Foxoke Interactive Frontend Engine
 * Includes:
 * - WebGL2 + 2D Canvas Fallback ASCII Field Shader (Hero & Horizon presets)
 * - Hero Pointer Glow physics tracker
 * - Hero Mode Tabs (Text LLM / Image / Video) + Auto-rotation + Media Layer switcher
 * - Interactive Model Selector Combobox populated with Bozzii AI models
 * - Scroll Reveal Observer & Animated Stat Counters
 * - 12-item Interactive FAQ Accordion
 * - One-click Copy with Toast feedback
 * - Command Palette Modal (⌘K)
 * - Dark / Light Theme Toggle + Bilingual (简 / EN) Switch + New API iframe postMessage sync
 */
(function () {
  "use strict";

  // 1. Detect iframe mode inside ai.bozzii.com New API console
  try {
    if (window.self !== window.top) {
      document.documentElement.setAttribute("data-in-iframe", "true");
    }
  } catch (e) {
    document.documentElement.setAttribute("data-in-iframe", "true");
  }

  // 2. WebGL2 + 2D Canvas ASCII Field Shader (1:1 from Foxoke 17306 chunk)
  const GLYPHS = " =+xX0S8#@";
  function hexToRgb(hex) {
    const n = Number.parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function calcHorizon(aspect, progress, apex) {
    const r = apex + (1 - progress) * 0.4;
    const a = 0.54 * aspect;
    const i = 1 - r;
    const radius = (a * a + i * i) / (2 * i);
    return { cy: r + radius, radius: radius };
  }
  const VERT_SRC = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
  const FRAG_SRC = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uCell;
uniform float uTime;
uniform sampler2D uAtlas;
uniform float uGlyphs;
uniform vec3 uColors[4];
uniform float uDensity, uGlyphOpacity, uGlow, uFlicker, uSoftness, uScale;
uniform float uFlow, uGradientOpacity, uGrain, uVariation, uScramble;
uniform vec3 uPointer;
uniform int uShape;
uniform vec2 uHorizon;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v / 0.875;
}
vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0) * 3.0;
  if (t < 1.0) return mix(uColors[0], uColors[1], t);
  if (t < 2.0) return mix(uColors[1], uColors[2], t - 1.0);
  return mix(uColors[2], uColors[3], t - 2.0);
}
vec3 field(vec2 uv, float t, bool detail) {
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  vec2 drift = vec2(t * uFlow * 0.12, -t * uFlow * 0.04);
  float n = detail ? fbm(p * uScale * uVariation * 0.25 + drift) : 0.5;
  if (uShape == 0) {
    float d = length(p - vec2(0.0, uHorizon.x));
    float r = uHorizon.y;
    float soft = 0.03 + uSoftness * 0.08;
    float inside = smoothstep(r + soft, r - soft, d);
    float depth = clamp((r - d) / 0.6, 0.0, 1.0);
    float halo = exp(-max(d - r, 0.0) * 9.0) * uGlow;
    float body = inside * (1.0 - depth * 0.7);
    return vec3(body * (0.55 + 0.45 * n) + halo * 0.5, depth, body + halo);
  }
  float cloud = smoothstep(0.32, 0.86, n) * (1.0 - uv.y * 0.55);
  return vec3(cloud, n, cloud);
}
void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 cell = floor(frag / uCell);
  vec2 cellUv = (cell + 0.5) * uCell / uRes;
  vec2 local = fract(frag / uCell);
  vec3 f = field(cellUv, uTime, true);
  float flick = 1.0 - uFlicker + uFlicker * 2.0 * hash(cell + floor(uTime * 6.0));
  float v = clamp(f.x * flick, 0.0, 1.0);
  float idx = floor(v * uDensity * (uGlyphs - 1.0) + 0.5);
  if (uPointer.z > 0.5 && idx > 0.0) {
    vec2 dp = (cellUv - uPointer.xy) * vec2(uRes.x / uRes.y, 1.0);
    if (length(dp) < uScramble * uRes.x / uRes.y) {
      idx = 1.0 + floor(hash(cell + floor(uTime * 14.0)) * (uGlyphs - 1.0));
    }
  }
  float glyph = texture(uAtlas, vec2((idx + local.x) / uGlyphs, local.y)).a;
  vec3 smoothF = uShape == 0 ? field(frag / uRes, uTime, false) : f;
  vec3 col = ramp(f.y);
  float glyphA = glyph * uGlyphOpacity * (0.35 + v);
  float gradA = smoothF.z * uGradientOpacity * 0.62;
  float grain = (hash(frag + fract(uTime * 7.0) * 91.0) - 0.5) * uGrain;
  float a = clamp(gradA + glyphA + grain * step(0.01, gradA), 0.0, 1.0);
  vec3 rgb = mix(ramp(smoothF.y), mix(col, vec3(1.0), uGlow), glyphA / max(a, 1e-4));
  outColor = vec4(rgb * a, a);
}`;

  function hash2d(x, y) {
    let o = (123.34 * x) % 1;
    let r = (456.21 * y) % 1;
    if (o < 0) o += 1;
    if (r < 0) r += 1;
    const a = o * (o + 45.32) + r * (r + 45.32);
    const i = ((o += a) * (r += a)) % 1;
    return i < 0 ? i + 1 : i;
  }

  function createAsciiField(canvas, cfg) {
    const glBackend = (function () {
      const gl = canvas.getContext("webgl2", {
        premultipliedAlpha: true,
        antialias: false,
        alpha: true,
        powerPreference: "low-power",
      });
      if (!gl) return null;
      const compile = (type, src) => {
        const s = gl.createShader(type);
        if (!s) return null;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      };
      const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
      const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
      const prog = gl.createProgram();
      if (!vs || !fs || !prog) return null;
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const tex = gl.createTexture();
      let cellPx = cfg.cellSize;
      let aspect = 1;

      const setLook = (look) => {
        gl.uniform3fv(gl.getUniformLocation(prog, "uColors"), new Float32Array(look.colors.flatMap(hexToRgb)));
        gl.uniform1f(gl.getUniformLocation(prog, "uDensity"), look.density);
        gl.uniform1f(gl.getUniformLocation(prog, "uGlyphOpacity"), look.glyphOpacity);
        gl.uniform1f(gl.getUniformLocation(prog, "uGlow"), look.glow);
        gl.uniform1f(gl.getUniformLocation(prog, "uGradientOpacity"), look.gradientOpacity);
      };

      gl.uniform1i(gl.getUniformLocation(prog, "uAtlas"), 0);
      gl.uniform1f(gl.getUniformLocation(prog, "uGlyphs"), GLYPHS.length);
      gl.uniform1f(gl.getUniformLocation(prog, "uFlicker"), cfg.flicker);
      gl.uniform1f(gl.getUniformLocation(prog, "uSoftness"), cfg.softness);
      gl.uniform1f(gl.getUniformLocation(prog, "uScale"), cfg.scale);
      gl.uniform1f(gl.getUniformLocation(prog, "uFlow"), cfg.flow);
      gl.uniform1f(gl.getUniformLocation(prog, "uGrain"), cfg.grain);
      gl.uniform1f(gl.getUniformLocation(prog, "uVariation"), cfg.variation);
      gl.uniform1f(gl.getUniformLocation(prog, "uScramble"), cfg.scrambleRadius);
      gl.uniform1i(gl.getUniformLocation(prog, "uShape"), +(cfg.shape !== "horizon"));
      setLook(cfg);

      const uRes = gl.getUniformLocation(prog, "uRes");
      const uCell = gl.getUniformLocation(prog, "uCell");
      const uTime = gl.getUniformLocation(prog, "uTime");
      const uPointer = gl.getUniformLocation(prog, "uPointer");
      const uHorizon = gl.getUniformLocation(prog, "uHorizon");

      return {
        resize(w, h, dpr) {
          canvas.width = Math.max(1, Math.round(w * dpr));
          canvas.height = Math.max(1, Math.round(h * dpr));
          aspect = w / Math.max(1, h);
          gl.viewport(0, 0, canvas.width, canvas.height);
          gl.uniform2f(uRes, canvas.width, canvas.height);
          const nextCell = cfg.cellSize * dpr;
          cellPx = nextCell;
          gl.uniform1f(uCell, cellPx);
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          const atlasSize = Math.max(8, Math.round(cellPx));
          const atlas = document.createElement("canvas");
          atlas.width = atlasSize * GLYPHS.length;
          atlas.height = atlasSize;
          const ctx2d = atlas.getContext("2d");
          if (ctx2d) {
            ctx2d.fillStyle = "#fff";
            ctx2d.textAlign = "center";
            ctx2d.textBaseline = "middle";
            ctx2d.font = `${Math.round(0.7 * atlasSize)}px 'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace`;
            for (let i = 0; i < GLYPHS.length; i += 1) {
              ctx2d.fillText(GLYPHS[i], i * atlasSize + atlasSize / 2, atlasSize / 2 + 0.04 * atlasSize);
            }
          }
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        },
        draw(t, introProgress, ptr) {
          const h = calcHorizon(aspect, introProgress, cfg.apex);
          gl.uniform2f(uHorizon, h.cy, h.radius);
          gl.uniform1f(uTime, t);
          gl.uniform3f(uPointer, ptr[0], ptr[1], ptr[2]);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
        setLook,
      };
    })();

    const backend =
      glBackend ||
      (function () {
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        let look = cfg;
        let colors = cfg.colors.map(hexToRgb);
        let W = 1,
          H = 1,
          DPR = 1;
        const sampleRamp = (t) => {
          const p = 3 * Math.min(Math.max(t, 0), 1);
          const idx = Math.min(2, Math.floor(p));
          const frac = p - idx;
          return colors[idx].map((c, k) => c + (colors[idx + 1][k] - c) * frac);
        };
        const rgbaStr = (rgb, a) => `rgb(${rgb.map((v) => Math.round(255 * v)).join(" ")} / ${a.toFixed(3)})`;
        return {
          resize(w, h, dpr) {
            W = w;
            H = h;
            DPR = dpr;
            canvas.width = Math.max(1, Math.round(w * dpr));
            canvas.height = Math.max(1, Math.round(h * dpr));
          },
          draw(t, introProgress) {
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            ctx.clearRect(0, 0, W, H);
            const aspect = W / Math.max(1, H);
            const h = calcHorizon(aspect, introProgress, cfg.apex);
            if (cfg.shape === "horizon") {
              const cx = W / 2,
                cy = h.cy * H,
                rad = h.radius * H;
              const grad = ctx.createRadialGradient(cx, cy, 0.55 * rad, cx, cy, 1.06 * rad);
              grad.addColorStop(0, rgbaStr(sampleRamp(1), 0.45 * look.gradientOpacity));
              grad.addColorStop(0.8, rgbaStr(sampleRamp(0.4), 0.75 * look.gradientOpacity));
              grad.addColorStop(0.94, rgbaStr(sampleRamp(0), 0.6 * look.gradientOpacity));
              grad.addColorStop(1, rgbaStr(sampleRamp(0), 0));
              ctx.fillStyle = grad;
              ctx.fillRect(0, 0, W, H);
            }
          },
          setLook(nextLook) {
            look = nextLook;
            colors = nextLook.colors.map(hexToRgb);
          },
        };
      })();

    if (!backend) return null;

    const frameInterval = 1000 / (cfg.maxFps || 30);
    const pointer = [0, 0, 0];
    let rafId = 0;
    let playing = false;
    let lastFrame = 0;
    let simTime = 0;
    let introStart = null;

    const renderFrame = (now) => {
      let introProgress = 1;
      if (cfg.intro) {
        if (introStart === null) introStart = now;
        const p = Math.min(1, (now - introStart) / 1200);
        introProgress = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      }
      backend.draw(simTime * cfg.speed, introProgress, pointer);
    };

    const resize = () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || 520;
      backend.resize(w, h, Math.min(2, window.devicePixelRatio || 1));
      if (!playing) renderFrame(performance.now());
    };

    const loop = (now) => {
      rafId = requestAnimationFrame(loop);
      const dt = now - lastFrame;
      if (dt < frameInterval) return;
      lastFrame = now - (dt % frameInterval);
      simTime += Math.min(dt, 100) / 1000;
      renderFrame(now);
    };

    if (cfg.mouseInteraction) {
      window.addEventListener(
        "pointermove",
        (ev) => {
          if (ev.pointerType && ev.pointerType !== "mouse") return;
          const rect = canvas.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const x = (ev.clientX - rect.left) / rect.width;
          const y = (ev.clientY - rect.top) / rect.height;
          const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
          pointer[0] = x;
          pointer[1] = y;
          pointer[2] = inside ? 1 : 0;
        },
        { passive: true }
      );
    }

    resize();
    renderFrame(performance.now());

    return {
      setPlaying(next) {
        if (next === playing) return;
        playing = next;
        if (playing) {
          lastFrame = performance.now();
          rafId = requestAnimationFrame(loop);
        } else {
          cancelAnimationFrame(rafId);
        }
      },
      setLook(look) {
        backend.setLook(look);
        if (!playing) renderFrame(performance.now());
      },
      resize,
    };
  }

  const PRESETS = {
    hero: {
      shape: "field",
      looks: {
        dark: {
          colors: ["#0f5f4b", "#34c79b", "#a5f0d8", "#f6f8ff"],
          density: 0.74,
          glyphOpacity: 0.16,
          glow: 0.2,
          gradientOpacity: 0.74,
        },
        light: {
          colors: ["#5fd3b0", "#0a7a64", "#0a7a64", "#063f34"],
          density: 0.74,
          glyphOpacity: 0.15,
          glow: 0.2,
          gradientOpacity: 0.7,
        },
      },
      cellSize: 18,
      flicker: 0.09,
      softness: 0.5,
      scale: 1.3,
      flow: 0.55,
      speed: 0.55,
      grain: 0.035,
      variation: 11,
      mouseInteraction: true,
      scrambleRadius: 0.09,
      maxFps: 30,
      apex: 0.42,
      intro: false,
    },
    horizon: {
      shape: "horizon",
      looks: {
        dark: {
          colors: ["#3fd6a6", "#2aa3b0", "#2a6aa0", "#1d3f6c"],
          density: 0.5,
          glyphOpacity: 0.11,
          glow: 0.2,
          gradientOpacity: 0.88,
        },
        light: {
          colors: ["#8fdcc2", "#b8ecdc", "#d0f2e8", "#e4f7f1"],
          density: 0.4,
          glyphOpacity: 0.12,
          glow: 0.1,
          gradientOpacity: 0.6,
        },
      },
      cellSize: 18,
      flicker: 0.09,
      softness: 1,
      scale: 1.3,
      flow: 0.55,
      speed: 0.55,
      grain: 0.035,
      variation: 11,
      mouseInteraction: true,
      scrambleRadius: 0.09,
      maxFps: 30,
      apex: 0.66,
      intro: true,
    },
  };

  function getTheme() {
    return document.documentElement.classList.contains("light") ? "light" : "dark";
  }

  // Initialize ASCII Canvases
  const asciiInstances = [];
  function initAsciiCanvases() {
    const canvases = document.querySelectorAll(".ascii-field-canvas");
    canvases.forEach((canvas) => {
      const isHorizon = !!canvas.closest(".final-cta");
      const presetKey = isHorizon ? "horizon" : "hero";
      const preset = PRESETS[presetKey];
      const theme = getTheme();
      const instance = createAsciiField(canvas, Object.assign({}, preset, preset.looks[theme]));
      if (!instance) return;
      asciiInstances.push({ instance, preset });
      instance.setPlaying(true);

      if ("ResizeObserver" in window) {
        const ro = new ResizeObserver(() => instance.resize());
        ro.observe(canvas);
      } else {
        window.addEventListener("resize", () => instance.resize());
      }

      if ("IntersectionObserver" in window) {
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              instance.setPlaying(entry.isIntersecting);
            });
          },
          { threshold: 0.05 }
        );
        io.observe(canvas);
      }
    });
  }

  // 3. Hero Pointer Glow Tracker
  function initHeroPointerGlow() {
    const glow = document.querySelector(".hero-pointer-glow");
    const hero = document.querySelector(".landing-hero");
    if (!glow || !hero) return;
    let rect = hero.getBoundingClientRect();
    const pos = { x: 0.78 * rect.width, y: Math.min(0.22 * rect.height, 280) };
    const target = { x: pos.x, y: pos.y };
    let raf = 0;
    let lastTime = 0;

    const apply = () => {
      glow.style.transform = `translate3d(${pos.x - glow.offsetWidth / 2}px, ${pos.y - glow.offsetHeight / 2}px, 0)`;
    };
    const step = (now) => {
      raf = 0;
      const dt = lastTime ? Math.min(now - lastTime, 64) : 16;
      lastTime = now;
      const alpha = 1 - Math.exp(-dt / 140);
      pos.x += (target.x - pos.x) * alpha;
      pos.y += (target.y - pos.y) * alpha;
      apply();
      if (Math.hypot(target.x - pos.x, target.y - pos.y) > 0.5) {
        raf = requestAnimationFrame(step);
      } else {
        lastTime = 0;
      }
    };
    hero.addEventListener(
      "pointermove",
      (e) => {
        rect = hero.getBoundingClientRect();
        target.x = e.clientX - rect.left;
        target.y = e.clientY - rect.top;
        glow.setAttribute("data-active", "true");
        if (!raf) raf = requestAnimationFrame(step);
      },
      { passive: true }
    );
    hero.addEventListener("pointerleave", () => {
      glow.removeAttribute("data-active");
    });
  }

  // 4. Hero Mode Switcher (文本 LLM / 图片 / 视频) + Model Combobox + Prompt Submit
  const BOZZII_MODELS_BY_MODE = {
    language: [
      { id: "deepseek-v4-pro", vendor: "云厂商自部署", badge: "商务折扣 · 算力支持" },
      { id: "mimo-v2.6-pro", vendor: "云厂商自部署", badge: "商务折扣 · 算力支持" },
      { id: "glm-5.3", vendor: "云厂商自部署", badge: "商务折扣 · 算力支持" },
      { id: "deepseek-v4.1-flash", vendor: "云厂商自部署", badge: "商务折扣 · 算力支持" },
      { id: "claude-sonnet-5-5", vendor: "海外大模型 API", badge: "商务折扣 · 算力支持" },
      { id: "claude-opus-5-5", vendor: "海外大模型 API", badge: "商务折扣 · 算力支持" },
      { id: "gpt-6.1-sol", vendor: "海外大模型 API", badge: "商务折扣 · 算力支持" },
      { id: "gpt-6-astra", vendor: "海外大模型 API", badge: "商务折扣 · 算力支持" },
      { id: "grok-4.7", vendor: "海外大模型 API", badge: "商务折扣 · 算力支持" },
    ],
    image: [
      { id: "gpt-image-2.5-flare", vendor: "海外大模型 API", badge: "按需付费 · 算力支持" },
      { id: "gpt-image-2.5-sunburst", vendor: "海外大模型 API", badge: "按需付费 · 算力支持" },
      { id: "gpt-image-2", vendor: "海外大模型 API", badge: "按需付费 · 算力支持" },
    ],
    video: [
      { id: "MiniMax-H3", vendor: "云厂商自部署", badge: "按需付费 · 算力支持" },
    ],
  };

  const MODE_META = {
    language: {
      surfaceMode: "text",
      placeholderZh: "随便问点什么，或说说你想用 Bozzii API 构建什么应用…",
      placeholderEn: "Ask anything, or describe what you want to build with Bozzii API…",
    },
    image: {
      surfaceMode: "image",
      placeholderZh: "描述你想生成的画面，例如：晨雾中的赛博朋克深圳湾天际线…",
      placeholderEn: "Describe the image you want to create…",
    },
    video: {
      surfaceMode: "video",
      placeholderZh: "描述你想生成的视频片段，支持 MiniMax-H3 高清视频生成…",
      placeholderEn: "Describe the video clip you want to generate…",
    },
  };

  function initHeroInteractive() {
    const form = document.querySelector("form.landing-ask");
    if (!form) return;
    const input = form.querySelector("input");
    const tabs = Array.from(form.querySelectorAll('[role="tab"]'));
    const modelValueEl = form.querySelector(".landing-model-value");
    const comboboxBtn = form.querySelector('[role="combobox"]');
    const progressWrap = form.querySelector(".landing-ask-progress");
    const heroSurface = document.querySelector(".hero-surface");

    let currentMode = "language";
    let selectedModelByMode = {
      language: "deepseek-v4-pro",
      image: "gpt-image-2.5-flare",
      video: "MiniMax-H3",
    };
    let autoRotate = true;
    let rotateTimer = null;

    // Build model popover inside combobox parent
    let popover = null;
    if (comboboxBtn && comboboxBtn.parentElement) {
      const wrap = comboboxBtn.parentElement;
      wrap.classList.add("bozzii-model-picker-wrap");
      popover = document.createElement("div");
      popover.className = "bozzii-model-popover";
      wrap.appendChild(popover);

      comboboxBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        stopRotation();
        const isOpen = popover.getAttribute("data-open") === "true";
        popover.setAttribute("data-open", isOpen ? "false" : "true");
        comboboxBtn.setAttribute("aria-expanded", isOpen ? "false" : "true");
      });

      document.addEventListener("click", (e) => {
        if (!wrap.contains(e.target)) {
          popover.setAttribute("data-open", "false");
          comboboxBtn.setAttribute("aria-expanded", "false");
        }
      });
    }

    function renderModelOptions() {
      const list = BOZZII_MODELS_BY_MODE[currentMode] || BOZZII_MODELS_BY_MODE.language;
      const chosen = selectedModelByMode[currentMode] || list[0].id;
      if (modelValueEl) modelValueEl.textContent = chosen;
      if (!popover) return;
      popover.innerHTML = "";
      list.forEach((m) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bozzii-model-option";
        if (m.id === chosen) btn.setAttribute("data-selected", "true");
        btn.innerHTML = `<span>${m.id}</span><span class="text-muted-foreground font-sans text-[11px]">${m.vendor} · ${m.badge}</span>`;
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectedModelByMode[currentMode] = m.id;
          renderModelOptions();
          popover.setAttribute("data-open", "false");
          if (comboboxBtn) comboboxBtn.setAttribute("aria-expanded", "false");
        });
        popover.appendChild(btn);
      });
    }

    function setMode(mode, userTriggered) {
      if (userTriggered) stopRotation();
      currentMode = mode;
      const meta = MODE_META[mode] || MODE_META.language;
      const isEn = document.documentElement.getAttribute("data-lang") === "en";
      if (input) {
        input.placeholder = isEn ? meta.placeholderEn : meta.placeholderZh;
      }

      tabs.forEach((tab, idx) => {
        const tabMode = idx === 0 ? "language" : idx === 1 ? "image" : "video";
        const active = tabMode === mode;
        tab.setAttribute("aria-selected", active ? "true" : "false");
        if (active) {
          tab.classList.add(
            "bg-background",
            "text-foreground",
            "after:absolute",
            "after:inset-x-2",
            "after:bottom-0",
            "after:h-0.5",
            "after:rounded-full",
            "after:bg-(--brand)",
            "after:content-['']"
          );
        } else {
          tab.classList.remove(
            "bg-background",
            "text-foreground",
            "after:absolute",
            "after:inset-x-2",
            "after:bottom-0",
            "after:h-0.5",
            "after:rounded-full",
            "after:bg-(--brand)",
            "after:content-['']"
          );
        }
      });

      // Switch Hero Background Surface Layer (text / image / video)
      if (heroSurface) {
        heroSurface.setAttribute("data-mode", meta.surfaceMode);
        const layers = heroSurface.querySelectorAll(".hero-layer");
        layers.forEach((layer) => {
          const lMode = layer.getAttribute("data-layer") || "text";
          if (lMode === meta.surfaceMode) {
            layer.setAttribute("data-active", "true");
          } else {
            layer.removeAttribute("data-active");
          }
        });
        const videoEl = heroSurface.querySelector("video.hero-video");
        if (videoEl) {
          if (meta.surfaceMode === "video") {
            videoEl.play().catch(() => {});
          } else {
            videoEl.pause();
          }
        }
        const mediaPad = heroSurface.querySelector(".hero-media-pad");
        if (mediaPad) {
          mediaPad.style.display = meta.surfaceMode === "text" ? "none" : "block";
        }
      }

      // Reset progress bar animation
      if (progressWrap && autoRotate) {
        progressWrap.innerHTML = "<span></span>";
      }

      renderModelOptions();
    }

    function stopRotation() {
      if (!autoRotate) return;
      autoRotate = false;
      if (rotateTimer) clearInterval(rotateTimer);
      if (progressWrap) progressWrap.style.display = "none";
    }

    tabs.forEach((tab, idx) => {
      const tabMode = idx === 0 ? "language" : idx === 1 ? "image" : "video";
      tab.addEventListener("click", () => setMode(tabMode, true));
    });

    form.addEventListener("pointerdown", () => stopRotation());
    form.addEventListener("focusin", () => stopRotation());

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const targetUrl = "https://ai.bozzii.com/playground";
      window.top ? (window.top.location.href = targetUrl) : (window.location.href = targetUrl);
    });

    // Auto-rotate modes every 5.2 seconds until user interacts
    const modeOrder = ["language", "image", "video"];
    rotateTimer = setInterval(() => {
      if (!autoRotate || document.hidden) return;
      const nextIdx = (modeOrder.indexOf(currentMode) + 1) % modeOrder.length;
      setMode(modeOrder[nextIdx], false);
    }, 5200);

    setMode("language", false);
  }

  // 5. Hero Announcement Ticker Rotation
  function initHeroTicker() {
    const tickerLink = document.querySelector(".hero-update");
    const tickerText = document.querySelector(".hero-update-text");
    if (!tickerLink || !tickerText) return;
    const items = [
      {
        zh: "XSEEK 办公智能体已正式上线 · 前往官网体验与预约演示",
        en: "XSEEK Enterprise AI Agent Now Live · Visit Site or Book a Demo",
        href: "https://xseekai.cn/index.html",
        external: true,
      },
      {
        zh: "一键接入配置页上线 · 支持 WorkBuddy / CodeBuddy / Claude Code / Codex",
        en: "Quick Connect Hub · WorkBuddy, CodeBuddy, Claude Code & Codex",
        href: "https://ai.bozzii.com/brand/connect.html",
        external: false,
      },
      {
        zh: "境内主体合规备案 · 支持企业对公结算与增值税开票",
        en: "ICP Registered · Corporate Payment & VAT Invoicing Supported",
        href: "#compliance-footer",
        external: false,
      },
    ];
    let idx = 0;
    let paused = false;
    tickerLink.addEventListener("mouseenter", () => (paused = true));
    tickerLink.addEventListener("mouseleave", () => (paused = false));
    setInterval(() => {
      if (paused || document.hidden) return;
      idx = (idx + 1) % items.length;
      const isEn = document.documentElement.getAttribute("data-lang") === "en";
      tickerText.textContent = isEn ? items[idx].en : items[idx].zh;
      tickerLink.setAttribute("href", items[idx].href);
      tickerLink.setAttribute("target", items[idx].external ? "_blank" : "_top");
      if (items[idx].external) {
        tickerLink.setAttribute("rel", "noopener noreferrer");
      } else {
        tickerLink.removeAttribute("rel");
      }
    }, 4800);
  }

  // 6. Scroll Reveal & Stat Counter Animation
  function initScrollRevealAndStats() {
    const revealEls = document.querySelectorAll(".home-reveal");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.setAttribute("data-visible", "true");
              entry.target.setAttribute("data-reveal-state", "visible");
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08 }
      );
      revealEls.forEach((el) => io.observe(el));
    } else {
      revealEls.forEach((el) => {
        el.setAttribute("data-visible", "true");
        el.setAttribute("data-reveal-state", "visible");
      });
    }
  }

  // 7. Interactive FAQ Accordion (12 items)
  function initFaqAccordion() {
    const items = document.querySelectorAll(".landing-faq-item");
    items.forEach((item) => {
      const btn = item.querySelector("button.group\\/faq");
      const panel = item.querySelector('[role="region"]');
      if (!btn || !panel) return;

      btn.addEventListener("click", () => {
        const isExpanded = btn.getAttribute("aria-expanded") === "true";
        const nextState = !isExpanded;
        btn.setAttribute("aria-expanded", nextState ? "true" : "false");
        if (nextState) {
          item.setAttribute("data-open", "");
          item.removeAttribute("data-closed");
          panel.style.display = "block";
        } else {
          item.removeAttribute("data-open");
          item.setAttribute("data-closed", "");
          panel.style.display = "none";
        }
      });
    });
  }

  // 8. One-Click Copy Buttons + Toast Notification
  function showToast(msg) {
    let toast = document.getElementById("bozzii-copy-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "bozzii-copy-toast";
      toast.className = "bozzii-toast";
      toast.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg><span></span>`;
      document.body.appendChild(toast);
    }
    const label = toast.querySelector("span");
    if (label) label.textContent = msg;
    toast.setAttribute("data-show", "true");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.setAttribute("data-show", "false");
    }, 2200);
  }

  function copyTextFallback(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return Boolean(ok);
    } catch (e) {
      return false;
    }
  }

  function initCopyButtons() {
    const copyBtns = document.querySelectorAll('[aria-label="复制"], [data-copy]');
    copyBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const pre = btn.parentElement ? btn.parentElement.querySelector("pre") : null;
        const text = btn.getAttribute("data-copy") || (pre ? pre.textContent.trim() : "");
        if (!text) return;
        const isEn = document.documentElement.getAttribute("data-lang") === "en";
        const notify = (ok) => {
          showToast(
            ok
              ? isEn
                ? `Copied: ${text}`
                : `已复制到剪贴板：${text}`
              : isEn
                ? "Copy failed, please select manually"
                : "复制失败，请手动选中复制"
          );
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(text)
            .then(() => notify(true))
            .catch(() => notify(copyTextFallback(text)));
        } else {
          notify(copyTextFallback(text));
        }
      });
    });
  }

  // 9. Theme Toggle (Dark / Light) + New API Parent Iframe Sync
  function applyTheme(mode) {
    const html = document.documentElement;
    const isLight = mode === "light";
    html.classList.toggle("light", isLight);
    html.classList.toggle("dark", !isLight);
    html.style.colorScheme = isLight ? "light" : "dark";
    try {
      localStorage.setItem("bozzii-theme", isLight ? "light" : "dark");
    } catch (e) {}
    asciiInstances.forEach(({ instance, preset }) => {
      instance.setLook(preset.looks[isLight ? "light" : "dark"]);
    });
  }

  function initThemeAndLang() {
    // Check saved theme
    try {
      const saved = localStorage.getItem("bozzii-theme");
      if (saved === "light" || saved === "dark") {
        applyTheme(saved);
      }
    } catch (e) {}

    // Theme toggle button in header
    const themeBtns = document.querySelectorAll('[data-action="toggle-theme"], [aria-label*="切换至"]');
    themeBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = getTheme() === "dark" ? "light" : "dark";
        applyTheme(next);
      });
    });

    // Language switch button (简 / EN)
    const langBtns = document.querySelectorAll('[data-action="toggle-lang"], [aria-label="切换语言"]');
    langBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const curr = document.documentElement.getAttribute("data-lang") === "en" ? "en" : "zh";
        const next = curr === "en" ? "zh" : "en";
        applyLanguage(next);
      });
    });

    // Listen to New API parent frame messages ({ themeMode, lang })
    window.addEventListener("message", (e) => {
      const d = e.data || {};
      if (d.themeMode === "light" || d.themeMode === "dark") {
        applyTheme(d.themeMode);
      }
      if (typeof d.lang === "string") {
        applyLanguage(d.lang.startsWith("en") ? "en" : "zh");
      }
    });
  }

  // Bilingual dictionary for key elements with [data-i18n-zh] / [data-i18n-en]
  function applyLanguage(lang) {
    document.documentElement.setAttribute("data-lang", lang);
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
    const els = document.querySelectorAll("[data-i18n-en]");
    els.forEach((el) => {
      const zh = el.getAttribute("data-i18n-zh");
      const en = el.getAttribute("data-i18n-en");
      if (lang === "en" && en) {
        if (!zh) el.setAttribute("data-i18n-zh", el.textContent);
        el.textContent = en;
      } else if (lang === "zh" && zh) {
        el.textContent = zh;
      }
    });
    const langIndicator = document.querySelector(".bozzii-lang-label");
    if (langIndicator) {
      langIndicator.textContent = lang === "en" ? "EN" : "简";
    }
  }

  // 10. Command Palette Modal (⌘K)
  function initCommandPalette() {
    const backdrop = document.getElementById("bozzii-cmdk-modal");
    if (!backdrop) return;
    const input = backdrop.querySelector(".bozzii-cmdk-input");
    const items = Array.from(backdrop.querySelectorAll(".bozzii-cmdk-item"));

    function openModal() {
      backdrop.setAttribute("data-open", "true");
      if (input) {
        input.value = "";
        filterItems("");
        setTimeout(() => input.focus(), 30);
      }
    }
    function closeModal() {
      backdrop.setAttribute("data-open", "false");
    }
    function filterItems(q) {
      const term = q.trim().toLowerCase();
      items.forEach((item) => {
        const text = item.textContent.toLowerCase();
        item.style.display = !term || text.includes(term) ? "flex" : "none";
      });
    }

    document.querySelectorAll('[data-action="open-search"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        openModal();
      });
    });

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });

    if (input) {
      input.addEventListener("input", () => filterItems(input.value));
    }

    window.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const isOpen = backdrop.getAttribute("data-open") === "true";
        isOpen ? closeModal() : openModal();
      } else if (e.key === "Escape") {
        closeModal();
      }
    });
  }

  // 11. Interactive Pricing Category Filter (全部模型 / 云厂商自部署 / 海外大模型 API)
  function initPricingFilter() {
    const tabs = document.querySelectorAll(".bozzii-pricing-tab[data-filter]");
    const rows = document.querySelectorAll(".bozzii-pricing-row[data-category]");
    if (!tabs.length || !rows.length) return;
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const filter = tab.getAttribute("data-filter") || "all";
        tabs.forEach((t) => t.setAttribute("aria-selected", t === tab ? "true" : "false"));
        rows.forEach((row) => {
          const cat = row.getAttribute("data-category");
          row.style.display = filter === "all" || cat === filter ? "" : "none";
        });
      });
    });
  }

  // 12. Live API Status & Model Count Enhancer (when hosted on ai.bozzii.com)
  function initLiveApiSync() {
    if (!location.hostname.endsWith("bozzii.com")) return;
    fetch("/api/pricing")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!json || !Array.isArray(json.data)) return;
        const countEl = document.querySelector('[data-stat="models-count"]');
        if (countEl && json.data.length > 0) {
          countEl.textContent = `${json.data.length}+`;
        }
      })
      .catch(() => {});
  }

  // 13. Hide redundant Sign In button when user already has an active session cookie
  function initSessionHintSync() {
    try {
      const hasSession = /(?:^|;\s*)new_api_has_session=1(?:;|$)/.test(
        document.cookie || ""
      );
      const signInEl = document.getElementById("bozzii-nav-signin");
      if (hasSession && signInEl) {
        signInEl.style.display = "none";
      }
    } catch (e) {}
  }

  function boot() {
    initAsciiCanvases();
    initHeroPointerGlow();
    initHeroInteractive();
    initHeroTicker();
    initScrollRevealAndStats();
    initFaqAccordion();
    initCopyButtons();
    initThemeAndLang();
    initCommandPalette();
    initPricingFilter();
    initLiveApiSync();
    initSessionHintSync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
