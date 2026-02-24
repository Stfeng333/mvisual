/**
 * Three.js full-screen scene: renderer, camera, basic lighting.
 */

import * as THREE from 'three';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

export function createScene(container: HTMLElement): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.z = 5;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // Filmic tone mapping gives richer contrast to the additive glow layers
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  function resize(w: number, h: number): void {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  resize(container.clientWidth, container.clientHeight);
  const ro = new ResizeObserver((entries) => {
    const { width, height } = entries[0]!.contentRect;
    resize(width, height);
  });
  ro.observe(container);

  function dispose(): void {
    ro.disconnect();
    renderer.dispose();
    container.removeChild(renderer.domElement);
  }

  return { scene, camera, renderer, resize, dispose };
}
