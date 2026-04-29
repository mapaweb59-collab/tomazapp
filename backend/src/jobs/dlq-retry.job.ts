import { Queue, Worker } from 'bullmq';
import { queueConnection, createWorkerConnection } from '../lib/redis';
import { supabase } from '../lib/supabase';
import { replayEvent } from '../domains/dlq/dlq.service';

export const dlqRetryQueue = new Queue('dlq-retry', { connection: queueConnection });

export const dlqRetryWorker = new Worker(
  'dlq-retry',
  async () => {
    const { data: events } = await supabase
      .from('dead_letter_queue')
      .select('id')
      .eq('status', 'pending')
      .lt('retry_count', 5)
      .order('created_at', { ascending: true })
      .limit(20);

    for (const event of events ?? []) {
      await replayEvent(event.id);
    }
  },
  { connection: createWorkerConnection() },
);
