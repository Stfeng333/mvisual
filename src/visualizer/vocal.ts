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
uniform float uBeatFlash;
uniform float uHueSpread;

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
  float thickness = 0.009 + energy * 0.016 + uSustain * 0.006;

  for (int layer = 0; layer < 5; layer++) {
    float fi       = float(layer);
    float layerOff = (fi - 2.0) * 0.034;
    float freq     = 2.6 + fi * 1.4;
    float speed    = 0.65 + fi * 0.30;
    float phase    = fi * 1.6 + uRealTime * (0.07 - fi * 0.01);
    float hShift   = fi * 0.055 * uHueSpread;
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
    float ePow = energy * energy;
    float glow = exp(-dist * dist / t2 * 2.0);
    float halo = exp(-dist * dist / (t2 * 8.0)) * (0.02 + energy * 0.48 + uBeatFlash * 0.52);

    float brightness = (glow + halo) * fading;
    float val        = (0.055 + ePow * 1.80 + uBeatFlash * 0.88) * brightness;
    float beatSat    = clamp(sat + uBeatFlash * 0.35, 0.0, 1.0);
    vec3 lc          = hsv2rgb(baseHue + hShift, beatSat, val);
    float layerA     = brightness * (0.040 + ePow * 1.15 + uBeatFlash * 0.60) * (1.0 - alphaAcc * 0.45);
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
    uBeatFlash:   { value: 0 },
    uHueSpread:   { value: 1.0 },
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
  let beatFlashVal    = 0;
  // 3-band transient state for hit detection: sub-bass (kick) / mids (snare, guitar) / highs (cymbals)
  let prevSbSum   = 0;   // sub-bass (kick)
  let prevMidSum  = 0;   // mids (snare / guitar / bass)
  let prevHiSum   = 0;   // highs (cymbals)
  let fullHitCD   = 0;

  // Gradual hue drift & drop detection
  let hueSpread       = 1.0;      // per-layer spread multiplier
  let bassDropFast    = 0;        // fast EMA of full-band energy
  let bassDropSlow    = 0;        // very slow EMA — long-term baseline
  let buildupScore    = 0;        // how much we've been building
  let dropCooldown    = 0;        // prevent re-firing too soon
  let dropSpreadDecay = 0;        // how long until spread returns to normal

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

      // ── Full-band transient: kick (0–6%) + mids (6–55%) + cymbals (55–100%) ──
      const sbEnd2  = Math.floor(len * 0.06);
      const midEnd2 = Math.floor(len * 0.55);
      const hiStart = Math.floor(len * 0.55);
      let sbSum2 = 0, midSum2 = 0, hiSum = 0;
      for (let i = 0;       i < sbEnd2;  i++) sbSum2  += freq[i]! / 255;
      for (let i = sbEnd2;  i < midEnd2; i++) midSum2 += freq[i]! / 255;
      for (let i = hiStart; i < len;     i++) hiSum   += freq[i]! / 255;
      sbSum2  /= Math.max(1, sbEnd2);
      midSum2 /= Math.max(1, midEnd2 - sbEnd2);
      hiSum   /= Math.max(1, len - hiStart);
      const sbAtk2  = Math.max(0, sbSum2  - prevSbSum);   prevSbSum  = sbSum2;
      const midAtk2 = Math.max(0, midSum2 - prevMidSum);  prevMidSum = midSum2;
      const hiAtk   = Math.max(0, hiSum   - prevHiSum);   prevHiSum  = hiSum;
      fullHitCD = Math.max(0, fullHitCD - dt);

      // Big hit: kick spiking alongside mid (snare/guitar) or highs (cymbal)
      const hitStrength = sbAtk2 * 0.40 + midAtk2 * 0.35 + hiAtk * 0.25;
      const isBigHit    = hitStrength > 0.022
                       && sbAtk2  > 0.022
                       && (midAtk2 > 0.018 || hiAtk > 0.016)
                       && fullHitCD <= 0;

      if (isBigHit) {
        // Flash intensity — scales with how hard everything hits
        beatFlashVal = Math.max(beatFlashVal, 0.75 + hitStrength * 4.5);

        // Moderate hue jump — 1/6 to 1/3 of color wheel, scaled by strength
        const hueJump = 0.12 + hitStrength * 2.2;
        hueBase = (hueBase + Math.min(hueJump, 0.38)) % 1.0;

        // Briefly fan the layers apart so each lane reads as a distinct color
        const spreadTarget = 1.8 + hitStrength * 3.0;
        hueSpread = Math.max(hueSpread, Math.min(spreadTarget, 3.2));
        // Re-use dropSpreadDecay to bleed back to normal
        if (dropSpreadDecay <= 0) dropSpreadDecay = 0.6 + hitStrength * 0.8;

        fullHitCD = 0.10;   // short enough to fire on every dense beat
      }

      // ── Full-band energy for drop detection ──
      let fullBand = 0;
      for (let i = 0; i < len; i++) fullBand += freq[i]! / 255;
      fullBand /= len;

      const dropFastRate = 0.18;
      const dropSlowRate = 0.004; // ~250-frame baseline
      bassDropFast += (fullBand - bassDropFast) * Math.min(1, dropFastRate * dt * 60);
      bassDropSlow += (fullBand - bassDropSlow) * Math.min(1, dropSlowRate * dt * 60);

      // Build-up score: measures how much fast is above slow (energy rising)
      const surge = bassDropFast - bassDropSlow;
      buildupScore += (surge - buildupScore) * Math.min(1, 0.02 * dt * 60);

      dropCooldown    = Math.max(0, dropCooldown    - dt);
      dropSpreadDecay = Math.max(0, dropSpreadDecay - dt);

      // ── Drop fire condition ──
      // Bass surges to >2× the slow baseline AND absolute level is high AND cooled down
      const isDropHit = bassDropFast > bassDropSlow * 2.1
                     && bassDropFast > 0.38
                     && dropCooldown <= 0;

      if (isDropHit) {
        // Jump hue by ~half the wheel (completely opposite palette)
        hueBase += 0.42 + Math.random() * 0.18;
        hueBase  = hueBase % 1.0;
        // Explode spread so every layer is a different color
        hueSpread       = 4.5 + Math.random() * 1.5;
        dropSpreadDecay = 4.0;          // holds wide for 4s then decays
        beatFlashVal    = Math.min(2.0, 1.8 + bassDropFast * 0.6);
        dropCooldown    = 8.0;          // at least 8s before next drop
      } else if (dropSpreadDecay > 0) {
        // Smoothly converge spread back to normal (oscillating ~1.0-1.5)
        const targetSpread = 1.0 + Math.sin(realTime * 0.11) * 0.35;
        const decaySpeed   = 1.4 / Math.max(0.5, dropSpreadDecay);
        hueSpread += (targetSpread - hueSpread) * Math.min(1, decaySpeed * dt);
      } else {
        // Normal: slow oscillation so palette gently shifts over ~20s
        const targetSpread = 1.0 + Math.sin(realTime * 0.11) * 0.35 + buildupScore * 0.8;
        hueSpread += (targetSpread - hueSpread) * Math.min(1, 1.2 * dt);
      }

      uniforms.uHueSpread.value = Math.max(0.5, hueSpread);

      const isFluxPeak  = fluxSmooth > 0.42;
      const isOnset     = (vocalEmaFast - vocalEmaSlow) > 0.16;

      // Gradual hue drift — normal speed, faster during activity
      hueBase += (0.006 + vocalEmaFast * 0.012) * dt;

      if (isFluxPeak && !prevFluxAbove) {
        hueBase += 0.22 + Math.random() * 0.38;
        beatFlashVal = Math.min(1.5, 1.0 + fluxSmooth * 0.6);
      } else if (isOnset && !prevOnsetAbove) {
        hueBase += 0.15 + Math.random() * 0.28;
        beatFlashVal = Math.max(beatFlashVal, 0.65 + (vocalEmaFast - vocalEmaSlow) * 2.5);
      }
      beatFlashVal = Math.max(0, beatFlashVal - dt * 6.0);
      uniforms.uBeatFlash.value = beatFlashVal;

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
