import { randomUUID } from 'crypto';
import {
  findActiveByCustomer,
  createConversation,
  updateContext,
  updateStatus,
  updateChatwootId,
} from './conversation.repository';
import { Conversation, ConversationState } from './conversation.types';
import { findOrCreateContact, createChatwootConversation } from '../../integrations/chatwoot';

const initialState = (): ConversationState => ({
  fase: 'livre',
  profissional: null,
  modalidade: null,
  dia: null,
  horario: null,
  slotId: null,
  nomeCliente: null,
  idempotencyKey: randomUUID(),
});

export async function getOrCreateConversation(customerId: string, channel: string): Promise<Conversation> {
  const existing = await findActiveByCustomer(customerId, channel);
  if (existing) return existing;
  return createConversation(customerId, channel, initialState());
}

export async function ensureChatwootConversation(
  conversation: Conversation,
  phone: string,
  name?: string,
): Promise<Conversation> {
  if (conversation.chatwoot_conversation_id) return conversation;

  try {
    const contactId = await findOrCreateContact(phone, name);
    const chatwootConversationId = await createChatwootConversation(contactId);
    await updateChatwootId(conversation.id, chatwootConversationId);
    return { ...conversation, chatwoot_conversation_id: chatwootConversationId };
  } catch {
    // Chatwoot indisponível — bot continua funcionando sem espelhamento
    return conversation;
  }
}

export async function saveContext(id: string, state: ConversationState): Promise<void> {
  return updateContext(id, state);
}

export async function transferToHuman(id: string, state: ConversationState): Promise<void> {
  await updateContext(id, state);
  await updateStatus(id, 'human');
}

export async function reactivateBot(id: string): Promise<void> {
  await updateStatus(id, 'bot');
}
