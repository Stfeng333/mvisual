/*Render loop: tick animation, read analyser, update effects, render*/

import type { SceneContext } from './scene';
import type { VisualEffect, EffectParams } from './effects';
import { getAnalyserFrequencies } from '../audio/player';

export interface RunnerParams {
  analyser: AnalyserNode;
  bpm: number;
  energy: number;
  valence: number;
  genres: string[];
}

export function runVisualizerLoop(
  ctx: SceneContext,
  effect: VisualEffect,
  getParams: () => RunnerParams
): () => void {
  let rafId: number;
  let lastTime = performance.now() / 1000;

  function tick() {
    const now = performance.now() / 1000;
    const dt = Math.min(now - lastTime, 0.1);
    lastTime = now;

    const params = getParams();
    const freq = getAnalyserFrequencies(params.analyser);
    const level = freq.length > 0
      ? freq.reduce((a, b) => a + b, 0) / freq.length / 255
      : 0;
    const { analyser: _a, ...rest } = params;
    effect.update(
      {
        ...rest,
        frequencyData: freq,
        level,
      } as EffectParams,
      dt
    );

    ctx.renderer.render(ctx.scene, ctx.camera);
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}
