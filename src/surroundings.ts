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
}

/**
 * OSM 由来の周辺市街地（scripts/fetch-osm.mjs の出力）を
 * 発光ワイヤーフレーム調で生成する。?nocity で無効化。
 * データ出典: © OpenStreetMap contributors (ODbL)
 */
export async function loadSurroundings(
  campusBoundsXZ: THREE.Box2
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
  const baseY = SURROUNDINGS.baseY;

  // --- 台地プレーン（bbox 全域の暗い床） ---
  const sw = projectLatLon(data.bounds.south, data.bounds.west);
  const ne = projectLatLon(data.bounds.north, data.bounds.east);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.abs(ne.x - sw.x), Math.abs(ne.z - sw.z)),
    new THREE.MeshBasicMaterial({ color: 0x06110b })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.set((sw.x + ne.x) / 2, baseY - 0.3, (sw.z + ne.z) / 2);
  group.add(plane);
  raycastTargets.push(plane);

  // --- 建物（押し出し + エッジ発光） ---
  const solidGeos: THREE.BufferGeometry[] = [];
  for (const building of data.buildings) {
    const local = building.pts.map(([lon, lat]) => projectLatLon(lat, lon));
    // キャンパスモデルの範囲内は Google Earth モデル側に任せてスキップ
    const cx = local.reduce((s, p) => s + p.x, 0) / local.length;
    const cz = local.reduce((s, p) => s + p.z, 0) / local.length;
    if (campusBoundsXZ.containsPoint(new THREE.Vector2(cx, cz))) continue;

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

    // 稜線: 加算合成グリーン（重なりがブルームで発光する）
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(merged, 30),
      new THREE.LineBasicMaterial({
        color: 0x2effa0,
        transparent: true,
        opacity: 0.38,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    group.add(edges);
  }

  // --- 道路・鉄道（ポリライン） ---
  group.add(
    buildLines(data.roads.filter((r) => !r.major), baseY + 0.25, 0x1d9c64, 0.18),
    buildLines(data.roads.filter((r) => r.major), baseY + 0.35, 0x2effa0, 0.32),
    buildLines(data.railways, baseY + 0.5, 0x7dffce, 0.6)
  );

  // --- 駅マーカー + ラベル ---
  for (const station of data.stations) {
    group.add(createStationMarker(station, baseY));
  }

  console.info(
    `[surroundings] buildings=${solidGeos.length} roads=${data.roads.length} ` +
      `stations=${data.stations.map((s) => s.name).join(",")}`
  );
  return { group, raycastTargets };
}

function buildLines(
  ways: { pts: [number, number][] }[],
  y: number,
  color: number,
  opacity: number
): THREE.LineSegments {
  const positions: number[] = [];
  for (const way of ways) {
    const local = way.pts.map(([lon, lat]) => projectLatLon(lat, lon));
    for (let i = 0; i < local.length - 1; i++) {
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
      blending: THREE.AdditiveBlending,
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
    new THREE.CylinderGeometry(1.2, 1.2, 60, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x7dffce,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  beam.position.y = 30;
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
  sprite.scale.set(80, 20, 1);
  sprite.position.y = 72;
  marker.add(sprite);

  return marker;
}
