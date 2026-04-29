import { ConversationPhase } from '../conversations/conversation.types';

export type IntentType =
  | 'AGENDAMENTO'
  | 'REAGENDAMENTO'
  | 'CANCELAMENTO'
  | 'CONSULTA_AGENDA'
  | 'PAGAMENTO'
  | 'FAQ'
  | 'HANDOFF'
  | 'SAUDACAO'
  | 'OUTRO';

export interface BotResponse {
  intent: IntentType;
  fase: ConversationPhase;
  message: string;
  extraido: {
    profissional: string | null;
    modalidade: string | null;
    dia: string | null;       // YYYY-MM-DD quando cliente informar o dia preferido
    horario: string | null;   // ISO datetime quando cliente escolher o slot
    nomeCliente: string | null;
  };
  mostrarHorarios: boolean;
  triggerHandoff: boolean;
  triggerPayment: boolean;
  triggerConfirmacao: boolean;
}

export interface Profissional {
  id: string;
  nome: string;
  apelidos: string[];
  especialidades: string[];
  gcalCalendarId?: string;
  businessHours?: Record<string, { open: string; close: string } | null>;
}

export interface PromptContext {
  assistantName: string;
  studioName: string;
  profissionais: Profissional[];
  conversationState: string;
  conversationHistory: string;
  availableSlots: string;
  ragContext: string;
  customerData: string;
}
