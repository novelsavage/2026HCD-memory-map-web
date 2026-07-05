import * as THREE from "three";
import type { Memory } from "./data";
import { projectLatLon } from "./geo";
import { createTextLabelTexture } from "./textLabel";
import { GENRE_COLORS, GENRE_FALLBACK_COLOR, MAP_BOUNDS, MARKER } from "./config";

interface MarkerEntry {
  memory: Memory;
  root: THREE.Group;
  pole: THREE.Mesh;
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
      // root = 接地点（ピン中心）。ポールは上方向、テキストはその上。
      root.position.set(p.x, groundY, p.z);

      this.buildPin(root, genreColor, fadeTargets);
      const pole = this.buildPole(root, genreColor, fadeTargets);
      const label = await this.buildLabel(root, memory, fadeTargets);

      const stagger = Math.min(
        spawnIndex * MARKER.staggerStep,
        MARKER.staggerMax
      );
      root.scale.setScalar(0.0001);
      this.entries.push({
        memory,
        root,
        pole,
        label,
        fadeTargets,
        spawnDelay: MARKER.staggerBaseDelay + stagger,
        visible: true,
        appear: 0
      });
      this.group.add(root);
      spawnIndex++;
    }

    this.assignLabelStacks();
  }

  /** 近接マーカーはラベルを積み、ポールを同じ高さまで延長する。 */
  private assignLabelStacks(): void {
    const active = this.entries.filter((e) => e.visible);
    const radiusSq = MARKER.stackRadius * MARKER.stackRadius;

    for (const entry of active) {
      const px = entry.root.position.x;
      const pz = entry.root.position.z;

      const neighbors = active.filter((other) => {
        const dx = other.root.position.x - px;
        const dz = other.root.position.z - pz;
        return dx * dx + dz * dz <= radiusSq;
      });

      neighbors.sort((a, b) => {
        const ta = a.memory.captured_at ?? "";
        const tb = b.memory.captured_at ?? "";
        if (ta !== tb) return ta.localeCompare(tb);
        return a.memory.id.localeCompare(b.memory.id);
      });

      const idx = neighbors.findIndex((n) => n.memory.id === entry.memory.id);
      const stackIndex = Math.min(
        Math.max(idx, 0),
        MARKER.stackMaxLevels - 1
      );
      const poleHeight =
        MARKER.groundOffsetY + stackIndex * MARKER.stackHeightStep;
      entry.pole.scale.y = poleHeight / MARKER.groundOffsetY;
      entry.pole.position.y = poleHeight / 2;
      entry.label.position.y = poleHeight;
    }
  }

  /** 接地点のピン（root 原点 = 地面） */
  private buildPin(
    root: THREE.Group,
    color: THREE.Color,
    fadeTargets: THREE.MeshBasicMaterial[]
  ): void {
    const pinMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    fadeTargets.push(pinMat);

    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(MARKER.pinRadius, 12, 10),
      pinMat
    );
    pin.position.y = MARKER.pinRadius;
    pin.renderOrder = 2;
    root.add(pin);
  }

  /** 地面(y=0)からポール上端(y=groundOffsetY)まで */
  private buildPole(
    root: THREE.Group,
    color: THREE.Color,
    fadeTargets: THREE.MeshBasicMaterial[]
  ): THREE.Mesh {
    const poleMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
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
    pole.position.y = height / 2;
    pole.renderOrder = 1;
    root.add(pole);
    return pole;
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
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    fadeTargets.push(labelMat);

    // PlaneGeometry の原点を中央から左上へ移す。
    // ポール上端を旗の左上Pivotとして、文字面を右・下へ広げる。
    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    geometry.translate(planeWidth / 2, -planeHeight / 2, 0);
    const label = new THREE.Mesh(geometry, labelMat);
    label.name = "label";
    label.position.y = MARKER.groundOffsetY;
    label.renderOrder = 3;
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
        mat.opacity = alpha;
      }
    }
  }

  applyFilter(predicate: (memory: Memory) => boolean): number {
    let count = 0;
    for (const entry of this.entries) {
      entry.visible = predicate(entry.memory);
      if (entry.visible) count++;
    }
    this.assignLabelStacks();
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
