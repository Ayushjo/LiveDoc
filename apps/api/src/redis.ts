import IORedis from 'ioredis';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL environment variable is not set');
}

const REDIS_URL = process.env.REDIS_URL;

/**
 * Shared Redis client for general-purpose use (caching, pub/sub, etc.).
 * BullMQ workers must use createRedisConnection() to get a dedicated connection.
 */
export const redis = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

/**
 * Factory that creates a fresh IORedis connection for BullMQ.
 * BullMQ requires a dedicated connection per Queue/Worker instance —
 * never share a single connection across multiple BullMQ consumers.
 */
export function createRedisConnection(): IORedis {
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

redis.on('error', (err: Error) => {
  console.error('[Redis] connection error:', err.message);
});

redis.on('connect', () => {
  console.log('[Redis] connected');
});
