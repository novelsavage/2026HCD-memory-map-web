import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MODEL_TRANSFORM } from "./config";

export interface CampusModel {
  group: THREE.Group;
  /** 地面スナップ用レイキャスト対象 */
  raycastTargets: THREE.Object3D[];
}

/**
 * キャンパス GLB（Google 3D Tiles 由来・テクスチャ焼き込み unlit）を読み込む。
 * デフォルトはテクスチャ表示。?holo でホログラム調（暗い面 + 発光ワイヤーフレーム）。
 */
export async function loadCampusModel(
  onProgress?: (ratio: number) => void
): Promise<CampusModel> {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
  loader.setDRACOLoader(draco);

  const gltf = await loader.loadAsync(
    `${import.meta.env.BASE_URL}models/campus.glb`,
    (event) => {
      if (event.total > 0 && onProgress) onProgress(event.loaded / event.total);
    }
  );

  const group = new THREE.Group();
  group.name = "campus";
  group.add(gltf.scene);

  const holoMode = new URLSearchParams(location.search).has("holo");
  const raycastTargets: THREE.Object3D[] = [];

  if (holoMode) {
    applyHologramLook(gltf.scene, group, raycastTargets);
  } else {
    // Google Earth の焼き込みテクスチャをそのまま表示。
    // 夜のシーンに馴染むよう、わずかに暗く沈ませる。
    gltf.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        raycastTargets.push(obj);
        const material = obj.material as THREE.MeshBasicMaterial;
        material.color.multiplyScalar(0.88);
        if (material.map) material.map.anisotropy = 8;
      }
    });
  }

  // 配置調整
  const t = MODEL_TRANSFORM;
  group.scale.setScalar(t.scale);
  group.rotation.y = (t.yawDeg * Math.PI) / 180;
  group.position.set(t.offsetX, t.offsetY, t.offsetZ);

  // 中心が原点から大きく外れている場合は自動で中央寄せ
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  console.info(
    `[campus] bbox size=(${size.x.toFixed(1)}, ${size.y.toFixed(1)}, ${size.z.toFixed(1)})` +
      ` center=(${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)})`
  );
  if (center.length() > t.autoCenterThreshold) {
    group.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
    console.warn("[campus] モデル中心が原点から離れていたため自動中央寄せしました");
  }

  return { group, raycastTargets };
}

/** ホログラム調（?holo）: 暗い面 + 加算合成ワイヤーフレーム */
function applyHologramLook(
  sceneRoot: THREE.Object3D,
  group: THREE.Group,
  raycastTargets: THREE.Object3D[]
): void {
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0x0d2e1c,
    roughness: 0.85,
    metalness: 0.1,
    transparent: true,
    opacity: 0.96
  });
  const wireMaterial = new THREE.MeshBasicMaterial({
    color: 0x2effa0,
    wireframe: true,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const wireMeshes: THREE.Mesh[] = [];
  sceneRoot.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.material = baseMaterial;
      raycastTargets.push(obj);
      const wire = new THREE.Mesh(obj.geometry, wireMaterial);
      wireMeshes.push(wire);
      obj.updateWorldMatrix(true, false);
      wire.applyMatrix4(obj.matrixWorld);
    }
  });
  for (const wire of wireMeshes) group.add(wire);
}

/** 指定した XZ 位置の地面の高さを求める。キャンパス Mesh を優先し、未ヒット時は fallbackY。 */
export function snapToGround(
  x: number,
  z: number,
  campusTargets: THREE.Object3D[],
  surroundingsTargets: THREE.Object3D[],
  fallbackY: number,
  raycaster = new THREE.Raycaster()
): number {
  raycaster.set(new THREE.Vector3(x, 2000, z), new THREE.Vector3(0, -1, 0));
  raycaster.far = 2500;

  const meshHitY = (targets: THREE.Object3D[]): number | null => {
    const valid = targets.filter(
      (obj): obj is THREE.Object3D => obj != null && obj instanceof THREE.Object3D
    );
    if (valid.length === 0) return null;
    const hits = raycaster.intersectObjects(valid, false);
    const hit = hits.find((h) => h.object instanceof THREE.Mesh);
    return hit ? hit.point.y : null;
  };

  const campusY = meshHitY(campusTargets);
  if (campusY != null) return campusY;

  const surY = meshHitY(surroundingsTargets);
  if (surY != null) return surY;

  return fallbackY;
}
