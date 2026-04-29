import { Queue, Worker } from 'bullmq';
import { queueConnection, createWorkerConnection } from '../lib/redis';
import { supabase } from '../lib/supabase';
import { sendWhatsAppMessage } from '../domains/channels/whatsapp/whatsapp.sender';
import { sendMessage } from '../integrations/chatwoot';

export const reminderQueue = new Queue('reminders', { connection: queueConnection });

export const reminderWorker = new Worker(
  'reminders',
  async job => {
    const { appointmentId } = job.data as { appointmentId: string };

    const { data: appt } = await supabase
      .from('appointments')
      .select('*, customers(name, phone_normalized)')
      .eq('id', appointmentId)
      .single();

    if (!appt || appt.status !== 'confirmed') return;

    const customerName = (appt.customers as { name?: string; phone_normalized?: string })?.name ?? '';
    const phone = (appt.customers as { name?: string; phone_normalized?: string })?.phone_normalized;

    const text = `Oi${customerName ? ` ${customerName}` : ''}! Lembrando da sua sessão amanhã 😊 Confirma presença?`;

    if (phone) {
      await sendWhatsAppMessage(phone, text).catch(() => {});
    }

    const { data: conv } = await supabase
      .from('conversations')
      .select('chatwoot_conversation_id')
      .eq('customer_id', appt.customer_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (conv?.chatwoot_conversation_id) {
      await sendMessage(conv.chatwoot_conversation_id, text).catch(() => {});
    }
  },
  { connection: createWorkerConnection() },
);
