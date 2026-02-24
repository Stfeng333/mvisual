/**
 * Visual effects driven by BPM, energy, genre, and real-time FFT.
 *
 * Layer 1 – Fullscreen GLSL fluid shader (domain-warped FBM simplex noise)
 *            Looks like ink diffusing in water. Color reacts to energy/valence.
 * Layer 2 – 3,000 soft circular particles (custom ShaderMaterial + sprite texture)
 *            CPU physics: velocity, lifetime, continuous respawn.
 *            AdditiveBlending so they glow and composite like luminous smoke.
 */

import * as THREE from 'three';

// ─── Public types ────────────────────────────────────────────────────────────

export interface EffectParams {
  bpm: number;
  energy: number;
  valence: number;
  genres: string[];
  /** 0–1, mean FFT level */
  level: number;
  /** Raw FFT frequency bins */
  frequencyData: Uint8Array;
}

export interface VisualEffect {
  update: (params: EffectParams, dt: number) => void;
  dispose: () => void;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

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

// ─── Sprite texture ───────────────────────────────────────────────────────────

/** Soft radial-gradient circle — eliminates square-particle look */
function createSpriteTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0.0,  'rgba(255,255,255,1.0)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.6,  'rgba(255,255,255,0.25)');
  grad.addColorStop(1.0,  'rgba(255,255,255,0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

// ─── Background fluid shader ──────────────────────────────────────────────────

const FLUID_VERT = /* glsl */`
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * Domain-warped FBM produces organic, ink-in-water shapes.
 * Palette: dark → deep teal → luminous cyan, shifted by energy/valence.
 * Technique: q = fbm(uv), r = fbm(uv + q), n = fbm(uv + r)  (Inigo Quilez warp)
 */
const FLUID_FRAG = /* glsl */`
precision highp float;

uniform float uTime;
uniform float uEnergy;
uniform float uLow;
uniform float uMid;
uniform float uHigh;
uniform float uValence;
uniform vec2  uResolution;

// ── 2D Simplex noise (Stefan Gustavson / Ashima Arts, public domain) ──────────
vec3 mod289v3(vec3 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec2 mod289v2(vec2 x){ return x - floor(x*(1.0/289.0))*289.0; }
vec3 permute3(vec3 x){ return mod289v3(((x*34.0)+1.0)*x); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187,0.366025403784439,
                     -0.577350269189626,0.024390243902439);
  vec2 i  = floor(v + dot(v,C.yy));
  vec2 x0 = v - i + dot(i,C.xx);
  vec2 i1  = (x0.x > x0.y) ? vec2(1.0,0.0) : vec2(0.0,1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy  -= i1;
  i = mod289v2(i);
  vec3 p = permute3(permute3(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m = max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m = m*m; m = m*m;
  vec3 x2 = 2.0*fract(p*C.www)-1.0;
  vec3 h   = abs(x2)-0.5;
  vec3 ox  = floor(x2+0.5);
  vec3 a0  = x2-ox;
  m *= 1.79284291400159 - 0.85373472095314*(a0*a0+h*h);
  vec3 g;
  g.x  = a0.x *x0.x  + h.x *x0.y;
  g.yz = a0.yz*x12.xz + h.yz*x12.yw;
  return 130.0*dot(m,g);
}

// ── FBM with rotation to reduce axis-aligned artefacts ───────────────────────
float fbm(vec2 p){
  float v=0.0, a=0.5;
  mat2 rot = mat2(cos(0.5),sin(0.5),-sin(0.5),cos(0.5));
  for(int i=0;i<6;i++){
    v  += a*snoise(p);
    p   = rot*p*2.0 + vec2(31.4,17.3);
    a  *= 0.5;
  }
  return v;
}

// ── Color palette ─────────────────────────────────────────────────────────────
vec3 palette(float t, float energy, float valence){
  // Smoke/ink base → teal mid → cyan-white bright
  vec3 cA = vec3(0.02, 0.02, 0.04);
  vec3 cB = vec3(0.00, 0.12, 0.22);
  vec3 cC = vec3(0.04, 0.40, 0.52);
  vec3 cD = vec3(0.50, 0.90, 1.00);

  // High valence: shift toward violet/magenta
  vec3 vShift = vec3(0.18, -0.05, 0.25) * valence;
  // High energy: brighter, more saturated
  float bright = 0.8 + energy * 0.5;

  cC += vShift * 0.6;
  cD += vShift;

  vec3 col = mix(cA, cB, smoothstep(0.0, 0.4, t));
       col = mix(col, cC, smoothstep(0.3, 0.7, t));
       col = mix(col, cD, smoothstep(0.65, 1.0, t));
  return col * bright;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  uv = uv*2.0-1.0;
  uv.x *= uResolution.x/uResolution.y;

  // Time scaled by BPM-like feel; energy adds turbulence speed
  float spd = 0.10 + uEnergy*0.18;
  float t   = uTime * spd;

  // 3-pass domain warp  (q → r → n)
  vec2 q = vec2(fbm(uv + t),
                fbm(uv + vec2(5.2, 1.3) + t*0.9));

  vec2 r = vec2(fbm(uv + 3.5*q + vec2(1.7, 9.2) + t*0.6 + uLow*0.4),
                fbm(uv + 3.5*q + vec2(8.3, 2.8) + t*0.5 + uMid*0.3));

  float n = fbm(uv + 3.5*r + t*0.3);
  n = (n + 1.0)*0.5; // remap to [0,1]

  vec3 col = palette(n, uEnergy, uValence);

  // Bass flash: bright pulse on kick
  col += uLow * 0.12 * vec3(0.5, 1.0, 1.2);

  // Edge vignette
  float vignette = 1.0 - smoothstep(0.55, 1.4, length(uv * 0.6));
  col *= vignette;

  gl_FragColor = vec4(col, 1.0);
}`;

// ─── Particle shaders ────────────────────────────────────────────────────────

const PARTICLE_VERT = /* glsl */`
attribute float aSize;
attribute float aAlpha;
attribute float aHue;
varying float vAlpha;
varying float vHue;
void main(){
  vAlpha = aAlpha;
  vHue   = aHue;
  vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
  // Mild perspective scale; works well with camera at z=5
  gl_PointSize = aSize * (28.0 / max(0.1, -mvPos.z));
  gl_Position  = projectionMatrix * mvPos;
}`;

const PARTICLE_FRAG = /* glsl */`
precision mediump float;
uniform sampler2D uSprite;
uniform float uEnergy;
varying float vAlpha;
varying float vHue;

vec3 hsl2rgb(float h, float s, float l){
  vec3 rgb = clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0);
  return l + s*(rgb - 0.5)*(1.0 - abs(2.0*l - 1.0));
}

void main(){
  float spriteAlpha = texture2D(uSprite, gl_PointCoord).r;
  // Hue range: 0.45–0.58 (teal/cyan), shifted by energy toward violet
  float h = 0.50 + vHue*0.10 + uEnergy*0.06;
  float s = 0.75;
  float l = 0.55 + uEnergy*0.15;
  vec3 col = hsl2rgb(h, s, l);
  float alpha = spriteAlpha * vAlpha;
  if(alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
}`;

// ─── Main effect factory ─────────────────────────────────────────────────────

const PARTICLE_COUNT = 3000;

export function createOrbAndParticles(scene: THREE.Scene, params: EffectParams): VisualEffect {

  // ── 1. Background fluid mesh ───────────────────────────────────────────────
  const bgGeo = new THREE.PlaneGeometry(2, 2);
  const bgUniforms = {
    uTime:       { value: 0 },
    uEnergy:     { value: params.energy },
    uLow:        { value: 0 },
    uMid:        { value: 0 },
    uHigh:       { value: 0 },
    uValence:    { value: params.valence },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
  };
  const bgMat = new THREE.ShaderMaterial({
    uniforms:       bgUniforms,
    vertexShader:   FLUID_VERT,
    fragmentShader: FLUID_FRAG,
    depthTest:      false,
    depthWrite:     false,
  });
  const bgMesh = new THREE.Mesh(bgGeo, bgMat);
  bgMesh.frustumCulled = false;
  bgMesh.renderOrder  = -1;
  scene.add(bgMesh);

  // ── 2. Particle system ─────────────────────────────────────────────────────
  const sprite = createSpriteTexture();

  // GPU buffers
  const posArr   = new Float32Array(PARTICLE_COUNT * 3);
  const sizeArr  = new Float32Array(PARTICLE_COUNT);
  const alphaArr = new Float32Array(PARTICLE_COUNT);
  const hueArr   = new Float32Array(PARTICLE_COUNT);

  // CPU physics arrays (not sent to GPU)
  const velX     = new Float32Array(PARTICLE_COUNT);
  const velY     = new Float32Array(PARTICLE_COUNT);
  const velZ     = new Float32Array(PARTICLE_COUNT);
  const life     = new Float32Array(PARTICLE_COUNT);
  const maxLife  = new Float32Array(PARTICLE_COUNT);
  const baseSz   = new Float32Array(PARTICLE_COUNT);

  function spawnParticle(i: number, energyBoost = 0): void {
    const angle = Math.random() * Math.PI * 2;
    const r     = Math.random() * 0.6;
    posArr[i * 3]     = r * Math.cos(angle);
    posArr[i * 3 + 1] = (Math.random() - 0.6) * 1.2; // bias downward so smoke rises
    posArr[i * 3 + 2] = (Math.random() - 0.5) * 0.8;

    const spd  = 0.25 + Math.random() * 0.5 + energyBoost * 0.6;
    velX[i]    = (Math.random() - 0.5) * 0.25;
    velY[i]    =  spd;
    velZ[i]    = (Math.random() - 0.5) * 0.15;

    life[i]    = 1.0;
    maxLife[i] = 1.2 + Math.random() * 2.8;
    baseSz[i]  = 6 + Math.random() * 14;
    hueArr[i]  = Math.random();
    alphaArr[i]= 0.0;
    sizeArr[i] = baseSz[i];
  }

  // Stagger initial spawn times
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    spawnParticle(i);
    life[i] = Math.random(); // random phase so they don't all expire together
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(posArr,   3).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aSize',    new THREE.BufferAttribute(sizeArr,  1).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphaArr, 1).setUsage(THREE.DynamicDrawUsage));
  pGeo.setAttribute('aHue',     new THREE.BufferAttribute(hueArr,   1));

  const pUniforms = {
    uSprite: { value: sprite },
    uEnergy: { value: params.energy },
  };
  const pMat = new THREE.ShaderMaterial({
    uniforms:       pUniforms,
    vertexShader:   PARTICLE_VERT,
    fragmentShader: PARTICLE_FRAG,
    transparent:    true,
    depthWrite:     false,
    blending:       THREE.AdditiveBlending,
  });

  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);

  // ── Beat detection state ───────────────────────────────────────────────────
  let smoothedLow = 0;
  let elapsed = 0;

  return {
    update(efParams: EffectParams, dt: number) {
      elapsed += dt;

      const bands = getBandLevels(efParams.frequencyData);

      // Beat detection: spike in low band above smoothed baseline
      const beatThreshold = 0.14;
      const isBeat = (bands.low - smoothedLow) > beatThreshold;
      smoothedLow = smoothedLow * 0.88 + bands.low * 0.12;

      // ── Update background shader ─────────────────────────────────────────
      bgUniforms.uTime.value    = elapsed;
      bgUniforms.uEnergy.value  = efParams.energy;
      bgUniforms.uLow.value     = bands.low;
      bgUniforms.uMid.value     = bands.mid;
      bgUniforms.uHigh.value    = bands.high;
      bgUniforms.uValence.value = efParams.valence;
      bgUniforms.uResolution.value.set(window.innerWidth, window.innerHeight);

      // ── Update particles ──────────────────────────────────────────────────
      pUniforms.uEnergy.value = efParams.energy;

      // On beat: add a burst (respawn 60 particles with extra speed)
      if (isBeat) {
        let burst = 0;
        for (let i = 0; i < PARTICLE_COUNT && burst < 60; i++) {
          if (life[i]! < 0.15) {
            spawnParticle(i, bands.low);
            burst++;
          }
        }
      }

      const posAttr   = pGeo.attributes.position as THREE.BufferAttribute;
      const sizeAttr  = pGeo.attributes.aSize    as THREE.BufferAttribute;
      const alphaAttr = pGeo.attributes.aAlpha   as THREE.BufferAttribute;

      // Turbulence: slow lateral drift driven by mid band
      const turbScale = 0.08 + bands.mid * 0.18;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        let l = life[i]!;
        l -= dt / maxLife[i]!;

        if (l <= 0) {
          spawnParticle(i);
          continue;
        }
        life[i] = l;

        // Velocity: gentle upward drag, lateral noise
        velX[i]! += (Math.random() - 0.5) * turbScale * dt;
        velY[i]! += (-0.06 + efParams.energy * 0.04) * dt; // slow deceleration
        velZ[i]! += (Math.random() - 0.5) * turbScale * 0.5 * dt;

        const i3 = i * 3;
        posArr[i3]!     += velX[i]! * dt;
        posArr[i3 + 1]! += velY[i]! * dt;
        posArr[i3 + 2]! += velZ[i]! * dt;

        // Fade in fast, fade out gently (t=1 new, t=0 dead)
        const fadeIn  = Math.min(1, (1 - l) * 8); // snap in quickly
        const fadeOut = l < 0.3 ? l / 0.3 : 1.0;
        alphaArr[i] = fadeIn * fadeOut * (0.45 + efParams.energy * 0.3);

        // Grow slightly as particle ages (smoke expands)
        const age = 1 - l;
        sizeArr[i] = baseSz[i]! * (0.6 + age * 1.2);
      }

      posAttr.needsUpdate   = true;
      sizeAttr.needsUpdate  = true;
      alphaAttr.needsUpdate = true;
    },

    dispose() {
      bgGeo.dispose();
      bgMat.dispose();
      pGeo.dispose();
      pMat.dispose();
      sprite.dispose();
      scene.remove(bgMesh);
      scene.remove(points);
    },
  };
}
