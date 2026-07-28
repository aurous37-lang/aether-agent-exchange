import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connectionFailed = false;

/**
 * Get the Redis client, or null if REDIS_URL is not set or connection failed.
 * Lazy-connects on first call. Falls back to null so callers can use in-memory stores.
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) return null;
  if (connectionFailed) return null;
  if (client?.isOpen) return client;

  try {
    client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
      connectionFailed = true;
    });
    await client.connect();
    console.log('[Redis] Connected to', process.env.REDIS_URL);
    return client;
  } catch (err) {
    console.error('[Redis] Failed to connect:', (err as Error).message);
    connectionFailed = false; // Allow retry on next call
    client = null;
    return null;
  }
}

// ─── Nonce Operations ──────────────────────────────────────────

const NONCE_KEY_PREFIX = 'aae:nonce:';

/**
 * Store a nonce for a wallet address with an expiry time.
 */
export async function storeNonce(wallet: string, nonce: string, expiryMs: number): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return; // Caller should fall back to in-memory
  const key = NONCE_KEY_PREFIX + wallet.toLowerCase();
  const data = JSON.stringify({ nonce, expires: Date.now() + expiryMs });
  // Set with TTL in seconds (round up to avoid premature expiry)
  await redis.set(key, data, { PX: expiryMs });
}

/**
 * Retrieve a stored nonce for a wallet address.
 * Returns null if not found or expired.
 */
export async function getNonce(wallet: string): Promise<{ nonce: string; expires: number } | null> {
  const redis = await getRedisClient();
  if (!redis) return null; // Caller should fall back to in-memory
  const key = NONCE_KEY_PREFIX + wallet.toLowerCase();
  const raw = await redis.get(key);
  if (!raw) return null;
  const data = JSON.parse(raw) as { nonce: string; expires: number };
  // Double-check expiry (Redis TTL handles it, but be safe)
  if (Date.now() > data.expires) {
    await redis.del(key);
    return null;
  }
  return data;
}

/**
 * Delete a nonce for a wallet address (consume after verification).
 */
export async function deleteNonce(wallet: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return; // Caller should fall back to in-memory
  const key = NONCE_KEY_PREFIX + wallet.toLowerCase();
  await redis.del(key);
}

// ─── Rate Limiting Store ───────────────────────────────────────

/**
 * Create a Redis-backed store compatible with express-rate-limit.
 * Returns undefined if Redis is not available (limiter will use its default MemoryStore).
 *
 * This implements the express-rate-limit Store interface:
 *   - increment(key): Promise<IncrementResponse>
 *   - decrement(key): Promise<void>
 *   - resetKey(key): Promise<void>
 *
 * Usage:
 *   const store = await createRedisRateLimitStore('aae:rl:auth:', 60_000);
 *   rateLimit({ ..., store: store || undefined });
 */
export async function createRedisRateLimitStore(prefix: string, windowMs: number) {
  const redis = await getRedisClient();
  if (!redis) return undefined;

  return {
    async increment(key: string): Promise<{ totalHits: number; resetTime: Date }> {
      const redisKey = prefix + key;
      const hits = await redis.incr(redisKey);
      if (hits === 1) {
        // First hit in this window — set expiry
        await redis.pExpire(redisKey, windowMs);
      }
      const ttl = await redis.pTTL(redisKey);
      const resetTime = new Date(Date.now() + Math.max(ttl, 0));
      return { totalHits: hits, resetTime };
    },

    async decrement(key: string): Promise<void> {
      const redisKey = prefix + key;
      await redis.decr(redisKey);
    },

    async resetKey(key: string): Promise<void> {
      const redisKey = prefix + key;
      await redis.del(redisKey);
    },

    // express-rate-limit v7 optional
    async resetAll(): Promise<void> {
      // Scan and delete all keys with this prefix
      let cursor = 0;
      do {
        const result = await redis.scan(cursor, { MATCH: prefix + '*', COUNT: 100 });
        cursor = result.cursor;
        if (result.keys.length > 0) {
          await redis.del(result.keys);
        }
      } while (cursor !== 0);
    },
  };
}
