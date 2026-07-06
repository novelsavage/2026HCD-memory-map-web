import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { projectLatLon } from "./geo";
import { SURROUNDINGS } from "./config";

interface OsmData {
  bounds: { south: number; west: number; north: number; east: number };
  buildings: { h: number; pts: [number, number][] }[];
  roads: { major: boolean; pts: [number, number][] }[];
  railways: { pts: [number, number][] }[];
  stations: { name: string; lat: number; lon: number }[];
}

export interface Surroundings {
  group: THREE.Group;
  /** カードの接地対象（建物屋上・台地面） */
  raycastTargets: THREE.Object3D[];
  /** 生成時に使用した周辺市街地の基準高さ */
  baseY: number;
}

/**
 * OSM 由来の周辺市街地（scripts/fetch-osm.mjs の出力）を
 * 発光ワイヤーフレーム調で生成する。?nocity で無効化。
 * データ出典: © OpenStreetMap contributors (ODbL)
 */
export async function loadSurroundings(
  campusTargets: THREE.Object3D[],
  baseY: number
): Promise<Surroundings | null> {
  if (new URLSearchParams(location.search).has("nocity")) return null;

  const res = await fetch(`${import.meta.env.BASE_URL}osm-surroundings.json`);
  if (!res.ok) {
    console.warn("osm-surroundings.json が無いため周辺市街地はスキップ");
    return null;
  }
  const data = (await res.json()) as OsmData;

  const group = new THREE.Group();
  group.name = "surroundings";
  const raycastTargets: THREE.Object3D[] = [];

  // キャンパスモデルの XZ 占有グリッド（台地のくり抜き・重複除外の共通判定）
  const footprint = new CampusFootprint(campusTargets);

  // --- 台地プレート（?plate=1 の時のみ） ---
  // 既定では床を描画しない。平らな床と起伏のある実地形を1つの高さで
  // 接ぐと、どこかが必ず浮くか陥没して見えるため、床自体を無くして
  // 「道路と建物の光る回路が夜に浮かぶ」表現にしている。
  if (new URLSearchParams(location.search).has("plate")) {
    const sw = projectLatLon(data.bounds.south, data.bounds.west);
    const ne = projectLatLon(data.bounds.north, data.bounds.east);
    const plate = buildBasePlate(sw, ne, baseY, footprint);
    group.add(plate);
    raycastTargets.push(plate);
  }

  // --- 建物（押し出し + エッジ発光） ---
  const solidGeos: THREE.BufferGeometry[] = [];
  for (const building of data.buildings) {
    const local = building.pts.map(([lon, lat]) => projectLatLon(lat, lon));
    const cx = local.reduce((s, p) => s + p.x, 0) / local.length;
    const cz = local.reduce((s, p) => s + p.z, 0) / local.length;
    if (footprint.covers(cx, cz)) {
      continue;
    }

    // ExtrudeGeometry は XY 平面 + Z 押し出しなので (x, -z) で作って X 軸回転する
    const shape = new THREE.Shape(local.map((p) => new THREE.Vector2(p.x, -p.z)));
    const height = building.h > 0 ? building.h : SURROUNDINGS.buildingDefaultHeight;
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, baseY, 0);
    solidGeos.push(geo);
  }

  if (solidGeos.length > 0) {
    const merged = mergeGeometries(solidGeos, false);
    for (const g of solidGeos) g.dispose();

    // 面: ほぼ黒の塗り（奥のラインを遮蔽して立体感を出す）
    const solid = new THREE.Mesh(
      merged,
      new THREE.MeshBasicMaterial({
        color: 0x081812,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1
      })
    );
    group.add(solid);
    raycastTargets.push(solid);

    // 稜線: 通常合成（加算ブルーム対象にしない）
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(merged, 30),
      new THREE.LineBasicMaterial({
        color: 0x2effa0,
        transparent: true,
        opacity: 0.38,
        depthWrite: false
      })
    );
    group.add(edges);
  }

  // --- 道路・鉄道（ポリライン） ---
  group.add(
    buildLines(data.roads.filter((r) => !r.major), baseY + 0.25, 0x1d9c64, 0.32, footprint),
    buildLines(data.roads.filter((r) => r.major), baseY + 0.35, 0x2effa0, 0.52, footprint),
    buildLines(data.railways, baseY + 0.5, 0x7dffce, 0.72, footprint)
  );

  // --- 駅マーカー + ラベル ---
  for (const station of data.stations) {
    group.add(createStationMarker(station, baseY));
  }

  console.info(
    `[surroundings] buildings=${solidGeos.length} roads=${data.roads.length} ` +
      `stations=${data.stations.map((s) => s.name).join(",")}`
  );
  return { group, raycastTargets, baseY };
}

function buildLines(
  ways: { pts: [number, number][] }[],
  y: number,
  color: number,
  opacity: number,
  footprint?: CampusFootprint
): THREE.LineSegments {
  const positions: number[] = [];
  for (const way of ways) {
    const local = way.pts.map(([lon, lat]) => projectLatLon(lat, lon));
    for (let i = 0; i < local.length - 1; i++) {
      // キャンパスくり抜き内を通る区間は描かない（低地の上に浮くため）
      if (
        footprint?.covers(
          (local[i].x + local[i + 1].x) / 2,
          (local[i].z + local[i + 1].z) / 2
        )
      ) {
        continue;
      }
      positions.push(local[i].x, y, local[i].z, local[i + 1].x, y, local[i + 1].z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false
    })
  );
}

function createStationMarker(
  station: { name: string; lat: number; lon: number },
  baseY: number
): THREE.Group {
  const marker = new THREE.Group();
  const p = projectLatLon(station.lat, station.lon);
  marker.position.set(p.x, baseY, p.z);

  // 光の柱
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 90, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x7dffce,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  beam.position.y = 45;
  marker.add(beam);

  // ラベル（Sprite = 常にカメラを向く）
  const label = station.name.endsWith("駅") ? station.name : `${station.name}駅`;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "56px 'DotGothic16', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#2effa0";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#d9ffe9";
  ctx.fillText(label, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  sprite.scale.set(120, 30, 1);
  sprite.position.y = 105;
  marker.add(sprite);

  return marker;
}

/**
 * キャンパスモデルの XZ 占有グリッド。
 * 三角形単位（XZ バウンディングボックス）で cell(m) グリッドへ塗る。
 * 頂点だけのラスタライズだと、平坦部の巨大三角形（頂点間隔 >> cell）の
 * 内側セルに頂点が入らず「モデル無し」と誤判定され、台地の床が
 * キャンパス上に黒い四角として残る（実際に起きた不具合）。
 * 台地のくり抜き・建物や道路の重複除外の判定に共通で使う。
 */
class CampusFootprint {
  readonly cell: number;
  readonly minX: number;
  readonly minZ: number;
  readonly minY: number;
  readonly nx: number;
  readonly nz: number;
  private grid: Uint8Array;

  constructor(campusTargets: THREE.Object3D[], cell = 5) {
    this.cell = cell;
    const box = new THREE.Box3();
    for (const obj of campusTargets) box.expandByObject(obj);
    this.minX = box.min.x - cell;
    this.minZ = box.min.z - cell;
    this.minY = box.min.y;
    this.nx = Math.max(1, Math.ceil((box.max.x - this.minX) / cell) + 2);
    this.nz = Math.max(1, Math.ceil((box.max.z - this.minZ) / cell) + 2);
    this.grid = new Uint8Array(this.nx * this.nz);

    const started = performance.now();
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    const vc = new THREE.Vector3();
    for (const obj of campusTargets) {
      if (!(obj instanceof THREE.Mesh)) continue;
      const geometry = obj.geometry as THREE.BufferGeometry;
      const position = geometry.getAttribute("position") as
        | THREE.BufferAttribute
        | undefined;
      if (!position) continue;
      const index = geometry.getIndex();
      const vertexCount = index ? index.count : position.count;
      obj.updateWorldMatrix(true, false);
      for (let i = 0; i + 2 < vertexCount; i += 3) {
        va.fromBufferAttribute(position, index ? index.getX(i) : i);
        vb.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1);
        vc.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2);
        va.applyMatrix4(obj.matrixWorld);
        vb.applyMatrix4(obj.matrixWorld);
        vc.applyMatrix4(obj.matrixWorld);
        const ix0 = Math.max(0, Math.floor((Math.min(va.x, vb.x, vc.x) - this.minX) / cell));
        const ix1 = Math.min(this.nx - 1, Math.floor((Math.max(va.x, vb.x, vc.x) - this.minX) / cell));
        const iz0 = Math.max(0, Math.floor((Math.min(va.z, vb.z, vc.z) - this.minZ) / cell));
        const iz1 = Math.min(this.nz - 1, Math.floor((Math.max(va.z, vb.z, vc.z) - this.minZ) / cell));
        for (let iz = iz0; iz <= iz1; iz++) {
          for (let ix = ix0; ix <= ix1; ix++) {
            this.grid[iz * this.nx + ix] = 1;
          }
        }
      }
    }
    console.info(
      `[surroundings] footprint ${this.nx}x${this.nz} cells rasterized in ` +
        `${(performance.now() - started).toFixed(0)}ms`
    );
  }

  coversCell(ix: number, iz: number): boolean {
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return false;
    return this.grid[iz * this.nx + ix] === 1;
  }

  covers(x: number, z: number): boolean {
    return this.coversCell(
      Math.floor((x - this.minX) / this.cell),
      Math.floor((z - this.minZ) / this.cell)
    );
  }
}

/**
 * 台地の床プレート。キャンパス footprint のセルはくり抜き、
 * くり抜きの縁には下向きの断面壁を張って「地形の切り口」に見せる。
 */
function buildBasePlate(
  sw: { x: number; z: number },
  ne: { x: number; z: number },
  baseY: number,
  footprint: CampusFootprint
): THREE.Mesh {
  const minX = Math.min(sw.x, ne.x);
  const maxX = Math.max(sw.x, ne.x);
  const minZ = Math.min(sw.z, ne.z);
  const maxZ = Math.max(sw.z, ne.z);

  // 内側グリッド領域（footprint 全域を bbox にクランプ）
  const gx0 = Math.max(minX, footprint.minX);
  const gz0 = Math.max(minZ, footprint.minZ);
  const gx1 = Math.min(maxX, footprint.minX + footprint.nx * footprint.cell);
  const gz1 = Math.min(maxZ, footprint.minZ + footprint.nz * footprint.cell);

  const positions: number[] = [];
  const floorQuad = (x0: number, z0: number, x1: number, z1: number): void => {
    if (x1 <= x0 || z1 <= z0) return;
    positions.push(
      x0, baseY, z0, x1, baseY, z0, x1, baseY, z1,
      x0, baseY, z0, x1, baseY, z1, x0, baseY, z1
    );
  };
  // くり抜き縁の断面壁（モデル最低部より下まで落とす）
  const wallBottom = Math.min(footprint.minY, baseY) - 5;
  const wall = (x0: number, z0: number, x1: number, z1: number): void => {
    positions.push(
      x0, baseY, z0, x1, baseY, z1, x1, wallBottom, z1,
      x0, baseY, z0, x1, wallBottom, z1, x0, wallBottom, z0
    );
  };

  // 外周 4 ストリップ（くり抜きの可能性がない領域は大きな板で済ませる）
  floorQuad(minX, minZ, maxX, gz0);
  floorQuad(minX, gz1, maxX, maxZ);
  floorQuad(minX, gz0, gx0, gz1);
  floorQuad(gx1, gz0, maxX, gz1);

  // 内側は footprint のセル単位。覆われていないセルだけ床を張り、
  // 覆われたセル（穴）の縁に壁を張る。
  let holeCells = 0;
  for (let iz = 0; iz < footprint.nz; iz++) {
    for (let ix = 0; ix < footprint.nx; ix++) {
      const x0 = Math.max(gx0, footprint.minX + ix * footprint.cell);
      const z0 = Math.max(gz0, footprint.minZ + iz * footprint.cell);
      const x1 = Math.min(gx1, footprint.minX + (ix + 1) * footprint.cell);
      const z1 = Math.min(gz1, footprint.minZ + (iz + 1) * footprint.cell);
      if (x1 <= x0 || z1 <= z0) continue;
      if (!footprint.coversCell(ix, iz)) {
        floorQuad(x0, z0, x1, z1);
        continue;
      }
      holeCells++;
      if (!footprint.coversCell(ix, iz - 1)) wall(x0, z0, x1, z0);
      if (!footprint.coversCell(ix, iz + 1)) wall(x0, z1, x1, z1);
      if (!footprint.coversCell(ix - 1, iz)) wall(x0, z0, x0, z1);
      if (!footprint.coversCell(ix + 1, iz)) wall(x1, z0, x1, z1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ color: 0x06110b, side: THREE.DoubleSide })
  );
  mesh.name = "surroundings-plate";
  console.info(`[surroundings] plate: hole cells=${holeCells}`);
  return mesh;
}
