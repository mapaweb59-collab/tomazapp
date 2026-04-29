import { Queue, Worker } from 'bullmq';
import { createBullConnection } from '../lib/redis';
import { supabase } from '../lib/supabase';
import { sendMessage } from '../integrations/chatwoot';

export const reminderQueue = new Queue('reminders', { connection: createBullConnection() });

export const reminderWorker = new Worker(
  'reminders',
  async job => {
    const { appointmentId } = job.data;

    const { data: appt } = await supabase
      .from('appointments')
      .select('*, customers(name), conversations(chatwoot_conversation_id)')
      .eq('id', appointmentId)
      .single();

    if (!appt || appt.status !== 'confirmed') return;

    const chatwootId = appt.conversations?.[0]?.chatwoot_conversation_id;
    if (!chatwootId) return;

    await sendMessage(chatwootId, `Oi ${appt.customers?.name ?? ''}! Lembrando da sua sessão amanhã. Confirma? 😊`);
  },
  { connection: createBullConnection() },
);
