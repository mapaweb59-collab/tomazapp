import { redis } from './redis';

export async function isProcessed(key: string): Promise<boolean> {
  const value = await redis.get(`idempotency:${key}`);
  return value !== null;
}

export async function markProcessed(key: string, ttlSeconds = 86400): Promise<void> {
  await redis.setex(`idempotency:${key}`, ttlSeconds, '1');
}
