export type ConversationStatus = 'bot' | 'human' | 'closed';

export type ConversationPhase =
  | 'livre'
  | 'coletar_modalidade'
  | 'coletar_dia'
  | 'coletar_horario'
  | 'confirmar'
  | 'concluido'
  | 'handoff';

export interface ConversationState {
  fase: ConversationPhase;
  profissional: string | null;
  modalidade: string | null;
  dia: string | null;       // YYYY-MM-DD (BRT) preferido pelo cliente
  horario: string | null;
  slotId: string | null;
  nomeCliente: string | null;
  idempotencyKey: string;
}

export interface Conversation {
  id: string;
  customer_id: string;
  channel: string;
  chatwoot_conversation_id?: string;
  status: ConversationStatus;
  context: ConversationState;
  created_at: string;
  updated_at: string;
}
