import 'dotenv/config';
import Fastify from 'fastify';
import { whatsappWebhookRoutes } from './routes/webhooks/whatsapp.route';
import { chatwootWebhookRoutes } from './routes/webhooks/chatwoot.route';
import { asaasWebhookRoutes } from './routes/webhooks/asaas.route';
import { metaWebhookRoutes } from './routes/webhooks/meta.route';
import { adminDlqRoutes } from './routes/admin/dlq.route';
import { adminApiRoutes } from './routes/api/admin.route';
import { ragSyncWorker, ragSyncQueue } from './jobs/rag-sync.job';
import { reminderWorker } from './jobs/reminder.job';
import { dlqRetryWorker, dlqRetryQueue } from './jobs/dlq-retry.job';
import { whatsappMonitorWorker, whatsappMonitorQueue } from './jobs/whatsapp-monitor.job';
import { getTenantRagSyncIntervalHours, listActiveTenantIds } from './domains/tenants/tenant.service';

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
app.register(metaWebhookRoutes);
app.register(adminDlqRoutes);
app.register(adminApiRoutes);

app.get('/health', async () => ({
  ok: true,
  workers: ['rag-sync', 'reminders', 'dlq-retry', 'whatsapp-monitor'],
  features: {
    instagram: process.env.FEATURE_INSTAGRAM_ENABLED === 'true',
    messenger: process.env.FEATURE_MESSENGER_ENABLED === 'true',
    tiktok: process.env.FEATURE_TIKTOK_ENABLED === 'true',
  },
}));

const start = async () => {
  try {
    await Promise.all([
      ragSyncWorker.waitUntilReady(),
      reminderWorker.waitUntilReady(),
      dlqRetryWorker.waitUntilReady(),
      whatsappMonitorWorker.waitUntilReady(),
    ]);

    const tenantIds = await listActiveTenantIds();

    // RAG sync: immediate + tenant-configured interval
    for (const tenantId of tenantIds) {
      const intervalHours = await getTenantRagSyncIntervalHours(tenantId);
      await ragSyncQueue.add('initial-sync', { tenantId }, { jobId: `initial-${tenantId}` });
      await ragSyncQueue.upsertJobScheduler(
        `rag-sync-${tenantId}`,
        { every: intervalHours * 60 * 60 * 1000 },
        { name: 'scheduled-sync', data: { tenantId } },
      );
    }

    // DLQ retry: every 30 minutes
    await dlqRetryQueue.upsertJobScheduler(
      'dlq-retry-scheduled',
      { every: 30 * 60 * 1000 },
      { name: 'dlq-retry', data: {} },
    );

    // WhatsApp monitor: every 5 minutes
    await whatsappMonitorQueue.upsertJobScheduler(
      'whatsapp-monitor-scheduled',
      { every: 5 * 60 * 1000 },
      { name: 'whatsapp-check', data: {} },
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
    whatsappMonitorWorker.close(),
  ]);
  await app.close();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
