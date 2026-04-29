import { openai } from '../../integrations/openai';
import { buildSystemPrompt } from './prompt.builder';
import { BotResponse, PromptContext } from './ai.types';

function stripMarkdownJson(raw: string): string {
  return raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
}

function pickModel(ctx: PromptContext): string {
  // Fase de confirmação é crítica — usa modelo mais capaz
  const state = JSON.parse(ctx.conversationState || '{}');
  if (state.fase === 'confirmar') return 'gpt-4o';
  return 'gpt-4o-mini';
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
    response_format: { type: 'json_object' },
    temperature: 0.4,
  });

  const raw = stripMarkdownJson(completion.choices[0].message.content ?? '{}');

  try {
    return JSON.parse(raw) as BotResponse;
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw}`);
  }
}
