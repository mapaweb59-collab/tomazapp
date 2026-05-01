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
          horario_iso: {
            type: 'string',
            description: 'Datetime ISO 8601 EXATO do slot escolhido — copie LITERALMENTE o valor que veio depois de "→" em buscar_horarios, incluindo o "Z" no fim. Ex: "2026-05-04T12:00:00.000Z". NUNCA reescreva o horário em fuso local — sempre use o UTC retornado pela tool.',
          },
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
      name: 'consultar_meus_agendamentos',
      description: 'Lista os agendamentos futuros do cliente atual. ' +
        'Use quando cliente perguntar "tenho aula marcada?", "quais minhas aulas?", ' +
        'ou quando ele quiser cancelar/reagendar e você precisar identificar qual.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: [],
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'cancelar_agendamento',
      description: 'Cancela um agendamento. Use APENAS após o cliente confirmar o cancelamento. ' +
        'Se o cliente tem mais de um agendamento, primeiro chame consultar_meus_agendamentos ' +
        'e identifique qual ele quer cancelar.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['appointment_id', 'motivo'],
        properties: {
          appointment_id: { type: 'string', description: 'ID UUID do agendamento' },
          motivo: { type: 'string', description: 'Motivo do cancelamento (curto)' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reagendar_agendamento',
      description: 'Move um agendamento existente para um novo horário (apaga evento antigo, cria novo). ' +
        'Use após cliente confirmar o novo horário escolhido (que veio de buscar_horarios).',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['appointment_id', 'novo_horario_iso'],
        properties: {
          appointment_id: { type: 'string', description: 'ID UUID do agendamento atual' },
          novo_horario_iso: { type: 'string', description: 'Datetime ISO 8601 do novo slot' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'criar_cobranca',
      description: 'Cria uma cobrança no Asaas para a aula recém agendada. ' +
        'IMPORTANTE: chame esta tool APENAS DEPOIS que agendar_aula retornou SUCESSO no MESMO turno. ' +
        'NUNCA chame em paralelo com agendar_aula — espere o resultado primeiro. ' +
        'Use apenas se a modalidade tiver preço > 0 nos serviços disponíveis. ' +
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
  consultar_meus_agendamentos: (args: Record<string, never>) => Promise<string>;
  cancelar_agendamento: (args: { appointment_id: string; motivo: string }) => Promise<string>;
  reagendar_agendamento: (args: { appointment_id: string; novo_horario_iso: string }) => Promise<string>;
  transferir_para_humano: (args: { motivo: string }) => Promise<string>;
  // Opcional: só presente quando o tenant tem payment.enabled = true
  criar_cobranca?: (args: { modalidade: string; valor: number }) => Promise<string>;
}

export type ToolName = keyof ToolHandlers;
