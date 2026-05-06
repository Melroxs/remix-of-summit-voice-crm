// Travel-time helper using public OSRM demo + Nominatim geocoding.
// No API key required. Results cached in-memory per session.

const geoCache = new Map<string, { lat: number; lon: number } | null>();
const routeCache = new Map<string, number>();

async function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key)!;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    const data = await res.json();
    const hit = Array.isArray(data) && data[0] ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) } : null;
    geoCache.set(key, hit);
    return hit;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

/**
 * Returns travel time in minutes between two addresses (driving).
 * Returns null if either address can't be geocoded or routing fails.
 */
export async function getTravelTime(from: string, to: string): Promise<number | null> {
  if (!from?.trim() || !to?.trim()) return null;
  const cacheKey = `${from.trim().toLowerCase()}|${to.trim().toLowerCase()}`;
  if (routeCache.has(cacheKey)) return routeCache.get(cacheKey)!;

  const [a, b] = await Promise.all([geocode(from), geocode(to)]);
  if (!a || !b) return null;

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`osrm ${res.status}`);
    const data = await res.json();
    const seconds = data?.routes?.[0]?.duration;
    if (typeof seconds !== "number") return null;
    const minutes = Math.round(seconds / 60);
    routeCache.set(cacheKey, minutes);
    return minutes;
  } catch {
    return null;
  }
}
