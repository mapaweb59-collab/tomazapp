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
import { shouldRetrieveRagContext } from '../ai/rag.utils';
import {
  scheduleAppointment, cancelAppointment, rescheduleAppointment, findUpcomingByCustomer,
} from '../appointments/appointment.service';
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
  getTenantPaymentConfig,
} from '../tenants/tenant.service';
import { BotResponse, Profissional } from '../ai/ai.types';
import { ToolHandlers } from '../ai/tools';
import { ConversationState } from '../conversations/conversation.types';

const DAYS_PT_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ToolCallTrace {
  name: string;
  args: unknown;
  result: string;
}

export interface ChannelGatewayOptions {
  tenantId?: string;
  skipExternalDelivery?: boolean;
  throwOnError?: boolean;
  toolCalls?: ToolCallTrace[];
}

export interface ChannelGatewayResult {
  reply: string;
  botResponse: BotResponse;
  conversationId: string;
  state: ConversationState;
  toolCalls: ToolCallTrace[];
  effects: {
    handoff: boolean;
    appointmentCreated: boolean;
    paymentRequested: boolean;
  };
}

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

function professionalCoversModality(prof: Profissional, modalidade: string): boolean {
  const target = modalidade.toLowerCase().trim();
  return prof.especialidades.some(e => {
    const esp = e.toLowerCase().trim();
    return esp === target || esp.includes(target) || target.includes(esp);
  });
}

interface SideEffects {
  handoff: boolean;
  appointmentCreated: boolean;
  appointmentId?: string;       // setado por agendar_aula, lido por criar_cobranca
  paymentRequested: boolean;
}

/**
 * Normaliza ISO datetime: se vier sem timezone, assume BRT (-03:00).
 * O LLM frequentemente devolve "2026-05-04T10:00:00" (horário local) em vez do
 * UTC original retornado por buscar_horarios.
 */
function normalizeIsoDatetime(input: string): string {
  // Já tem timezone (Z ou +/-HH:MM no fim)?
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(input)) return input;
  // Sem TZ → assume BRT
  return `${input}-03:00`;
}

function buildToolHandlers(deps: {
  profissionais: Profissional[];
  scheduleConfig: Awaited<ReturnType<typeof getTenantScheduleConfig>>;
  paymentConfig: Awaited<ReturnType<typeof getTenantPaymentConfig>>;
  identity: Awaited<ReturnType<typeof resolveIdentity>>;
  state: ConversationState;
  effects: SideEffects;
  conversationId: string;
  chatwootConversationId?: string;
}): ToolHandlers {
  const { profissionais, scheduleConfig, paymentConfig, identity, state, effects, conversationId, chatwootConversationId } = deps;

  const handlers: ToolHandlers = {
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
          maxSlots: 20,
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
      if (state.fase !== 'confirmar') {
        return `ERRO: o cliente ainda não confirmou o agendamento. Antes de chamar agendar_aula, mostre ao cliente os dados completos (${profissional}, ${modalidade}, horário ${horario_iso}) e pergunte "Está correto? Confirma com 'ok'?". Mude fase para "confirmar" e ESPERE a próxima mensagem dele. NÃO chame agendar_aula agora.`;
      }
      const prof = findProfissional(profissional, profissionais);
      if (prof && !professionalCoversModality(prof, modalidade)) {
        return `ERRO: ${prof.nome} não atende ${modalidade}. Especialidades de ${prof.nome}: ${prof.especialidades.join(', ')}. Avise o cliente e pergunte se quer trocar de profissional ou modalidade. NÃO tente agendar de novo até o cliente decidir.`;
      }
      const normalizedIso = normalizeIsoDatetime(horario_iso);
      console.log('[AGENDAR_AULA]', { input: horario_iso, normalized: normalizedIso });
      try {
        const appointment = await scheduleAppointment({
          customerId: identity.id,
          serviceType: modalidade,
          requestedAt: normalizedIso,
          idempotencyKey: state.idempotencyKey,
          durationMinutes: scheduleConfig.durationMinutes,
          professionalCalendarId: prof?.gcalCalendarId ?? scheduleConfig.sharedCalendarId,
          professionalName: prof?.nome,
        });
        effects.appointmentCreated = true;
        effects.appointmentId = appointment.id;
        return [
          `SUCESSO. Agendamento criado (id: ${appointment.id}).`,
          'NÃO chame buscar_horarios novamente.',
          'Se houver cobrança automática aplicável, chame criar_cobranca uma única vez;',
          'caso contrário, retorne o JSON final com fase "concluido" confirmando data, horário, profissional e modalidade.',
        ].join(' ');
      } catch (err) {
        if (err instanceof Error && err.message === 'SLOT_UNAVAILABLE') {
          return `ERRO: o slot ${normalizedIso} acabou de ser ocupado. Peça desculpas e ofereça outro horário (chame buscar_horarios de novo).`;
        }
        return `ERRO ao agendar: ${err instanceof Error ? err.message : String(err)}. Ofereça transferir para atendente.`;
      }
    },

    async consultar_meus_agendamentos() {
      try {
        const list = await findUpcomingByCustomer(identity.id);
        if (!list.length) return 'O cliente não tem agendamentos futuros.';
        const lines = list.map((a, i) => {
          const dt = new Date(a.scheduled_at);
          const local = new Date(dt.getTime() - 3 * 60 * 60 * 1000);
          const dataLabel = `${String(local.getUTCDate()).padStart(2, '0')}/${String(local.getUTCMonth() + 1).padStart(2, '0')} às ${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
          return `${i + 1}. ${a.service_type} em ${dataLabel} (id: ${a.id})`;
        });
        return `Agendamentos do cliente:\n${lines.join('\n')}`;
      } catch (err) {
        return `ERRO ao consultar: ${err instanceof Error ? err.message : String(err)}.`;
      }
    },

    async cancelar_agendamento({ appointment_id, motivo }) {
      try {
        await cancelAppointment(appointment_id, identity.id, motivo);
        return `SUCESSO. Agendamento ${appointment_id} cancelado. Confirme ao cliente.`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'APPOINTMENT_NOT_FOUND') return 'ERRO: agendamento não existe. Chame consultar_meus_agendamentos.';
        if (msg === 'NOT_OWNER') return 'ERRO: esse agendamento não é deste cliente. Recuse e ofereça atendente.';
        return `ERRO ao cancelar: ${msg}.`;
      }
    },

    async reagendar_agendamento({ appointment_id, novo_horario_iso }) {
      try {
        // Recupera o profissional/calendar do appointment original via lookup
        // (o calendarId não é guardado no appointment, então usamos o do estado atual ou primary)
        const prof = findProfissional(state.profissional, profissionais);
        await rescheduleAppointment(appointment_id, identity.id, novo_horario_iso, {
          calendarId: prof?.gcalCalendarId ?? scheduleConfig.sharedCalendarId,
          professionalName: prof?.nome,
        });
        return `SUCESSO. Agendamento movido para ${novo_horario_iso}. Confirme ao cliente.`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'SLOT_UNAVAILABLE') return `ERRO: o novo horário ${novo_horario_iso} já está ocupado. Chame buscar_horarios novamente.`;
        if (msg === 'APPOINTMENT_NOT_FOUND') return 'ERRO: agendamento não existe.';
        if (msg === 'NOT_OWNER') return 'ERRO: agendamento não é deste cliente.';
        if (msg === 'ALREADY_CANCELLED') return 'ERRO: agendamento já foi cancelado.';
        return `ERRO ao reagendar: ${msg}.`;
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
      // Pré-condição: agendar_aula precisa ter rodado com sucesso ANTES
      if (!effects.appointmentId) {
        return 'ERRO: você precisa chamar agendar_aula com sucesso ANTES de criar_cobranca. Chame agendar_aula primeiro.';
      }
      if (valor <= 0) {
        return 'ERRO: valor deve ser > 0. Confira o preço do serviço na lista de SERVIÇOS DISPONÍVEIS.';
      }
      effects.paymentRequested = true;
      try {
        await chargeForAppointment(
          identity.id,
          effects.appointmentId,
          valor,
          `pay_${state.idempotencyKey}`,
          identity.name ?? 'Cliente',
          identity.phoneNormalized,
        );
        return `Cobrança de R$ ${valor.toFixed(2)} para ${modalidade} criada. O cliente vai receber o link em breve.`;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = (err as { code?: string })?.code;
        console.error('[CRIAR_COBRANCA_ERROR]', { code, message });
        if (code === 'ERR_INVALID_URL' || /Invalid URL/i.test(message)) {
          return 'ERRO: integração de pagamento (Asaas) não está configurada (ASAAS_API_URL ausente). Avise o cliente que a aula está agendada e que a cobrança será enviada manualmente.';
        }
        return `ERRO ao criar cobrança: ${message}. Avise o cliente que a aula está agendada e que enviará a cobrança em breve.`;
      }
    },
  };

  // Se o tenant não tem cobrança automática habilitada, remove a tool da lista
  // (assim o LLM nem sabe que ela existe e não tenta chamar).
  if (!paymentConfig.enabled) {
    delete handlers.criar_cobranca;
  }

  return handlers;
}

export async function handleIncomingMessage(
  msg: ChannelMessage,
  options: ChannelGatewayOptions = {},
): Promise<ChannelGatewayResult | null> {
  try {
    const tenantId = options.tenantId ?? await getDefaultTenantId();
    const identity = await resolveIdentity(msg.from, msg.channel, undefined, tenantId);

    let conversation = await getOrCreateConversation(identity.id, msg.channel);
    if (conversation.status === 'human') return null;

    if (!options.skipExternalDelivery) {
      conversation = await ensureChatwootConversation(
        conversation, identity.phoneNormalized, identity.name,
      );
    }

    await saveMessage({
      conversation_id: conversation.id,
      role: 'user',
      content: msg.text,
      channel: msg.channel,
      idempotency_key: msg.id,
    });

    const [ragContext, conversationHistory, profissionais, servicos, assistantName, studioName, scheduleConfig, paymentConfig] =
      await Promise.all([
        shouldRetrieveRagContext(msg.text) ? retrieveContext(tenantId, msg.text) : Promise.resolve(''),
        getRecentMessages(conversation.id, 10),
        loadProfissionais(tenantId),
        loadServices(tenantId),
        getTenantConfigValue(tenantId, 'bot.name'),
        getTenantConfigValue(tenantId, 'bot.studio_name'),
        getTenantScheduleConfig(tenantId),
        getTenantPaymentConfig(tenantId),
      ]);

    const dateInfo = getBrasiliaDateInfo();
    const effects: SideEffects = { handoff: false, appointmentCreated: false, paymentRequested: false };
    const toolCalls = options.toolCalls ?? [];

    console.log('[TENANT_FEATURES]', { paymentEnabled: paymentConfig.enabled, environment: paymentConfig.environment });

    const handlers = buildToolHandlers({
      profissionais,
      scheduleConfig,
      paymentConfig,
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
      {
        getAllowedTools: () => {
          if (effects.paymentRequested) return [];
          if (effects.appointmentCreated) {
            return handlers.criar_cobranca ? ['criar_cobranca'] : [];
          }
          return null;
        },
        getFinalizationInstruction: () => {
          if (!effects.appointmentCreated && !effects.paymentRequested) return null;
          const paymentText = effects.paymentRequested
            ? 'A cobrança também já foi gerada.'
            : 'Não chame mais tools neste turno.';
          return [
            'AÇÃO DE AGENDAMENTO JÁ EXECUTADA COM SUCESSO.',
            paymentText,
            'Agora retorne APENAS o JSON final, sem tool calls, com fase "concluido".',
            'A mensagem ao cliente deve confirmar o agendamento já realizado com profissional, modalidade, data e horário.',
            'Se não houve cobrança automática, não prometa link de pagamento.',
          ].join(' ');
        },
        onToolResult: trace => {
          toolCalls.push(trace);
        },
      },
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
    if (!options.skipExternalDelivery && msg.channel === 'whatsapp') {
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

    if (!options.skipExternalDelivery && conversation.chatwoot_conversation_id) {
      await sendMessage(conversation.chatwoot_conversation_id, botResponse.message).catch(() => {});
    }

    await saveMessage({
      conversation_id: conversation.id,
      role: 'assistant',
      content: botResponse.message,
      channel: msg.channel,
    });

    return {
      reply: botResponse.message,
      botResponse,
      conversationId: conversation.id,
      state: newState,
      toolCalls,
      effects,
    };
  } catch (err) {
    await pushToDLQ('incoming_message', msg, err instanceof Error ? err.message : String(err));
    await logIncident('high', 'channel_gateway_error', String(err));
    if (options.throwOnError) throw err;
    return null;
  }
}
