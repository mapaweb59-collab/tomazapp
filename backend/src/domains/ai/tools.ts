// Definições das tools que o LLM pode chamar.
// O backend implementa os handlers; o LLM decide quando invocar.

export const TOOLS_DEFINITION = [
  {
    type: 'function' as const,
    function: {
      name: 'buscar_horarios',
      description: 'Busca os horários disponíveis para um profissional em um dia específico. ' +
        'Use SEMPRE que tiver profissional + dia definidos e ainda não tiver horários carregados. ' +
        'Se não houver vaga no dia pedido, retorna automaticamente o próximo dia disponível.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['profissional', 'dia'],
        properties: {
          profissional: { type: 'string', description: 'Nome do profissional (ex: "Ana")' },
          dia: { type: 'string', description: 'Data no formato YYYY-MM-DD (ex: "2026-05-04")' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'agendar_aula',
      description: 'Cria efetivamente o agendamento no Google Calendar e no banco de dados. ' +
        'Use APENAS depois que o cliente confirmou o horário escolhido. ' +
        'Retorna sucesso ou erro (slot ocupado, etc).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['profissional', 'modalidade', 'horario_iso'],
        properties: {
          profissional: { type: 'string' },
          modalidade: { type: 'string' },
          horario_iso: { type: 'string', description: 'Datetime ISO 8601 do slot escolhido' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'transferir_para_humano',
      description: 'Transfere a conversa para um atendente humano. ' +
        'Use quando: cliente pede explicitamente, está frustrado, reclamação, ' +
        'serviço marcado como REQUER HUMANO, ou pergunta fora do escopo de agendamento.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['motivo'],
        properties: {
          motivo: { type: 'string', description: 'Por que está transferindo (curto)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'criar_cobranca',
      description: 'Cria uma cobrança no Asaas para a aula recém agendada. ' +
        'Use APENAS após agendar_aula com sucesso E se a modalidade tiver preço > 0 nos serviços disponíveis. ' +
        'Se preço = 0 ou serviço não listado, NÃO chame esta tool.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['modalidade', 'valor'],
        properties: {
          modalidade: { type: 'string' },
          valor: { type: 'number', description: 'Valor em reais (ex: 80.00)' },
        },
      },
    },
  },
];

export interface ToolHandlers {
  buscar_horarios: (args: { profissional: string; dia: string }) => Promise<string>;
  agendar_aula: (args: { profissional: string; modalidade: string; horario_iso: string }) => Promise<string>;
  transferir_para_humano: (args: { motivo: string }) => Promise<string>;
  criar_cobranca: (args: { modalidade: string; valor: number }) => Promise<string>;
}

export type ToolName = keyof ToolHandlers;
