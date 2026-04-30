import { openai } from '../../integrations/openai';
import { buildSystemPrompt } from './prompt.builder';
import { BOT_RESPONSE_SCHEMA } from './response.schema';
import { BotResponse, PromptContext } from './ai.types';

function pickModel(ctx: PromptContext): string {
  // Modelo override por env (ex: gpt-5-mini, gpt-4.1-mini)
  if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL;
  // Fase de confirmação é crítica — usa modelo mais capaz
  const state = JSON.parse(ctx.conversationState || '{}');
  if (state.fase === 'confirmar') return process.env.OPENAI_MODEL_CRITICAL ?? 'gpt-4.1';
  return 'gpt-4.1-mini';
}

export async function generateBotResponse(
  userMessage: string,
  ctx: PromptContext,
): Promise<BotResponse> {
  const systemPrompt = buildSystemPrompt(ctx);
  const model = pickModel(ctx);

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    // Structured Outputs — OpenAI garante schema, sem fallback manual
    response_format: {
      type: 'json_schema',
      json_schema: BOT_RESPONSE_SCHEMA,
    },
    temperature: 0.4,
  });

  const raw = completion.choices[0].message.content ?? '{}';
  // Com strict schema o parse nunca deveria falhar, mas mantemos o try
  // por segurança em caso de refusal (que vem em campo separado em raros casos)
  return JSON.parse(raw) as BotResponse;
}
