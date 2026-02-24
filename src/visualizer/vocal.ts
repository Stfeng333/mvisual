import * as THREE from 'three';

const VERT = /* glsl */`
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */`
precision highp float;

uniform vec2  uResolution;
uniform float uAspect;
uniform float uTime;
uniform float uRealTime;
uniform float uVocalEnergy;
uniform float uSustain;
uniform float uFlux;
uniform float uPitchRatio;
uniform float uHueBase;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.1);
  return fract(p.x * p.y);
}

vec3 hsv2rgb(float h, float s, float v) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(vec3(h) + K.xyz) * 6.0 - K.www);
  return v * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), s);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1,0)), f.x),
    mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x),
    f.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);

  vec3  col      = vec3(0.0);
  float alphaAcc = 0.0;

  float baseHue   = uHueBase + uPitchRatio * 0.08;
  float floatY    = sin(uRealTime * 0.17) * 0.035;
  float energy    = max(0.04, uVocalEnergy);
  float amp       = max(0.025 + energy * 0.110, uSustain * 0.080);
  float thickness = 0.005 + energy * 0.014 + uSustain * 0.005;

  for (int layer = 0; layer < 5; layer++) {
    float fi       = float(layer);
    float layerOff = (fi - 2.0) * 0.034;
    float freq     = 2.6 + fi * 1.4;
    float speed    = 0.65 + fi * 0.30;
    float phase    = fi * 1.6 + uRealTime * (0.07 - fi * 0.01);
    float hShift   = fi * 0.055;
    float sat      = 0.90 - fi * 0.06;
    float fading   = 1.0 - fi * 0.05;

    float wx   = freq * p.x + uTime * speed + phase;
    float wave = amp * sin(wx)
               + amp * 0.42 * sin(wx * 2.07 + 1.1)
               + energy * 0.018 * sin(p.x * 9.2 + uRealTime * 2.5 + fi);
    float noiseW = vnoise(vec2(p.x * 4.0 + uTime * 0.4, fi * 3.1)) * energy * 0.014;

    float cy   = floatY + layerOff + wave + noiseW;
    float dist = abs(p.y - cy);
    float t2   = thickness * thickness;
    float glow = exp(-dist * dist / t2 * 2.0);
    float halo = exp(-dist * dist / (t2 * 8.0)) * (0.10 + energy * 0.60);

    float brightness = (glow + halo) * fading;
    float val        = (0.08 + energy * 1.25) * brightness;
    vec3 lc          = hsv2rgb(baseHue + hShift, sat, val);
    float layerA     = brightness * (0.06 + energy * 0.90) * (1.0 - alphaAcc * 0.45);
    col      += lc * layerA;
    alphaAcc += layerA;
  }

  if (uSustain > 0.05) {
    float aY      = p.y - floatY;
    float ap      = uRealTime * 0.10;
    float c1      = (sin(p.x * 3.0 + ap) * 0.5 + 0.5) * (sin(p.x * 7.3 - ap * 1.8) * 0.35 + 0.65);
    float c2      = (sin(p.x * 5.1 - ap * 0.7) * 0.5 + 0.5) * (sin(p.x * 2.2 + ap * 1.2) * 0.3 + 0.7);
    float curtain = mix(c1, c2, 0.5);
    float aWidth  = 0.07 + uSustain * 0.09;
    float aGlow   = exp(-aY * aY / (aWidth * aWidth)) * curtain;
    vec3 aCol = hsv2rgb(baseHue + 0.10, 0.60, 0.50) * aGlow * uSustain * 0.38 * (1.0 - alphaAcc * 0.5);
    col      += aCol;
    alphaAcc += aGlow * uSustain * 0.30;
  }

  if (uFlux > 0.04) {
    float d      = length(p - vec2(0.0, floatY));
    float ringR  = uFlux * 0.30;
    float ring   = exp(-pow(d - ringR, 2.0) * 140.0) * uFlux;
    float flash  = exp(-d * d * 22.0) * uFlux * 0.85;
    vec3 fluxCol = hsv2rgb(baseHue + 0.50, 0.65, 1.0);
    float fluxA  = (ring * 0.80 + flash) * (1.0 - alphaAcc * 0.4);
    col      += fluxCol * fluxA;
    alphaAcc += fluxA * 0.60;
  }

  gl_FragColor = vec4(col, clamp(alphaAcc, 0.0, 1.0));
}`;

export interface VocalLayer {
  update: (freq: Uint8Array, dt: number) => void;
  dispose: () => void;
}

export function createVocalLayer(scene: THREE.Scene): VocalLayer {
  const uniforms = {
    uResolution:  { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uAspect:      { value: window.innerWidth / window.innerHeight },
    uTime:        { value: 0 },
    uRealTime:    { value: 0 },
    uVocalEnergy: { value: 0 },
    uSustain:     { value: 0 },
    uFlux:        { value: 0 },
    uPitchRatio:  { value: 0.5 },
    uHueBase:     { value: Math.random() },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader:   VERT,
    fragmentShader: FRAG,
    uniforms,
    transparent:  true,
    depthTest:    false,
    depthWrite:   false,
    blending:     THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder   = 2;
  scene.add(mesh);

  let vocalEmaFast  = 0;
  let vocalEmaSlow  = 0;
  let sustainLevel  = 0;
  let fluxSmooth    = 0;
  let prevVocalMid  = 0;
  let pitchRatioEma = 0.5;
  let timeAccum     = 0;
  let realTime      = 0;
  let hueBase       = uniforms.uHueBase.value;
  let prevFluxAbove   = false;
  let prevOnsetAbove  = false;

  function update(freq: Uint8Array, dt: number): void {
    realTime += dt;

    if (freq.length > 0) {
      const len      = freq.length;
      const vStart   = Math.floor(len * 0.007);
      const vLowEnd  = Math.floor(len * 0.032);
      const vMidEnd  = Math.floor(len * 0.113);
      const vHighEnd = Math.floor(len * 0.272);

      let vLow = 0, vMid = 0, vHigh = 0;
      for (let i = vStart;   i < vLowEnd;  i++) vLow  += freq[i]! / 255;
      for (let i = vLowEnd;  i < vMidEnd;  i++) vMid  += freq[i]! / 255;
      for (let i = vMidEnd;  i < vHighEnd; i++) vHigh += freq[i]! / 255;
      vLow  /= Math.max(1, vLowEnd  - vStart);
      vMid  /= Math.max(1, vMidEnd  - vLowEnd);
      vHigh /= Math.max(1, vHighEnd - vMidEnd);

      const vocalEnergy   = vLow * 0.20 + vMid * 0.60 + vHigh * 0.20;
      const pitchTarget   = vHigh / Math.max(0.01, vLow + vMid + vHigh);
      pitchRatioEma      += (pitchTarget - pitchRatioEma) * Math.min(1, dt * 3.0);

      vocalEmaFast += (vocalEnergy - vocalEmaFast) * Math.min(1, 0.30 * dt * 60);
      vocalEmaSlow += (vocalEnergy - vocalEmaSlow) * Math.min(1, 0.05 * dt * 60);

      const stable        = Math.abs(vocalEmaFast - vocalEmaSlow) < 0.045;
      const singing       = vocalEmaSlow > 0.10;
      const sustainTarget = (stable && singing) ? Math.min(1.0, vocalEmaSlow * 3.5) : 0.0;
      sustainLevel       += (sustainTarget - sustainLevel) * Math.min(1, dt * 2.0);

      const fluxTarget = Math.min(1.0, Math.max(0, vMid - prevVocalMid) * 14.0);
      if (fluxTarget > fluxSmooth) {
        fluxSmooth += (fluxTarget - fluxSmooth) * Math.min(1, dt * 12.0);
      } else {
        fluxSmooth *= Math.pow(0.04, dt);
      }
      prevVocalMid = vMid;

      uniforms.uVocalEnergy.value = vocalEmaFast;
      uniforms.uSustain.value     = sustainLevel;
      uniforms.uFlux.value        = fluxSmooth;
      uniforms.uPitchRatio.value  = pitchRatioEma;

      const isFluxPeak  = fluxSmooth > 0.42;
      const isOnset     = (vocalEmaFast - vocalEmaSlow) > 0.16;

      hueBase += 0.009 * dt * (1.0 - sustainLevel * 0.75);

      if (isFluxPeak && !prevFluxAbove) {
        hueBase += 0.22 + Math.random() * 0.38;
      } else if (isOnset && !prevOnsetAbove) {
        hueBase += 0.15 + Math.random() * 0.28;
      }

      prevFluxAbove  = isFluxPeak;
      prevOnsetAbove = isOnset;
      hueBase        = hueBase % 1.0;
      uniforms.uHueBase.value = hueBase;
    }

    timeAccum += dt * (1.0 - sustainLevel * 0.875);
    uniforms.uTime.value     = timeAccum;
    uniforms.uRealTime.value = realTime;
    uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
    uniforms.uAspect.value = window.innerWidth / window.innerHeight;
  }

  function dispose(): void {
    scene.remove(mesh);
    material.dispose();
    mesh.geometry.dispose();
  }

  return { update, dispose };
}
