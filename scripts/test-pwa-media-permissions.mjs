/**
 * PWA media permission / geo cache helpers.
 * Run: node scripts/test-pwa-media-permissions.mjs
 */
import assert from 'node:assert/strict';

const GEO_CACHE_MAX_AGE_MS = 15 * 60 * 1000;

function readCachedGeoFrom(store, maxAgeMs = GEO_CACHE_MAX_AGE_MS) {
  const raw = store.getItem('openhr_pwa_last_geo_v1');
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!Number.isFinite(parsed?.lat) || !Number.isFinite(parsed?.lng) || !Number.isFinite(parsed?.at)) {
    return null;
  }
  if (Date.now() - parsed.at > maxAgeMs) return null;
  return parsed;
}

function writeCachedGeoTo(store, geo) {
  store.setItem(
    'openhr_pwa_last_geo_v1',
    JSON.stringify({
      lat: geo.lat,
      lng: geo.lng,
      address: geo.address || `${geo.lat},${geo.lng}`,
      accuracy: geo.accuracy ?? null,
      at: geo.at ?? Date.now(),
    }),
  );
}

const mem = new Map();
const store = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
};

assert.equal(readCachedGeoFrom(store), null);
writeCachedGeoTo(store, { lat: -29.1, lng: -51.2, address: 'Teste', at: Date.now() });
const hit = readCachedGeoFrom(store);
assert.equal(hit.lat, -29.1);
assert.equal(hit.address, 'Teste');

writeCachedGeoTo(store, { lat: 1, lng: 2, address: 'Old', at: Date.now() - GEO_CACHE_MAX_AGE_MS - 1000 });
assert.equal(readCachedGeoFrom(store), null);

console.log('✅ pwa media permission cache tests passed.');
