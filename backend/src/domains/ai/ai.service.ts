import { openai } from '../../integrations/openai';
import { buildSystemPrompt } from './prompt.builder';
import { BotResponse, PromptContext } from './ai.types';

export async function generateBotResponse(
  userMessage: string,
  ctx: PromptContext,
): Promise<BotResponse> {
  const systemPrompt = buildSystemPrompt(ctx);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.4,
  });

  const raw = completion.choices[0].message.content ?? '{}';

  try {
    return JSON.parse(raw) as BotResponse;
  } catch {
    throw new Error(`LLM returned invalid JSON: ${raw}`);
  }
}
