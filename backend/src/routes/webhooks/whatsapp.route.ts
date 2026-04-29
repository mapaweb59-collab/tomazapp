import { FastifyInstance } from 'fastify';
import { normalizeMegaApiPayload } from '../../domains/channels/whatsapp/whatsapp.normalizer';
import { handleIncomingMessage } from '../../domains/channels/channel.gateway';
import { isProcessed, markProcessed } from '../../lib/idempotency';

export async function whatsappWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/whatsapp', async (req, reply) => {
    const payload = req.body as Record<string, unknown>;
    const eventId = (payload['key'] as Record<string, string>)?.id;

    if (!eventId) return reply.status(400).send({ error: 'missing event id' });
    if (await isProcessed(eventId)) return reply.status(200).send({ duplicate: true });

    await markProcessed(eventId);

    const msg = normalizeMegaApiPayload(
      payload as unknown as Parameters<typeof normalizeMegaApiPayload>[0],
    );

    if (!msg) return reply.status(200).send({ skipped: 'fromMe' });

    const result = await handleIncomingMessage(msg);
    return reply.status(200).send({ ok: true, ...(result ?? {}) });
  });
}
