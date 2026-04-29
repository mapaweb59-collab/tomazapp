import { FastifyInstance } from 'fastify';
import { normalizeInstagramPayload } from '../../domains/channels/instagram/instagram.normalizer';
import { normalizeMessengerPayload } from '../../domains/channels/messenger/messenger.normalizer';
import { handleIncomingMessage } from '../../domains/channels/channel.gateway';
import { isProcessed, markProcessed } from '../../lib/idempotency';

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN ?? 'tomazapp_verify';

export async function metaWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.get('/webhooks/meta', async (req, reply) => {
    const query = req.query as Record<string, string>;
    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === VERIFY_TOKEN
    ) {
      return reply.status(200).send(query['hub.challenge']);
    }
    return reply.status(403).send({ error: 'Forbidden' });
  });

  app.post('/webhooks/meta', async (req, reply) => {
    const body = req.body as { object: string; entry: unknown[] };

    for (const entry of body.entry ?? []) {
      let msg = null;

      if (
        body.object === 'instagram' &&
        process.env.FEATURE_INSTAGRAM_ENABLED === 'true'
      ) {
        msg = normalizeInstagramPayload(entry as Parameters<typeof normalizeInstagramPayload>[0]);
      } else if (
        body.object === 'page' &&
        process.env.FEATURE_MESSENGER_ENABLED === 'true'
      ) {
        msg = normalizeMessengerPayload(entry as Parameters<typeof normalizeMessengerPayload>[0]);
      }

      if (!msg) continue;
      if (await isProcessed(msg.id)) continue;
      await markProcessed(msg.id);
      await handleIncomingMessage(msg).catch(() => {});
    }

    return reply.status(200).send({ ok: true });
  });
}
