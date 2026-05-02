import { FastifyInstance } from 'fastify';
import { supabase } from '../../lib/supabase';
import { getInstanceStatus, getQrCode } from '../../integrations/megaapi';
import { syncRagContentToVectors } from '../../domains/ai/rag.service';
import { runSimulatedChat } from '../../domains/ai/simulator.service';
import { ConversationState } from '../../domains/conversations/conversation.types';

export async function adminApiRoutes(app: FastifyInstance): Promise<void> {
  // ─── Tenants ────────────────────────────────────────────────────────────────

  app.get('/api/tenants', async (_req, reply) => {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name, slug, plan, active, created_at')
      .order('created_at', { ascending: false });

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ tenants: data });
  });

  app.post('/api/tenants', async (req, reply) => {
    const body = req.body as { name: string; slug: string; plan?: string };
    const { data, error } = await supabase
      .from('tenants')
      .insert({ name: body.name, slug: body.slug, plan: body.plan ?? 'basic' })
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  // ─── Tenant Config ───────────────────────────────────────────────────────────

  app.get('/api/tenants/:id/config', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await supabase
      .from('tenant_config')
      .select('key, value')
      .eq('tenant_id', id);

    if (error) return reply.status(500).send({ error: error.message });

    const config: Record<string, unknown> = {};
    for (const row of data ?? []) config[row.key] = row.value;
    return reply.send({ config });
  });

  app.patch('/api/tenants/:id/config', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;

    const upserts = Object.entries(body).map(([key, value]) => ({
      tenant_id: id,
      key,
      value,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('tenant_config')
      .upsert(upserts, { onConflict: 'tenant_id,key' });

    if (error) return reply.status(400).send({ error: error.message });
    return reply.send({ ok: true });
  });

  // ─── Professionals ───────────────────────────────────────────────────────────

  app.get('/api/tenants/:id/professionals', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await supabase
      .from('professionals')
      .select('*')
      .eq('tenant_id', id)
      .order('name');

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ professionals: data });
  });

  app.post('/api/tenants/:id/professionals', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      name: string;
      aliases: string[];
      specialties: string[];
      gcal_calendar_id?: string;
    };

    const { data, error } = await supabase
      .from('professionals')
      .insert({ tenant_id: id, ...body })
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  app.patch('/api/tenants/:id/professionals/:pid', async (req, reply) => {
    const { pid } = req.params as { id: string; pid: string };
    const body = req.body as Partial<{
      name: string;
      aliases: string[];
      specialties: string[];
      gcal_calendar_id: string;
      active: boolean;
    }>;

    const { data, error } = await supabase
      .from('professionals')
      .update(body)
      .eq('id', pid)
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.send(data);
  });

  app.delete('/api/tenants/:id/professionals/:pid', async (req, reply) => {
    const { pid } = req.params as { id: string; pid: string };
    await supabase.from('professionals').update({ active: false }).eq('id', pid);
    return reply.send({ ok: true });
  });

  // ─── Services ────────────────────────────────────────────────────────────────

  app.get('/api/tenants/:id/services', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('tenant_id', id)
      .order('name');

    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ services: data });
  });

  app.post('/api/tenants/:id/services', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      name: string;
      price?: number;
      duration_minutes?: number;
      requires_handoff?: boolean;
    };

    const { data, error } = await supabase
      .from('services')
      .insert({ tenant_id: id, ...body })
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.status(201).send(data);
  });

  app.patch('/api/tenants/:id/services/:sid', async (req, reply) => {
    const { sid } = req.params as { id: string; sid: string };
    const body = req.body as Partial<{
      name: string;
      price: number;
      duration_minutes: number;
      requires_handoff: boolean;
      active: boolean;
    }>;

    const { data, error } = await supabase
      .from('services')
      .update(body)
      .eq('id', sid)
      .select()
      .single();

    if (error) return reply.status(400).send({ error: error.message });
    return reply.send(data);
  });

  // ─── Metrics ─────────────────────────────────────────────────────────────────

  app.get('/api/tenants/:id/metrics', async (req, reply) => {
    const { id } = req.params as { id: string };
    const today = new Date().toISOString().split('T')[0];

    const [conversations, appointments, handoffs, dlqPending, professionals, lastRagSync] = await Promise.all([
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', today),
      supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', today),
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'human')
        .gte('updated_at', today),
      supabase
        .from('dead_letter_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('professionals')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', id)
        .eq('active', true),
      supabase
        .from('rag_chunks')
        .select('last_synced_at')
        .eq('tenant_id', id)
        .order('last_synced_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return reply.send({
      conversations: conversations.count ?? 0,
      appointments: appointments.count ?? 0,
      handoffs: handoffs.count ?? 0,
      dlqPending: dlqPending.count ?? 0,
      professionalsCount: professionals.count ?? 0,
      lastRagSync: lastRagSync.data?.last_synced_at ?? null,
    });
  });

  // ─── WhatsApp status & QR ────────────────────────────────────────────────────

  app.get('/api/whatsapp/status', async (_req, reply) => {
    try {
      const connected = await getInstanceStatus();
      const qrcode = connected ? undefined : await getQrCode().catch(() => undefined);
      return reply.send({ connected, qrcode });
    } catch (err) {
      return reply.status(503).send({ connected: false, error: String(err) });
    }
  });

  app.post('/api/whatsapp/reconnect', async (_req, reply) => {
    try {
      const qrcode = await getQrCode();
      return reply.send({ ok: true, qrcode });
    } catch (err) {
      return reply.status(503).send({ ok: false, error: String(err) });
    }
  });

  // ─── Audit log ────────────────────────────────────────────────────────────────

  app.get('/api/tenants/:id/audit', async (req, reply) => {
    const { id } = req.params as { id: string };
    const query = req.query as {
      page?: string;
      type?: string;
      from?: string;
      to?: string;
    };

    const page = Number(query.page ?? 1);
    const pageSize = 50;
    const from = (page - 1) * pageSize;

    // suppress unused id param
    void id;

    let q = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (query.type) q = q.eq('entity_type', query.type);
    if (query.from) q = q.gte('created_at', query.from);
    if (query.to) q = q.lte('created_at', query.to);

    const { data, count, error } = await q;
    if (error) return reply.status(500).send({ error: error.message });

    return reply.send({ logs: data, total: count, page, pageSize });
  });

  // ─── RAG sync ────────────────────────────────────────────────────────────────

  app.post('/api/tenants/:id/rag/sync', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await syncRagContentToVectors(id);
    return reply.send({ ok: true, ...result });
  });

  // ─── Simulator (testar bot) ──────────────────────────────────────────────────

  app.post('/api/tenants/:id/simulator/chat', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as {
      message: string;
      sessionId?: string;
      state?: ConversationState;
      history?: { role: 'user' | 'assistant'; content: string }[];
    };

    if (!body?.message?.trim()) {
      return reply.status(400).send({ error: 'message é obrigatório' });
    }

    try {
      const result = await runSimulatedChat({
        tenantId: id,
        message: body.message,
        sessionId: body.sessionId,
        state: body.state,
        history: body.history,
      });
      return reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[SIMULATOR_ERROR]', message);
      return reply.status(500).send({ error: message });
    }
  });
}
