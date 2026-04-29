import { FastifyInstance } from 'fastify';
import { handleAsaasWebhook } from '../../domains/payments/payment.service';

export async function asaasWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/asaas', async (req, reply) => {
    const body = req.body as { event: string; payment: { id: string } };
    await handleAsaasWebhook(body.payment.id, body.event);
    return reply.status(200).send({ ok: true });
  });
}
