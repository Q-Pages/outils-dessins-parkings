export interface LatLng {
  lat: number;
  lng: number;
}

export interface Point {
  x: number;
  y: number;
}

const EARTH_RADIUS_M = 6378137;
const METERS_PER_DEG_LAT = (Math.PI / 180) * EARTH_RADIUS_M;

export function makeProjection(originLatLng: LatLng) {
  const originLatRad = (originLatLng.lat * Math.PI) / 180;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(originLatRad);

  return {
    toLocal(p: LatLng): Point {
      return {
        x: (p.lng - originLatLng.lng) * metersPerDegLng,
        y: (p.lat - originLatLng.lat) * METERS_PER_DEG_LAT,
      };
    },
    toLatLng(p: Point): LatLng {
      return {
        lat: originLatLng.lat + p.y / METERS_PER_DEG_LAT,
        lng: originLatLng.lng + p.x / metersPerDegLng,
      };
    },
  };
}
