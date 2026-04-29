import { FastifyInstance } from 'fastify';
import { supabase } from '../../lib/supabase';
import { replayEvent, discardEvent } from '../../domains/dlq/dlq.service';

export async function adminDlqRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/dlq', async (req, reply) => {
    const query = req.query as { status?: string; type?: string; limit?: string };
    let q = supabase
      .from('dead_letter_queue')
      .select('id, event_type, error_message, retry_count, status, created_at, last_attempt_at')
      .order('created_at', { ascending: false })
      .limit(Number(query.limit ?? 50));

    if (query.status) q = q.eq('status', query.status);
    if (query.type) q = q.eq('event_type', query.type);

    const { data, error } = await q;
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ events: data });
  });

  app.get('/admin/dlq/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await supabase
      .from('dead_letter_queue')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return reply.status(404).send({ error: 'Not found' });
    return reply.send(data);
  });

  app.post('/admin/dlq/:id/replay', async (req, reply) => {
    const { id } = req.params as { id: string };
    await replayEvent(id);
    return reply.send({ ok: true });
  });

  app.post('/admin/dlq/replay-all', async (_req, reply) => {
    const { data: events } = await supabase
      .from('dead_letter_queue')
      .select('id')
      .eq('status', 'pending')
      .lt('retry_count', 5)
      .limit(50);

    for (const event of events ?? []) {
      await replayEvent(event.id);
    }

    return reply.send({ ok: true, replayed: events?.length ?? 0 });
  });

  app.patch('/admin/dlq/:id/discard', async (req, reply) => {
    const { id } = req.params as { id: string };
    await discardEvent(id);
    return reply.send({ ok: true });
  });
}
