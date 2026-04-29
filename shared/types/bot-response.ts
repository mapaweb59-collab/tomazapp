export type ConversationPhase =
  | 'livre'
  | 'coletar_modalidade'
  | 'coletar_horario'
  | 'confirmar'
  | 'concluido'
  | 'handoff';

export type IntentType =
  | 'AGENDAMENTO' | 'REAGENDAMENTO' | 'CANCELAMENTO'
  | 'CONSULTA_AGENDA' | 'PAGAMENTO' | 'FAQ'
  | 'HANDOFF' | 'SAUDACAO' | 'OUTRO';

export interface BotResponse {
  intent: IntentType;
  fase: ConversationPhase;
  message: string;
  extraido: {
    profissional: string | null;
    modalidade: string | null;
    horario: string | null;
    nomeCliente: string | null;
  };
  mostrarHorarios: boolean;
  triggerHandoff: boolean;
  triggerPayment: boolean;
  triggerConfirmacao: boolean;
}
