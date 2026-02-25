/**
 * Lightning / plasma tendril renderer
 * Each bolt is a branching fractal tree (recursive midpoint displacement)
 * Segments are rendered as billboard quads (4 verts + 6 indices each), so we get arbitrary thickness and soft exponential glow — no 1-pixel canvas lines
 * Coordinate convention:
 *   Screen UV  [0,1] x [0,1]  – used for position storage
 *   NDC        [-1,1]         – used by gl_Position
 */

import * as THREE from 'three';

// ─── capacity ────────────────────────────────────────────────────────────────
const MAX_BOLTS        = 24;
const MAX_SEGS_PER_BOLT = 512;
const MAX_SEGS         = MAX_BOLTS * MAX_SEGS_PER_BOLT;
const VERTS_PER_SEG    = 4;   // quad
const IDX_PER_SEG      = 6;   // 2 triangles
const FLOATS_PER_VERT  = 10;  // floats per vertex: sta(xy) end(xy) side t width intensity hue life

// ─── shaders ─────────────────────────────────────────────────────────────────

const VERT_SHADER = /* glsl */`
precision highp float;

attribute vec2  a_sta;
attribute vec2  a_end;
attribute float a_side;
attribute float a_t;
attribute float a_width;
attribute float a_intensity;
attribute float a_hue;
attribute float a_life;   // 0 = just born, 1 = fully aged

uniform float uAspect;

varying float vDist;
varying float vIntensity;
varying float vHue;
varying float vLife;

void main() {
  // UV [0,1] → NDC [-1,1]
  vec2 ndcSta = a_sta * 2.0 - 1.0;
  vec2 ndcEnd = a_end * 2.0 - 1.0;

  // Direction in aspect-corrected space (so visually perpendicular looks right)
  vec2 dirAsp = vec2((ndcEnd.x - ndcSta.x) * uAspect, ndcEnd.y - ndcSta.y);
  float dLen  = length(dirAsp);
  if (dLen < 0.00001) { gl_Position = vec4(-2.0, -2.0, 0.0, 1.0); return; }

  vec2 perpAsp = vec2(-dirAsp.y, dirAsp.x) / dLen;
  // Convert perpendicular back from aspect-corrected → NDC
  vec2 perpNDC = vec2(perpAsp.x / uAspect, perpAsp.y);

  // Base vertex position = whichever endpoint (a_t = 0 or 1)
  vec2 base = mix(ndcSta, ndcEnd, a_t);

  // Width in NDC: a_width is in UV units → multiply by 2
  vec2 pos = base + perpNDC * a_side * a_width * 2.0;

  // vDist: normalized edge distance (-1 .. +1 across the quad width)
  vDist      = a_side;
  vIntensity = a_intensity;
  vHue       = a_hue;
  vLife      = a_life;

  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const FRAG_SHADER = /* glsl */`
precision highp float;

varying float vDist;
varying float vIntensity;
varying float vHue;
varying float vLife;

vec3 hsv2rgb(float h, float s, float v) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(vec3(h) + K.xyz) * 6.0 - K.www);
  return v * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), s);
}

void main() {
  float d    = abs(vDist);            // 0 = centerline, 1 = edge

  // Three layers of glow: ultra-bright core, inner glow, wide soft halo
  float core  = exp(-d * d * 28.0);
  float inner = exp(-d * d * 7.0);
  float halo  = exp(-d * d * 1.8);

  // Life fade: sharp fade-in, smooth fade-out
  float fadeIn  = smoothstep(0.0, 0.08, 1.0 - vLife);
  float fadeOut = 1.0 - smoothstep(0.55, 1.0, vLife);
  float lifeFade = fadeIn * fadeOut;

  float brightness = (core * 1.0 + inner * 0.55 + halo * 0.18) * vIntensity * lifeFade;

  // Core is near-white, inner is full hue, halo is dark saturated
  vec3 coreCol  = mix(hsv2rgb(vHue, 1.0, 1.0), vec3(1.0), core * 0.65);
  vec3 innerCol = hsv2rgb(vHue, 0.85, 1.0);
  vec3 haloCol  = hsv2rgb(vHue + 0.05, 0.65, 0.50);

  vec3 col = coreCol * core + innerCol * inner * 0.6 + haloCol * halo * 0.25;
  // Background layer: scale down so waveform lanes dominate
  float alpha = clamp(brightness * 0.28, 0.0, 1.0);

  gl_FragColor = vec4(col * alpha, 1.0);
}`;

// ─── types ────────────────────────────────────────────────────────────────────

interface Seg {
  x1: number; y1: number;
  x2: number; y2: number;
  width: number;
  intensity: number;
}

interface Bolt {
  segs:   Seg[];
  age:    number;
  maxAge: number;
  hue:    number;
}

// ─── fractal generation ───────────────────────────────────────────────────────

function rnd(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function perpComponent(x1: number, y1: number, x2: number, y2: number): [number, number] {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return [-dy / len, dx / len];
}

interface GenOpts {
  depth:       number;
  offsetScale: number;    // perpendicular jitter relative to segment length
  branchProb:  number;    // probability of spawning a branch at midpoint
  branchAngle: number;    // max branch deviation in radians
  widthDecay:  number;    // per-depth width multiplier < 1
  intensDecay: number;    // per-depth intensity multiplier < 1
  aspect:      number;    // screen aspect for length calculation
}

function generateSegments(
  x1: number, y1: number,
  x2: number, y2: number,
  opts: GenOpts,
  depth: number,
  width: number,
  intensity: number,
  out: Seg[],
): void {
  if (out.length >= MAX_SEGS_PER_BOLT - 4) return;

  const dx = x2 - x1, dy = y2 - y1;
  // Length in aspect-corrected UV space (to judge when to stop)
  const lenAsp = Math.hypot(dx * opts.aspect, dy);

  if (depth <= 0 || lenAsp < 0.008) {
    out.push({ x1, y1, x2, y2, width, intensity });
    return;
  }

  // Midpoint + random perpendicular displacement
  const mx = (x1 + x2) * 0.5;
  const my = (y1 + y2) * 0.5;
  const [px, py] = perpComponent(x1, y1, x2, y2);
  const disp = rnd(-1, 1) * lenAsp * opts.offsetScale;
  // Compensate for aspect when moving perpendicular in UV space
  const dispX = px * disp / opts.aspect;
  const dispY = py * disp;
  const jx = mx + dispX;
  const jy = my + dispY;

  const nextW = width    * opts.widthDecay;
  const nextI = intensity * opts.intensDecay;

  generateSegments(x1, y1, jx, jy, opts, depth - 1, nextW, nextI, out);
  generateSegments(jx, jy, x2, y2, opts, depth - 1, nextW, nextI, out);

  // Occasional branch
  if (depth >= 2 && Math.random() < opts.branchProb) {
    const angle     = rnd(-opts.branchAngle, opts.branchAngle);
    const cosA      = Math.cos(angle), sinA = Math.sin(angle);
    const rdx       = (x2 - x1) * 0.5 * rnd(0.45, 0.85);
    const rdy       = (y2 - y1) * 0.5 * rnd(0.45, 0.85);
    const bex       = jx + (cosA * rdx - sinA * rdy);
    const bey       = jy + (sinA * rdx + cosA * rdy);
    generateSegments(
      jx, jy, bex, bey,
      opts, depth - 2,
      nextW * 0.70, nextI * 0.65,
      out,
    );
  }
}

function makeBolt(opts: {
  x1: number; y1: number;
  x2: number; y2: number;
  hue: number;
  energy: number;
  bpm: number;
  aspect: number;
  maxAge?: number;
}): Bolt {
  const segs: Seg[] = [];
  const energy = Math.max(0.2, opts.energy);

  // depth 6 gives 2^6=64 leaf segs — enough detail without going sub-pixel.
  // widthDecay 0.88 keeps leaves ~35% of root: visible at any depth.
  const depth = 6 + Math.round(energy * 2);
  const wBase = 0.014 + energy * 0.006;
  generateSegments(
    opts.x1, opts.y1,
    opts.x2, opts.y2,
    {
      depth,
      offsetScale: 0.38 + energy * 0.18,
      branchProb:  0.48 + energy * 0.22,
      branchAngle: Math.PI * (0.28 + energy * 0.15),
      widthDecay:  0.88,
      intensDecay: 0.88,
      aspect:      opts.aspect,
    },
    depth,
    wBase,
    0.85 + energy * 0.15,
    segs,
  );

  return {
    segs,
    age:    0,
    maxAge: opts.maxAge ?? rnd(0.6, 1.5),
    hue:    opts.hue,
  };
}

// ─── GPU buffer helpers ───────────────────────────────────────────────────────

export interface LightningSystem {
  update: (
    frequencyData: Uint8Array,
    energy: number,
    bpm: number,
    hue: number,
    dt: number,
  ) => void;
  triggerDrop: (energy: number, hue: number) => void;
  dispose: () => void;
}

export function createLightningSystem(scene: THREE.Scene): LightningSystem {
  // ── geometry ──────────────────────────────────────────────────────────────
  const totalVerts   = MAX_SEGS * VERTS_PER_SEG;
  const totalIndices = MAX_SEGS * IDX_PER_SEG;

  const buf = new Float32Array(totalVerts * FLOATS_PER_VERT);

  const geo = new THREE.BufferGeometry();

  // Single interleaved buffer
  const interleavedBuf = new THREE.InterleavedBuffer(buf, FLOATS_PER_VERT);
  interleavedBuf.setUsage(THREE.DynamicDrawUsage);

  geo.setAttribute('a_sta',       new THREE.InterleavedBufferAttribute(interleavedBuf, 2, 0));
  geo.setAttribute('a_end',       new THREE.InterleavedBufferAttribute(interleavedBuf, 2, 2));
  geo.setAttribute('a_side',      new THREE.InterleavedBufferAttribute(interleavedBuf, 1, 4));
  geo.setAttribute('a_t',         new THREE.InterleavedBufferAttribute(interleavedBuf, 1, 5));
  geo.setAttribute('a_width',     new THREE.InterleavedBufferAttribute(interleavedBuf, 1, 6));
  geo.setAttribute('a_intensity', new THREE.InterleavedBufferAttribute(interleavedBuf, 1, 7));
  geo.setAttribute('a_hue',       new THREE.InterleavedBufferAttribute(interleavedBuf, 1, 8));
  geo.setAttribute('a_life',      new THREE.InterleavedBufferAttribute(interleavedBuf, 1, 9));

  // Pre-build static index buffer
  const indices = new Uint32Array(totalIndices);
  for (let s = 0; s < MAX_SEGS; s++) {
    const v = s * VERTS_PER_SEG;
    const i = s * IDX_PER_SEG;
    // quad: verts at v+0(sta,-1) v+1(sta,+1) v+2(end,+1) v+3(end,-1)
    indices[i + 0] = v + 0; indices[i + 1] = v + 1; indices[i + 2] = v + 2;
    indices[i + 3] = v + 0; indices[i + 4] = v + 2; indices[i + 5] = v + 3;
  }
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.setDrawRange(0, 0);

  // ── material ──────────────────────────────────────────────────────────────
  const uniforms = {
    uAspect: { value: window.innerWidth / window.innerHeight },
  };

  const mat = new THREE.RawShaderMaterial({
    uniforms,
    vertexShader:   VERT_SHADER,
    fragmentShader: FRAG_SHADER,
    transparent:    true,
    depthTest:      false,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
    side:           THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder   = 1;
  scene.add(mesh);

  // ── bolt pool ─────────────────────────────────────────────────────────────
  const bolts: Bolt[] = [];

  function getAspect(): number { return window.innerWidth / window.innerHeight; }

  // Waveform lanes occupy roughly y=0.26–0.74 in UV space.
  // Lightning avoids this band for origins and targets; only the drop
  // burst and pass-through comets are allowed to cross it.
  const WAVE_TOP = 0.26;
  const WAVE_BOT = 0.74;

  function safeY(): number {
    // Pick a Y in the top or bottom safe zone with equal probability
    return Math.random() < 0.5 ? rnd(0.04, WAVE_TOP) : rnd(WAVE_BOT, 0.96);
  }

  // Spawn a few bolts immediately so the screen isn't empty on first frame.
  // Target corners/edges well away from the waveform lane band.
  const initAspect = getAspect();
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const ex = 0.5 + Math.cos(angle) * 0.55;
    // Keep vertical reach in safe zones so init bolts don't pile on the lanes
    const eyRaw = 0.5 + Math.sin(angle) * 0.38;
    const ey = eyRaw < 0.5 ? Math.min(eyRaw, WAVE_TOP) : Math.max(eyRaw, WAVE_BOT);
    bolts.push(makeBolt({ x1: 0.5, y1: ey < 0.5 ? WAVE_TOP * 0.5 : WAVE_BOT + (1 - WAVE_BOT) * 0.5,
      x2: ex, y2: ey, hue: i / 4, energy: 0.5, bpm: 120, aspect: initAspect, maxAge: 1.2 }));
  }

  function randomEdgeUV(): [number, number] {
    const edge = Math.floor(Math.random() * 4);
    const t = rnd(0.05, 0.95);
    // Top / bottom edges: full width, Y already outside waveform zone
    if (edge === 0) return [t,    0.0 ];
    if (edge === 1) return [t,    1.0 ];
    // Left / right edges: bias Y to safe zone so bolts start away from lanes
    if (edge === 2) return [0.0,  safeY()];
    return                 [1.0,  safeY()];
  }

  function spawnBolt(
    x1: number, y1: number,
    x2: number, y2: number,
    hue: number, energy: number, bpm: number,
    maxAge?: number,
  ): void {
    if (bolts.length >= MAX_BOLTS) bolts.shift();
    bolts.push(makeBolt({ x1, y1, x2, y2, hue, energy, bpm, aspect: getAspect(), maxAge }));
  }

  function spawnEdgeBolt(hue: number, energy: number, bpm: number): void {
    const [x1, y1] = randomEdgeUV();
    // Target the opposite safe zone — bolts travel through upper or lower thirds
    const tx = rnd(0.10, 0.90);
    const ty = safeY();
    spawnBolt(x1, y1, tx, ty, hue, energy, bpm);
  }

  // ── drop burst ────────────────────────────────────────────────────────────
  function triggerDrop(energy: number, hue: number): void {
    const cx = rnd(0.35, 0.65), cy = rnd(0.40, 0.60);
    const arms = 6 + Math.round(energy * 4);
    for (let i = 0; i < arms; i++) {
      const angle = (i / arms) * Math.PI * 2 + rnd(-0.2, 0.2);
      const reach = rnd(0.55, 1.1);
      const ex = cx + Math.cos(angle) * reach;
      const ey = cy + Math.sin(angle) * (reach * 0.56); // squash vertically
      spawnBolt(cx, cy, ex, ey, hue + i * 0.08, energy, 120, rnd(1.2, 2.2));
    }
  }

  // ── beat state (3-band transient detection) ──────────────────────────────
  // Sub-bass band (0–8%): kick drum
  let sbFast = 0, sbSlow = 0, prevSb = 0;
  // Mid band (8–55%): snare, guitar, bass
  let midFast = 0, midSlow = 0, prevMid = 0;
  // High band (55–100%): cymbals, hi-hats, presence
  let hiFast = 0, hiSlow = 0, prevHi = 0;

  let impactCD    = 0;
  let beatCD      = 0;
  let beatClock   = 0;
  let beatSnapCD  = 0;   // prevents double-fire on transient snapping
  let bigHitCD    = 0;   // prevents comet spam on consecutive loud beats

  // ── GPU upload ────────────────────────────────────────────────────────────
  function uploadToGPU(): void {
    let segIdx = 0;

    for (const bolt of bolts) {
      const life = bolt.age / bolt.maxAge;
      const hue  = bolt.hue;

      for (const seg of bolt.segs) {
        if (segIdx >= MAX_SEGS) break;

        const base = segIdx * VERTS_PER_SEG * FLOATS_PER_VERT;
        const w    = seg.width;
        const intn = seg.intensity;

        // 4 vertices: (sta,-1) (sta,+1) (end,+1) (end,-1)
        const sides: [number, number][] = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
        for (let vi = 0; vi < 4; vi++) {
          const [side, tVal] = sides[vi]!;
          const off = base + vi * FLOATS_PER_VERT;
          buf[off + 0] = seg.x1;
          buf[off + 1] = seg.y1;
          buf[off + 2] = seg.x2;
          buf[off + 3] = seg.y2;
          buf[off + 4] = side;
          buf[off + 5] = tVal;
          buf[off + 6] = w;
          buf[off + 7] = intn;
          buf[off + 8] = hue;
          buf[off + 9] = life;
        }

        segIdx++;
      }
    }

    interleavedBuf.needsUpdate = true;
    geo.setDrawRange(0, segIdx * IDX_PER_SEG);
  }

  // ── main update ───────────────────────────────────────────────────────────
  function update(
    frequencyData: Uint8Array,
    energy: number,
    bpm: number,
    hue: number,
    dt: number,
  ): void {
    const aspect = getAspect();
    uniforms.uAspect.value = aspect;

    const len = frequencyData.length;
    if (len === 0) { uploadToGPU(); return; }

    // ── 3-band analysis ──────────────────────────────────────────────────────
    const sbEnd  = Math.floor(len * 0.08);   // 0–8%:   sub-bass / kick
    const midEnd = Math.floor(len * 0.55);   // 8–55%:  mids / snare / guitar
    //                                          55–100%: highs / cymbals
    let sb = 0, mid = 0, hi = 0;
    for (let i = 0;      i < sbEnd;  i++) sb  += frequencyData[i]! / 255;
    for (let i = sbEnd;  i < midEnd; i++) mid += frequencyData[i]! / 255;
    for (let i = midEnd; i < len;    i++) hi  += frequencyData[i]! / 255;
    sb  /= Math.max(1, sbEnd);
    mid /= Math.max(1, midEnd - sbEnd);
    hi  /= Math.max(1, len   - midEnd);

    // Per-band attacks (frame-to-frame rise)
    const sbAttack  = Math.max(0, sb  - prevSb);   prevSb  = sb;
    const midAttack = Math.max(0, mid - prevMid);  prevMid = mid;
    const hiAttack  = Math.max(0, hi  - prevHi);   prevHi  = hi;

    // Fast/slow EMAs for each band
    const k60 = (r: number) => Math.min(1, r * dt * 60);
    sbFast  += (sb  - sbFast)  * k60(0.55);  sbSlow  += (sb  - sbSlow)  * k60(0.04);
    midFast += (mid - midFast) * k60(0.55);  midSlow += (mid - midSlow) * k60(0.04);
    hiFast  += (hi  - hiFast)  * k60(0.55);  hiSlow  += (hi  - hiSlow)  * k60(0.04);

    // Per-band onset = fast−slow surplus + raw attack
    const sbOnset  = Math.max(0, sbFast  - sbSlow)  + sbAttack  * 0.7;
    const midOnset = Math.max(0, midFast - midSlow)  + midAttack * 0.7;
    const hiOnset  = Math.max(0, hiFast  - hiSlow)   + hiAttack  * 0.7;

    // Composite onset weighted toward bass (kick drives timing)
    const onset = sbOnset * 0.50 + midOnset * 0.30 + hiOnset * 0.20;

    // Multi-band hit: ALL bands firing at once = drum+guitar+cymbal+vocal together
    const isMultiHit     = sbOnset > 0.038 && midOnset > 0.030 && hiOnset > 0.025;
    const multiHitStrength = sbOnset + midOnset + hiOnset;

    impactCD   = Math.max(0, impactCD  - dt);
    beatCD     = Math.max(0, beatCD    - dt);
    beatSnapCD = Math.max(0, beatSnapCD - dt);
    bigHitCD   = Math.max(0, bigHitCD  - dt);
    beatClock += dt;

    const spb = 60 / Math.max(70, bpm);
    // Phase within the current beat window (0 = beat boundary)
    const beatPhase = beatClock / spb;
    const nearBeat  = beatPhase > 0.80 || beatPhase < 0.15;

    // ── Beat clock: always fire on boundary ──────────────────────────────────
    if (beatClock >= spb) {
      beatClock -= spb;
      spawnEdgeBolt(hue + rnd(-0.08, 0.08), energy, bpm);
    }

    // ── Transient snap: strong onset near beat boundary = fire immediately ───
    const onsetThresh = 0.055 - energy * 0.012;
    if (onset > onsetThresh && nearBeat && beatSnapCD <= 0 && impactCD <= 0) {
      spawnEdgeBolt(hue + rnd(-0.12, 0.12), Math.min(1, energy + onset * 0.5), bpm);
      beatSnapCD = spb * 0.45;
      impactCD   = 0.14;
    }

    // ── Onset-driven bolt (any phase, for off-beat hits) ─────────────────────
    if (onset > onsetThresh && impactCD <= 0) {
      spawnEdgeBolt(hue + rnd(-0.15, 0.15), Math.min(1, energy + onset * 0.4), bpm);
      impactCD = 0.22 + rnd(0, 0.06);
    }

    // ── Multi-hit comet: ALL bands explode = cross-screen arc ────────────────
    if (isMultiHit && multiHitStrength > 0.10 && bigHitCD <= 0) {
      const [x1, y1] = randomEdgeUV();  // already biased to safe zone
      // Mirror to opposite side but clamp y to safe zone
      const x2raw = 1 - x1 + rnd(-0.18, 0.18);
      const y2raw = 1 - y1 + rnd(-0.18, 0.18);
      const x2 = Math.max(0, Math.min(1, x2raw));
      const y2 = y2raw < 0.5 ? Math.min(y2raw, WAVE_TOP) : Math.max(y2raw, WAVE_BOT);
      spawnBolt(x1, y1, x2, y2, hue + rnd(0.3, 0.55), Math.min(1, energy + multiHitStrength * 0.5), bpm, rnd(0.7, 1.4));
      if (multiHitStrength > 0.20) {
        spawnEdgeBolt(hue + rnd(-0.2, 0.2), Math.min(1, energy + 0.25), bpm);
      }
      bigHitCD = 0.22;
      beatCD   = rnd(0.45, 0.85);
    } else if (onset > 0.28 && beatCD <= 0) {
      // Fallback: single strong bass hit — comet through safe zone
      const [x1, y1] = randomEdgeUV();
      const x2raw = 1 - x1 + rnd(-0.15, 0.15);
      const y2raw = 1 - y1 + rnd(-0.15, 0.15);
      const x2 = Math.max(0, Math.min(1, x2raw));
      const y2 = y2raw < 0.5 ? Math.min(y2raw, WAVE_TOP) : Math.max(y2raw, WAVE_BOT);
      spawnBolt(x1, y1, x2, y2, hue + rnd(0.3, 0.5), Math.min(1, energy + 0.2), bpm, rnd(0.9, 1.8));
      beatCD = rnd(0.6, 1.2);
    }

    // Age bolts
    for (let i = bolts.length - 1; i >= 0; i--) {
      bolts[i]!.age += dt;
      if (bolts[i]!.age >= bolts[i]!.maxAge) bolts.splice(i, 1);
    }

    uploadToGPU();
  }

  function dispose(): void {
    scene.remove(mesh);
    geo.dispose();
    mat.dispose();
  }

  return { update, triggerDrop, dispose };
}
