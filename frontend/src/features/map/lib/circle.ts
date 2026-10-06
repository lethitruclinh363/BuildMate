/** GeoJSON ring around a point. Radius is kilometres; coordinates stay [lng, lat]. */
export function circleFeature(lng: number, lat: number, radiusKm: number) {
  const steps = 64;
  const distance = radiusKm / 6371;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const bearing = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(distance) + Math.cos(lat1) * Math.sin(distance) * Math.cos(bearing)
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(distance) * Math.cos(lat1),
        Math.cos(distance) - Math.sin(lat1) * Math.sin(lat2)
      );
    ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
  };
}
