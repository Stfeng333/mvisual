/**
 * Three.js full-screen scene using OrthographicCamera.
 * This is the standard approach for fullscreen shader/visualizer effects —
 * it guarantees a PlaneGeometry(2,2) always fills the entire canvas.
 */

import * as THREE from 'three';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  resize: (w: number, h: number) => void;
  dispose: () => void;
}

export function createScene(container: HTMLElement): SceneContext {
  const scene = new THREE.Scene();

  // Orthographic camera: NDC space maps directly to the plane, always fullscreen
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  function resize(w: number, h: number): void {
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
