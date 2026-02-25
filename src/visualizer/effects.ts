import * as THREE from 'three';
import { createVocalLayer } from './vocal';
import { createLightningSystem } from './lightning';

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

function getBandLevels(data: Uint8Array): { low: number; mid: number; high: number } {
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

export function createOrbAndParticles(scene: THREE.Scene, _params: EffectParams): VisualEffect {
  const lightning  = createLightningSystem(scene);
  const vocalLayer = createVocalLayer(scene);

  // drop detection state
  let dropFast     = 0;
  let dropSlow     = 0;
  let dropCooldown = 0;

  // hue slowly drifts, shared with lightning system
  let hueBase = Math.random();

  return {
    update(p: EffectParams, dt: number): void {
      const bands = getBandLevels(p.frequencyData);
      const bpm   = Math.max(72, Math.min(190, p.bpm || 120));

      // full-band energy for drop detection
      const len = p.frequencyData.length;
      let fullBand = 0;
      for (let i = 0; i < len; i++) fullBand += p.frequencyData[i]! / 255;
      if (len > 0) fullBand /= len;

      dropFast += (fullBand - dropFast) * Math.min(1, 0.18 * dt * 60);
      dropSlow += (fullBand - dropSlow) * Math.min(1, 0.004 * dt * 60);
      dropCooldown = Math.max(0, dropCooldown - dt);

      // Drop: fast energy explodes to >2x the slow baseline AND loud
      const isDropHit = dropFast > dropSlow * 2.1
                     && dropFast > 0.38
                     && dropCooldown <= 0;

      if (isDropHit) {
        hueBase = (hueBase + 0.42 + Math.random() * 0.18) % 1.0;
        lightning.triggerDrop(Math.min(1, p.energy + 0.2), hueBase);
        dropCooldown = 8.0;
      }

      // slow hue drift
      hueBase = (hueBase + (0.006 + bands.mid * 0.012) * dt) % 1.0;

      lightning.update(p.frequencyData, p.energy, bpm, hueBase, dt);
      vocalLayer.update(p.frequencyData, dt);
    },

    dispose(): void {
      lightning.dispose();
      vocalLayer.dispose();
    },
  };
}
