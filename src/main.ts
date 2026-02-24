import './style.css';
import { renderLanding, type TrackSource } from './landing';

// Use local proxy in dev so Spotify search works without manual config
declare global {
  interface Window {
    __MVISUAL_SPOTIFY_API__?: string;
  }
}
// Use /api for Spotify search (dev: Vite proxy; production: Vercel serverless at same origin)
if (typeof window !== 'undefined' && window.__MVISUAL_SPOTIFY_API__ === undefined) {
  window.__MVISUAL_SPOTIFY_API__ = '/api';
}
import { createAudioFromFile, createAudioFromUrl } from './audio/player';
import { createScene } from './visualizer/scene';
import { createOrbAndParticles } from './visualizer/effects';
import { runVisualizerLoop } from './visualizer/loop';

const app = document.querySelector<HTMLDivElement>('#app')!;
const visualizerRoot = document.querySelector<HTMLDivElement>('#visualizer-root')!;

function showNoPreviewMessage(container: HTMLElement, trackName: string): void {
  const existing = document.getElementById('mvisual-no-preview');
  if (existing) existing.remove();
  const msg = document.createElement('div');
  msg.id = 'mvisual-no-preview';
  msg.className = 'no-preview-banner';
  msg.innerHTML = trackName
    ? `“${escapeHtml(trackName)}” has no 30s preview on Spotify. Try another result or upload your own file.`
    : 'No preview for this track. Upload your own file for full visualization.';
  container.appendChild(msg);
  setTimeout(() => msg.remove(), 8000);
}
function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function getMetadataFromSource(source: TrackSource): {
  bpm: number;
  energy: number;
  valence: number;
  genres: string[];
} {
  if (source.type === 'spotify') {
    return {
      bpm: source.bpm,
      energy: source.energy,
      valence: source.valence,
      genres: source.genres,
    };
  }
  if (source.type === 'file' && source.meta) {
    return source.meta;
  }
  return {
    bpm: 120,
    energy: 0.6,
    valence: 0.5,
    genres: [],
  };
}

function startVisualizer(source: TrackSource): void {
  document.getElementById('mvisual-no-preview')?.remove();
  app.style.display = 'none';
  visualizerRoot.classList.add('active');
  visualizerRoot.innerHTML = '';

  const metadata = getMetadataFromSource(source);

  let playback: Awaited<ReturnType<typeof createAudioFromFile>> | null = null;
  let stopLoop: (() => void) | null = null;
  let sceneContext: ReturnType<typeof createScene> | null = null;
  let effect: ReturnType<typeof createOrbAndParticles> | null = null;

  async function run() {
    if (source.type === 'file') {
      playback = await createAudioFromFile(source.file);
    } else if (source.type === 'spotify' && source.previewUrl) {
      playback = await createAudioFromUrl(source.previewUrl);
    } else {
      // No preview: show message in the landing so the user actually sees it
      visualizerRoot.classList.remove('active');
      app.style.display = '';
      showNoPreviewMessage(app, source.type === 'spotify' ? source.name : '');
      return;
    }

    sceneContext = createScene(visualizerRoot);
    effect = createOrbAndParticles(sceneContext.scene, {
      ...metadata,
      level: 0,
      frequencyData: new Uint8Array(playback.analyser.frequencyBinCount),
    });

    stopLoop = runVisualizerLoop(sceneContext, effect, () => ({
      analyser: playback!.analyser,
      bpm: metadata.bpm,
      energy: metadata.energy,
      valence: metadata.valence,
      genres: metadata.genres,
    }));

    playback.onEnded(() => {
      stopLoop?.();
      effect?.dispose();
      sceneContext?.dispose();
      visualizerRoot.classList.remove('active');
      visualizerRoot.innerHTML = '';
      app.style.display = '';
    });

    await playback.play();
  }

  run().catch((err) => {
    console.error(err);
    visualizerRoot.innerHTML = '<p style="color:#e55;padding:2rem;">Failed to load audio.</p>';
    visualizerRoot.classList.remove('active');
    app.style.display = '';
  });
}

renderLanding(app, (source) => {
  startVisualizer(source);
});
