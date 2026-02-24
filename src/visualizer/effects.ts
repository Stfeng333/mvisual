/**
 * Visuals:
 *  - Pure black background
 *  - Coloured smoke that shoots inward from all four screen borders,
 *    pulsing with BPM and reacting to energy/bass
 *  - On each hard beat: a smooth radial paint explosion bursts from
 *    the centre and expands outward, then fades
 *
 * Implemented as a single fullscreen GLSL shader + JS-side beat detection.
 */

import * as THREE from 'three';

// ─── Public types ─────────────────────────────────────────────────────────────

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

// ─── Utility ──────────────────────────────────────────────────────────────────

export function getBandLevels(data: Uint8Array): { low: number; mid: number; high: number } {
  const len = data.length;
  if (len === 0) return { low: 0, mid: 0, high: 0 };
  const lowEnd = Math.floor(len * 0.25);
  const midEnd = Math.floor(len * 0.6);
  let low = 0, mid = 0, high = 0;
  for (let i = 0; i < lowEnd; i++) low += data[i]!;
  for (let i = lowEnd; i < midEnd; i++) mid += data[i]!;
  for (let i = midEnd; i < len; i++) high += data[i]!;
  return {
    low:  low  / lowEnd            / 255,
    mid:  mid  / (midEnd - lowEnd) / 255,
    high: high / (len - midEnd)    / 255,
  };
}

// ─── Vertex shader ────────────────────────────────────────────────────────────

const VERT = /* glsl */`
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// ─── Fragment shader ──────────────────────────────────────────────────────────

const FRAG = /* glsl */`
precision highp float;

uniform float uTime;
uniform float uEnergy;
uniform float uLow;
uniform float uMid;
uniform float uHigh;
uniform float uValence;
uniform float uBeat;
uniform float uBpmPhase;
uniform vec2  uResolution;

// ── Simplex noise 2D — Gustavson / Ashima Arts (public domain) ───────────────
vec3 _m289v3(vec3 x){ return x - floor(x*(1./289.))*289.; }
vec2 _m289v2(vec2 x){ return x - floor(x*(1./289.))*289.; }
vec3 _perm(vec3 x)  { return _m289v3(((x*34.)+1.)*x); }

float snoise(vec2 v){
  const vec4 C = vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1  = (x0.x > x0.y) ? vec2(1.,0.) : vec2(0.,1.);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy  -= i1;
  i = _m289v2(i);
  vec3 p = _perm(_perm(i.y + vec3(0.,i1.y,1.)) + i.x + vec3(0.,i1.x,1.));
  vec3 m = max(.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.);
  m = m*m; m = m*m;
  vec3 x2 = 2.*fract(p*C.www) - 1.;
  vec3 h   = abs(x2) - .5;
  vec3 ox  = floor(x2 + .5);
  vec3 a0  = x2 - ox;
  m *= 1.79284291400159 - .85373472095314*(a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x*x0.x  + h.x*x0.y;
  g.yz = a0.yz*x12.xz + h.yz*x12.yw;
  return 130.*dot(m, g);
}

// ── FBM 5 octaves ─────────────────────────────────────────────────────────────
float fbm(vec2 p) {
  float v = 0., a = .5;
  float s = sin(.5), c = cos(.5);
  mat2 r = mat2(c, s, -s, c);
  for (int i = 0; i < 5; i++) {
    v += a * snoise(p);
    p  = r * p * 2.05 + vec2(12.3, 7.1);
    a *= .5;
  }
  return v;
}

// ── Smoke colour ──────────────────────────────────────────────────────────────
// valence 0 = cool blue-violet, valence 1 = warm pink-magenta
vec3 smokeCol(float t, float energy, float valence) {
  vec3 cThin = mix(vec3(0.08, 0.02, 0.30), vec3(0.40, 0.03, 0.18), valence);
  vec3 cMid  = mix(vec3(0.28, 0.08, 0.80), vec3(0.90, 0.20, 0.50), valence);
  vec3 cCore = mix(vec3(0.65, 0.50, 1.00), vec3(1.00, 0.75, 0.80), valence);
  vec3 col = mix(cThin, cMid,  smoothstep(0.0, 0.55, t));
       col = mix(col,   cCore, smoothstep(0.55, 1.0,  t));
  return col * (0.35 + energy * 0.85);
}

// ── Explosion colour ──────────────────────────────────────────────────────────
vec3 explodeCol(float t, float valence, float energy) {
  vec3 rim  = mix(vec3(0.45, 0.10, 0.90), vec3(1.00, 0.35, 0.15), valence);
  vec3 core = mix(vec3(0.85, 0.70, 1.00), vec3(1.00, 0.92, 0.75), valence);
  return mix(rim, core, t) * (0.85 + energy * 0.55);
}

void main() {
  vec2 uv  = gl_FragCoord.xy / uResolution;
  float ar = uResolution.x / uResolution.y;
  // Aspect-corrected centred coords
  vec2 uvC = (uv - .5) * vec2(ar, 1.0);

  // ── BORDER SMOKE ──────────────────────────────────────────────────────────
  // edgeDist: 0 at screen edge, 0.5 at centre
  float edgeDist   = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  float bpmPulse   = 0.5 + 0.5 * sin(uBpmPhase);
  float borderZone = 0.26 + uEnergy * 0.12 + bpmPulse * 0.03;
  // 1 at edge → 0 at borderZone depth
  float borderMask = pow(1.0 - smoothstep(0.0, borderZone, edgeDist), 1.8);

  vec3 outSmoke = vec3(0.0);

  if (borderMask > 0.001) {
    // Inward flow: each UV point is pushed toward (0.5, 0.5) over time
    vec2 inward = (vec2(0.5) - uv) * (0.18 + uEnergy * 0.12);
    vec2 flowUV = uv * 3.0 + inward * uTime;
    // Bass turbulence
    flowUV += vec2(uLow * 0.55 * sin(uTime * 1.9 + uv.y * 4.0),
                   uLow * 0.55 * cos(uTime * 1.6 + uv.x * 4.0));

    // Two-pass domain warp
    vec2 q = vec2(fbm(flowUV),
                  fbm(flowUV + vec2(4.9, 2.1)));
    float n = fbm(flowUV + 2.2 * q);

    float density = clamp(n * 0.5 + 0.5, 0., 1.);
    float thresh  = 0.50 - uLow * 0.10;
    float raw     = density - thresh;

    if (raw > 0.0) {
      float sm = pow(smoothstep(0.0, 0.30, raw), 1.2);
      outSmoke = smokeCol(sm, uEnergy, uValence) * (borderMask * sm);
    }
  }

  // ── BEAT EXPLOSION ────────────────────────────────────────────────────────
  vec3 outExplode = vec3(0.0);

  if (uBeat > 0.001) {
    float dist = length(uvC);

    // Ring expands outward as uBeat decays 1→0
    float ringR     = (1.0 - uBeat) * 1.40;
    float ringWidth = 0.06 + (1.0 - uBeat) * 0.22;
    float innerR    = ringR - 0.02;
    float outerR    = ringR + ringWidth;

    float ring = smoothstep(innerR - 0.03, innerR, dist)
               * (1.0 - smoothstep(ringR, outerR, dist));
    ring = pow(ring, 0.65) * uBeat;

    // central splat disk — only visible right at beat moment
    float splatR = uBeat * 0.18;
    float splat  = (1.0 - smoothstep(0.0, splatR + 0.005, dist)) * uBeat * uBeat;

    // soft inner fill inside the ring
    float fill = (1.0 - smoothstep(0.0, max(ringR - 0.02, 0.001), dist))
                 * uBeat * 0.20;

    float total = ring + splat * 0.95 + fill;
    float t     = clamp(1.0 - dist / max(ringR + 0.18, 0.001), 0., 1.);
    outExplode  = explodeCol(t, uValence, uEnergy) * total;
  }

  // ── Composite ─────────────────────────────────────────────────────────────
  vec3 col = outSmoke + outExplode;

  // Very faint centre ambient (barely visible unless high energy)
  float centreA = (1.0 - smoothstep(0.0, 0.30, length(uvC))) * uEnergy * 0.05;
  col += smokeCol(0.35, uEnergy, uValence) * centreA;

  gl_FragColor = vec4(col, 1.0);
}`;

// ─── Main factory ─────────────────────────────────────────────────────────────

export function createOrbAndParticles(scene: THREE.Scene, params: EffectParams): VisualEffect {
  const bgGeo = new THREE.PlaneGeometry(2, 2);

  const bgUniforms = {
    uTime:       { value: 0 },
    uEnergy:     { value: params.energy },
    uLow:        { value: 0 },
    uMid:        { value: 0 },
    uHigh:       { value: 0 },
    uValence:    { value: Math.max(0.01, params.valence) },
    uBeat:       { value: 0 },
    uBpmPhase:   { value: 0 },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  };

  const bgMat = new THREE.ShaderMaterial({
    uniforms:       bgUniforms,
    vertexShader:   VERT,
    fragmentShader: FRAG,
    depthTest:      false,
    depthWrite:     false,
  });

  const bgMesh = new THREE.Mesh(bgGeo, bgMat);
  bgMesh.frustumCulled = false;
  bgMesh.renderOrder   = -1;
  scene.add(bgMesh);

  let elapsed   = 0;
  let smoothLow = 0;
  let beatDecay = 0;
  let bpmPhase  = 0;

  const BEAT_FADE   = 0.65;  // seconds for explosion ring to fully fade
  const LOW_ATTACK  = 0.35;
  const LOW_RELEASE = 0.05;
  const BEAT_THRESH = 0.16;  // spike above baseline needed to trigger beat

  return {
    update(p: EffectParams, dt: number) {
      elapsed += dt;
      const bands = getBandLevels(p.frequencyData);

      // Smooth baseline for beat detection (rises fast, falls slow)
      smoothLow += (bands.low > smoothLow)
        ? (bands.low - smoothLow) * LOW_ATTACK
        : (bands.low - smoothLow) * LOW_RELEASE;

      // Beat trigger: don't re-trigger while current explosion is still strong
      if ((bands.low - smoothLow) > BEAT_THRESH && beatDecay < 0.25) {
        beatDecay = 1.0;
      }
      beatDecay = Math.max(0, beatDecay - dt / BEAT_FADE);

      // BPM phase for border pulse
      bpmPhase += dt * ((p.bpm || 120) / 60) * Math.PI * 2;
      if (bpmPhase > Math.PI * 2) bpmPhase -= Math.PI * 2;

      bgUniforms.uTime.value     = elapsed;
      bgUniforms.uEnergy.value   = p.energy * 0.55 + p.level * 0.45;
      bgUniforms.uLow.value      = bands.low;
      bgUniforms.uMid.value      = bands.mid;
      bgUniforms.uHigh.value     = bands.high;
      bgUniforms.uValence.value  = Math.max(0.01, p.valence);
      bgUniforms.uBeat.value     = beatDecay;
      bgUniforms.uBpmPhase.value = bpmPhase;
      bgUniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    },

    dispose() {
      bgGeo.dispose();
      bgMat.dispose();
      scene.remove(bgMesh);
    },
  };
}
