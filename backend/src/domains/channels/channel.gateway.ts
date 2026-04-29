import { ChannelMessage } from '../../types/channel-message';
import { resolveIdentity } from '../customers/customer.service';
import {
  getOrCreateConversation,
  ensureChatwootConversation,
  saveContext,
  transferToHuman,
} from '../conversations/conversation.service';
import { saveMessage, getRecentMessages } from '../messages/message.repository';
import { generateBotResponse } from '../ai/ai.service';
import { retrieveContext } from '../ai/rag.service';
import { scheduleAppointment } from '../appointments/appointment.service';
import { sendMessage, assignAgent } from '../../integrations/chatwoot';
import { logIncident } from '../incidents/incident.service';
import { pushToDLQ } from '../dlq/dlq.service';
import { getDefaultTenantId, loadProfissionais, getTenantConfigValue } from '../tenants/tenant.service';

export async function handleIncomingMessage(msg: ChannelMessage): Promise<void> {
  try {
    const [identity, tenantId] = await Promise.all([
      resolveIdentity(msg.from, msg.channel),
      getDefaultTenantId(),
    ]);

    let conversation = await getOrCreateConversation(identity.id, msg.channel);

    if (conversation.status === 'human') return;

    conversation = await ensureChatwootConversation(
      conversation,
      msg.from,
      identity.name,
    );

    await saveMessage({
      conversation_id: conversation.id,
      role: 'user',
      content: msg.text,
      channel: msg.channel,
      idempotency_key: msg.id,
    });

    const [ragContext, conversationHistory, profissionais, assistantName, studioName] =
      await Promise.all([
        retrieveContext(tenantId, msg.text),
        getRecentMessages(conversation.id, 10),
        loadProfissionais(tenantId),
        getTenantConfigValue(tenantId, 'bot.name'),
        getTenantConfigValue(tenantId, 'bot.studio_name'),
      ]);

    const botResponse = await generateBotResponse(msg.text, {
      assistantName: assistantName ?? process.env.ASSISTANT_NAME ?? 'Sofia',
      studioName: studioName ?? process.env.STUDIO_NAME ?? 'Studio',
      profissionais,
      conversationState: JSON.stringify(conversation.context),
      conversationHistory,
      availableSlots: '',
      ragContext,
      customerData: JSON.stringify(identity),
    });

    const newState = {
      ...conversation.context,
      fase: botResponse.fase,
      profissional: botResponse.extraido.profissional ?? conversation.context.profissional,
      modalidade: botResponse.extraido.modalidade ?? conversation.context.modalidade,
      horario: botResponse.extraido.horario ?? conversation.context.horario,
      nomeCliente: botResponse.extraido.nomeCliente ?? conversation.context.nomeCliente,
    };

    if (botResponse.triggerHandoff) {
      await transferToHuman(conversation.id, newState);
      await assignAgent(conversation.chatwoot_conversation_id!);
    } else {
      await saveContext(conversation.id, newState);
    }

    if (botResponse.triggerConfirmacao) {
      await scheduleAppointment({
        customerId: identity.id,
        serviceType: newState.modalidade ?? '',
        requestedAt: newState.horario ?? '',
        idempotencyKey: newState.idempotencyKey,
      });
    }

    await sendMessage(conversation.chatwoot_conversation_id!, botResponse.message);

    await saveMessage({
      conversation_id: conversation.id,
      role: 'assistant',
      content: botResponse.message,
      channel: msg.channel,
    });
  } catch (err) {
    await pushToDLQ('incoming_message', msg, err instanceof Error ? err.message : String(err));
    await logIncident('high', 'channel_gateway_error', String(err));
  }
}
