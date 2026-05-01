import { Queue, Worker } from 'bullmq';
import { queueConnection, createWorkerConnection } from '../lib/redis';
import { syncRagContentToVectors } from '../domains/ai/rag.service';
import { logIncident } from '../domains/incidents/incident.service';

export const ragSyncQueue = new Queue('rag-sync', { connection: queueConnection });

export const ragSyncWorker = new Worker(
  'rag-sync',
  async job => {
    return syncRagContentToVectors(job.data.tenantId);
  },
  {
    connection: createWorkerConnection(),
    concurrency: 1,
  },
);

ragSyncWorker.on('failed', async (job, err) => {
  await logIncident('high', 'rag_sync_failed', err.message, { jobId: job?.id });
});
