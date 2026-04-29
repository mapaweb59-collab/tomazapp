import 'dotenv/config';
import Fastify from 'fastify';
import { whatsappWebhookRoutes } from './routes/webhooks/whatsapp.route';
import { chatwootWebhookRoutes } from './routes/webhooks/chatwoot.route';
import { asaasWebhookRoutes } from './routes/webhooks/asaas.route';
import { ragSyncWorker, ragSyncQueue } from './jobs/rag-sync.job';
import { reminderWorker } from './jobs/reminder.job';
import { dlqRetryWorker } from './jobs/dlq-retry.job';
import { getDefaultTenantId } from './domains/tenants/tenant.service';

const app = Fastify({
  logger: {
    transport: process.env.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

app.register(whatsappWebhookRoutes);
app.register(chatwootWebhookRoutes);
app.register(asaasWebhookRoutes);

app.get('/health', async () => ({ ok: true, workers: ['rag-sync', 'reminders', 'dlq-retry'] }));

const start = async () => {
  try {
    // Workers iniciam junto com o servidor
    await Promise.all([
      ragSyncWorker.waitUntilReady(),
      reminderWorker.waitUntilReady(),
      dlqRetryWorker.waitUntilReady(),
    ]);

    // Agenda RAG sync imediato + repeatable a cada 6h
    const tenantId = await getDefaultTenantId();
    await ragSyncQueue.add('initial-sync', { tenantId }, { jobId: `initial-${tenantId}` });
    await ragSyncQueue.upsertJobScheduler(
      `rag-sync-${tenantId}`,
      { every: 6 * 60 * 60 * 1000 },
      { name: 'scheduled-sync', data: { tenantId } },
    );

    await app.listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

const shutdown = async () => {
  await Promise.all([
    ragSyncWorker.close(),
    reminderWorker.close(),
    dlqRetryWorker.close(),
  ]);
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
