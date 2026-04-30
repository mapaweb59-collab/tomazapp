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
import { listSlotsForDay, formatSlotsForPrompt } from '../../integrations/google-calendar';
import { logIncident } from '../incidents/incident.service';
import { pushToDLQ } from '../dlq/dlq.service';
import {
  getDefaultTenantId,
  loadProfissionais,
  loadServices,
  getTenantConfigValue,
  getTenantScheduleConfig,
  getServicePrice,
} from '../tenants/tenant.service';
import { Profissional } from '../ai/ai.types';

const DAYS_PT_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function getBrasiliaDateInfo(): { today: string; todayIso: string; tomorrowIso: string } {
  const TZ_OFFSET_MS = -3 * 60 * 60 * 1000;
  const nowLocal = new Date(Date.now() + TZ_OFFSET_MS);
  const tomorrowLocal = new Date(nowLocal.getTime() + 24 * 60 * 60 * 1000);

  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

  const todayIso = fmt(nowLocal);
  const tomorrowIso = fmt(tomorrowLocal);
  const dayName = DAYS_PT_FULL[nowLocal.getUTCDay()];
  const todayLabel = `${dayName}, ${String(nowLocal.getUTCDate()).padStart(2, '0')}/${String(nowLocal.getUTCMonth() + 1).padStart(2, '0')}/${nowLocal.getUTCFullYear()}`;

  return { today: todayLabel, todayIso, tomorrowIso };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

async function fetchSlotsForDay(
  profissionalNome: string | null,
  dia: string,                    // YYYY-MM-DD
  profissionais: Profissional[],
  scheduleConfig: Awaited<ReturnType<typeof getTenantScheduleConfig>>,
): Promise<{ slotsText: string; wasFallback: boolean; usedDateLabel: string }> {
  try {
    const prof = findProfissional(profissionalNome, profissionais);
    const calendarId = prof?.gcalCalendarId ?? scheduleConfig.sharedCalendarId;
    const businessHours = prof?.businessHours ?? scheduleConfig.businessHours;
    const result = await listSlotsForDay(dia, {
      calendarId,
      durationMinutes: scheduleConfig.durationMinutes,
      slotIntervalMinutes: scheduleConfig.slotIntervalMinutes,
      businessHours,
      maxSlots: 5,
    });
    return {
      slotsText: formatSlotsForPrompt(result.slots),
      wasFallback: result.wasFallback,
      usedDateLabel: result.usedDateLabel,
    };
  } catch {
    return { slotsText: '', wasFallback: false, usedDateLabel: '' };
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

    const [ragContext, conversationHistory, profissionais, servicos, assistantName, studioName, scheduleConfig] =
      await Promise.all([
        retrieveContext(tenantId, msg.text),
        getRecentMessages(conversation.id, 10),
        loadProfissionais(tenantId),
        loadServices(tenantId),
        getTenantConfigValue(tenantId, 'bot.name'),
        getTenantConfigValue(tenantId, 'bot.studio_name'),
        getTenantScheduleConfig(tenantId),
      ]);

    const dateInfo = getBrasiliaDateInfo();
    const ctx = conversation.context;

    // Busca slots apenas quando temos dia VÁLIDO (YYYY-MM-DD) e fase coletar_horario
    const hasValidDia = !!(ctx.dia && ISO_DATE_RE.test(ctx.dia));
    let availableSlots = '';
    let slotsFallbackNote = '';

    if (hasValidDia && ctx.fase === 'coletar_horario') {
      const { slotsText, wasFallback, usedDateLabel } = await fetchSlotsForDay(
        ctx.profissional, ctx.dia!, profissionais, scheduleConfig,
      );
      availableSlots = slotsText;
      if (wasFallback && usedDateLabel) {
        slotsFallbackNote = `ATENÇÃO: não havia vagas no dia pedido. Os horários abaixo são do próximo dia disponível: ${usedDateLabel}.`;
      }
    }

    const promptSlots = slotsFallbackNote
      ? `${slotsFallbackNote}\n${availableSlots}`
      : availableSlots;

    let botResponse = await generateBotResponse(msg.text, {
      assistantName: assistantName ?? 'Sofia',
      studioName: studioName ?? 'Studio',
      profissionais,
      servicos,
      conversationState: JSON.stringify(conversation.context),
      conversationHistory,
      availableSlots: promptSlots,
      ragContext,
      customerData: JSON.stringify(identity),
      today: dateInfo.today,
      todayIso: dateInfo.todayIso,
      tomorrowIso: dateInfo.tomorrowIso,
    });

    const extraido = botResponse.extraido ?? {};
    console.log('[BOT_RESP_1]', { fase: botResponse.fase, extraido, slotsLen: availableSlots.length });

    // Só aceita dia se vier no formato YYYY-MM-DD; senão mantém o anterior
    const novoDia = extraido.dia && ISO_DATE_RE.test(extraido.dia)
      ? extraido.dia
      : conversation.context.dia;

    const newState = {
      ...conversation.context,
      fase: botResponse.fase ?? conversation.context.fase,
      profissional: extraido.profissional ?? conversation.context.profissional,
      modalidade: extraido.modalidade ?? conversation.context.modalidade,
      dia: novoDia,
      horario: extraido.horario ?? conversation.context.horario,
      nomeCliente: extraido.nomeCliente ?? conversation.context.nomeCliente,
    };

    // Se o LLM transitou para coletar_horario e agora temos dia válido, busca slots e re-chama
    if (botResponse.fase === 'coletar_horario' && !availableSlots && newState.dia && ISO_DATE_RE.test(newState.dia)) {
      console.log('[FETCH_SLOTS_2]', { dia: newState.dia, profissional: newState.profissional });
      const { slotsText, wasFallback, usedDateLabel } = await fetchSlotsForDay(
        newState.profissional, newState.dia, profissionais, scheduleConfig,
      );
      console.log('[FETCH_SLOTS_2_RESULT]', { hasSlots: !!slotsText, wasFallback, usedDateLabel, len: slotsText.length });

      if (slotsText) {
        const note = wasFallback && usedDateLabel
          ? `ATENÇÃO: não havia vagas no dia pedido. Os horários abaixo são do próximo dia disponível: ${usedDateLabel}.\n`
          : '';
        botResponse = await generateBotResponse(msg.text, {
          assistantName: assistantName ?? 'Sofia',
          studioName: studioName ?? 'Studio',
          profissionais,
          servicos,
          conversationState: JSON.stringify(newState),
          conversationHistory,
          availableSlots: note + slotsText,
          ragContext,
          customerData: JSON.stringify(identity),
          today: dateInfo.today,
          todayIso: dateInfo.todayIso,
          tomorrowIso: dateInfo.tomorrowIso,
        });
      } else {
        // Sem slots no dia pedido nem nos próximos 14 dias — fallback útil
        botResponse = {
          ...botResponse,
          message: `Não encontrei vagas disponíveis nas próximas duas semanas para esse dia 😕 Quer que eu te conecte com um atendente?`,
          fase: 'coletar_dia',
        };
      }
    }

    // Se LLM transitou para coletar_horario mas o dia não foi extraído como YYYY-MM-DD
    if (botResponse.fase === 'coletar_horario' && !availableSlots && (!newState.dia || !ISO_DATE_RE.test(newState.dia))) {
      console.log('[NO_VALID_DIA]', { rawDia: extraido.dia, savedDia: newState.dia });
      botResponse = {
        ...botResponse,
        message: 'Desculpa, não entendi a data. Pode me dizer um dia específico? Ex: "amanhã", "segunda-feira", "05/05" 😊',
        fase: 'coletar_dia',
      };
    }

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
          durationMinutes: scheduleConfig.durationMinutes,
          professionalCalendarId: prof?.gcalCalendarId ?? scheduleConfig.sharedCalendarId,
          professionalName: prof?.nome,
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
      try {
        await sendWhatsAppMessage(msg.from, botResponse.message);
      } catch (sendErr: unknown) {
        const errData = (sendErr as { response?: { status?: number; data?: unknown } })?.response;
        console.error('[WA_SEND_ERROR]', {
          to: msg.from,
          status: errData?.status,
          body: errData?.data,
          message: sendErr instanceof Error ? sendErr.message : String(sendErr),
        });
      }
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
