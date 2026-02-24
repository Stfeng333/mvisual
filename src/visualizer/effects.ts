import * as THREE from 'three';
import { createVocalLayer } from './vocal';

export interface EffectParams {
  bpm: number;
  energy: number;
  valence: number;
  genres: string[];
  level: number;
  frequencyData: Uint8Array;
}

export interface VisualEffect {
  update: (params: EffectParams, dt: number) => void;
  dispose: () => void;
}


export function getBandLevels(data: Uint8Array): { low: number; mid: number; high: number } {
  const len = data.length;
  if (len === 0) return { low: 0, mid: 0, high: 0 };
  const a = Math.floor(len * 0.23);
  const b = Math.floor(len * 0.62);
  let low = 0, mid = 0, high = 0;
  for (let i = 0;  i < a;   i++) low  += data[i]!;
  for (let i = a;  i < b;   i++) mid  += data[i]!;
  for (let i = b;  i < len; i++) high += data[i]!;
  return {
    low:  low  / Math.max(1, a)       / 255,
    mid:  mid  / Math.max(1, b - a)   / 255,
    high: high / Math.max(1, len - b) / 255,
  };
}

const MAX_SMOKES = 180;
const MAX_JETS   = 6;
const EFFECT_PLUME     = 0;
const EFFECT_BURST     = 1;
const EFFECT_COMET     = 2;
const EFFECT_SCATTER   = 3;
const EFFECT_SHOCKWAVE = 4;
const NUM_EFFECTS      = 5;


type Smoke = {
  x: number; y: number;
  vx: number; vy: number;
  age: number; maxAge: number;
  radius: number;

  seed: number;
  hue: number;
  sat: number;
};

type Jet = {
  sx: number; sy: number;
  cx: number; cy: number;
  ex: number; ey: number;
  age: number; duration: number;
  emitCarry: number; emitRate: number;
  intensity: number;
  hue: number;
  seedRange: [number, number];
};


const VERT = /* glsl */`
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */`
precision highp float;
uniform vec2  uResolution;
uniform float uAspect;
uniform int   uCount;
uniform float uFlash;
uniform vec4  uSmokePos  [${MAX_SMOKES}];
uniform vec4  uSmokeColor[${MAX_SMOKES}];

float hash(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.1);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a*vnoise(p); p=p*2.07+vec2(3.1,1.7); a*=0.5; }
  return v * 2.0 - 1.0;
}
vec3 hsv2rgb(float h, float s, float v) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(vec3(h)+K.xyz)*6.0-K.www);
  return v * mix(K.xxx, clamp(p-K.xxx,0.0,1.0), s);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec3 col = vec3(0.0);
  float alphaAcc = 0.0;

  for (int i = 0; i < ${MAX_SMOKES}; i++) {
    if (i >= uCount) break;
    float sx      = uSmokePos[i].x;
    float sy      = uSmokePos[i].y;
    float radius  = uSmokePos[i].z;
    float t       = uSmokePos[i].w;
    float hue     = uSmokeColor[i].x;
    float seed    = uSmokeColor[i].y;
    float opacity = uSmokeColor[i].z;
    float satBase = uSmokeColor[i].w;

    vec2 dxy = uv - vec2(sx, sy);
    dxy.x *= uAspect;

    float density  = 0.0;
    float finalSat = satBase;
    float finalVal = 0.8;

    if (seed < 0.32) {
      float dist  = length(dxy);
      vec2 nc     = uv * 5.0 + vec2(seed * 9.0, t * 2.0 + seed * 4.0);
      float warp  = fbm(nc) * radius * (0.22 + t * 0.35);
      float r     = radius * (0.60 + t * 0.85);
      density     = 1.0 - smoothstep(0.0, r, dist + warp);
      density     = pow(max(density, 0.0), 0.75);
      finalSat    = mix(satBase, 0.15, density * 0.60);
      finalVal    = mix(0.20, 0.85, density);
    }
    else if (seed < 0.66) {
      float angle  = seed * 22.0;
      float cosA   = cos(angle), sinA = sin(angle);
      float du     =  dxy.x * cosA + dxy.y * sinA;
      float dv     = -dxy.x * sinA + dxy.y * cosA;
      float stretch = 5.5 + seed * 7.0;
      float dist   = length(vec2(du / stretch, dv));
      vec2 nc      = uv * 9.0 + vec2(seed * 7.0, t * 3.5);
      float ew     = fbm(nc) * radius * 0.16;
      float r      = radius * (0.38 + t * 0.48);
      density      = 1.0 - smoothstep(0.0, r, dist + ew);
      density      = pow(max(density, 0.0), 0.90);
      finalSat     = satBase * 1.10;
      finalVal     = mix(0.30, 0.90, density);
    }
    else {
      float dist  = length(dxy);
      float nc1   = vnoise(uv * 14.0 + vec2(seed * 12.0, t * 4.0));
      float warp  = nc1 * radius * 0.12;
      float r     = radius * (0.40 + t * 0.50);
      density     = 1.0 - smoothstep(0.0, r, dist + warp);
      density     = pow(max(density, 0.0), 1.1);
      finalSat    = mix(satBase * 1.10, 0.10, pow(1.0 - density, 2.0));
      finalVal    = mix(0.18, 0.88, density);
    }

    float fadeIn  = smoothstep(0.0, 0.06, t);
    float fadeOut = t > 0.46 ? 1.0 - smoothstep(0.46, 1.0, t) : 1.0;
    float alpha   = density * opacity * fadeIn * fadeOut;
    if (alpha <= 0.0004) continue;

    col      += hsv2rgb(hue, finalSat, finalVal) * alpha;
    alphaAcc += alpha;
  }

  col = 1.0 - exp(-col * 0.80);
  col += vec3(uFlash * uFlash * 0.55);
  gl_FragColor = vec4(col, 1.0);
}`;


function clamp01(v: number): number { return Math.min(1, Math.max(0, v)); }
function rnd(lo: number, hi: number): number { return lo + Math.random() * (hi - lo); }

function randomEdgePoint(): { x: number; y: number } {
  const edge = Math.floor(Math.random() * 4);
  const t = rnd(0.05, 0.95);
  if (edge === 0) return { x: t,     y: -0.03 };
  if (edge === 1) return { x: t,     y:  1.03 };
  if (edge === 2) return { x: -0.03, y: t     };
  return               { x:  1.03, y: t     };
}

function oppositeEdgePoint(sx: number, sy: number): { x: number; y: number } {
  const candidates: Array<{ x: number; y: number }> = [];
  const t = () => rnd(0.05, 0.95);
  if (sy >= 0) candidates.push({ x: t(),   y: -0.03 });
  if (sy <= 1) candidates.push({ x: t(),   y:  1.03 });
  if (sx >= 0) candidates.push({ x: -0.03, y: t()   });
  if (sx <= 1) candidates.push({ x:  1.03, y: t()   });
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}


export function createOrbAndParticles(scene: THREE.Scene, params: EffectParams): VisualEffect {
  const smokes: Smoke[] = [];
  const jets: Jet[]     = [];

  const geo       = new THREE.PlaneGeometry(2, 2);
  const posVecs   = Array.from({ length: MAX_SMOKES }, () => new THREE.Vector4(0, 0, 0, 1));
  const colorVecs = Array.from({ length: MAX_SMOKES }, () => new THREE.Vector4(0, 0, 0, 0));

  const uniforms = {
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uAspect:     { value: window.innerWidth / window.innerHeight },
    uCount:      { value: 0 },
    uFlash:      { value: 0.0 },
    uSmokePos:   { value: posVecs },
    uSmokeColor: { value: colorVecs },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const vocalLayer = createVocalLayer(scene);

  function addSmoke(
    x: number, y: number, vx: number, vy: number,
    hue: number, sat: number,
    seedRange: [number, number],
    intensity: number,
    sizeScale = 1.0,
    lifeScale  = 1.0,
  ): void {
    if (smokes.length >= MAX_SMOKES) smokes.shift();
    smokes.push({
      x, y, vx, vy,
      age: 0,
      maxAge: (2.0 + Math.random() * 1.6) * lifeScale,
      radius: (rnd(0.045, 0.072) + intensity * 0.018) * sizeScale,
      seed:   rnd(seedRange[0], seedRange[1]),
      hue,
      sat,
    });
  }


  function triggerPlume(energy: number, bpm: number): void {
    if (jets.length >= MAX_JETS) jets.shift();
    const start = randomEdgePoint();
    const end   = oppositeEdgePoint(start.x, start.y);
    const dx = end.x - start.x, dy = end.y - start.y;
    const pLen = Math.hypot(dx, dy) || 1;
    const bend = rnd(-0.85, 0.85);
    jets.push({
      sx: start.x, sy: start.y,
      cx: (start.x + end.x) * 0.5 + (-dy / pLen) * bend,
      cy: (start.y + end.y) * 0.5 + ( dx / pLen) * bend,
      ex: end.x, ey: end.y,
      age: 0,
      duration: Math.max(0.40, 60 / Math.max(70, bpm) * 0.65),
      emitCarry: 0,
      emitRate: 62 + energy * 52,
      intensity: 0.36 + energy * 0.44,
      hue: Math.random(),
      seedRange: [0.00, 0.31],
    });
  }


  function triggerBurst(energy: number): void {
    const ox   = rnd(0.20, 0.80);
    const oy   = rnd(0.20, 0.80);
    const hue  = Math.random();
    const count = Math.round(12 + energy * 14);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rnd(-0.25, 0.25);
      const speed = rnd(0.06, 0.18) * (0.55 + energy * 0.55);
      addSmoke(
        ox + rnd(-0.018, 0.018), oy + rnd(-0.018, 0.018),
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        hue, rnd(0.28, 0.56), [0.00, 0.31], energy, 0.80, 1.1,
      );
    }
  }

  function triggerComet(energy: number, bpm: number): void {
    if (jets.length >= MAX_JETS) jets.shift();
    const start = randomEdgePoint();
    const end   = oppositeEdgePoint(start.x, start.y);
    const perpX = -(end.y - start.y);
    const perpY =  (end.x - start.x);
    const swing = rnd(0.22, 0.48) * (Math.random() < 0.5 ? 1 : -1);
    jets.push({
      sx: start.x, sy: start.y,
      cx: (start.x + end.x) * 0.5 + perpX * swing,
      cy: (start.y + end.y) * 0.5 + perpY * swing,
      ex: end.x, ey: end.y,
      age: 0,
      duration: Math.max(0.55, 60 / Math.max(70, bpm) * 0.90),
      emitCarry: 0,
      emitRate: 28 + energy * 18,
      intensity: 0.72 + energy * 0.48,
      hue: Math.random(),
      seedRange: [0.00, 0.31],
    });
  }


  // ── Effect type 4: SHOCKWAVE – extreme drum hit, radial multi-streak + flash ──

  function triggerShockwave(energy: number, bpm: number): void {
    const numArms = 8;
    const hue = Math.random();
    const ox = 0.38 + Math.random() * 0.24;
    const oy = 0.38 + Math.random() * 0.24;
    for (let i = 0; i < numArms; i++) {
      if (jets.length >= MAX_JETS) jets.shift();
      const angle  = (i / numArms) * Math.PI * 2 + Math.random() * 0.22;
      const reach  = 0.68 + Math.random() * 0.40;
      const ex     = ox + Math.cos(angle) * reach;
      const ey     = oy + Math.sin(angle) * reach;
      const bend   = rnd(-0.10, 0.10);
      const mx = (ox + ex) * 0.5, my = (oy + ey) * 0.5;
      const dx = ex - ox, dy = ey - oy;
      const pLen = Math.hypot(dx, dy) || 1;
      jets.push({
        sx: ox, sy: oy,
        cx: mx + (-dy / pLen) * bend,
        cy: my + ( dx / pLen) * bend,
        ex, ey,
        age: 0,
        duration: Math.max(0.13, 60 / Math.max(70, bpm) * 0.20),
        emitCarry: 0,
        emitRate: 38 + energy * 28,
        intensity: 0.62 + energy * 0.38,
        hue: hue + i * 0.032,
        seedRange: [0.34, 0.65] as [number, number],
      });
    }
    const count = Math.round(18 + energy * 18);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = rnd(0.09, 0.26) * (0.55 + energy * 0.55);
      addSmoke(
        ox + rnd(-0.02, 0.02), oy + rnd(-0.02, 0.02),
        Math.cos(a) * speed,   Math.sin(a) * speed,
        hue + rnd(-0.07, 0.07), rnd(0.42, 0.72),
        [0.67, 0.97], energy, 0.68, 0.72,
      );
    }
    uniforms.uFlash.value = 0.78 + energy * 0.22;
  }

  function triggerScatter(energy: number): void {
    const origin = randomEdgePoint();
    const inX = 0.5 - origin.x, inY = 0.5 - origin.y;
    const inLen = Math.hypot(inX, inY) || 1;
    const nx = inX / inLen, ny = inY / inLen;
    const hue   = Math.random();
    const count = Math.round(16 + energy * 16);
    for (let i = 0; i < count; i++) {
      const spread = rnd(-0.70, 0.70);
      const speed  = rnd(0.018, 0.065);
      addSmoke(
        origin.x + rnd(-0.025, 0.025), origin.y + rnd(-0.025, 0.025),
        (nx + -ny * spread) * speed,   (ny +  nx * spread) * speed,
        hue + rnd(-0.05, 0.05), rnd(0.26, 0.52),
        [0.67, 0.97], energy, 0.58, 1.9,
      );
    }
  }


  function syncGPU(): void {
    uniforms.uCount.value = smokes.length;
    for (let i = 0; i < smokes.length; i++) {
      const s = smokes[i]!;
      const t = clamp01(s.age / s.maxAge);
      posVecs[i]!.set(s.x, s.y, s.radius, t);
      colorVecs[i]!.set(s.hue, s.seed, 1.0, s.sat);
    }
  }


  function updateJets(dt: number, bands: { low: number; mid: number; high: number }): void {
    for (let i = jets.length - 1; i >= 0; i--) {
      const jet = jets[i]!;
      jet.age  += dt;
      const progress = clamp01(jet.age / jet.duration);

      jet.emitCarry += jet.emitRate * dt;
      const puffs    = Math.floor(jet.emitCarry);
      jet.emitCarry -= puffs;

      for (let p = 0; p < puffs; p++) {
        const t  = clamp01(progress - (p + Math.random()) / Math.max(1, puffs) * 0.07);
        const mt = 1 - t;
        const x  = mt*mt*jet.sx + 2*mt*t*jet.cx + t*t*jet.ex;
        const y  = mt*mt*jet.sy + 2*mt*t*jet.cy + t*t*jet.ey;
        const dtx = 2*mt*(jet.cx-jet.sx) + 2*t*(jet.ex-jet.cx);
        const dty = 2*mt*(jet.cy-jet.sy) + 2*t*(jet.ey-jet.cy);
        const dl  = Math.hypot(dtx, dty) || 1;
        const perp = (Math.random() - 0.5) * (0.018 + bands.high * 0.012);
        addSmoke(
          x + rnd(-0.005, 0.005), y + rnd(-0.005, 0.005),
          dtx/dl * rnd(0.03, 0.06) - dty/dl * perp,
          dty/dl * rnd(0.03, 0.06) + dtx/dl * perp,
          jet.hue, 0.34 + bands.mid * 0.14,
          jet.seedRange, jet.intensity * (0.72 + bands.low * 0.50),
          1.0, 0.52,
        );
      }
      if (jet.age >= jet.duration) jets.splice(i, 1);
    }
  }

  const typeCooldowns = new Array<number>(NUM_EFFECTS).fill(0);
  let lastType  = -1;
  let beatClock = 0;
  let globalRest = 0;
  let bassEmaFast = 0;
  let bassEmaSlow = 0;
  let prevLow  = 0;
  let peakHeld = 0;
  let impactCD = 0;
  let shockCD  = 0;

  function pickAndFire(energy: number, bpm: number): void {
    const eligible: number[] = [];
    for (let t = 0; t < EFFECT_SHOCKWAVE; t++) {
      if (typeCooldowns[t]! <= 0 && t !== lastType) eligible.push(t);
    }
    if (eligible.length === 0) return;
    const chose = eligible[Math.floor(Math.random() * eligible.length)]!;
    lastType = chose;
    const cooldowns = [1.6, 2.0, 1.2, 2.4] as const;
    typeCooldowns[chose] = cooldowns[chose]!;
    globalRest = 0.34 + (1.0 - energy) * 0.38;

    if      (chose === EFFECT_PLUME)   triggerPlume(energy, bpm);
    else if (chose === EFFECT_BURST)   triggerBurst(energy);
    else if (chose === EFFECT_COMET)   triggerComet(energy, bpm);
    else if (chose === EFFECT_SCATTER) triggerScatter(energy);
  }

  // Kick off with a single plume so screen isn't empty
  triggerPlume(params.energy, params.bpm);


  return {
    update(p: EffectParams, dt: number): void {
      const bands = getBandLevels(p.frequencyData);
      const bpm   = Math.max(72, Math.min(190, p.bpm || 120));
      const spb   = 60 / bpm;

      globalRest = Math.max(0, globalRest - dt);
      impactCD   = Math.max(0, impactCD   - dt);
      shockCD    = Math.max(0, shockCD    - dt);
      for (let t = 0; t < NUM_EFFECTS; t++) typeCooldowns[t] = Math.max(0, typeCooldowns[t]! - dt);

      uniforms.uFlash.value = Math.max(0, uniforms.uFlash.value - dt * 4.5);

      beatClock += dt;
      if (beatClock >= spb) {
        beatClock -= spb;
        if (globalRest <= 0 && Math.random() < 0.65) {
          pickAndFire(p.energy, bpm);
        }
      }

      const low    = bands.low;
      const attack = Math.max(0, low - prevLow);
      prevLow      = low;
      const fRise = 0.55, fFall = 0.09;
      bassEmaFast += (low - bassEmaFast) * Math.min(1, (low > bassEmaFast ? fRise : fFall) * dt * 60);
      bassEmaSlow += (low - bassEmaSlow) * Math.min(1, 0.035 * dt * 60);
      peakHeld = Math.max(bassEmaFast, peakHeld - dt * 0.18);
      const onset  = Math.max(0, bassEmaFast - bassEmaSlow) + attack * 0.75;
      const thresh = 0.065 - p.energy * 0.018;

      if (onset > thresh && impactCD <= 0 && globalRest <= 0) {
        pickAndFire(Math.min(1, p.energy + 0.10), bpm);
        impactCD = 0.22;
      }

      const drumHit = onset + Math.max(0, bands.mid - bassEmaSlow * 0.6) * 0.55;
      const shockThresh = 0.32 - p.energy * 0.05;
      if (drumHit > shockThresh && shockCD <= 0) {
        triggerShockwave(Math.min(1, p.energy + 0.15), bpm);
        globalRest = 0.28;
        shockCD    = 1.8;
        impactCD   = 0.32;
      }

      updateJets(dt, bands);

      for (let i = smokes.length - 1; i >= 0; i--) {
        const s  = smokes[i]!;
        s.age   += dt;
        if (s.age >= s.maxAge) { smokes.splice(i, 1); continue; }

        const drag = Math.pow(0.978, dt * 60);
        s.vx *= drag;
        s.vy *= drag;

        const f1  = 1.2 + s.seed * 1.2;
        const f2  = 2.6 + s.seed * 1.6;
        const wob = Math.sin(s.age * f1 + s.seed * 8.1)
                  + Math.sin(s.age * f2 + s.seed * 13.5) * 0.25;
        s.vx += wob * (0.004 + bands.mid * 0.006) * dt;
        s.vy += Math.cos(s.age * f1 * 0.71 + s.seed * 4.9) * (0.003 + bands.high * 0.005) * dt
              + 0.002 * dt;

        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.x < -0.3 || s.x > 1.3 || s.y < -0.3 || s.y > 1.3) smokes.splice(i, 1);
      }

      syncGPU();
      uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
      uniforms.uAspect.value = window.innerWidth / window.innerHeight;
      vocalLayer.update(p.frequencyData, dt);
    },

    dispose(): void {
      vocalLayer.dispose();
      geo.dispose();
      mat.dispose();
      scene.remove(mesh);
    },
  };
}
