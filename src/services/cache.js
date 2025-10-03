const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCached(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < (item.ttl ?? CACHE_TTL)) {
    return item.data;
  }
  cache.delete(key);
  return null;
}

export function setCache(key, data, ttl = CACHE_TTL) {
  cache.set(key, { data, timestamp: Date.now(), ttl });
}

export function clearCache(pattern) {
  if (pattern) {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) cache.delete(key);
    }
  } else {
    cache.clear();
  }
}
