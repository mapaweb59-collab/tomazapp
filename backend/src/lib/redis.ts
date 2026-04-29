import { Redis } from 'ioredis';

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
const opts = { maxRetriesPerRequest: null };

// Conexão geral (idempotência, cache)
export const redis = new Redis(url, opts);

// Conexão compartilhada para Queue instances (seguro compartilhar entre filas, não entre filas e workers)
export const queueConnection = new Redis(url, opts);

// Cada Worker precisa de conexão própria (comandos bloqueantes)
export function createWorkerConnection(): Redis {
  return new Redis(url, opts);
}
