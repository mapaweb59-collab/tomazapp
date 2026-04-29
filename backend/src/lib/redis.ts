import { Redis } from 'ioredis';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Conexão geral (idempotência, cache)
export const redis = new Redis(url, { maxRetriesPerRequest: null });

// BullMQ precisa de conexões dedicadas (não pode compartilhar com comandos bloqueantes)
export function createBullConnection(): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
