/**
 * Tiny TTL cache for data-API responses.
 *
 * Free-tier quotas (the-odds-api = 500/mo) mean we cache reads for 60s. The
 * cache is keyed by a caller-supplied string and stores the resolved value plus
 * an expiry. A single in-flight promise per key de-dupes concurrent calls so a
 * burst of tool invocations is one upstream request.
 */
interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache {
  private store = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly ttlMs = 60_000) {}

  /** Return cached value if fresh, else run `loader`, cache, and return it. */
  async get<T>(key: string, loader: () => Promise<T>, ttlMs = this.ttlMs): Promise<T> {
    const now = Date.now();
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > now) return hit.value as T;

    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;

    const p = (async () => {
      try {
        const value = await loader();
        this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p as Promise<T>;
  }

  /** True if the key has a fresh entry (used by bench to report hit/miss). */
  isFresh(key: string): boolean {
    const hit = this.store.get(key);
    return !!hit && hit.expiresAt > Date.now();
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }
}

export const dataCache = new TtlCache(60_000);
