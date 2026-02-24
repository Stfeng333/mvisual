/**
 * Visual effects driven by BPM, energy, genre, and real-time FFT.
 * Adds and updates meshes in the Three.js scene.
 */

import * as THREE from 'three';

export interface EffectParams {
  bpm: number;
  energy: number;
  valence: number;
  genres: string[];
  /** 0–255 range, normalized for reactivity */
  level: number;
  /** Frequency bins (use slice for low/mid/high) */
  frequencyData: Uint8Array;
}

export interface VisualEffect {
  update: (params: EffectParams, dt: number) => void;
  dispose: () => void;
}

/** Low/mid/high band levels from FFT */
export function getBandLevels(data: Uint8Array): { low: number; mid: number; high: number } {
  const len = data.length;
  const lowEnd = Math.floor(len * 0.25);
  const midEnd = Math.floor(len * 0.6);
  let low = 0,
    mid = 0,
    high = 0;
  for (let i = 0; i < lowEnd; i++) low += data[i]!;
  for (let i = lowEnd; i < midEnd; i++) mid += data[i]!;
  for (let i = midEnd; i < len; i++) high += data[i]!;
  return {
    low: low / lowEnd / 255,
    mid: mid / (midEnd - lowEnd) / 255,
    high: high / (len - midEnd) / 255,
  };
}

/** Create a reactive particle field + central orb, driven by BPM/energy/FFT */
export function createOrbAndParticles(scene: THREE.Scene, params: EffectParams): VisualEffect {
  const group = new THREE.Group();
  scene.add(group);

  const orbGeometry = new THREE.SphereGeometry(0.4, 32, 32);
  const orbMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHSL(0.5 + params.valence * 0.2, 0.8, 0.5),
    transparent: true,
    opacity: 0.9,
  });
  const orb = new THREE.Mesh(orbGeometry, orbMaterial);
  group.add(orb);

  const particleCount = 800;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    const r = 1.5 + Math.random() * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const particlesGeometry = new THREE.BufferGeometry();
  particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particlesMaterial = new THREE.PointsMaterial({
    size: 0.04,
    color: 0x00d4aa,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  });
  const particles = new THREE.Points(particlesGeometry, particlesMaterial);
  group.add(particles);

  const beatPhase = { current: 0 };

  return {
    update(efParams: EffectParams, dt: number) {
      const bpmToHz = efParams.bpm / 60;
      beatPhase.current += dt * bpmToHz * 2 * Math.PI;
      if (beatPhase.current > Math.PI * 2) beatPhase.current -= Math.PI * 2;
      const pulse = 0.85 + 0.15 * Math.sin(beatPhase.current) + efParams.level * 0.2;
      orb.scale.setScalar(pulse);
      (orbMaterial.color as THREE.Color).setHSL(0.5 + efParams.valence * 0.2, 0.8, 0.4 + efParams.energy * 0.3);
      orbMaterial.opacity = 0.7 + efParams.level * 0.2;

      const posAttr = particlesGeometry.attributes.position as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;
      const bands = getBandLevels(efParams.frequencyData);
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const x = posArray[i3]!;
        const y = posArray[i3 + 1]!;
        const z = posArray[i3 + 2]!;
        const dist = Math.sqrt(x * x + y * y + z * z);
        const push = (bands.mid + bands.high) * 0.15 * Math.sin(beatPhase.current + i * 0.1);
        const scale = 1 + push / Math.max(dist, 0.5);
        posArray[i3] = x * scale;
        posArray[i3 + 1] = y * scale;
        posArray[i3 + 2] = z * scale;
      }
      posAttr.needsUpdate = true;
    },
    dispose() {
      orbGeometry.dispose();
      orbMaterial.dispose();
      particlesGeometry.dispose();
      particlesMaterial.dispose();
      scene.remove(group);
    },
  };
}
