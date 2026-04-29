import { supabase } from '../../lib/supabase';

export async function pushToDLQ(eventType: string, payload: unknown, errorMessage: string): Promise<void> {
  const { error } = await supabase.from('dead_letter_queue').insert({
    event_type: eventType,
    payload,
    error_message: errorMessage,
    retry_count: 0,
    status: 'pending',
  });

  if (error) console.error('[dlq] failed to push:', error.message);
}

export async function replayEvent(id: string): Promise<void> {
  const { data, error } = await supabase
    .from('dead_letter_queue')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return;

  await supabase
    .from('dead_letter_queue')
    .update({ retry_count: data.retry_count + 1, last_attempt_at: new Date().toISOString() })
    .eq('id', id);
}

export async function discardEvent(id: string): Promise<void> {
  await supabase
    .from('dead_letter_queue')
    .update({ status: 'discarded' })
    .eq('id', id);
}
