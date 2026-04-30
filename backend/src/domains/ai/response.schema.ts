// JSON Schema enforced pela OpenAI Structured Outputs.
// Toda resposta do LLM segue este formato — sem precisar de validação manual.
export const BOT_RESPONSE_SCHEMA = {
  name: 'BotResponse',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['intent', 'fase', 'message', 'extraido'],
    properties: {
      intent: {
        type: 'string',
        enum: ['AGENDAMENTO', 'REAGENDAMENTO', 'CANCELAMENTO', 'CONSULTA_AGENDA',
               'PAGAMENTO', 'FAQ', 'HANDOFF', 'SAUDACAO', 'OUTRO'],
      },
      fase: {
        type: 'string',
        enum: ['livre', 'coletar_modalidade', 'coletar_dia', 'coletar_horario',
               'confirmar', 'concluido', 'handoff'],
      },
      message: { type: 'string' },
      extraido: {
        type: 'object',
        additionalProperties: false,
        required: ['profissional', 'modalidade', 'dia', 'horario', 'nomeCliente'],
        properties: {
          profissional: { type: ['string', 'null'] },
          modalidade:   { type: ['string', 'null'] },
          dia:          { type: ['string', 'null'], description: 'YYYY-MM-DD ou null' },
          horario:      { type: ['string', 'null'], description: 'ISO 8601 ou null' },
          nomeCliente:  { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;
