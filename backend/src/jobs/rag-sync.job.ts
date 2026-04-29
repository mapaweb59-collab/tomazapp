import { Queue, Worker } from 'bullmq';
import { createBullConnection } from '../lib/redis';
import { syncNotionToVectors } from '../domains/ai/rag.service';
import { logIncident } from '../domains/incidents/incident.service';

export const ragSyncQueue = new Queue('rag-sync', { connection: createBullConnection() });

export const ragSyncWorker = new Worker(
  'rag-sync',
  async job => {
    await syncNotionToVectors(job.data.tenantId);
  },
  {
    connection: createBullConnection(),
    concurrency: 1,
  },
);

ragSyncWorker.on('failed', async (job, err) => {
  await logIncident('high', 'rag_sync_failed', err.message, { jobId: job?.id });
});
