import OpenAI from 'openai';
import { openai } from '../../integrations/openai';
import { buildSystemPrompt } from './prompt.builder';
import { BOT_RESPONSE_SCHEMA } from './response.schema';
import { TOOLS_DEFINITION, ToolHandlers, ToolName } from './tools';
import { BotResponse, PromptContext } from './ai.types';

const MAX_TOOL_ITERATIONS = 5;

function pickModel(ctx: PromptContext): string {
  if (process.env.OPENAI_MODEL) return process.env.OPENAI_MODEL;
  const state = JSON.parse(ctx.conversationState || '{}');
  if (state.fase === 'confirmar') return process.env.OPENAI_MODEL_CRITICAL ?? 'gpt-4.1';
  return 'gpt-4.1-mini';
}

export async function generateBotResponse(
  userMessage: string,
  ctx: PromptContext,
  handlers: ToolHandlers,
): Promise<BotResponse> {
  const systemPrompt = buildSystemPrompt(ctx);
  const model = pickModel(ctx);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  // Filtra TOOLS_DEFINITION para incluir só as que têm handler definido.
  // Ex: criar_cobranca é removida quando o tenant não tem payment.enabled.
  const enabledTools = TOOLS_DEFINITION.filter(t =>
    handlers[t.function.name as ToolName] !== undefined,
  );

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const completion = await openai.chat.completions.create({
      model,
      messages,
      tools: enabledTools,
      response_format: { type: 'json_schema', json_schema: BOT_RESPONSE_SCHEMA },
      temperature: 0.4,
    });

    const msg = completion.choices[0].message;
    messages.push(msg);

    // Sem tool calls → resposta final em JSON estruturado
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const raw = msg.content ?? '{}';
      return JSON.parse(raw) as BotResponse;
    }

    // Executa cada tool em paralelo, devolve resultado pro LLM
    console.log('[TOOL_CALLS]', msg.tool_calls.map(t => ({ name: t.function.name, args: t.function.arguments })));

    const results = await Promise.all(
      msg.tool_calls.map(async call => {
        const name = call.function.name as ToolName;
        let result: string;
        try {
          const args = JSON.parse(call.function.arguments);
          const handler = handlers[name];
          if (!handler) {
            result = `ERRO: tool ${name} não implementada.`;
          } else {
            result = await (handler as (a: unknown) => Promise<string>)(args);
          }
        } catch (err) {
          result = `ERRO ao executar ${name}: ${err instanceof Error ? err.message : String(err)}`;
        }
        console.log('[TOOL_RESULT]', { name, result: result.slice(0, 200) });
        return { call_id: call.id, content: result };
      }),
    );

    for (const r of results) {
      messages.push({ role: 'tool', tool_call_id: r.call_id, content: r.content });
    }
  }

  throw new Error(`Max tool iterations (${MAX_TOOL_ITERATIONS}) atingido sem resposta final do LLM`);
}
