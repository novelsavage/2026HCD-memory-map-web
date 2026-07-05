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
  // Unity 版由来の名残。現行 Web では未使用
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
// この範囲内の思い出のみピン+テキストで表示する。
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

// 思い出マーカー（Unity Pin.prefab / MemoryGeoProjector 相当）
// Unity: unitsPerMeter=0.29, worldHeight=10, PinText 32×8 unit
// 位置・高さは geo ワールド（1 unit ≈ 1 m）。キャンパス MODEL_TRANSFORM.scale は掛けない。
const UNITY_UNITS_PER_METER = 0.29;
const unityWorld = (units: number): number => units / UNITY_UNITS_PER_METER;

/** 3D ラベル全体の表示倍率 */
const MARKER_TEXT_SCALE = 1.2;

export const MARKER = {
  textScale: MARKER_TEXT_SCALE,
  /** 密集時にも確保する地面からの最低高度（Unity worldHeight=10） */
  groundOffsetY: unityWorld(10),
  /** 孤立した思い出を目立たせる標準高度 */
  defaultLabelHeight: unityWorld(20),
  poleRadius: unityWorld(0.12),
  pinRadius: unityWorld(0.2),
  /** 左上Pivotのテキスト Plane（幅は Canvas アスペクト比から自動） */
  labelPlaneHeight: unityWorld(5) * MARKER_TEXT_SCALE,
  appearDuration: 1.2,
  staggerStep: 0.15,
  staggerMax: 3.0,
  staggerBaseDelay: 0.4,
  labelCanvasWidth: 1024,
  labelFontSize: Math.round(72 * MARKER_TEXT_SCALE),
  labelLineHeight: 1.35,
  labelMaxLines: 5,
  labelPadding: Math.round(24 * MARKER_TEXT_SCALE),
  labelGlowBlur: Math.round(22 * MARKER_TEXT_SCALE),
  stackRadius: 80,
  stackHeightStep: unityWorld(5) * MARKER_TEXT_SCALE,
  stackMaxLevels: 8
};

export const EVENT_ID =
  (import.meta.env.VITE_EVENT_ID as string | undefined) || "reitaku-hcd-2026";
