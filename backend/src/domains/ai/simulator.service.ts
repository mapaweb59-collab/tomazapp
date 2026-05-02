import { generateBotResponse, MaxToolIterationsError } from './ai.service';
import { retrieveContext } from './rag.service';
import { shouldRetrieveRagContext } from './rag.utils';
import { listSlotsForDay, formatSlotsForPrompt } from '../../integrations/google-calendar';
import {
  loadProfissionais,
  loadServices,
  getTenantConfigValue,
  getTenantScheduleConfig,
  getTenantPaymentConfig,
} from '../tenants/tenant.service';
import { ToolHandlers } from './tools';
import { ConversationState, ConversationPhase } from '../conversations/conversation.types';
import { Profissional, BotResponse } from './ai.types';

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

function professionalCoversModality(prof: Profissional, modalidade: string): boolean {
  const target = modalidade.toLowerCase().trim();
  return prof.especialidades.some(e => {
    const esp = e.toLowerCase().trim();
    return esp === target || esp.includes(target) || target.includes(esp);
  });
}

export interface ToolCallTrace {
  name: string;
  args: unknown;
  result: string;
}

export interface SimulatorRequest {
  tenantId: string;
  message: string;
  state?: ConversationState;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface SimulatorResponse {
  reply: BotResponse;
  newState: ConversationState;
  toolCalls: ToolCallTrace[];
  effects: { handoff: boolean; appointmentCreated: boolean; paymentRequested: boolean };
  warning?: string;
}

function freshState(): ConversationState {
  return {
    fase: 'livre',
    profissional: null,
    modalidade: null,
    dia: null,
    horario: null,
    slotId: null,
    nomeCliente: null,
    idempotencyKey: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

function formatHistory(history: SimulatorRequest['history']): string {
  if (!history || !history.length) return '(início da conversa)';
  return history
    .slice(-10)
    .map(m => `${m.role === 'user' ? 'Cliente' : 'Bot'}: ${m.content}`)
    .join('\n');
}

/**
 * Roda o motor do bot em modo simulado:
 * - RAG e buscar_horarios usam dados reais (read-only).
 * - Tools que escrevem (agendar, cancelar, reagendar, cobrar, transferir) são mockadas.
 * - Sem persistência: estado entra e sai pela API.
 */
export async function runSimulatedChat(req: SimulatorRequest): Promise<SimulatorResponse> {
  const { tenantId, message } = req;
  const state = req.state ?? freshState();

  const [ragContext, profissionais, servicos, assistantName, studioName, scheduleConfig, paymentConfig] =
    await Promise.all([
      shouldRetrieveRagContext(message) ? retrieveContext(tenantId, message) : Promise.resolve(''),
      loadProfissionais(tenantId),
      loadServices(tenantId),
      getTenantConfigValue(tenantId, 'bot.name'),
      getTenantConfigValue(tenantId, 'bot.studio_name'),
      getTenantScheduleConfig(tenantId),
      getTenantPaymentConfig(tenantId),
    ]);

  const dateInfo = getBrasiliaDateInfo();
  const toolCalls: ToolCallTrace[] = [];
  const effects = { handoff: false, appointmentCreated: false, paymentRequested: false };

  const trace = async <A>(name: string, args: A, fn: () => Promise<string>): Promise<string> => {
    const result = await fn();
    toolCalls.push({ name, args, result });
    return result;
  };

  const handlers: ToolHandlers = {
    async buscar_horarios({ profissional, dia }) {
      return trace('buscar_horarios', { profissional, dia }, async () => {
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
            return `Sem vagas no dia ${dia} nem nos próximos 14 dias para ${profissional}.`;
          }
          const fallbackNote = result.wasFallback
            ? `Não havia vagas em ${dia}, mas em ${result.usedDateLabel} (${result.usedDate}) há disponibilidade:\n`
            : `Horários disponíveis em ${result.usedDateLabel} (${result.usedDate}):\n`;
          return fallbackNote + formatSlotsForPrompt(result.slots);
        } catch (err) {
          return `ERRO ao consultar agenda: ${err instanceof Error ? err.message : String(err)}.`;
        }
      });
    },

    async agendar_aula(args) {
      return trace('agendar_aula', args, async () => {
        if (state.fase !== 'confirmar') {
          return `ERRO: o cliente ainda não confirmou o agendamento. Antes de chamar agendar_aula, mostre ao cliente os dados completos (${args.profissional}, ${args.modalidade}, horário ${args.horario_iso}) e pergunte "Está correto? Confirma com 'ok'?". Mude fase para "confirmar" e ESPERE a próxima mensagem dele. NÃO chame agendar_aula agora.`;
        }
        const prof = findProfissional(args.profissional, profissionais);
        if (prof && !professionalCoversModality(prof, args.modalidade)) {
          return `ERRO: ${prof.nome} não atende ${args.modalidade}. Especialidades de ${prof.nome}: ${prof.especialidades.join(', ')}. Avise o cliente e pergunte se quer trocar de profissional ou modalidade. NÃO tente agendar de novo até o cliente decidir.`;
        }
        effects.appointmentCreated = true;
        const fakeId = `sim_appt_${Date.now()}`;
        return `[SIMULADO] SUCESSO. Agendamento criado (id: ${fakeId}). Confirme ao cliente data, horário, profissional e modalidade. Se a modalidade tem preço > 0, agora você PODE chamar criar_cobranca.`;
      });
    },

    async consultar_meus_agendamentos(args) {
      return trace('consultar_meus_agendamentos', args, async () =>
        '[SIMULADO] O cliente não tem agendamentos futuros (modo simulação).',
      );
    },

    async cancelar_agendamento(args) {
      return trace('cancelar_agendamento', args, async () =>
        `[SIMULADO] SUCESSO. Agendamento ${args.appointment_id} cancelado.`,
      );
    },

    async reagendar_agendamento(args) {
      return trace('reagendar_agendamento', args, async () =>
        `[SIMULADO] SUCESSO. Agendamento movido para ${args.novo_horario_iso}.`,
      );
    },

    async transferir_para_humano(args) {
      return trace('transferir_para_humano', args, async () => {
        effects.handoff = true;
        return `[SIMULADO] Transferência registrada. Motivo: ${args.motivo}.`;
      });
    },

    async criar_cobranca(args) {
      return trace('criar_cobranca', args, async () => {
        effects.paymentRequested = true;
        return `[SIMULADO] Cobrança de R$ ${args.valor.toFixed(2)} para ${args.modalidade} criada.`;
      });
    },
  };

  if (!paymentConfig.enabled) delete handlers.criar_cobranca;

  const botResponse = await generateBotResponse(
    message,
    {
      assistantName: assistantName ?? 'Sofia',
      studioName: studioName ?? 'Studio',
      profissionais,
      servicos,
      conversationState: JSON.stringify(state),
      conversationHistory: formatHistory(req.history),
      ragContext,
      customerData: JSON.stringify({
        id: 'sim_customer',
        isNew: true,
        phoneNormalized: '+5500000000000',
        name: state.nomeCliente ?? 'Cliente Simulado',
      }),
      today: dateInfo.today,
      todayIso: dateInfo.todayIso,
      tomorrowIso: dateInfo.tomorrowIso,
    },
    handlers,
  );

  const extraido = botResponse.extraido ?? {};
  const novoDia = extraido.dia && ISO_DATE_RE.test(extraido.dia) ? extraido.dia : state.dia;

  const newState: ConversationState = {
    ...state,
    fase: (botResponse.fase as ConversationPhase) ?? state.fase,
    profissional: extraido.profissional ?? state.profissional,
    modalidade: extraido.modalidade ?? state.modalidade,
    dia: novoDia,
    horario: extraido.horario ?? state.horario,
    nomeCliente: extraido.nomeCliente ?? state.nomeCliente,
  };

  return { reply: botResponse, newState, toolCalls, effects };
}
