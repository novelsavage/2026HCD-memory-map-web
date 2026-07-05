import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  composer: EffectComposer;
  render: () => void;
}

export const HOME_CAMERA_POS = new THREE.Vector3(180, 150, 220);

export function createSceneContext(container: HTMLElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050d08);
  scene.fog = new THREE.FogExp2(0x050d08, 0.0008);

  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 6000);
  camera.position.copy(HOME_CAMERA_POS);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 15;
  controls.maxDistance = 2800;
  controls.target.set(0, 0, 0);

  // ライティング（ホログラム調なので控えめ + 青みがかった夜）
  scene.add(new THREE.HemisphereLight(0x3a8060, 0x0a1a10, 0.9));
  const dir = new THREE.DirectionalLight(0x9fffcf, 0.7);
  dir.position.set(200, 320, 120);
  scene.add(dir);

  addStars(scene);
  addGround(scene);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // threshold=1.0: 通常マテリアル（カード等）は光らせず、
  // 加算合成で1.0を超えるワイヤーフレームの重なりや発光体だけをブルームさせる
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    0.85, // strength
    0.6, // radius
    1.0 // threshold
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  return {
    scene,
    camera,
    renderer,
    controls,
    composer,
    render: () => composer.render()
  };
}

function addStars(scene: THREE.Scene): void {
  const count = 2600;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // 上半球にランダム配置
    const radius = 1800 + Math.random() * 1600;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(0.3 + Math.random() * 0.68); // 仰角17°以上（市街地と混ざらない）
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xcfffe3,
    size: 2.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  });
  scene.add(new THREE.Points(geometry, material));
}

function addGround(scene: THREE.Scene): void {
  const grid = new THREE.GridHelper(4000, 100, 0x1a5c38, 0x0e3320);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.28;
  grid.position.y = -1.2;
  scene.add(grid);

  // 中心の淡い発光サークル
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, "rgba(52, 180, 120, 0.10)");
  grad.addColorStop(0.7, "rgba(24, 100, 70, 0.03)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const glowTexture = new THREE.CanvasTexture(canvas);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1300, 1300),
    new THREE.MeshBasicMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -1.4;
  scene.add(glow);
}
