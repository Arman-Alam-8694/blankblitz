/** Token-bucket rate limiter: `capacity` burst, refilled at `perSecond`. */
export class TokenBucket {
  private tokens: number;
  private last = Date.now();

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {
    this.tokens = capacity;
  }

  take(cost = 1): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < cost) return false;
    this.tokens -= cost;
    return true;
  }
}

/** Keyed buckets (e.g. per IP) with periodic cleanup so memory stays bounded. */
export class KeyedLimiter {
  private readonly buckets = new Map<string, { bucket: TokenBucket; seen: number }>();
  private readonly sweep: NodeJS.Timeout;

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
  ) {
    this.sweep = setInterval(() => {
      const cutoff = Date.now() - 10 * 60_000;
      for (const [k, v] of this.buckets) if (v.seen < cutoff) this.buckets.delete(k);
    }, 60_000);
    this.sweep.unref();
  }

  take(key: string, cost = 1): boolean {
    let entry = this.buckets.get(key);
    if (!entry) {
      entry = { bucket: new TokenBucket(this.capacity, this.perSecond), seen: Date.now() };
      this.buckets.set(key, entry);
    }
    entry.seen = Date.now();
    return entry.bucket.take(cost);
  }

  stop(): void {
    clearInterval(this.sweep);
  }
}
