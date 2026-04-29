import { supabase } from '../../lib/supabase';
import { ChannelMessage } from '../../types/channel-message';

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

  try {
    if (data.event_type === 'incoming_message') {
      // Dynamic import breaks circular dependency (channel.gateway imports pushToDLQ)
      const { handleIncomingMessage } = await import('../channels/channel.gateway');
      await handleIncomingMessage(data.payload as ChannelMessage);
    } else {
      throw new Error(`No replayer for event_type: ${data.event_type}`);
    }

    await supabase
      .from('dead_letter_queue')
      .update({ status: 'replayed', last_attempt_at: new Date().toISOString() })
      .eq('id', id);
  } catch (err) {
    await supabase
      .from('dead_letter_queue')
      .update({
        retry_count: data.retry_count + 1,
        last_attempt_at: new Date().toISOString(),
        error_message: err instanceof Error ? err.message : String(err),
      })
      .eq('id', id);
  }
}

export async function discardEvent(id: string): Promise<void> {
  await supabase
    .from('dead_letter_queue')
    .update({ status: 'discarded' })
    .eq('id', id);
}
