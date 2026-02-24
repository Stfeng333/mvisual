import './style.css';
import { renderLanding, type TrackSource } from './landing';
import { createAudioFromFile, createAudioFromUrl } from './audio/player';
import { createScene } from './visualizer/scene';
import { createOrbAndParticles } from './visualizer/effects';
import { runVisualizerLoop } from './visualizer/loop';

const app = document.querySelector<HTMLDivElement>('#app')!;
const visualizerRoot = document.querySelector<HTMLDivElement>('#visualizer-root')!;

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
  return {
    bpm: 120,
    energy: 0.6,
    valence: 0.5,
    genres: [],
  };
}

function startVisualizer(source: TrackSource): void {
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
      visualizerRoot.innerHTML = '<p style="color:rgba(255,255,255,0.6);padding:2rem;text-align:center">No preview for this track. Upload your own file for full visualization.</p>';
      visualizerRoot.classList.remove('active');
      app.style.display = '';
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
