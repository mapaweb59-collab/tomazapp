import { FastifyInstance } from 'fastify';
import { reactivateBot } from '../../domains/conversations/conversation.service';
import { supabase } from '../../lib/supabase';

export async function chatwootWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/chatwoot', async (req, reply) => {
    const body = req.body as { event: string; conversation?: { id: string } };

    if (body.event === 'conversation_resolved' && body.conversation?.id) {
      const chatwootId = String(body.conversation.id);

      const { data } = await supabase
        .from('conversations')
        .select('id')
        .eq('chatwoot_conversation_id', chatwootId)
        .single();

      if (data) await reactivateBot(data.id);
    }

    return reply.status(200).send({ ok: true });
  });
}
