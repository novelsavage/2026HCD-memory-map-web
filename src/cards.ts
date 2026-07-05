import * as THREE from "three";
import type { Memory } from "./data";
import { projectLatLon } from "./geo";
import { createTextLabelTexture } from "./textLabel";
import { GENRE_COLORS, GENRE_FALLBACK_COLOR, MAP_BOUNDS, MARKER } from "./config";

interface MarkerEntry {
  memory: Memory;
  root: THREE.Group;
  label: THREE.Mesh;
  fadeTargets: THREE.MeshBasicMaterial[];
  spawnDelay: number;
  visible: boolean;
  appear: number;
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** 地図（OCR WebApp と同じ MAP_BOUNDS）の範囲内か */
export function isInMapBounds(memory: Memory): boolean {
  if (memory.latitude == null || memory.longitude == null) return false;
  return (
    memory.latitude >= MAP_BOUNDS.south &&
    memory.latitude <= MAP_BOUNDS.north &&
    memory.longitude >= MAP_BOUNDS.west &&
    memory.longitude <= MAP_BOUNDS.east
  );
}

export class MemoryMarkers {
  readonly group = new THREE.Group();
  private entries: MarkerEntry[] = [];
  private elapsed = 0;
  private raycaster = new THREE.Raycaster();

  async spawn(
    memories: Memory[],
    groundHeightAt: (x: number, z: number) => number
  ): Promise<void> {
    const grounded = memories.filter(isInMapBounds);
    let spawnIndex = 0;

    for (const memory of grounded) {
      const root = new THREE.Group();
      const genreColor = new THREE.Color(
        GENRE_COLORS[memory.genre || ""] || GENRE_FALLBACK_COLOR
      );
      const fadeTargets: THREE.MeshBasicMaterial[] = [];

      const p = projectLatLon(memory.latitude!, memory.longitude!);
      const groundY = groundHeightAt(p.x, p.z);
      root.position.set(p.x, groundY + MARKER.groundOffsetY, p.z);

      this.buildPole(root, genreColor, fadeTargets);
      const label = await this.buildLabel(root, memory, fadeTargets);

      const stagger = Math.min(
        spawnIndex * MARKER.staggerStep,
        MARKER.staggerMax
      );
      root.scale.setScalar(0.0001);
      this.entries.push({
        memory,
        root,
        label,
        fadeTargets,
        spawnDelay: MARKER.staggerBaseDelay + stagger,
        visible: true,
        appear: 0
      });
      this.group.add(root);
      spawnIndex++;
    }
  }

  /** 根元(y=0)から地面(y=-groundOffsetY)まで */
  private buildPole(
    root: THREE.Group,
    color: THREE.Color,
    fadeTargets: THREE.MeshBasicMaterial[]
  ): void {
    const poleMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9
    });
    fadeTargets.push(poleMat);

    const height = MARKER.groundOffsetY;
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(
        MARKER.poleRadius,
        MARKER.poleRadius,
        height,
        8
      ),
      poleMat
    );
    pole.position.y = -height / 2;
    root.add(pole);
  }

  private async buildLabel(
    root: THREE.Group,
    memory: Memory,
    fadeTargets: THREE.MeshBasicMaterial[]
  ): Promise<THREE.Mesh> {
    const { texture, planeWidth, planeHeight } =
      await createTextLabelTexture(memory);
    const labelMat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    fadeTargets.push(labelMat);

    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(planeWidth, planeHeight),
      labelMat
    );
    label.name = "label";
    label.position.y = MARKER.labelOffsetY;
    root.add(label);
    return label;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.elapsed += dt;
    for (const entry of this.entries) {
      const target = entry.visible ? 1 : 0;
      if (this.elapsed > entry.spawnDelay || target === 0) {
        const speed = dt / MARKER.appearDuration;
        entry.appear = THREE.MathUtils.clamp(
          entry.appear + (target === 1 ? speed : -speed * 1.8),
          0,
          1
        );
      }
      const scale = entry.appear > 0 ? easeOutBack(entry.appear) : 0.0001;
      entry.root.scale.setScalar(Math.max(scale, 0.0001));
      entry.root.visible = entry.appear > 0.001;

      entry.label.quaternion.copy(
        (camera as THREE.PerspectiveCamera).quaternion
      );

      const alpha = entry.visible ? entry.appear : 0;
      for (let i = 0; i < entry.fadeTargets.length; i++) {
        const mat = entry.fadeTargets[i];
        mat.opacity = i === 0 ? alpha * 0.9 : alpha;
      }
    }
  }

  applyFilter(predicate: (memory: Memory) => boolean): number {
    let count = 0;
    for (const entry of this.entries) {
      entry.visible = predicate(entry.memory);
      if (entry.visible) count++;
    }
    return count;
  }

  pick(pointer: THREE.Vector2, camera: THREE.Camera): Memory | null {
    this.raycaster.setFromCamera(pointer, camera);
    const labels = this.entries
      .filter((e) => e.visible && e.appear > 0.5)
      .map((e) => e.label);
    const hits = this.raycaster.intersectObjects(labels, false);
    if (hits.length === 0) return null;
    const hit = hits[0].object;
    const entry = this.entries.find((e) => e.label === hit);
    return entry ? entry.memory : null;
  }

  worldPositionOf(memory: Memory): THREE.Vector3 | null {
    const entry = this.entries.find((e) => e.memory.id === memory.id);
    if (!entry) return null;
    return entry.label.getWorldPosition(new THREE.Vector3());
  }

  get allMemories(): Memory[] {
    return this.entries.map((e) => e.memory);
  }
}

/** @deprecated MemoryMarkers へ移行。互換のためエイリアス */
export { MemoryMarkers as MemoryCards };
