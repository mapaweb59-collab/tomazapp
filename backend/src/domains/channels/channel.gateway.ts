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
import { chargeForAppointment } from '../payments/payment.service';
import { sendMessage, assignAgent } from '../../integrations/chatwoot';
import { sendWhatsAppMessage } from './whatsapp/whatsapp.sender';
import { listAvailableSlots, formatSlotsForPrompt } from '../../integrations/google-calendar';
import { logIncident } from '../incidents/incident.service';
import { pushToDLQ } from '../dlq/dlq.service';
import {
  getDefaultTenantId,
  loadProfissionais,
  getTenantConfigValue,
  getServicePrice,
} from '../tenants/tenant.service';
import { Profissional } from '../ai/ai.types';

function findProfissional(
  nome: string | null,
  profissionais: Profissional[],
): Profissional | undefined {
  if (!nome) return undefined;
  const lower = nome.toLowerCase();
  return profissionais.find(
    p =>
      p.nome.toLowerCase() === lower ||
      p.apelidos.some(a => a.toLowerCase() === lower),
  );
}

async function fetchSlots(
  profissionalNome: string | null,
  profissionais: Profissional[],
): Promise<string> {
  try {
    const prof = findProfissional(profissionalNome, profissionais);
    const calendarId = prof?.gcalCalendarId ?? 'primary';
    const slots = await listAvailableSlots(calendarId, 60, 7);
    return formatSlotsForPrompt(slots);
  } catch {
    return '';
  }
}

export async function handleIncomingMessage(msg: ChannelMessage): Promise<{ reply: string } | null> {
  try {
    const [identity, tenantId] = await Promise.all([
      resolveIdentity(msg.from, msg.channel),
      getDefaultTenantId(),
    ]);

    let conversation = await getOrCreateConversation(identity.id, msg.channel);

    if (conversation.status === 'human') return null;

    conversation = await ensureChatwootConversation(
      conversation,
      identity.phoneNormalized,
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

    const ctx = conversation.context;
    const shouldFetchSlots =
      ctx.fase === 'coletar_horario' ||
      (ctx.profissional && ctx.modalidade);

    const availableSlots = shouldFetchSlots
      ? await fetchSlots(ctx.profissional, profissionais)
      : '';

    const botResponse = await generateBotResponse(msg.text, {
      assistantName: assistantName ?? 'Sofia',
      studioName: studioName ?? 'Studio',
      profissionais,
      conversationState: JSON.stringify(conversation.context),
      conversationHistory,
      availableSlots,
      ragContext,
      customerData: JSON.stringify(identity),
    });

    const extraido = botResponse.extraido ?? {};

    const newState = {
      ...conversation.context,
      fase: botResponse.fase ?? conversation.context.fase,
      profissional: extraido.profissional ?? conversation.context.profissional,
      modalidade: extraido.modalidade ?? conversation.context.modalidade,
      horario: extraido.horario ?? conversation.context.horario,
      nomeCliente: extraido.nomeCliente ?? conversation.context.nomeCliente,
    };

    if (botResponse.triggerHandoff) {
      await transferToHuman(conversation.id, newState);
      await assignAgent(conversation.chatwoot_conversation_id!).catch(() => {});
    } else {
      await saveContext(conversation.id, newState);
    }

    if (botResponse.triggerConfirmacao && newState.horario) {
      const prof = findProfissional(newState.profissional, profissionais);
      try {
        const appointment = await scheduleAppointment({
          customerId: identity.id,
          serviceType: newState.modalidade ?? newState.profissional ?? 'Aula',
          requestedAt: newState.horario,
          idempotencyKey: newState.idempotencyKey,
          professionalId: prof?.gcalCalendarId,
        });

        if (botResponse.triggerPayment && appointment) {
          const amount = await getServicePrice(tenantId, newState.modalidade);
          if (amount > 0) {
            chargeForAppointment(
              identity.id,
              appointment.id,
              amount,
              `pay_${newState.idempotencyKey}`,
              identity.name ?? 'Cliente',
              identity.phoneNormalized,
            ).catch(() => {});
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'SLOT_UNAVAILABLE') {
          await saveContext(conversation.id, { ...newState, fase: 'coletar_horario', horario: null });
        }
      }
    }

    if (msg.channel === 'whatsapp') {
      await sendWhatsAppMessage(msg.from, botResponse.message);
    }

    if (conversation.chatwoot_conversation_id) {
      await sendMessage(conversation.chatwoot_conversation_id, botResponse.message).catch(() => {});
    }

    await saveMessage({
      conversation_id: conversation.id,
      role: 'assistant',
      content: botResponse.message,
      channel: msg.channel,
    });

    return { reply: botResponse.message };
  } catch (err) {
    await pushToDLQ('incoming_message', msg, err instanceof Error ? err.message : String(err));
    await logIncident('high', 'channel_gateway_error', String(err));
    return null;
  }
}
