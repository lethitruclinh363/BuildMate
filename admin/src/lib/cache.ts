const memory = new Map<string, { at: number; data: unknown; inflight: Promise<unknown> | null }>();

export function cached<T>(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < ttlMs && hit.data !== undefined && !hit.inflight) {
    return Promise.resolve(hit.data as T);
  }
  if (hit?.inflight) return hit.inflight as Promise<T>;

  const inflight = factory()
    .then((data) => {
      memory.set(key, { at: Date.now(), data, inflight: null });
      return data;
    })
    .catch((err) => {
      memory.delete(key);
      throw err;
    });

  memory.set(key, { at: 0, data: hit?.data, inflight });
  return inflight;
}

export function invalidateCache(key?: string) {
  if (!key) {
    memory.clear();
    return;
  }
  memory.delete(key);
}
