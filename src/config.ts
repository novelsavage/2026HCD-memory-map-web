// 座標キャリブレーション。Unity 版 MemoryGeoProjector の設定を踏襲する。
// ?debug=1 で lil-gui から調整し、確定値をここに書き戻す。
export const CALIBRATION = {
  originLat: 35.833956,
  originLon: 139.956178,
  unitsPerMeter: 1,
  yawDeg: 0,
  invertEastWest: false,
  invertNorthSouth: false,
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  // 原点からこの距離(m)を超える思い出は「大学外」として上空に浮かせる
  maxDistanceFromOriginMeters: 3000
};

// キャンパスモデル(campus.glb)の配置調整
export const MODEL_TRANSFORM = {
  scale: 3.51,
  yawDeg: 0,
  offsetX: -409,
  offsetY: -30.2,
  offsetZ: 280,
  // バウンディングボックス中心が原点から大きく外れている場合に自動で中央寄せする
  autoCenterThreshold: 2000
};

// OCR WebApp (capture-form.tsx) の MAP_BOUNDS と同一。
// この範囲内の思い出は地面に接地、範囲外は上空に浮遊させる。
// scripts/fetch-osm.mjs の取得範囲もこれ。
export const MAP_BOUNDS = {
  north: 35.846503431837974,
  west: 139.9396836960089,
  south: 35.824255102680205,
  east: 139.96551577769122
};

// OSM 周辺市街地（surroundings.ts）
export const SURROUNDINGS = {
  // 変換後キャンパスモデルの bbox 底面より少し下げ、面の重なりを避ける
  baseOffsetFromCampusMin: -0.3,
  buildingDefaultHeight: 6.5
};

// OCR WebApp (capture-form.tsx) と同じジャンル配色
export const GENRE_COLORS: Record<string, string> = {
  恋愛: "#ec9bb6",
  友情: "#86c5e0",
  学業: "#83cf8a",
  部活: "#f0cf57",
  行事: "#b9a3e3",
  上記以外: "#357a5a"
};
export const GENRE_FALLBACK_COLOR = "#9aa7b4";

export const CARD = {
  size: 9, // カード一辺 (world units ≒ m)
  poleHeightMin: 5,
  poleHeightMax: 11,
  floatRadiusMin: 260,
  floatRadiusMax: 380,
  floatHeightMin: 120,
  floatHeightMax: 180
};

export const EVENT_ID =
  (import.meta.env.VITE_EVENT_ID as string | undefined) || "reitaku-hcd-2026";
