export const dynamic = 'force-dynamic';

import { createAdminClient } from '../../../lib/supabase/admin-client';
import { SimulatorClient } from './SimulatorClient';

interface Props { params: { tenantSlug: string } }

export default async function TestarPage({ params }: Props) {
  const supabase = createAdminClient();
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('slug', params.tenantSlug)
    .single();

  const { data: cfgRows } = tenant
    ? await supabase
        .from('tenant_config')
        .select('key, value')
        .eq('tenant_id', tenant.id)
        .in('key', ['bot.name', 'bot.welcome_message'])
    : { data: [] };

  const cfg: Record<string, string> = {};
  for (const row of cfgRows ?? []) cfg[row.key] = row.value as string;

  return (
    <div className="space-y-4 max-w-5xl">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Testar Bot</h1>
        <p className="text-sm text-gray-500 mt-1">
          Simule uma conversa com o bot. Nada é salvo no banco, nenhuma mensagem é enviada por
          WhatsApp e nenhuma cobrança real é criada.
        </p>
      </header>

      <SimulatorClient
        tenantSlug={params.tenantSlug}
        botName={cfg['bot.name'] ?? 'Sofia'}
        welcomeMessage={cfg['bot.welcome_message'] ?? null}
      />
    </div>
  );
}
