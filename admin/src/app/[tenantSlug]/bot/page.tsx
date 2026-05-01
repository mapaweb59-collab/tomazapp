export const dynamic = 'force-dynamic';

import { createAdminClient } from '../../../lib/supabase/admin-client';
import { saveBotConfig } from './actions';

interface Props { params: { tenantSlug: string } }

export default async function BotPage({ params }: Props) {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase.from('tenants').select('id').eq('slug', params.tenantSlug).single();

  const { data: rows } = tenant
    ? await supabase.from('tenant_config').select('key, value').eq('tenant_id', tenant.id)
    : { data: [] };

  const cfg: Record<string, string> = {};
  for (const row of rows ?? []) cfg[row.key] = row.value as string;

  const save = saveBotConfig.bind(null, params.tenantSlug);

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Identidade do Bot</h1>

      <form action={save} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do assistente</label>
          <input
            name="bot_name"
            defaultValue={cfg['bot.name'] ?? 'Sofia'}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do studio</label>
          <input
            name="studio_name"
            defaultValue={cfg['bot.studio_name'] ?? ''}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tom de comunicação</label>
          <select name="tone" defaultValue={cfg['bot.tone'] ?? 'friendly'} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="friendly">Amigável</option>
            <option value="formal">Formal</option>
            <option value="young">Jovem / Descolado</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem de boas-vindas</label>
          <textarea
            name="welcome_message"
            rows={3}
            defaultValue={cfg['bot.welcome_message'] ?? ''}
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem de handoff</label>
          <textarea
            name="handoff_message"
            rows={2}
            defaultValue={cfg['bot.handoff_message'] ?? 'Vou te conectar com um atendente. Em breve alguém entra em contato! 😊'}
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Base de conhecimento do RAG</label>
          <textarea
            name="rag_content"
            rows={12}
            defaultValue={cfg['rag.content'] ?? ''}
            className="w-full border rounded-lg px-3 py-2 text-sm resize-y font-mono"
            placeholder="Cole aqui FAQs, regras, planos, políticas e informações que o bot deve consultar."
          />
          <p className="text-xs text-gray-400 mt-1">
            Ao salvar, o conteúdo será reprocessado para busca vetorial.
          </p>
        </div>

        <button
          type="submit"
          className="bg-blue-600 text-white text-sm px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Salvar
        </button>
      </form>
    </div>
  );
}
