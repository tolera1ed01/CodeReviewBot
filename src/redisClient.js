import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Returns true if this GitHub delivery ID was already processed.
 * Uses 1 Redis command (SET NX). TTL = 24h to cover GitHub's retry window.
 */
export async function isDuplicate(deliveryId) {
  const result = await redis.set(`delivery:${deliveryId}`, '1', {
    nx: true,   // only set if key does not exist
    ex: 86400,  // expire after 24 hours
  });
  // result is "OK" when newly set, null when key already existed
  return result === null;
}

/**
 * Returns true if this repo has exceeded 10 reviews in the current hour.
 * Uses 2 Redis commands (INCR + EXPIRE on first call per window).
 */
export async function isRateLimited(repo) {
  const window = Math.floor(Date.now() / 3_600_000); // current hour bucket
  const key = `ratelimit:${repo}:${window}`;
  const count = await redis.incr(key);
  if (count === 1) {
    // First request this hour — set expiry so the key self-cleans
    await redis.expire(key, 3600);
  }
  return count > 10;
}
