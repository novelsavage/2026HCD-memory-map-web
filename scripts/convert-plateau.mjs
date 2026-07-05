// PLATEAU CityGML の建物外形・実測高さを、既存の周辺市街地JSON形式へ変換する。
// 使用例:
//   node scripts/convert-plateau.mjs /tmp/kashiwa-gml public/plateau-surroundings.json
// 入力ディレクトリには対象地域メッシュの *_bldg_*.gml だけを置く。

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BOUNDS = {
  south: 35.824255102680205,
  west: 139.9396836960089,
  north: 35.846503431837974,
  east: 139.972
};
const round6 = (value) => Math.round(value * 1e6) / 1e6;

const inputDir = process.argv[2];
const outputPath = process.argv[3] || "public/plateau-surroundings.json";
if (!inputDir) {
  throw new Error("入力ディレクトリを指定してください: node scripts/convert-plateau.mjs <gml-dir> [output]");
}

const osm = JSON.parse(readFileSync("public/osm-surroundings.json", "utf8"));
const files = readdirSync(inputDir)
  .filter((name) => /_bldg_.*\.gml$/i.test(name))
  .sort();
if (files.length === 0) throw new Error(`${inputDir} に建築物 CityGML がありません`);

const buildings = [];
let cityObjects = 0;
let skipped = 0;

for (const name of files) {
  const xml = readFileSync(resolve(inputDir, name), "utf8");
  const buildingPattern = /<bldg:Building\b[\s\S]*?<\/bldg:Building>/g;
  for (const match of xml.matchAll(buildingPattern)) {
    cityObjects++;
    const block = match[0];
    const heightText = block.match(/<bldg:measuredHeight\b[^>]*>([^<]+)<\/bldg:measuredHeight>/)?.[1];
    const height = Number.parseFloat(heightText ?? "0");
    const lod0 = block.match(/<bldg:lod0(?:RoofEdge|FootPrint)>[\s\S]*?<\/bldg:lod0(?:RoofEdge|FootPrint)>/)?.[0];
    if (!lod0) {
      skipped++;
      continue;
    }

    const exteriorPattern = /<gml:exterior>[\s\S]*?<gml:posList\b[^>]*>([\s\S]*?)<\/gml:posList>[\s\S]*?<\/gml:exterior>/g;
    let added = false;
    for (const exterior of lod0.matchAll(exteriorPattern)) {
      const values = exterior[1].trim().split(/\s+/).map(Number);
      if (values.length < 12 || values.length % 3 !== 0 || values.some((v) => !Number.isFinite(v))) {
        continue;
      }

      // EPSG:6697 の CityGML は lat, lon, elevation の順。
      const pts = [];
      // 6桁（約0.1m）へ丸め、ブラウザ配信用JSONを小さく保つ。
      for (let i = 0; i < values.length; i += 3) {
        pts.push([round6(values[i + 1]), round6(values[i])]);
      }
      const lons = pts.map(([lon]) => lon);
      const lats = pts.map(([, lat]) => lat);
      const intersects =
        Math.max(...lons) >= BOUNDS.west && Math.min(...lons) <= BOUNDS.east &&
        Math.max(...lats) >= BOUNDS.south && Math.min(...lats) <= BOUNDS.north;
      if (!intersects) continue;

      buildings.push({ h: Number.isFinite(height) && height > 0 ? height : 0, pts });
      added = true;
    }
    if (!added) skipped++;
  }
  console.log(`parsed ${name}`);
}

const out = {
  bounds: BOUNDS,
  source: {
    buildings: "Project PLATEAU 3D都市モデル（柏市・2020年度）",
    transport: "OpenStreetMap contributors"
  },
  buildings,
  roads: osm.roads,
  railways: osm.railways,
  stations: osm.stations
};
writeFileSync(outputPath, JSON.stringify(out));
console.log(
  `saved ${outputPath}: files=${files.length} cityObjects=${cityObjects} ` +
    `buildingParts=${buildings.length} skipped=${skipped}`
);
