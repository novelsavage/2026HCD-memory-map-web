import { CALIBRATION } from "./config";

const EARTH_RADIUS_METERS = 6378137;

export interface ProjectedPoint {
  x: number;
  z: number;
  distanceMeters: number;
}

/**
 * 緯度経度を原点基準の平面座標へ投影する（正距円筒近似）。
 * Unity 版 MemoryGeoProjector と同じ手法。キャンパス規模なら誤差は無視できる。
 * Three.js は右手系のため、北を -Z 方向に取る。
 */
export function projectLatLon(lat: number, lon: number): ProjectedPoint {
  const c = CALIBRATION;
  const originLatRad = (c.originLat * Math.PI) / 180;
  const dLatRad = ((lat - c.originLat) * Math.PI) / 180;
  const dLonRad = ((lon - c.originLon) * Math.PI) / 180;

  let east = dLonRad * Math.cos(originLatRad) * EARTH_RADIUS_METERS;
  let north = dLatRad * EARTH_RADIUS_METERS;

  const distanceMeters = Math.hypot(east, north);

  if (c.invertEastWest) east = -east;
  if (c.invertNorthSouth) north = -north;

  const yaw = (c.yawDeg * Math.PI) / 180;
  const eastRot = east * Math.cos(yaw) - north * Math.sin(yaw);
  const northRot = east * Math.sin(yaw) + north * Math.cos(yaw);

  return {
    x: eastRot * c.unitsPerMeter + c.offsetX,
    z: -northRot * c.unitsPerMeter + c.offsetZ,
    distanceMeters
  };
}
