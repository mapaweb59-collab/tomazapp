import { supabase } from '../../lib/supabase';
import { Conversation, ConversationState, ConversationStatus } from './conversation.types';

export async function findActiveByCustomer(customerId: string, channel: string): Promise<Conversation | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('customer_id', customerId)
    .eq('channel', channel)
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error?.code === 'PGRST116') return null;
  if (error) throw error;
  return data;
}

export async function createConversation(customerId: string, channel: string, context: ConversationState): Promise<Conversation> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ customer_id: customerId, channel, context })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateContext(id: string, context: ConversationState): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ context, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function updateStatus(id: string, status: ConversationStatus): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function updateChatwootId(id: string, chatwootConversationId: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ chatwoot_conversation_id: chatwootConversationId, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}
