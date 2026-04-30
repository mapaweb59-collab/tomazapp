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
} from '../tenants/tenant.service';
import { Profissional } from '../ai/ai.types';
import { ToolHandlers } from '../ai/tools';
import { ConversationState } from '../conversations/conversation.types';

const DAYS_PT_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function findProfissional(nome: string | null, profissionais: Profissional[]): Profissional | undefined {
  if (!nome) return undefined;
  const lower = nome.toLowerCase();
  return profissionais.find(p =>
    p.nome.toLowerCase() === lower || p.apelidos.some(a => a.toLowerCase() === lower),
  );
}

interface SideEffects {
  handoff: boolean;
  appointmentCreated: boolean;
  paymentRequested: boolean;
}

function buildToolHandlers(deps: {
  profissionais: Profissional[];
  scheduleConfig: Awaited<ReturnType<typeof getTenantScheduleConfig>>;
  identity: Awaited<ReturnType<typeof resolveIdentity>>;
  state: ConversationState;
  effects: SideEffects;
  conversationId: string;
  chatwootConversationId?: string;
}): ToolHandlers {
  const { profissionais, scheduleConfig, identity, state, effects, conversationId, chatwootConversationId } = deps;

  return {
    async buscar_horarios({ profissional, dia }) {
      if (!ISO_DATE_RE.test(dia)) return `ERRO: dia deve ser YYYY-MM-DD, recebi "${dia}".`;

      const prof = findProfissional(profissional, profissionais);
      const calendarId = prof?.gcalCalendarId ?? scheduleConfig.sharedCalendarId;
      const businessHours = prof?.businessHours ?? scheduleConfig.businessHours;

      try {
        const result = await listSlotsForDay(dia, {
          calendarId,
          durationMinutes: scheduleConfig.durationMinutes,
          slotIntervalMinutes: scheduleConfig.slotIntervalMinutes,
          businessHours,
          maxSlots: 5,
        });

        if (!result.slots.length) {
          return `Sem vagas no dia ${dia} nem nos próximos 14 dias para ${profissional}. Sugira ao cliente outro profissional ou transfira para atendente humano.`;
        }

        const fallbackNote = result.wasFallback
          ? `Não havia vagas em ${dia}, mas em ${result.usedDateLabel} (${result.usedDate}) há disponibilidade:\n`
          : `Horários disponíveis em ${result.usedDateLabel} (${result.usedDate}):\n`;
        return fallbackNote + formatSlotsForPrompt(result.slots);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[TOOL buscar_horarios ERROR]', { calendarId, dia, message });
        return `ERRO ao consultar agenda: ${message}. Avise o cliente que terá um pequeno atraso e ofereça falar com atendente.`;
      }
    },

    async agendar_aula({ profissional, modalidade, horario_iso }) {
      const prof = findProfissional(profissional, profissionais);
      try {
        const appointment = await scheduleAppointment({
          customerId: identity.id,
          serviceType: modalidade,
          requestedAt: horario_iso,
          idempotencyKey: state.idempotencyKey,
          durationMinutes: scheduleConfig.durationMinutes,
          professionalCalendarId: prof?.gcalCalendarId ?? scheduleConfig.sharedCalendarId,
          professionalName: prof?.nome,
        });
        effects.appointmentCreated = true;
        return `SUCESSO. Agendamento criado (id: ${appointment.id}). Confirme ao cliente data, horário, profissional e modalidade.`;
      } catch (err) {
        if (err instanceof Error && err.message === 'SLOT_UNAVAILABLE') {
          return `ERRO: o slot ${horario_iso} acabou de ser ocupado. Peça desculpas e ofereça outro horário (chame buscar_horarios de novo).`;
        }
        return `ERRO ao agendar: ${err instanceof Error ? err.message : String(err)}. Ofereça transferir para atendente.`;
      }
    },

    async transferir_para_humano({ motivo }) {
      effects.handoff = true;
      try {
        await transferToHuman(conversationId, state);
        if (chatwootConversationId) await assignAgent(chatwootConversationId).catch(() => {});
        return `Transferência iniciada. Motivo: ${motivo}. Diga ao cliente que um atendente vai falar com ele em breve.`;
      } catch (err) {
        return `ERRO ao transferir: ${err instanceof Error ? err.message : String(err)}.`;
      }
    },

    async criar_cobranca({ modalidade, valor }) {
      effects.paymentRequested = true;
      try {
        // Cobrança roda em background — não bloqueia resposta ao cliente
        chargeForAppointment(
          identity.id,
          state.idempotencyKey, // appointment_id é setado pelo handler de agendamento
          valor,
          `pay_${state.idempotencyKey}`,
          identity.name ?? 'Cliente',
          identity.phoneNormalized,
        ).catch(err => console.error('[ASYNC_CHARGE_ERROR]', err));
        return `Cobrança de R$ ${valor.toFixed(2)} para ${modalidade} criada. O cliente vai receber o link em breve.`;
      } catch (err) {
        return `ERRO ao criar cobrança: ${err instanceof Error ? err.message : String(err)}.`;
      }
    },
  };
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
      conversation, identity.phoneNormalized, identity.name,
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
    const effects: SideEffects = { handoff: false, appointmentCreated: false, paymentRequested: false };

    const handlers = buildToolHandlers({
      profissionais,
      scheduleConfig,
      identity,
      state: conversation.context,
      effects,
      conversationId: conversation.id,
      chatwootConversationId: conversation.chatwoot_conversation_id,
    });

    const botResponse = await generateBotResponse(
      msg.text,
      {
        assistantName: assistantName ?? 'Sofia',
        studioName: studioName ?? 'Studio',
        profissionais,
        servicos,
        conversationState: JSON.stringify(conversation.context),
        conversationHistory,
        ragContext,
        customerData: JSON.stringify(identity),
        today: dateInfo.today,
        todayIso: dateInfo.todayIso,
        tomorrowIso: dateInfo.tomorrowIso,
      },
      handlers,
    );

    const extraido = botResponse.extraido ?? {};
    console.log('[BOT_FINAL]', { fase: botResponse.fase, extraido, effects });

    // Aceita dia só se YYYY-MM-DD válido
    const novoDia = extraido.dia && ISO_DATE_RE.test(extraido.dia)
      ? extraido.dia
      : conversation.context.dia;

    const newState: ConversationState = {
      ...conversation.context,
      fase: botResponse.fase ?? conversation.context.fase,
      profissional: extraido.profissional ?? conversation.context.profissional,
      modalidade: extraido.modalidade ?? conversation.context.modalidade,
      dia: novoDia,
      horario: extraido.horario ?? conversation.context.horario,
      nomeCliente: extraido.nomeCliente ?? conversation.context.nomeCliente,
    };

    // Persistência: handoff já foi feito pela tool; aqui só salva contexto se ainda for bot
    if (!effects.handoff) {
      await saveContext(conversation.id, newState);
    }

    // Envio da mensagem
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
