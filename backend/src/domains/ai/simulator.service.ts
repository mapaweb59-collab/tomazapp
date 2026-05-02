import { randomUUID, createHash } from 'crypto';
import { handleIncomingMessage, ToolCallTrace } from '../channels/channel.gateway';
import { ConversationState } from '../conversations/conversation.types';
import { BotResponse } from './ai.types';
import { ChannelMessage } from '../../types/channel-message';

export interface SimulatorRequest {
  tenantId: string;
  message: string;
  sessionId?: string;
  state?: ConversationState;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export interface SimulatorResponse {
  reply: BotResponse;
  newState: ConversationState;
  toolCalls: ToolCallTrace[];
  effects: { handoff: boolean; appointmentCreated: boolean; paymentRequested: boolean };
  conversationId: string;
  sessionId: string;
  warning?: string;
}

function sessionToPhone(tenantId: string, sessionId: string): string {
  const hash = createHash('sha256').update(`${tenantId}:${sessionId}`).digest('hex');
  const digits = hash
    .split('')
    .map(ch => String(parseInt(ch, 16) % 10))
    .join('')
    .slice(0, 8);

  return `+55119${digits.padEnd(8, '0')}`;
}

/**
 * Roda o simulador pelo mesmo gateway usado pelos canais reais.
 *
 * O modo simulador persiste customer/conversation/messages, executa as mesmas tools
 * e agenda/cobra de verdade. A unica diferenca intencional e bloquear entrega externa
 * para nao enviar mensagem real via Evolution API ou Chatwoot durante testes no painel.
 */
export async function runSimulatedChat(req: SimulatorRequest): Promise<SimulatorResponse> {
  const sessionId = req.sessionId?.trim() || randomUUID();
  const toolCalls: ToolCallTrace[] = [];

  const msg: ChannelMessage = {
    id: `sim_${sessionId}_${Date.now()}_${randomUUID()}`,
    channel: 'whatsapp',
    from: sessionToPhone(req.tenantId, sessionId),
    text: req.message,
    timestamp: new Date().toISOString(),
    raw: {
      simulator: true,
      tenantId: req.tenantId,
      sessionId,
    },
  };

  const result = await handleIncomingMessage(msg, {
    tenantId: req.tenantId,
    skipExternalDelivery: true,
    throwOnError: true,
    toolCalls,
  });

  if (!result) {
    throw new Error('A conversa esta em atendimento humano ou nao gerou resposta do bot.');
  }

  return {
    reply: result.botResponse,
    newState: result.state,
    toolCalls: result.toolCalls,
    effects: result.effects,
    conversationId: result.conversationId,
    sessionId,
    warning: 'Modo simulador persiste dados e executa agendamentos/cobrancas reais; apenas o envio externo foi bloqueado.',
  };
}
