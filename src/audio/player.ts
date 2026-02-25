/**
 * Audio playback from File or URL (e.g. Deezer 30s preview).
 * Exposes AnalyserNode for visualization and basic metadata.
 */

export interface AudioPlayback {
  analyser: AnalyserNode;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  onEnded: (fn: () => void) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
}

const FFT_SIZE = 2048;
const SMOOTHING = 0.75;

export async function createAudioFromFile(file: File): Promise<AudioPlayback> {
  const arrayBuffer = await file.arrayBuffer();
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  const bufferSource = audioContext.createBufferSource();
  bufferSource.buffer = decoded;
  const gain = audioContext.createGain();
  gain.gain.value = 1;
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = SMOOTHING;
  bufferSource.connect(gain);
  gain.connect(analyser);
  analyser.connect(audioContext.destination);

  let endedCallback: (() => void) | null = null;
  bufferSource.onended = () => {
    endedCallback?.();
  };

  return {
    analyser,
    play: async () => {
      if (audioContext.state === 'suspended') await audioContext.resume();
      bufferSource.start(0);
    },
    pause: () => {
      // BufferSource can't be paused; we'd need to implement with start(offset) and track time
      // For simplicity we don't expose pause for file playback in v1
    },
    stop: () => {
      try {
        bufferSource.stop();
      } catch {
        /* already stopped */
      }
    },
    onEnded: (fn) => {
      endedCallback = fn;
    },
    getCurrentTime: () => 0,
    getDuration: () => decoded.duration,
  };
}

export async function createAudioFromUrl(url: string): Promise<AudioPlayback> {
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  const bufferSource = audioContext.createBufferSource();
  bufferSource.buffer = decoded;
  const gain = audioContext.createGain();
  gain.gain.value = 1;
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = SMOOTHING;
  bufferSource.connect(gain);
  gain.connect(analyser);
  analyser.connect(audioContext.destination);

  let endedCallback: (() => void) | null = null;
  bufferSource.onended = () => {
    endedCallback?.();
  };

  return {
    analyser,
    play: async () => {
      if (audioContext.state === 'suspended') await audioContext.resume();
      bufferSource.start(0);
    },
    pause: () => {},
    stop: () => {
      try {
        bufferSource.stop();
      } catch {
        /* already stopped */
      }
    },
    onEnded: (fn) => {
      endedCallback = fn;
    },
    getCurrentTime: () => 0,
    getDuration: () => decoded.duration,
  };
}

export function getAnalyserFrequencies(analyser: AnalyserNode): Uint8Array {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  return data;
}

export function getAnalyserWaveform(analyser: AnalyserNode): Uint8Array {
  const data = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(data);
  return data;
}
