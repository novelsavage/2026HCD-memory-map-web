import * as THREE from "three";
import type { Memory } from "./data";
import { projectLatLon } from "./geo";
import { loadCardTexture } from "./cardTexture";
import { CARD, GENRE_COLORS, GENRE_FALLBACK_COLOR, MAP_BOUNDS } from "./config";

interface CardEntry {
  memory: Memory;
  root: THREE.Group; // 位置・出現スケールを持つ
  card: THREE.Mesh; // ビルボード回転する面
  floating: boolean;
  baseY: number;
  bobPhase: number;
  spawnDelay: number;
  visible: boolean;
  appear: number; // 0..1
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export class MemoryCards {
  readonly group = new THREE.Group();
  private entries: CardEntry[] = [];
  private elapsed = 0;
  private raycaster = new THREE.Raycaster();

  spawn(memories: Memory[], groundHeightAt: (x: number, z: number) => number): void {
    let floatIndex = 0;
    const floatCount = memories.filter((m) => !this.isGrounded(m)).length;

    memories.forEach((memory, index) => {
      const onCampus = this.isGrounded(memory);
      const root = new THREE.Group();
      const genreColor = new THREE.Color(
        GENRE_COLORS[memory.genre || ""] || GENRE_FALLBACK_COLOR
      );

      let floating = false;
      let baseY: number;
      if (onCampus) {
        const p = projectLatLon(memory.latitude!, memory.longitude!);
        const groundY = groundHeightAt(p.x, p.z);
        const poleHeight =
          CARD.poleHeightMin +
          Math.random() * (CARD.poleHeightMax - CARD.poleHeightMin);
        root.position.set(p.x, groundY, p.z);
        baseY = groundY;
        this.buildPole(root, poleHeight, genreColor);
        this.buildCard(root, memory, poleHeight + CARD.size * 0.62);
      } else {
        // 地図範囲外の思い出：キャンパス上空のリングに浮かべる
        floating = true;
        const angle =
          (floatIndex / Math.max(floatCount, 1)) * Math.PI * 2 +
          Math.random() * 0.35;
        const radius =
          CARD.floatRadiusMin +
          Math.random() * (CARD.floatRadiusMax - CARD.floatRadiusMin);
        const height =
          CARD.floatHeightMin +
          Math.random() * (CARD.floatHeightMax - CARD.floatHeightMin);
        root.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
        baseY = height;
        this.buildCard(root, memory, 0, genreColor);
        floatIndex++;
      }

      root.scale.setScalar(0.0001);
      const entry: CardEntry = {
        memory,
        root,
        card: root.getObjectByName("card") as THREE.Mesh,
        floating,
        baseY,
        bobPhase: Math.random() * Math.PI * 2,
        spawnDelay: 0.4 + index * 0.07,
        visible: true,
        appear: 0
      };
      this.entries.push(entry);
      this.group.add(root);
    });
  }

  /** 地図（OCR WebApp と同じ MAP_BOUNDS）の範囲内なら実座標に接地する */
  private isGrounded(memory: Memory): boolean {
    if (memory.latitude == null || memory.longitude == null) return false;
    return (
      memory.latitude >= MAP_BOUNDS.south &&
      memory.latitude <= MAP_BOUNDS.north &&
      memory.longitude >= MAP_BOUNDS.west &&
      memory.longitude <= MAP_BOUNDS.east
    );
  }

  private buildPole(root: THREE.Group, height: number, color: THREE.Color): void {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, height, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9
      })
    );
    pole.position.y = height / 2;
    root.add(pole);

    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 12),
      new THREE.MeshBasicMaterial({ color })
    );
    pin.position.y = 0.4;
    root.add(pin);
  }

  private buildCard(
    root: THREE.Group,
    memory: Memory,
    y: number,
    frameColor?: THREE.Color
  ): void {
    const size = CARD.size;
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        side: THREE.DoubleSide
      })
    );
    card.name = "card";
    card.position.y = y;
    root.add(card);

    // 浮遊カードはジャンル色の枠を付ける（遠目でも分類が分かる）
    if (frameColor) {
      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(size * 1.08, size * 1.08),
        new THREE.MeshBasicMaterial({
          color: frameColor,
          transparent: true,
          opacity: 0.85,
          side: THREE.DoubleSide
        })
      );
      frame.position.z = -0.02;
      card.add(frame);
    }

    loadCardTexture(memory, (texture) => {
      const material = card.material as THREE.MeshBasicMaterial;
      material.map = texture;
      material.needsUpdate = true;
    });
  }

  update(dt: number, camera: THREE.Camera): void {
    this.elapsed += dt;
    for (const entry of this.entries) {
      // 出現 / 消滅アニメーション
      const target = entry.visible ? 1 : 0;
      if (this.elapsed > entry.spawnDelay || target === 0) {
        const speed = dt / 0.55;
        entry.appear = THREE.MathUtils.clamp(
          entry.appear + (target === 1 ? speed : -speed * 1.8),
          0,
          1
        );
      }
      const scale = entry.appear > 0 ? easeOutBack(entry.appear) : 0.0001;
      entry.root.scale.setScalar(Math.max(scale, 0.0001));
      entry.root.visible = entry.appear > 0.001;

      // 浮遊カードのゆらぎ
      if (entry.floating) {
        entry.root.position.y =
          entry.baseY + Math.sin(this.elapsed * 0.6 + entry.bobPhase) * 2.2;
      }

      // ビルボード（Unity 版と同じくカード面だけカメラへ向ける）
      entry.card.quaternion.copy((camera as THREE.PerspectiveCamera).quaternion);
    }
  }

  /** ジャンル・年代フィルター。該当しないカードは縮小して非表示にする */
  applyFilter(predicate: (memory: Memory) => boolean): number {
    let count = 0;
    for (const entry of this.entries) {
      entry.visible = predicate(entry.memory);
      if (entry.visible) count++;
    }
    return count;
  }

  /** クリック位置のカードを返す */
  pick(pointer: THREE.Vector2, camera: THREE.Camera): Memory | null {
    this.raycaster.setFromCamera(pointer, camera);
    const cards = this.entries
      .filter((e) => e.visible && e.appear > 0.5)
      .map((e) => e.card);
    const hits = this.raycaster.intersectObjects(cards, true);
    if (hits.length === 0) return null;
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && obj.name !== "card") obj = obj.parent;
    const entry = this.entries.find((e) => e.card === obj);
    return entry ? entry.memory : null;
  }

  /** カードのワールド座標（カメラフォーカス用） */
  worldPositionOf(memory: Memory): THREE.Vector3 | null {
    const entry = this.entries.find((e) => e.memory.id === memory.id);
    if (!entry) return null;
    return entry.card.getWorldPosition(new THREE.Vector3());
  }

  get allMemories(): Memory[] {
    return this.entries.map((e) => e.memory);
  }
}
