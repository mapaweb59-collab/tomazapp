import { supabase } from '../../lib/supabase';

interface SaveMessageParams {
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  channel?: string;
  idempotency_key?: string;
}

export async function saveMessage(params: SaveMessageParams): Promise<void> {
  const { error } = await supabase.from('messages').insert(params);
  if (error) console.error('[messages] failed to save:', error.message);
}

export async function getRecentMessages(
  conversationId: string,
  limit = 10,
): Promise<string> {
  const { data } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? [])
    .reverse()
    .map(m => `${m.role === 'user' ? 'cliente' : 'sofia'}: ${m.content}`)
    .join('\n');
}
