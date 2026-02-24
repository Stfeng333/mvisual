/**
 * Visual effects driven by BPM, energy, genre, and real-time FFT.
 *
 * Single fullscreen GLSL shader â€” domain-warped FBM simplex noise.
 * Technique: most of the screen stays black; only noise *peaks* get color,
 * producing thin wispy tendrils that look like ink/smoke diffusing in water.
 * Color palette shifts with energy (calm=pinkâ†’magenta, loud=redâ†’orange).
 */

import * as THREE from 'three';

// â”€â”€â”€ Public types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface EffectParams {
  bpm: number;
  energy: number;
  valence: number;
  genres: string[];
  /** 0â€“1, mean FFT level */
  level: number;
  /** Raw FFT frequency bins */
  frequencyData: Uint8Array;
}

export interface VisualEffect {
  update: (params: EffectParams, dt: number) => void;
  dispose: () => void;
}

// â”€â”€â”€ Utility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Shaders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const FLUID_VERT = /* glsl */`
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/**
 * How it works:
 *  1. FBM simplex noise ran through two domain-warp passes â†’ organic curl shapes
 *  2. The raw noise value (â€“1..1) is remapped so that only values ABOVE a
 *     threshold are visible â€” this keeps the background black and concentrates
 *     color in thin, wispy tendrils (the ink-in-water look).
 *  3. A smooth power curve on the visibility mask creates feathered edges
 *     instead of hard outlines.
 *  4. Color: three-stop gradient (deep â†’ mid â†’ core) tinted by energy/valence.
 *     Calm/low energy â†’ cool pink/rose; high energy â†’ hot coral/magenta.
 *  5. Bass reactive: on loud beats the threshold drops so more ink bleeds out.
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

// â”€â”€ 2D Simplex noise â€” Stefan Gustavson / Ashima Arts (public domain) â”€â”€â”€â”€â”€â”€â”€â”€â”€
vec3 mod289v3(vec3 x){ return x - floor(x*(1./289.))*289.; }
vec2 mod289v2(vec2 x){ return x - floor(x*(1./289.))*289.; }
vec3 permute3(vec3 x){ return mod289v3(((x*34.)+1.)*x); }

float snoise(vec2 v){
  const vec4 C = vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i  = floor(v + dot(v,C.yy));
  vec2 x0 = v - i + dot(i,C.xx);
  vec2 i1 = (x0.x>x0.y) ? vec2(1.,0.) : vec2(0.,1.);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289v2(i);
  vec3 p = permute3(permute3(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m = max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);
  m=m*m; m=m*m;
  vec3 x2 = 2.*fract(p*C.www)-1.;
  vec3 h = abs(x2)-.5;
  vec3 ox = floor(x2+.5);
  vec3 a0 = x2-ox;
  m *= 1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g;
  g.x  = a0.x*x0.x  + h.x*x0.y;
  g.yz = a0.yz*x12.xz + h.yz*x12.yw;
  return 130.*dot(m,g);
}

// â”€â”€ FBM: 6 octaves, rotated to break axis artefacts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
mat2 rot2(float a){ float c=cos(a),s=sin(a); return mat2(c,s,-s,c); }

float fbm(vec2 p){
  float v=0., a=.5;
  mat2 r = rot2(.5);
  for(int i=0;i<6;i++){
    v += a*snoise(p);
    p  = r*p*2.1 + vec2(31.4,17.3);
    a *= .5;
  }
  return v; // range roughly â€“1..1
}

// â”€â”€ Ink/smoke color: three-stop gradient, energy-tinted â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
vec3 inkColor(float t, float energy, float valence){
  // t=0 â†’ sparse/outer wisp, t=1 â†’ dense/core
  // Base palette: deep rose outer â†’ vivid pink mid â†’ near-white hot core
  // Energy shifts hue (calm=cool pink, loud=warm coral/magenta)
  float hueShift = energy * 0.12 - valence * 0.06;

  vec3 outer = vec3(0.55 + hueShift, 0.10, 0.25 - hueShift*0.5);
  vec3 mid   = vec3(0.90 + hueShift*0.5, 0.30, 0.55);
  vec3 core  = vec3(1.00, 0.85, 0.90);

  vec3 col = mix(outer, mid,  smoothstep(0.0, 0.5, t));
       col = mix(col,   core, smoothstep(0.5, 1.0, t));
  // Intensity: energy brightens mid/core, quiet tracks stay moody
  float lum = 0.5 + energy * 0.7;
  return col * lum;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uResolution;
  // Center origin, correct aspect
  uv = uv*2.-1.;
  uv.x *= uResolution.x/uResolution.y;

  // Slow drift â€” smoke doesn't rush
  float spd = 0.055 + uEnergy*0.07;
  float t   = uTime * spd;

  // Two-pass domain warp
  vec2 q = vec2(fbm(uv*1.4 + t),
                fbm(uv*1.4 + vec2(4.7, 2.3) + t*0.85));

  vec2 r = vec2(fbm(uv*1.2 + 2.8*q + vec2(1.7, 9.2) + t*0.6 + uLow*0.5),
                fbm(uv*1.2 + 2.8*q + vec2(8.3, 2.8) + t*0.5 + uMid*0.3));

  float n = fbm(uv*0.9 + 2.5*r + t*0.25);
  // n is in roughly â€“1..1; remap to 0..1
  float density = clamp(n*0.5 + 0.5, 0., 1.);

  // â”€â”€ KEY: visibility mask keeps background BLACK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Only pixels where density exceeds threshold get color.
  // Bass kicks lower the threshold slightly so more ink bleeds out on beats.
  float threshold = 0.56 - uLow*0.08 - uEnergy*0.04;
  float rawMask = density - threshold;
  if(rawMask <= 0.0){ gl_FragColor = vec4(0.,0.,0.,1.); return; }

  // Smooth feathered edge â€” no hard lines
  float spread = 0.22 + uEnergy*0.08;
  float mask = smoothstep(0., spread, rawMask);
  // Power curve: thins outer wisps, densifies core
  mask = pow(mask, 1.4);

  // Color mapped from wisp-thin (t=0) to dense-core (t=1)
  vec3 col = inkColor(mask, uEnergy, uValence);

  // Subtle extra glow at dense core (bloom stand-in)
  float coreMask = pow(mask, 3.5);
  col += coreMask * vec3(0.8, 0.7, 0.8) * (0.3 + uMid*0.4);

  gl_FragColor = vec4(col * mask, 1.0);
}`;

// â”€â”€â”€ Main effect factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function createOrbAndParticles(scene: THREE.Scene, params: EffectParams): VisualEffect {

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
  bgMesh.renderOrder   = -1;
  scene.add(bgMesh);

  let elapsed = 0;

  return {
    update(efParams: EffectParams, dt: number) {
      elapsed += dt;
      const bands = getBandLevels(efParams.frequencyData);

      bgUniforms.uTime.value    = elapsed;
      bgUniforms.uEnergy.value  = efParams.energy * 0.5 + efParams.level * 0.5;
      bgUniforms.uLow.value     = bands.low;
      bgUniforms.uMid.value     = bands.mid;
      bgUniforms.uHigh.value    = bands.high;
      bgUniforms.uValence.value = efParams.valence;
      bgUniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    },

    dispose() {
      bgGeo.dispose();
      bgMat.dispose();
      scene.remove(bgMesh);
    },
  };
}
