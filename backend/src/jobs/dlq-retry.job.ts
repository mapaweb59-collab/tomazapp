import { Queue, Worker } from 'bullmq';
import { createBullConnection } from '../lib/redis';
import { supabase } from '../lib/supabase';

export const dlqRetryQueue = new Queue('dlq-retry', { connection: createBullConnection() });

export const dlqRetryWorker = new Worker(
  'dlq-retry',
  async () => {
    const { data: events } = await supabase
      .from('dead_letter_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('retry_count', 5)
      .order('created_at', { ascending: true })
      .limit(20);

    for (const event of events ?? []) {
      await supabase
        .from('dead_letter_queue')
        .update({
          retry_count: event.retry_count + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', event.id);
    }
  },
  { connection: createBullConnection() },
);
