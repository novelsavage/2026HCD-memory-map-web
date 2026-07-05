// OSM (Overpass API) から周辺エリアの建物・道路・鉄道・駅を取得して
// public/osm-surroundings.json に保存する。ネットワーク必須・手動実行:
//   node scripts/fetch-osm.mjs
// 範囲は OCR WebApp (capture-form.tsx) の MAP_BOUNDS と同一。
// データライセンス: © OpenStreetMap contributors (ODbL)

import { writeFileSync, mkdirSync } from "node:fs";

const BBOX = {
  south: 35.824255102680205,
  west: 139.9396836960089,
  north: 35.846503431837974,
  east: 139.96551577769122
};

const bbox = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;
const query = `
[out:json][timeout:120];
(
  way["building"](${bbox});
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street|service)$"](${bbox});
  way["railway"~"^(rail|light_rail|subway)$"](${bbox});
  node["railway"~"^(station|halt)$"](${bbox});
);
out tags geom;
`;

const MAJOR_HIGHWAYS = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

function buildingHeight(tags = {}) {
  const h = parseFloat(tags.height);
  if (Number.isFinite(h) && h > 0) return Math.min(h, 60);
  const levels = parseFloat(tags["building:levels"]);
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels * 3.2, 60);
  return 0; // 不明。ランタイム側で既定値を使う
}

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

async function fetchOverpass() {
  let lastError;
  for (const endpoint of ENDPOINTS) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "2026HCD-memory-map-web/0.1 (reitaku student project)"
      },
      body: "data=" + encodeURIComponent(query)
    });
    if (res.ok) return res.json();
    lastError = new Error(`Overpass error at ${endpoint}: ${res.status}`);
    console.warn(String(lastError));
  }
  throw lastError;
}

const osm = await fetchOverpass();

const out = { bounds: BBOX, buildings: [], roads: [], railways: [], stations: [] };

for (const el of osm.elements) {
  if (el.type === "node") {
    if (el.tags?.railway === "station" || el.tags?.railway === "halt") {
      out.stations.push({
        name: el.tags.name || el.tags["name:ja"] || "駅",
        lat: round6(el.lat),
        lon: round6(el.lon)
      });
    }
    continue;
  }
  if (el.type !== "way" || !el.geometry) continue;
  const pts = el.geometry.map((g) => [round6(g.lon), round6(g.lat)]);
  const tags = el.tags || {};

  if (tags.building) {
    if (pts.length < 4) continue; // 閉じた外形は最低4点（始点=終点）
    out.buildings.push({ h: buildingHeight(tags), pts });
  } else if (tags.railway) {
    out.railways.push({ pts });
  } else if (tags.highway) {
    out.roads.push({ major: MAJOR_HIGHWAYS.has(tags.highway), pts });
  }
}

mkdirSync("public", { recursive: true });
writeFileSync("public/osm-surroundings.json", JSON.stringify(out));

console.log(
  `saved public/osm-surroundings.json: ` +
    `buildings=${out.buildings.length} roads=${out.roads.length} ` +
    `railways=${out.railways.length} stations=${out.stations.map((s) => s.name).join("/")}`
);
